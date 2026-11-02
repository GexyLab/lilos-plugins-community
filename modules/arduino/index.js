import { isAbsolute } from 'node:path';
import { Arduino } from './arduino.js';
import { LanguageServer, MAX_PER_USER } from './lsp.js';

/**
 * Arduino for lilOS's apps (ArduinoIDE): compiles sketches, keeps the boards' packages and the
 * users' libraries, and gives the editor its suggestions. Uploading to the board is not done here:
 * the board is plugged into the user's computer and the page writes to it with Web Serial.
 *
 *   GET /api/modules/arduino/status          { ready, lsp, lspPossible, core, tools, setting }
 *   WS  /api/modules/arduino/session         one per window, JSON text messages:
 *     from the page  { id, op, ...params }   ops below; { op: 'lsp', message } an LSP message
 *     to the page    { id, result } · { id, error: { code, message } } · { id, ev: 'progress', step, done?, total? }
 *                    { ev: 'lsp', message } · { ev: 'lspExit', code }
 *   ops   status · setup (admins: tools, indexes, AVR package) · boards · boardOptions { fqbn }
 *         compile { fqbn, sketch: { name, files }, libraries? } · libSearch { query, type, topic } · libTopics
 *         libInstalled · libDeps { name, version } · libInstall { name, version, deps } · libRemove { name }
 *         libExample { library, path } · provides { header }
 *         lspStart { fqbn, sketch } · lspSync { files } · lspStop
 *
 * Settings: dataPath, a folder for the data instead of the kernel's (absolute; on Windows keep it
 * short: the AVR compiler does not read paths of more than 260 characters).
 */
const live = new Map();   // user id → language servers running
const open = new Map();   // user id → sessions open
const SESSIONS_PER_USER = 5;

export default {
  async init(ctx) {
    const custom = typeof ctx.config.dataPath === 'string' && ctx.config.dataPath.trim();
    if (custom && !isAbsolute(custom)) ctx.log.warn('dataPath non è un percorso assoluto: uso la cartella del kernel');
    const arduino = new Arduino(custom && isAbsolute(custom) ? custom : ctx.dataDir, ctx.log);
    await arduino.start();
    this.arduino = arduino;

    ctx.route('GET', '/status', () => arduino.status());

    ctx.socket('/session', ({ principal, accept }) => {
      if ((open.get(principal.id) ?? 0) >= SESSIONS_PER_USER) ctx.fail('rate_limited', 'Troppe finestre di ArduinoIDE aperte');
      const ws = accept({ maxMessage: 16 << 20 });
      open.set(principal.id, (open.get(principal.id) ?? 0) + 1);
      ws.on('close', () => { const n = (open.get(principal.id) ?? 1) - 1; if (n > 0) open.set(principal.id, n); else open.delete(principal.id); });
      const say = msg => { if (ws.open) ws.send(JSON.stringify(msg)); };
      let ls = null;
      const stopLs = () => {
        if (!ls) return;
        ls.close();
        live.get(principal.id)?.delete(ls);
        ls = null;
      };

      const ops = {
        status: () => arduino.status(),
        setup: (_, id) => {
          if (principal.role !== 'admin') throw Object.assign(new Error('Solo un amministratore prepara Arduino (scarica gli strumenti e il pacchetto delle schede)'), { code: 'forbidden' });
          return arduino.setup(p => say({ id, ev: 'progress', ...p }));
        },
        boards: () => arduino.boards(principal),
        boardOptions: p => arduino.boardOptions(principal, p.fqbn),
        compile: (p, id) => arduino.compile(principal, p, step => say({ id, ev: 'progress', ...step })),
        libSearch: p => arduino.search(principal, p),
        libTopics: () => arduino.topics(),
        libInstalled: () => arduino.installed(principal),
        libDeps: p => arduino.dependencies(principal, p.name, p.version),
        libInstall: p => arduino.install(principal, p.name, p.version, { deps: p.deps !== false }),
        libRemove: p => arduino.uninstall(principal, p.name),
        libExample: p => arduino.example(principal, p.library, p.path),
        provides: p => arduino.provides(principal, p.header),
        lspStart: async p => {
          stopLs();
          const mine = live.get(principal.id) ?? new Set();
          if (mine.size >= MAX_PER_USER) throw Object.assign(new Error('Troppe finestre con i suggerimenti aperte'), { code: 'rate_limited' });
          const server = new LanguageServer({ arduino, principal, fqbn: p.fqbn, sketch: p.sketch });
          await server.start();
          server.onMessage = message => say({ ev: 'lsp', message });
          server.onExit = code => {
            live.get(principal.id)?.delete(server);
            if (ls === server) { ls = null; say({ ev: 'lspExit', code }); }
          };
          mine.add(server);
          live.set(principal.id, mine);
          ls = server;
          return { ok: true };
        },
        lspSync: async p => { if (ls) await ls.sync(p.files); return { ok: !!ls }; },
        lspStop: () => { stopLs(); return { ok: true }; },
      };

      ws.on('message', async (data, binary) => {
        if (binary) return;
        let msg;
        try { msg = JSON.parse(data.toString('utf8')); } catch { return; }
        if (!msg || typeof msg !== 'object') return;
        if (msg.op === 'lsp') { if (ls && msg.message && typeof msg.message === 'object') ls.send(msg.message); return; }
        const { id, op } = msg;
        if (!Number.isInteger(id)) return;
        if (typeof op !== 'string' || !Object.hasOwn(ops, op)) return say({ id, error: { code: 'invalid', message: `Operazione sconosciuta: ${String(op).slice(0, 40)}` } });
        try {
          say({ id, result: (await ops[op](msg, id)) ?? null });
        } catch (err) {
          if (!err.code) ctx.log.error(`arduino ${op}`, err);
          say({ id, error: { code: err.code ?? 'internal', message: String(err.message ?? err).slice(0, 2000) } });
        }
      });
      ws.on('close', stopLs);
    });
  },

  async stop() {
    for (const set of live.values()) for (const server of set) server.close();
    live.clear();
    this.arduino?.stop();
  },
};
