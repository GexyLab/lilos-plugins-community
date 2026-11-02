import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { available, ensureTool, findTool } from './tools.js';
import { SKETCH_NAME, checkFiles, checkPath, writeFiles } from './sketch.js';
import { Libraries } from './libraries.js';

/**
 * Arduino in the kernel, for every user: one data folder with the tools, the boards' packages
 * (shared: they are big) and the indexes; each user has their own installed libraries.
 *
 *   <data>/tools/          arduino-cli, arduino-language-server, clangd (tools.js)
 *   <data>/arduino/        arduino-cli's data: packages of the boards, indexes (directories.data)
 *   <data>/downloads/      its downloads (directories.downloads)
 *   <data>/users/<u>/      one user's cli.yaml and libraries/ (directories.user); <u> a hash of the id
 *   <data>/work/<u>/       sketches copied for a compilation or for the language server (removed after)
 *   <data>/build/<u>/      build caches, one per sketch and board (old ones removed)
 *   <data>/tmp/            temporary files of the tools (emptied at start)
 *
 * What changes the shared data (indexes, packages) waits for the compilations to end and the
 * other way round (a read-write lock); at most COMPILE_SLOTS compilations at a time.
 */
export const CORE = 'arduino:avr';
const COMPILE_SLOTS = 2;
const COMPILES_PER_USER = 2;      // running or waiting
const INDEX_DAYS = 1;
const INDEX_RETRY = 10 * 60_000;
const BUILD_DAYS = 14;
const FQBN = /^[a-zA-Z0-9_.-]+:[a-zA-Z0-9_.-]+:[a-zA-Z0-9_.-]+(:[a-zA-Z0-9_.=,-]+)?$/;
const LIB_NAME = /^[A-Za-z0-9_][\w .+()-]{0,99}$/;   // never starting like an option of arduino-cli
const VERSION = /^\d+(\.\d+){0,3}([-+][\w.]+)?$/;

const bad = message => Object.assign(new Error(message), { code: 'invalid' });
const userKey = id => createHash('sha256').update(String(id)).digest('hex').slice(0, 16);
const yamlString = s => JSON.stringify(s);   // a JSON string is a valid YAML string

