import { engine } from './engine/archive-engine.js';
import { MAX_FILE } from './text.js';

/**
 * Making and opening archives with lilOS's files (only `lilos`, no DOM: it runs in the entry point
 * `work`, a sandbox or a Web Worker). The formats are libarchive's (engine/archive-engine.js).
 * The app works with paths ('~/Documenti/a.txt', permission fs.write:~): an item it is handed is
 * known by id, what is inside a folder and next to it only by path.
 *
 * Errors are Error(code) with a `detail` (a name, a size): the windows and the notifications put
 * them in words (locales.json, error.<code>).
 */
export const MAX_TOTAL = 256 << 20;    // what is read or unpacked at once, in memory
export const MAX_ENTRIES = 10000;

/**
 * What the app makes: libarchive's format and filter, and the extension of the archive.
 * single: one file compressed as it is (note.txt → note.txt.gz); levels: false, nothing to choose.
 */
export const FORMATS = {
  'zip': { ext: 'zip', format: 'zip', password: true },
  '7z': { ext: '7z', format: '7zip' },
  'tar': { ext: 'tar', format: 'paxr', levels: false },
  'tar.gz': { ext: 'tar.gz', format: 'paxr', filter: 'gzip' },
  'tar.bz2': { ext: 'tar.bz2', format: 'paxr', filter: 'bzip2' },
  'tar.xz': { ext: 'tar.xz', format: 'paxr', filter: 'xz' },
  'iso': { ext: 'iso', format: 'iso9660', levels: false },
  'gz': { ext: 'gz', format: 'raw', filter: 'gzip', single: true },
  'bz2': { ext: 'bz2', format: 'raw', filter: 'bzip2', single: true },
  'xz': { ext: 'xz', format: 'raw', filter: 'xz', single: true },
};
export const LEVELS = ['fast', 'normal', 'max'];
// fast, normal, max of each compressor; xz and 7z stop at 7: with 9 xz needs 674 MB to compress
const LEVEL = { zip: [1, 6, 9], gzip: [1, 6, 9], bzip2: [1, 6, 9], xz: [1, 6, 7], '7zip': [1, 6, 7] };

/** The extensions of the archives the app opens (manifest: fileTypes and Extract here). */
export const ARCHIVES = ['zip', '7z', 'tar', 'tgz', 'gz', 'tbz', 'tbz2', 'bz2', 'txz', 'xz', 'rar', 'iso'];
const ARCHIVE_NAME = /\.(tar\.(gz|bz2|xz)|tgz|tbz2?|txz|zip|7z|tar|rar|iso)$/i;
const COMPRESSED_NAME = /\.(gz|bz2|xz|lzma)$/i;

