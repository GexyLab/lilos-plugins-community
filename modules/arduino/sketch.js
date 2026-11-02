import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

/**
 * The files a page sends (a sketch, the user's own libraries) before they reach the disk of the
 * kernel's computer and the compiler.
 *
 * The compiler runs with the kernel's rights, so a sketch must not make it read files outside what
 * it was given: an #include (#import, #embed) of an absolute path, with '..' or made by a macro
 * would show pieces of that file in the errors; inline assembler (and `.incbin`) could put a whole
 * file in the program the user downloads; build_opt.h and the like would add options to the
 * compiler's command line, and `ldflags` in library.properties to the linker's. Those are refused
 * (compile) or blanked out (the editor's suggestions, see blank()). The text is read as the
 * preprocessor reads it: \r, \r\n and \n end a line, \f and \v are spaces, a backslash followed by
 * spaces and a newline splices two lines, comments, strings, raw strings and the '%:' digraph count.
 *
 * This is a filter, not a sandbox: on a server whose users are not trusted, run the kernel as a
 * user that cannot read anything secret.
 */
export const SKETCH_NAME = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,62}$/;
const SEGMENT = /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,99}$/;
const EXTENSIONS = new Set(['ino', 'pde', 'h', 'hh', 'hpp', 'hxx', 'c', 'cc', 'cpp', 'cxx', 'tpp', 'ipp', 'txt', 'md', 'properties']);
/** Names arduino-cli or the toolchain read as options, not as code; Windows' reserved device names. */
const RESERVED = /^(build_opt\.h|build_extra_flags\.h|(platform|boards|programmers)(\.local)?\.txt|(con|prn|aux|nul|com\d|lpt\d)(\..*)?)$/i;
/** library.properties keys that reach the compiler's or the linker's command line. */
const UNSAFE_PROPERTY = /^[ \t]*(ldflags|precompiled|dot_a_linkage)[ \t]*=/im;
const MAX_FILES = 300;
const MAX_TOTAL = 4 << 20;
const MAX_DEPTH = 6;

const bad = message => Object.assign(new Error(message), { code: 'invalid' });

/** 'src/a.cpp' → checked path, or an error. */
export function checkPath(path) {
  if (typeof path !== 'string' || !path || path.length > 300) throw bad('Nome di file non valido');
  const parts = path.split('/');
  if (parts.length > MAX_DEPTH || parts.some(p => !SEGMENT.test(p) || p.endsWith('.') || RESERVED.test(p))) throw bad(`Nome di file non valido: ${path.slice(0, 80)}`);
  const name = parts.at(-1);
  const ext = name.includes('.') ? name.slice(name.lastIndexOf('.') + 1) : '';
  if (!EXTENSIONS.has(ext) || (ext === 'properties' && name !== 'library.properties')) throw bad(`Tipo di file non ammesso: ${name.slice(0, 80)}`);
  return path;
}

/** { path: text } from the page, checked: names, sizes and what the compiler would read. */
export function checkFiles(files, { what = 'Lo sketch' } = {}) {
  if (!files || typeof files !== 'object' || Array.isArray(files)) throw bad(`${what}: file mancanti`);
  const entries = Object.entries(files);
  if (entries.length > MAX_FILES) throw bad(`${what}: troppi file`);
  let total = 0;
  for (const [path, text] of entries) {
    checkPath(path);
    if (typeof text !== 'string') throw bad(`${path}: contenuto non valido`);
    total += text.length;
    if (total > MAX_TOTAL) throw bad(`${what}: troppo grande`);
    if (path.endsWith('library.properties')) {
      if (UNSAFE_PROPERTY.test(text)) throw bad(`${path}: ldflags, precompiled e dot_a_linkage non sono ammessi`);
      continue;
    }
    const problem = forbidden(text)[0];
    if (problem) throw bad(`${path}, riga ${problem.line}: ${problem.reason}`);
  }
  return files;
}

/** Writes checked files under `dir`. */
export async function writeFiles(dir, files) {
  for (const [path, text] of Object.entries(files)) {
    const target = join(dir, ...path.split('/'));
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, text);
  }
}

const SPLICE = '\u0000';

/** Same length, one kind of line end: \r\n → ' \n', a lone \r → \n, \f and \v → space. */
function normalize(text) {
  const out = text.split('');
  for (let i = 0; i < out.length; i++) {
    if (out[i] === '\r') out[i] = out[i + 1] === '\n' ? ' ' : '\n';
    else if (out[i] === '\f' || out[i] === '\v') out[i] = ' ';
  }
  return out.join('');
}

/** At i a backslash, then spaces and a newline? Returns the index after the newline, or -1. */
function spliceAt(t, i) {
  if (t[i] !== '\\') return -1;
  let k = i + 1;
  while (t[k] === ' ' || t[k] === '\t') k++;
  return t[k] === '\n' ? k + 1 : -1;
}

/**
 * The normalized text as the preprocessor sees it, same length: comments become spaces, splices
 * are marked SPLICE (forbidden() drops them). Strings, character literals and raw strings are kept
 * as they are, so a "/*" inside one does not open a comment.
 */