class Lock {
  #readers = 0;
  #writer = false;
  #queue = [];
  async read(fn) { await this.#take(false); try { return await fn(); } finally { this.#readers--; this.#wake(); } }
  async write(fn) { await this.#take(true); try { return await fn(); } finally { this.#writer = false; this.#wake(); } }
  #take(write) {
    return new Promise(resolve => { this.#queue.push({ write, resolve }); this.#wake(); });
  }
  #wake() {
    while (this.#queue.length) {
      const next = this.#queue[0];
      if (this.#writer || (next.write && this.#readers)) return;
      this.#queue.shift();
      if (next.write) this.#writer = true; else this.#readers++;
      next.resolve();
      if (next.write) return;
    }
  }
}

class Slots {
  #free; #queue = [];
  constructor(n) { this.#free = n; }
  async run(fn) {
    if (this.#free > 0) this.#free--; else await new Promise(r => this.#queue.push(r));
    try { return await fn(); } finally { const next = this.#queue.shift(); if (next) next(); else this.#free++; }
  }
}

export class Arduino {
  #dir; #log;
  #lock = new Lock();
  #slots = new Slots(COMPILE_SLOTS);
  #setup = null;           // the running setup: { promise, listeners }
  #children = new Set();
  #compiling = new Map();  // user key → compilations running or waiting
  #indexTried = 0;
  libraries;

  constructor(dir, log) {
    this.#dir = dir;
    this.#log = log;
    this.libraries = new Libraries(join(dir, 'arduino'), log);
  }

  get dir() { return this.#dir; }

  async start() {
    await rm(join(this.#dir, 'tmp'), { recursive: true, force: true }).catch(() => {});
    await rm(join(this.#dir, 'work'), { recursive: true, force: true }).catch(() => {});
    await mkdir(join(this.#dir, 'tmp'), { recursive: true });
    if (process.platform === 'win32' && this.#dir.length > 80) {
      this.#log.warn(`Cartella dei dati lunga (${this.#dir.length} caratteri): su Windows il compilatore AVR non legge percorsi oltre 260 caratteri. Scegline una più corta nelle impostazioni del modulo.`);
    }
    this.#pruneBuilds().catch(() => {});
  }

  stop() {
    for (const child of this.#children) child.kill();
  }

  /**
   * The environment of the tools: only what they need (none of the kernel's own variables, which
   * may hold secrets), their temporary files in <data>/tmp.
   */
  get env() {
    const tmp = join(this.#dir, 'tmp');
    const keep = ['PATH', 'Path', 'SystemRoot', 'SYSTEMROOT', 'windir', 'HOME', 'USERPROFILE', 'LOCALAPPDATA', 'APPDATA', 'LANG', 'LC_ALL'];
    return { ...Object.fromEntries(keep.filter(k => process.env[k] !== undefined).map(k => [k, process.env[k]])), TMP: tmp, TEMP: tmp, TMPDIR: tmp };
  }

  /** The configuration of arduino-cli for one user (written each time: it is tiny). */
  async configFor(principal) {
    const u = join(this.#dir, 'users', userKey(principal.id));
    await mkdir(u, { recursive: true });
    const file = join(u, 'cli.yaml');
    await writeFile(file, [
      'directories:',
      `  data: ${yamlString(join(this.#dir, 'arduino'))}`,
      `  downloads: ${yamlString(join(this.#dir, 'downloads'))}`,
      `  user: ${yamlString(u)}`,
      'locale: en',
      'updater:',
      '  enable_notification: false',
      'library:',
      '  enable_unsafe_install: false',
      '',
    ].join('\n'));
    return { file, user: u, key: userKey(principal.id) };
  }

  /** A shared configuration for what is not one user's (indexes, packages). */
  configShared() { return this.configFor({ id: '_shared' }); }

  /**
   * Runs arduino-cli. Returns { code, out, err }; with json: true the parsed output (throws if the
   * command failed, with arduino-cli's message).
   */
  async cli(args, { config, timeout = 120_000, json = false, maxOut = 32 << 20 } = {}) {
    const exe = await findTool(this.#dir, 'cli');
    if (!exe) throw Object.assign(new Error('Arduino non è ancora pronto: serve la preparazione'), { code: 'not_ready' });
    const child = spawn(exe, ['--config-file', config, ...args, ...(json ? ['--format', 'json'] : [])], { env: this.env, windowsHide: true, cwd: this.#dir });
    this.#children.add(child);
    let out = '', err = '', killed = false;
    child.stdout.on('data', d => { if (out.length < maxOut) out += d; });
    child.stderr.on('data', d => { if (err.length < 4 << 20) err += d; });
    const timer = setTimeout(() => { killed = true; child.kill(); }, timeout);
    const code = await new Promise(resolve => {
      child.on('error', () => resolve(-1));
      child.on('close', resolve);
    });
    clearTimeout(timer);
    this.#children.delete(child);
    if (killed) throw new Error('arduino-cli non ha finito in tempo');
    if (!json) return { code, out, err };
    let data = null;
    try { data = out.trim() ? JSON.parse(out) : null; } catch { /* not JSON */ }
    if (code !== 0 && !(data && 'compiler_err' in data)) {
      const message = data?.error ?? err.trim().split('\n').filter(Boolean).at(-1) ?? `arduino-cli: errore ${code}`;
      throw new Error(String(message).slice(0, 500));
    }
    return data;
  }

  // ---------- Setup ----------

  /** { ready, lsp, core: version | null, tools: { cli, ls, clangd } } */
  async status() {
    const [cli, ls, clangd] = await Promise.all(['cli', 'ls', 'clangd'].map(k => findTool(this.#dir, k)));
    const core = await this.#coreVersion();
    return {
      ready: !!cli && !!core,
      lsp: !!ls && !!clangd,
      lspPossible: available('ls') && available('clangd'),
      core,
      tools: { cli: !!cli, ls: !!ls, clangd: !!clangd },
      setting: this.#setup !== null,
    };
  }

  async #coreVersion() {
    const base = join(this.#dir, 'arduino', 'packages', 'arduino', 'hardware', 'avr');
    const versions = (await readdir(base).catch(() => [])).filter(v => /^\d+\.\d+\.\d+$/.test(v));
    return versions.sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))[0] ?? null;
  }

  /**
   * Gets everything ready: the tools, the indexes, the package of the AVR boards (Uno, Nano, Mega).
   * progress({ step, done?, total? }); steps 'cli' | 'ls' | 'clangd' | 'index' | 'core' | 'libraries'.
   * Several pages asking at once share the same run.
   */
  setup(progress = () => {}) {
    if (this.#setup) {
      this.#setup.listeners.add(progress);
      return this.#setup.promise.finally(() => this.#setup?.listeners.delete(progress));
    }
    const listeners = new Set([progress]);
    const tell = p => listeners.forEach(fn => { try { fn(p); } catch { /* a page that went */ } });
    const promise = (async () => {
      for (const key of ['cli', 'ls', 'clangd']) {
        if (!available(key)) continue;
        tell({ step: key, done: 0, total: 0 });
        await ensureTool(this.#dir, key, { progress: p => tell({ step: key, done: p.done, total: p.total }) });
      }
      const { file } = await this.configShared();
      await this.#lock.write(async () => {
        tell({ step: 'index' });
        await this.cli(['core', 'update-index'], { config: file, timeout: 300_000 });
        if (!await this.#coreVersion()) {
          tell({ step: 'core' });
          await this.cli(['core', 'install', CORE], { config: file, timeout: 1_800_000 });
        }
        tell({ step: 'libraries' });
        await this.cli(['lib', 'update-index'], { config: file, timeout: 300_000 });
        await this.libraries.rebuild();
      });
      return this.status();
    })();
    this.#setup = { promise, listeners };
    return promise.finally(() => { this.#setup = null; });
  }

  async #needReady() {
    if (!(await this.status()).ready) throw Object.assign(new Error('Arduino non è ancora pronto: serve la preparazione'), { code: 'not_ready' });
  }

  /** The library index is refreshed once a day, when someone searches; a failed try waits 10 minutes. */
  async #freshIndex() {
    const when = await stat(join(this.#dir, 'arduino', 'library_index.json')).then(s => s.mtimeMs, () => 0);
    if (Date.now() - when < INDEX_DAYS * 86_400_000 || Date.now() - this.#indexTried < INDEX_RETRY) return this.libraries.load();
    this.#indexTried = Date.now();
    const { file } = await this.configShared();
    await this.#lock.write(async () => {
      await this.cli(['lib', 'update-index'], { config: file, timeout: 300_000 }).catch(err => this.#log.warn(`Indice delle librerie non aggiornato: ${err.message}`));
      await this.libraries.rebuild();
    });
  }

  // ---------- Boards ----------

  /** [{ fqbn, name }] of the installed packages. */
  async boards(principal) {
    await this.#needReady();
    const { file } = await this.configFor(principal);
    const data = await this.#lock.read(() => this.cli(['board', 'listall'], { config: file, json: true }));
    return (data?.boards ?? []).map(b => ({ fqbn: b.fqbn, name: b.name })).filter(b => FQBN.test(b.fqbn ?? ''));
  }

  /** [{ option, label, values: [{ value, label, selected }] }]: the board's menus (processor…). */
  async boardOptions(principal, fqbn) {
    await this.#needReady();
    if (!FQBN.test(fqbn ?? '')) throw bad('Scheda non valida');
    const { file } = await this.configFor(principal);
    const data = await this.#lock.read(() => this.cli(['board', 'details', '-b', fqbn], { config: file, json: true }));
    return (data?.config_options ?? []).map(o => ({
      option: o.option, label: o.option_label,
      values: (o.values ?? []).map(v => ({ value: v.value, label: v.value_label, selected: v.selected === true })),
    }));
  }

  // ---------- Compiling ----------

  /**
   * Compiles a sketch: { fqbn, sketch: { name, files: { path: text } }, libraries?: { path: text } }
   * (libraries: the user's own, '<Library>/<path>'). Returns { success, sizes, hex, output,
   * diagnostics }: paths in output and diagnostics are relative, the sketch's files as they are,
   * the user's libraries as 'libraries/…', anything else by its name only.
   */
  async compile(principal, { fqbn, sketch, libraries }, onLog = () => {}) {
    await this.#needReady();
    if (!FQBN.test(fqbn ?? '')) throw bad('Scheda non valida');
    const name = sketch?.name;
    if (!SKETCH_NAME.test(name ?? '')) throw bad('Nome dello sketch non valido: lettere, cifre, _ . - (al massimo 63, senza spazi)');
    const files = checkFiles(sketch.files);
    if (!Object.hasOwn(files, `${name}.ino`)) throw bad(`Manca ${name}.ino`);
    const libs = libraries ? checkFiles(libraries, { what: 'Le librerie' }) : {};
    const { file, key } = await this.configFor(principal);
    const mine = this.#compiling.get(key) ?? 0;
    if (mine >= COMPILES_PER_USER) throw Object.assign(new Error('Aspetta che finiscano le compilazioni già avviate'), { code: 'rate_limited' });
    this.#compiling.set(key, mine + 1);
    return this.#slots.run(() => this.#lock.read(async () => {
      const work = join(this.#dir, 'work', key, `c-${randomBytes(6).toString('hex')}`);
      const sketchDir = join(work, name), libDir = join(work, 'libraries');
      const build = join(this.#dir, 'build', key, `${name}-${createHash('sha1').update(fqbn).digest('hex').slice(0, 10)}`);
      try {
        await writeFiles(sketchDir, files);
        await writeFiles(libDir, libs);
        await mkdir(build, { recursive: true });
        onLog({ step: 'compile' });
        const data = await this.cli([
          'compile', '-b', fqbn, '--build-path', build, '--warnings', 'default',
          ...(Object.keys(libs).length ? ['--libraries', libDir] : []), sketchDir,
        ], { config: file, json: true, timeout: 300_000 });
        const clean = text => relativize(String(text ?? ''), [[sketchDir, ''], [libDir, 'libraries'], [build, '(build)'], [this.#dir, '(arduino)']]);
        const err = clean(data?.compiler_err), out = clean(data?.compiler_out);
        const success = data?.success === true;
        let hex = null;
        if (success) hex = await readFile(join(build, `${name}.ino.hex`), 'utf8').catch(() => null);
        return {
          success,
          sizes: (data?.builder_result?.executable_sections_size ?? []).map(s => ({ name: s.name, size: s.size, max: s.max_size ?? 0 })),
          hex,
          output: `${out}${err}`.slice(0, 1 << 20),
          error: success ? null : clean(data?.error ?? '').slice(0, 2000),
          diagnostics: parseDiagnostics(err),
        };
      } finally {
        await rm(work, { recursive: true, force: true }).catch(() => {});
      }
    })).finally(() => {
      const left = (this.#compiling.get(key) ?? 1) - 1;
      if (left > 0) this.#compiling.set(key, left); else this.#compiling.delete(key);
    });
  }

  async #pruneBuilds() {
    const base = join(this.#dir, 'build');
    for (const user of await readdir(base).catch(() => [])) {
      for (const b of await readdir(join(base, user)).catch(() => [])) {
        const path = join(base, user, b);
        const s = await stat(path).catch(() => null);
        if (s && Date.now() - s.mtimeMs > BUILD_DAYS * 86_400_000) await rm(path, { recursive: true, force: true }).catch(() => {});
      }
    }
  }

  // ---------- Libraries ----------

  /** The user's libraries: [{ name, version, location: 'user' | 'platform', examples: [path] }]. */
  async installed(principal) {
    await this.#needReady();
    const { file, user } = await this.configFor(principal);
    const data = await this.#lock.read(() => this.cli(['lib', 'list', '--all'], { config: file, json: true }));
    return (data?.installed_libraries ?? []).map(({ library: l }) => ({
      name: l.name, version: l.version ?? '', sentence: l.sentence ?? '',
      location: l.location === 'user' ? 'user' : 'platform',
      examples: (l.examples ?? []).map(p => relative(l.install_dir ?? user, p).split(sep).join('/')).filter(p => p && !p.startsWith('..')),
      includes: (l.provides_includes ?? []).filter(h => typeof h === 'string' && /^[\w./+-]{1,100}$/.test(h)).slice(0, 10),
    })).filter(l => l.name);
  }

  /** Search in the index: { query, type: 'all' | 'installed' | 'updatable', topic } → [library]. */
  async search(principal, { query = '', type = 'all', topic = '' } = {}) {
    await this.#needReady();
    await this.#freshIndex();
    const installed = new Map((await this.installed(principal)).filter(l => l.location === 'user').map(l => [l.name, l.version]));
    return this.libraries.search(String(query).slice(0, 100), { type, topic: String(topic).slice(0, 60), installed });
  }

  topics() { return this.libraries.topics(); }

  /** Who provides a header file: [library], the ones that declare it first. */
  async provides(principal, header) {
    await this.#needReady();
    if (typeof header !== 'string' || !/^[\w./+-]{1,100}$/.test(header)) throw bad('Nome di file non valido');
    await this.libraries.load();
    return this.libraries.provides(header);
  }

  /** The libraries one needs: [{ name, version, installed }] (itself included). */
  async dependencies(principal, name, version) {
    await this.#needReady();
    const spec = libSpec(name, version);
    const { file } = await this.configFor(principal);
    const data = await this.#lock.read(() => this.cli(['lib', 'deps', spec], { config: file, json: true }));
    return (data?.dependencies ?? []).map(d => ({ name: d.name, version: d.version_required ?? '', installed: d.version_installed ?? null }));
  }

  async install(principal, name, version, { deps = true } = {}) {
    await this.#needReady();
    const spec = libSpec(name, version);
    const { file } = await this.configFor(principal);
    await this.#lock.read(() => this.cli(['lib', 'install', spec, ...(deps ? [] : ['--no-deps'])], { config: file, json: true, timeout: 600_000 }));
  }

  async uninstall(principal, name) {
    await this.#needReady();
    if (!LIB_NAME.test(name ?? '')) throw bad('Libreria non valida');
    const { file } = await this.configFor(principal);
    await this.#lock.read(() => this.cli(['lib', 'uninstall', name], { config: file, json: true }));
  }

  /** The files of an example of an installed library: { name, files: { path: text } }. */
  async example(principal, library, path) {
    const lib = (await this.installed(principal)).find(l => l.name === library) ?? (() => { throw bad('Libreria non installata'); })();
    if (!lib.examples.includes(path)) throw bad('Esempio inesistente');
    const { file, user } = await this.configFor(principal);
    const data = await this.#lock.read(() => this.cli(['lib', 'list', '--all'], { config: file, json: true }));
    const found = (data?.installed_libraries ?? []).find(x => x.library?.name === library)?.library;
    const dir = join(found?.install_dir ?? user, ...path.split('/'));
    const files = {};
    const walk = async (d, prefix, depth) => {
      for (const e of await readdir(d, { withFileTypes: true }).catch(() => [])) {
        const rel = prefix ? `${prefix}/${e.name}` : e.name;
        if (e.isDirectory() && depth < 3) await walk(join(d, e.name), rel, depth + 1);
        else if (e.isFile()) {
          try { checkPath(rel); } catch { continue; }
          const s = await stat(join(d, e.name));
          if (s.size <= 512 << 10) files[rel] = await readFile(join(d, e.name), 'utf8');
        }
      }
    };
    await walk(dir, '', 0);
    return { name: path.split('/').at(-1), files };
  }
}

function libSpec(name, version) {
  if (!LIB_NAME.test(name ?? '')) throw bad('Libreria non valida');
  if (version != null && version !== '' && !VERSION.test(version)) throw bad('Versione non valida');
  return version ? `${name}@${version}` : name;
}

/**
 * Paths of the kernel's computer in the compiler's text, made relative: [[folder, label]] in order
 * (the first that matches wins). gcc may write them in lower case or with either slash.
 */
export function relativize(text, folders) {
  let out = text;
  for (const [dir, label] of folders) {
    const variants = new Set([dir, dir.replace(/\\/g, '/'), dir.replace(/\//g, '\\')]);
    for (const v of variants) {
      const re = new RegExp(`${v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\\\/]?`, process.platform === 'win32' ? 'gi' : 'g');
      out = out.replace(re, label ? `${label}/` : '');
    }
  }
  return out;
}

/** gcc's 'file:line:col: error: text' lines → [{ file, line, col, severity, message }]. */
export function parseDiagnostics(text) {
  const found = [];
  for (const line of text.split(/\r?\n/)) {
    const m = /^(.+?):(\d+):(?:(\d+):)? (fatal error|error|warning|note): (.*)$/.exec(line);
    if (!m) continue;
    const file = m[1].replace(/\\/g, '/');
    found.push({ file, line: Number(m[2]), col: Number(m[3] ?? 1), severity: m[4] === 'fatal error' ? 'error' : m[4], message: m[5].slice(0, 500) });
    if (found.length >= 200) break;
  }
  return found;
}

