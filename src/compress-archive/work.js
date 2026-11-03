import { pack, unpack, list, FORMATS, LEVELS } from './archive.js';
import { explain, skippedText } from './text.js';
import { background, recordStep } from '../shared/sandbox/app.js';

/**
 * The entry point `work`, in a file of its own (dist/work.js): the only one with the archive
 * engine (~1 MB of WebAssembly), so the windows stay light. It runs in the background (a sandbox
 * or a Web Worker) and answers
 *   the menu of files and folders  { action: 'compress-archive.zip' | '….targz' | '….extract', files }:
 *                                  does it and notifies
 *   the windows (lilos.app.call)   { op: 'list' | 'extract' | 'compress', … } → the result, or { error, detail }
 *   an automation (Automata)       { automation: { action, params }, files } → the id of what it made
 * Passwords are used for one call and never kept.
 */
const ID = 'compress-archive';

const text = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');

export async function work({ lilos }) {
  const t = (k, p) => lilos.locale.i18n.t(k, p);
  const size = n => lilos.locale.formatBytes(n);
  // A notification refused (lilOS allows 10 a minute to an app) does not undo what was done
  const tell = (words, level) => Promise.resolve().then(() => lilos.ui.notify({ text: words, level })).catch(() => {});

  async function compress(ids, { format = 'zip', level = 'normal', password = '', name = '' } = {}) {
    const result = await pack(lilos, ids, { format, level, password, name, archiveName: t('archive.name') });
    await tell(t('done.pack', { name: result.name, n: result.count, size: size(result.size) }), 'success');
    // With a password the step is not recorded: done again, it would ask for nothing and make an archive without one
    if (!password) await recordStep(lilos, `${ID}.compress`, { params: { items: ids, format, level }, result: result.id });
    return result;
  }

  async function extract(id, options = {}) {
    const result = await unpack(lilos, id, options);
    await tell([t('done.unpack', { name: result.name, n: result.count }), skippedText(t, result.skipped)].filter(Boolean).join(' '), result.skipped.length ? 'warning' : 'success');
    // One step for each archive: it is what the action does again
    if (!options.password && !options.only) await recordStep(lilos, `${ID}.extract`, { params: { file: id }, result: result.id });
    return result;
  }

  /** A call of one of the app's windows: the data comes from the app, but is checked all the same. */
  async function answer(data) {
    if (typeof data?.op !== 'string') throw new Error('unknown');
    const ids = Array.isArray(data.files) ? data.files.filter(f => typeof f === 'string') : [];
    const password = text(data.password, 1000);
    try {
      if (data.op === 'list') return await list(lilos, data.file, { password });
      if (data.op === 'extract') {
        const only = Array.isArray(data.only) ? data.only.filter(p => typeof p === 'string').slice(0, 10000) : null;
        return await extract(data.file, { password, only: only?.length ? only : null });
      }
      if (data.op === 'compress') {
        return await compress(ids, { format: text(data.format, 10), level: text(data.level, 10), password, name: text(data.name, 255) });
      }
    } catch (err) {
      return { error: err?.message ?? String(err), detail: err?.detail ?? null };
    }
    throw new Error('unknown');
  }

  background(lilos, {
    // A step of an automation, done again without asking anything: the id of what it made
    automation: {
      [`${ID}.compress`]: async params => {
        const format = Object.hasOwn(FORMATS, params.format) ? params.format : 'zip';
        const level = LEVELS.includes(params.level) ? params.level : 'normal';
        return (await pack(lilos, Array.isArray(params.items) ? params.items : [], { format, level, archiveName: t('archive.name') })).id;
      },
      [`${ID}.extract`]: async params => {
        if (typeof params.file !== 'string') throw new Error('unknown');
        return (await unpack(lilos, params.file)).id;
      },
    },
    actions: {
      [`${ID}.zip`]: async ids => ({ name: (await compress(ids, { format: 'zip' })).name }),
      [`${ID}.targz`]: async ids => ({ name: (await compress(ids, { format: 'tar.gz' })).name }),
      [`${ID}.extract`]: async ids => {
        const names = [];
        for (const id of ids) {
          try {
            names.push((await extract(id)).name);
          } catch (err) {
            // Protected by a password: the window of the archive asks for it
            if (err?.message !== 'password') throw err;
            await tell(explain(lilos, err), 'info');
            await lilos.app.call('main', { file: id, extract: true });
          }
        }
        return { names };
      },
    },
    onError: async err => {
      await tell(explain(lilos, err), 'error');
      return { error: err?.message ?? String(err) };
    },
    other: answer,
    explainError: err => explain(lilos, err),
  });
}