function plain(t) {
  const out = t.split('');
  let i = 0;
  const n = out.length;
  while (i < n) {
    const c = out[i], d = out[i + 1];
    const splice = spliceAt(t, i);
    if (splice > 0) {
      for (let k = i; k < splice; k++) out[k] = SPLICE;
      i = splice;
    } else if (c === 'R' && d === '"' && !/[A-Za-z0-9_]/.test(rawPrefixBefore(t, i))) {
      const open = t.indexOf('(', i + 2);
      const delim = open < 0 ? null : t.slice(i + 2, open);
      if (delim !== null && /^[^\s()\\]{0,16}$/.test(delim)) {
        const end = t.indexOf(`)${delim}"`, open + 1);
        i = end < 0 ? n : end + delim.length + 2;
        continue;
      }
      i++;
    } else if (c === '"' || c === '\'') {
      let k = i + 1;
      while (k < n && out[k] !== c && out[k] !== '\n') {
        const s = spliceAt(t, k);
        k = s > 0 ? s : k + (out[k] === '\\' ? 2 : 1);
      }
      i = k + 1;
    } else if (c === '/' && d === '*') {
      const end = t.indexOf('*/', i + 2);
      const stop = end < 0 ? n : end + 2;
      for (let k = i; k < stop; k++) if (out[k] !== '\n') out[k] = ' ';
      i = stop;
    } else if (c === '/' && d === '/') {
      while (i < n && out[i] !== '\n') {
        const s = spliceAt(t, i);
        if (s > 0) { for (let k = i; k < s; k++) if (out[k] !== '\n') out[k] = ' '; i = s; continue; }   // the comment goes on
        out[i++] = ' ';
      }
    } else i++;
  }
  return out.join('');
}

/** The character before a raw string's R, skipping its encoding prefix (u8R, uR, UR, LR). */
function rawPrefixBefore(text, i) {
  let k = i;
  if (text.slice(k - 2, k) === 'u8') k -= 2;
  else if ('uUL'.includes(text[k - 1] ?? '')) k -= 1;
  return text[k - 1] ?? ' ';
}

const DIRECTIVE = /^[ \t]*(?:#|%:)[ \t]*(include_next|include|import|embed)\b(.*)$/;
const HAS_INCLUDE = /__has_(?:include_next|include|embed)\s*\(\s*([^)]*)\)/g;
const ASM = /\b(?:__asm__|__asm|asm)\b/;

/** Is the path of an #include one that stays among what the compiler was given? */
function safeTarget(arg) {
  const m = /^\s*(<([^>]*)>|"([^"]*)")/.exec(arg);
  if (!m) return false;                               // a macro: its value cannot be checked
  const path = (m[2] ?? m[3] ?? '').replace(/\\/g, '/');
  if (!path || path.startsWith('/') || /^[A-Za-z]:/.test(path) || path.split('/').includes('..')) return false;
  return true;
}

/** [{ line (1-based), start, end, reason }] of what may read outside the sketch (offsets in `text`). */
export function forbidden(text) {
  const t = normalize(text);
  // The text without the splices, and where each of its characters was
  const marked = plain(t);
  const map = [];
  let logical = '';
  for (let k = 0; k < marked.length; k++) {
    if (marked[k] === SPLICE) continue;
    map.push(k);
    logical += marked[k];
  }
  map.push(marked.length);
  const found = [];
  const lineAt = at => t.slice(0, at).split('\n').length;
  const spot = (s, e, reason) => found.push({ line: lineAt(map[s]), start: map[s], end: e > s ? map[e - 1] + 1 : map[s], reason });
  let offset = 0;
  for (const line of logical.split('\n')) {
    const whole = () => offset + line.length;
    const m = DIRECTIVE.exec(line);
    if (m && !safeTarget(m[2])) spot(offset, whole(), `#${m[1]} di un percorso assoluto, con «..» o fatto da una macro: non è ammesso`);
    for (const h of line.matchAll(HAS_INCLUDE)) {
      if (!safeTarget(h[1])) spot(offset, whole(), '__has_include di un percorso non ammesso');
    }
    if (ASM.test(line)) spot(offset, whole(), 'l’assembler inline non è ammesso');
    const low = line.toLowerCase();
    for (const word of ['incbin', '.include']) {
      let at = low.indexOf(word);
      while (at >= 0) {
        spot(offset + at, offset + at + word.length, `${word.replace(/^\./, '')} non è ammesso`);
        at = low.indexOf(word, at + word.length);
      }
    }
    offset += line.length + 1;
  }
  return found;
}

/** The text with what forbidden() finds turned into spaces (same length, same lines). */
export function blank(text) {
  const spots = forbidden(text);
  if (!spots.length) return text;
  const out = text.split('');
  for (const { start, end } of spots) for (let k = start; k < end && k < out.length; k++) if (out[k] !== '\n' && out[k] !== '\r') out[k] = ' ';
  return out.join('');
}