// Already compressed: stored as they are in a zip, packing them again only takes time
const STORED = new Set(['zip', 'gz', 'tgz', 'bz2', 'xz', '7z', 'rar', 'jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'heic', 'mp3', 'm4a', 'aac', 'ogg', 'opus', 'flac', 'mp4', 'm4v', 'mov', 'webm', 'mkv', 'woff', 'woff2', 'docx', 'xlsx', 'pptx', 'odt', 'ods', 'odp', 'epub']);
// What other systems put in archives and nobody wants back
const JUNK = /^(__MACOSX|\.DS_Store|Thumbs\.db|desktop\.ini)$/i;

// The first bytes of compressions libarchive reads (a file compressed as it is may be one of
// them) and of those it is built without
const COMPRESSED = [[0x1f, 0x8b], [0x42, 0x5a, 0x68], [0xfd, 0x37, 0x7a, 0x58, 0x5a, 0x00], [0x5d, 0x00, 0x00]];
const UNSUPPORTED = [
  [[0x28, 0xb5, 0x2f, 0xfd], 'zstd'], [[0x04, 0x22, 0x4d, 0x18], 'lz4'], [[0x4c, 0x5a, 0x49, 0x50], 'lzip'],
  [[0x89, 0x4c, 0x5a, 0x4f], 'lzop'], [[0x1f, 0x9d], 'compress'],
];
const startsWith = (bytes, magic) => magic.every((b, i) => bytes[i] === b);

const fail = (code, detail) => Object.assign(new Error(code), { detail });

const extOf = name => {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot + 1) : '';
};
const baseOf = name => {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(0, dot) : name;
};
/** 'foto.tar.gz' → 'foto' */
const archiveBase = name => name.replace(ARCHIVE_NAME, '') || baseOf(name);

/** A name as lilOS keeps it (fs.js checkName): spaces in one, no '/'. '' when nothing is left. */
const cleanName = name => String(name).replace(/[\u0000-\u001f\u007f]/g, '').replace(/[/\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 255);

/**
 * `name`, or `name 2.ext`, `name 3.ext`… if `taken` (lower-case names) has it, like lilOS's
 * fs.uniqueName: for names inside an archive, and for archives with two extensions (lilOS would
 * give 'Foto.tar 2.gz'; `ext` 'tar.gz' gives 'Foto 2.tar.gz'). The name it gives back is added
 * to `taken`. Folders and other files get their free name from lilOS (`unique` of files.*).
 */
function unique(name, taken, { folder = false, ext = folder ? '' : extOf(name) } = {}) {
  const base = ext ? name.slice(0, -(ext.length + 1)) : name;
  let out = name;
  for (let n = 2; taken.has(out.toLowerCase()); n++) out = `${base} ${n}${ext ? `.${ext}` : ''}`;
  taken.add(out.toLowerCase());
  return out;
}

/** The '~' path of an item (files.info gives it: what the files.* calls take). */
const refOf = info => info.ref ?? fail('outside', info.path);
/** The folder of a '~' path. */
const parent = ref => ref.slice(0, ref.lastIndexOf('/')) || '~';

const namesIn = async (lilos, ref) => new Set((await lilos.files.list(ref)).map(n => n.name.toLowerCase()));

const bytesOf = async (lilos, ref) => new Uint8Array(await (await lilos.files.read(ref, { bytes: true })).arrayBuffer());

/** libarchive's options for a format: compression level, encryption, name of a disc. */
function optionsFor(kind, level, { password, label }) {
  const at = LEVELS.includes(level) ? LEVELS.indexOf(level) : 1;
  const value = n => LEVEL[n][at];
  const out = [];
  if (kind.format === 'zip') {
    out.push(`zip:compression-level=${value('zip')}`);
    if (password) out.push('zip:encryption=aes256');
  }
  if (kind.format === '7zip') out.push('7zip:compression=lzma2', `7zip:compression-level=${value('7zip')}`);
  if (kind.filter) out.push(`${kind.filter}:compression-level=${value(kind.filter)}`);
  // A disc's name: up to 32 capital letters, digits and _ (ISO 9660)
  if (kind.format === 'iso9660') out.push(`iso9660:volume-id=${label.toUpperCase().replace(/[^A-Z0-9_]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 32) || 'LILOS'}`);
  return out.join(',');
}

/**
 * Packs these items (ids of files and folders, in one folder) into a new archive next to the
 * first, in `format` (FORMATS). Named `name` if given, otherwise as the item for one item or
 * `archiveName` for more; a number is added if the name is taken. A zip may have a password.
 * → { name, ref, id, count, size }
 */
export async function pack(lilos, ids, { format = 'zip', level = 'normal', password = '', name = '', archiveName = 'Archive', onProgress } = {}) {
  const kind = FORMATS[format] ?? fail('format', format);
  const top = (await Promise.all(ids.map(id => lilos.files.info(id)))).map(i => ({ ...i, ref: refOf(i) }));
  if (!top.length) throw fail('nothing');
  if (kind.single && (top.length !== 1 || top[0].type !== 'file')) throw fail('single', format);
  const dir = parent(top[0].ref);

  const entries = [];   // folders before what they hold
  let total = 0, count = 0;
  const add = async (path, item, ref) => {
    if (item.type === 'folder') {
      entries.push({ path, folder: true, mtime: item.modified });
      for (const child of await lilos.files.list(ref)) {
        if (child.type === 'file' || child.type === 'folder') await add(`${path}/${child.name}`, child, `${ref}/${child.name}`);
      }
      return;
    }
    if (item.type !== 'file') return;
    if (++count > MAX_ENTRIES) throw fail('tooMany', MAX_ENTRIES);
    total += item.size ?? 0;
    if (total > MAX_TOTAL) throw fail('tooBig', MAX_TOTAL);
    onProgress?.({ count, name: item.name });
    const data = await bytesOf(lilos, ref).catch(err => { throw fail('read', `${item.name}: ${err?.message ?? err}`); });
    entries.push({ path, data, mtime: item.modified, store: STORED.has(extOf(item.name).toLowerCase()) });
  };
  // Items of different folders (a selection in a tree) may have the same name
  const topNames = new Set();
  for (const item of top) await add(unique(item.name, topNames, { folder: item.type === 'folder' }), item, item.ref);

  const first = top[0];
  const wanted = cleanName(name) || (top.length > 1 ? archiveName : first.type === 'folder' || kind.single ? first.name : baseOf(first.name));
  const lib = await engine();
  const bytes = (() => {
    try {
      return lib.write(entries, { format: kind.format, filter: kind.filter, options: optionsFor(kind, level, { password, label: wanted }), password: kind.password ? password : '' });
    } catch (err) {
      throw err?.detail !== undefined ? err : fail('write', err?.message ?? String(err));
    }
  })();
  if (bytes.byteLength > MAX_FILE) throw fail('resultTooBig', bytes.byteLength);
  // The free name chosen here; `unique` still, if the folder changed meanwhile
  const free = unique(`${wanted}.${kind.ext}`, await namesIn(lilos, dir), { ext: kind.ext });
  const made = await lilos.files.write(`${dir}/${free}`, bytes, { unique: true });
  return { name: made.name, ref: made.ref, id: made.id, count, size: bytes.byteLength };
}

/** 'a//b\\c.txt' → ['a', 'b', 'c.txt'] (names as lilOS keeps them), null if unsafe. */
function safePath(raw) {
  const parts = raw.split(/[/\\]+/).filter(p => p !== '' && p !== '.');
  if (parts.includes('..')) return null;
  const path = parts.map(cleanName);
  return path.some(p => !p) ? null : path;
}

/** The name of the content of a file compressed as it is: 'note.txt.gz' → 'note.txt'. */
const rawName = name => cleanName(COMPRESSED_NAME.test(name) ? name.replace(COMPRESSED_NAME, '') : `${baseOf(name)} (1)`) || 'File';

/** The kind of an archive in a few letters: 'tar.gz', 'RAR 5', 'ISO 9660', 'gz'… */
function kindOf({ format, filters }, raw) {
  const filter = { gzip: 'gz', bzip2: 'bz2', xz: 'xz', lzma: 'lzma' }[filters[0]];
  if (raw) return filter ?? 'raw';
  const name = { zip: 'ZIP', tar: 'tar', iso: 'ISO 9660', rar: 'RAR 4', rar5: 'RAR 5', '7z': '7z', empty: '', cpio: 'cpio' }[format] ?? format;
  return filter ? `${name}.${filter}` : name;
}

/**
 * Goes through an archive (its bytes): `want(entry)` says which files to read; their content goes
 * to `got(entry, data)`. Paths are made safe (no '..', no absolute paths); links, devices, files
 * too big and the junk of other systems are left out. A compressed file that is not an archive
 * (note.txt.gz) is one entry named after it.
 * → { kind, raw, entries: [{ raw, path, folder, size, mtime, locked }], skipped: [{ name, why }] }
 */
function scan(lib, bytes, { password = '', name = 'Archive', want = () => false, got = () => {} } = {}) {
  for (const [magic, what] of UNSUPPORTED) if (startsWith(bytes, magic)) throw fail('compression', what);
  const run = raw => {
    const entries = [], skipped = [];
    let total = 0;
    const about = lib.read(bytes, {
      password, raw, max: MAX_FILE,
      each: (e, about) => {
        const path = raw ? [rawName(name)] : safePath(e.path);
        if (!path) { skipped.push({ name: e.path, why: 'unsafe' }); return null; }
        if (!path.length || path.some(p => JUNK.test(p))) return null;
        if (e.link) { skipped.push({ name: e.path, why: 'link' }); return null; }
        if (!e.file && !e.folder) { skipped.push({ name: e.path, why: 'special' }); return null; }
        if (e.file && e.size > MAX_FILE) { skipped.push({ name: e.path, why: 'big' }); return null; }
        // libarchive decrypts only zip: an encrypted entry of a rar or a 7z is left out, no password helps
        if (e.encrypted && about.format !== 'zip') { skipped.push({ name: e.path, why: 'encrypted' }); return null; }
        if (entries.length >= MAX_ENTRIES) throw fail('tooMany', MAX_ENTRIES);
        total += e.file ? Math.max(e.size, 0) : 0;
        if (total > MAX_TOTAL) throw fail('tooBig', MAX_TOTAL);
        const entry = { raw: e.path, path, folder: e.folder, size: e.file ? e.size : 0, mtime: e.mtime, locked: e.encrypted };
        entries.push(entry);
        if (!e.file || !want(entry)) return null;
        return (data, error) => {
          if (error?.message === 'big') skipped.push({ name: e.path, why: 'big' });
          else if (error?.message === 'encrypted') skipped.push({ name: e.path, why: 'encrypted' });
          else if (error) throw error;
          else {
            if (raw) entry.size = data.length;
            got(entry, data);
          }
        };
      },
    });
    return { kind: kindOf(about, raw), raw, entries, skipped };
  };
  try {
    return run(false);
  } catch (err) {
    // Not an archive: a compressed file is read as it is
    if (err?.message === 'corrupt' && /unrecognized archive format/i.test(err.detail) && COMPRESSED.some(m => startsWith(bytes, m))) return run(true);
    if (err?.message === 'corrupt' && /unrecognized archive format/i.test(err.detail)) throw fail('notArchive', name);
    throw err;
  }
}

/**
 * What is in an archive (a file id or a '~' path), without unpacking it.
 * → { name, size, kind, raw, locked, entries: [{ path: ['a', 'b.txt'], folder, size, mtime, locked }], skipped }
 */
export async function list(lilos, file, { password = '' } = {}) {
  const info = await lilos.files.info(file);
  if (info.type !== 'file') throw fail('notArchive', info.name);
  const bytes = await bytesOf(lilos, file).catch(err => { throw fail('read', `${info.name}: ${err?.message ?? err}`); });
  const lib = await engine();
  const { kind, raw, entries, skipped } = scan(lib, bytes, { password, name: info.name });
  return {
    name: info.name, size: info.size ?? bytes.length, kind, raw, locked: entries.some(e => e.locked),
    entries: entries.map(({ path, folder, size, mtime, locked }) => ({ path, folder, size, mtime, locked })),
    skipped,
  };
}

/**
 * Unpacks an archive (a file id or a '~' path) next to it. An archive with a single folder at the
 * top gives that folder; otherwise a new folder named as the archive holds everything; a file
 * compressed as it is (note.txt.gz) gives the file. `only`: the paths ('a/b', folders with what
 * they hold) to unpack, all if missing. Names already taken get a number: nothing is ever
 * overwritten. An encrypted zip needs its `password` (error 'password' otherwise).
 * → { name, ref, id, count, skipped: [{ name, why }] }
 */
export async function unpack(lilos, file, { password = '', only = null, onProgress } = {}) {
  const info = await lilos.files.info(file);
  if (info.type !== 'file') throw fail('notArchive', info.name);
  const bytes = await bytesOf(lilos, file).catch(err => { throw fail('read', `${info.name}: ${err?.message ?? err}`); });
  const chosen = Array.isArray(only) && only.length ? only.map(p => String(p).toLowerCase()) : null;
  const wanted = path => {
    const key = path.join('/').toLowerCase();
    return !chosen || chosen.some(c => key === c || key.startsWith(`${c}/`));
  };
  const contents = new Map();   // raw name in the archive → its bytes
  const lib = await engine();
  const { raw, entries, skipped } = scan(lib, bytes, {
    password, name: info.name,
    want: e => wanted(e.path),
    got: (e, data) => contents.set(e.raw, data),
  });
  const picked = entries.filter(e => wanted(e.path));
  if (!picked.length) throw fail(skipped.length ? 'skippedAll' : 'empty', info.name);
  if (picked.some(e => e.locked && !e.folder && !contents.has(e.raw) && !skipped.some(s => s.name === e.raw))) throw fail('password', info.name);
  const dir = parent(refOf(info));

  // A file compressed as it is: the file, next to the archive
  if (raw) {
    onProgress?.({ count: 1, name: picked[0].path[0] });
    const made = await lilos.files.write(`${dir}/${picked[0].path[0]}`, contents.get(picked[0].raw), { unique: true });
    return { name: made.name, ref: made.ref, id: made.id, count: 1, skipped };
  }

  const single = new Set(picked.map(e => e.path[0].toLowerCase())).size === 1 && picked.every(e => e.path.length > 1 || e.folder);
  const made = await lilos.files.mkdir(`${dir}/${cleanName(single ? picked[0].path[0] : archiveBase(info.name)) || 'Archive'}`, { unique: true });
  const root = made.ref;

  // Where each folder of the archive goes, chosen once; names that differ only by case (lilOS
  // does not tell them apart) get a number
  const folders = new Map();   // archive folder, lower case → its path
  const names = new Map();     // path of a folder → lower-case names taken in it
  const taken = at => names.get(at) ?? names.set(at, new Set()).get(at);
  const folderAt = parts => {
    let at = root;
    for (let i = 0; i < parts.length; i++) {
      const key = parts.slice(0, i + 1).join('/').toLowerCase();
      if (!folders.has(key)) folders.set(key, `${at}/${unique(parts[i], taken(at), { folder: true })}`);
      at = folders.get(key);
    }
    return at;
  };
  const targets = [];   // [path of the file, raw name in the archive]
  for (const e of picked) {
    const inner = single ? e.path.slice(1) : e.path;
    if (e.folder) folderAt(inner);
    else if (contents.has(e.raw)) {
      const at = folderAt(inner.slice(0, -1));
      targets.push([`${at}/${unique(inner.at(-1), taken(at))}`, e.raw]);
    }
  }
  // A parent always comes before its folders in the map
  for (const d of folders.values()) await lilos.files.mkdir(d);
  let count = 0;
  for (const [target, rawName] of targets) {
    onProgress?.({ count: count + 1, name: target.slice(target.lastIndexOf('/') + 1) });
    await lilos.files.write(target, contents.get(rawName));
    count++;
  }
  return { name: made.name, ref: root, id: made.id, count, skipped };
}
