import { explain as explainCode } from '../shared/sandbox/app.js';

/**
 * Words shared by the windows and the entry point `work`: the errors of archive.js and what was
 * left out of an archive, in the language of the system (locales.json). Sizes are lilOS's
 * (lilos.locale.formatBytes).
 */
export const MAX_FILE = 10 << 20;   // lilOS saves files up to 10 MB (methods.js MAX_BYTES)

const KNOWN = ['nothing', 'tooMany', 'tooBig', 'resultTooBig', 'read', 'corrupt', 'empty', 'skippedAll', 'notArchive', 'outside',
  'format', 'single', 'write', 'password', 'encrypted', 'compression', 'memory'];

/** An error of archive.js (or its code from `work`, { error, detail }), in words. */
export function explain(lilos, err) {
  const size = n => lilos.locale.formatBytes(n);
  const code = { message: err?.error ?? err?.message, detail: err?.detail };
  return explainCode((k, p) => lilos.locale.i18n.t(k, p), code, KNOWN, {
    ...(typeof code.detail === 'number' && { detail: size(code.detail) }), limit: size(MAX_FILE), max: code.detail,
  });
}

/** What was left out of an archive, in a sentence ('' when nothing). */
export function skippedText(t, skipped) {
  if (!skipped?.length) return '';
  const names = skipped.slice(0, 3).map(s => `${s.name} (${t(`why.${s.why}`)})`).join(', ');
  return t('skipped', { n: skipped.length, names: skipped.length > 3 ? `${names}, …` : names });
}
