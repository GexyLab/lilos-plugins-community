import { h } from './dom.js';

/**
 * The skeleton isolated apps share (Zip, FileCrypt): they have no lilOS SDK, only `lilos`.
 * Nothing here imports the SDK.
 */

/** The file an app was opened or launched with: args.file, otherwise the first of args.files, or null. */
export const fileFromArgs = args => args?.file ?? (Array.isArray(args?.files) ? args.files[0] : null) ?? null;

/**
 * Tells an automation being recorded what the user did (an action of the manifest's
 * contributes.automation): data { params, result?, defaults? }, never a password. A lilOS without
 * lilos.automation, or a failure, only means the step is not recorded.
 */
export async function recordStep(lilos, id, data) {
  try { await lilos.automation?.record(id, data); } catch { /* not recorded */ }
}

/** Calls lilos gets: redraw when the language of the system changes. Returns what stops it. */
export const onLocale = (lilos, redraw) => lilos.on('locale', redraw);

/**
 * The window's root: the style, a box (<div class="className">) to draw in, and draw(box) again
 * when the language changes.
 *   const { box, redraw, off } = frame(lilos, root, { style: STYLE, className: 'fc' }, box => box.replaceChildren(…));
 * off() stops following the language (call it when the window closes).
 */
export function frame(lilos, root, { style, className }, draw) {
  if (style) root.append(h('style', {}, style));
  const box = h('div', { class: className });
  root.append(box);
  const redraw = () => draw(box);
  const off = onLocale(lilos, redraw);
  return { box, redraw, off };
}

/**
 * An error in words, from its code (err.message):
 *   known   { code: key } or [code…] (the key is `error.<code>`)
 *   params  for the app's text, besides { detail }: err.detail as a string
 * Unknown codes: t('error.generic', { error }), the app's own key.
 */
export function explain(t, err, known, params = {}) {
  const code = err?.message;
  const key = Array.isArray(known) ? (known.includes(code) ? `error.${code}` : null) : (known && Object.hasOwn(known, code) ? known[code] : null);
  return key ? t(key, { detail: String(err?.detail ?? ''), ...params }) : t('error.generic', { error: code ?? String(err) });
}

/**
 * The background entry point of an isolated app: answers lilOS's calls (lilos.handle).
 *   automation  { 'app.action': async (params, data) => result }: a step of an automation
 *               done again, without asking anything ({ automation: { action, params } }; params
 *               is always an object). An error is thrown again in words (explainError); one
 *               with the message 'unknown' as it is.
 *   actions     { 'app.action': async (files, data) => result }: an action of the menu of files
 *               ({ action, files }; files is always an array)
 *   onError     (err, data) → result: an action failed (tell the user, return what lilOS gets);
 *               without it the error goes to lilOS
 *   other       (data) → result: any other call ({ op: … } of the app's own windows)
 *   explainError  (err) → string: the words of an automation's error (default: err.message)
 * A call nothing answers throws Error('unknown').
 */
export function background(lilos, { automation = {}, actions = {}, onError = null, other = null, explainError = err => err?.message ?? String(err) } = {}) {
  lilos.handle(async data => {
    if (data?.automation) {
      const { action, params } = data.automation;
      const run = typeof action === 'string' && Object.hasOwn(automation, action) ? automation[action] : null;
      if (!run) throw new Error('unknown');
      try {
        return await run(params && typeof params === 'object' ? params : {}, data);
      } catch (err) {
        throw err?.message === 'unknown' ? err : new Error(explainError(err));
      }
    }
    const action = typeof data?.action === 'string' && Object.hasOwn(actions, data.action) ? actions[data.action] : null;
    if (action) {
      try {
        return await action(Array.isArray(data.files) ? data.files : [], data);
      } catch (err) {
        if (!onError) throw err;
        return onError(err, data);
      }
    }
    if (other) return other(data);
    throw new Error('unknown');
  });
}
