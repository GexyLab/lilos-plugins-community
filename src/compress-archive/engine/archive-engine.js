import createLibarchive from './libarchive.js';

/**
 * libarchive from JavaScript (the calls of native/glue.c): archives read from bytes and written to
 * bytes, nothing else. It knows nothing of lilOS: archive.js uses it. Loaded only by the entry
 * point `work` (work.js): the WebAssembly is ~1 MB that the windows never need.
 *
 * Errors are Error(code) with a `detail`, as in archive.js: 'corrupt', 'password' (missing or
 * wrong), 'encrypted' (a kind of encryption libarchive cannot open), 'big', 'memory'.
 */
const EOF = 1, WARN = -20;
const CHUNK = 1 << 20;
const IFMT = 0o170000, IFREG = 0o100000, IFDIR = 0o040000;

const fail = (code, detail) => Object.assign(new Error(code), { detail });

/** libarchive's codes (archive.h): format families and filters. */
const FORMAT = { 0x10000: 'cpio', 0x30000: 'tar', 0x40000: 'iso', 0x50000: 'zip', 0x60000: 'empty', 0x90000: 'raw', 0xd0000: 'rar', 0xe0000: '7z', 0x100000: 'rar5' };
const FILTER = { 1: 'gzip', 2: 'bzip2', 5: 'lzma', 6: 'xz' };

let loading = null;

/** The engine, made once: `factory` is the module of the build (another one for the tests). */
export function engine(factory = createLibarchive) {
  loading ??= factory().then(m => {
    m._la_init();
    return makeEngine(m);
  });
  return loading;
}

function makeEngine(m) {
  /** A UTF-8 copy of `text` in the WebAssembly memory (0 for none): free it with m._free. */
  const cstr = text => (text ? m.stringToNewUTF8(text) : 0);
  /** `bytes` copied into the WebAssembly memory. */
  const put = bytes => {
    const at = m._malloc(Math.max(bytes.length, 1));
    if (!at) throw fail('memory');
    m.HEAPU8.set(bytes, at);
    return at;
  };
  const say = (code, message) => {
    const text = message ? m.UTF8ToString(message) : '';
    if (/passphrase|password/i.test(text)) return fail('password', text);
    if (/encrypt|decrypt|crypto/i.test(text)) return fail('encrypted', text);
    return fail(code, text);
  };

  /**
   * Goes through an archive: `each(entry, about)` for every entry, where
   *   entry  { path, folder, file, size (-1 unknown), mtime (ms, -1 unknown), encrypted, link }
   *   about  { format: 'zip' | 'tar' | 'rar' | 'rar5' | 'iso' | '7z' | 'raw' | …, filters: ['gzip', …] }
   * returns a function to have the content of a file: it gets (data: Uint8Array) or, if the content
   * cannot be read, (null, error) and the reading goes on. `raw`: the content of a compressed file
   * that is not an archive, as one entry. `max`: bytes of one content. → about
   */
  function read(bytes, { password = '', raw = false, max = Infinity, each }) {
    const input = put(bytes);
    const pass = cstr(password);
    const r = m._la_read_open(input, bytes.length, raw ? 1 : 0, pass);
    const buffer = m._malloc(CHUNK);
    try {
      if (!r || !buffer) throw fail('memory');
      if (m._la_read_status(r) < WARN) throw say('corrupt', m._la_read_error(r));
      let about = null;
      for (;;) {
        const status = m._la_read_next(r);
        if (status === EOF) break;
        if (status < WARN) throw say('corrupt', m._la_read_error(r));
        about ??= {
          format: FORMAT[m._la_read_format(r) & 0xff0000] ?? 'other',
          filters: Array.from({ length: m._la_read_filters(r) }, (_, i) => FILTER[m._la_read_filter(r, i)]).filter(Boolean),
        };
        const type = m._la_entry_type(r) & IFMT;
        const entry = {
          path: m.UTF8ToString(m._la_entry_path(r)),
          folder: type === IFDIR,
          file: type === IFREG,
          size: m._la_entry_size(r),
          mtime: m._la_entry_mtime(r),
          encrypted: m._la_entry_encrypted(r) !== 0,
          link: m._la_entry_link(r) !== 0,
        };
        const got = each(entry, about);
        if (!got || !entry.file) {
          if (m._la_read_skip(r) < WARN) throw say('corrupt', m._la_read_error(r));
          continue;
        }
        if (entry.size > max) {
          m._la_read_skip(r);
          got(null, fail('big', entry.size));
          continue;
        }
        const parts = [];
        let total = 0, error = null;
        for (;;) {
          const n = m._la_read_data(r, buffer, CHUNK);
          if (n === 0) break;
          if (n < 0) { error = say('corrupt', m._la_read_error(r)); break; }
          total += n;
          if (total > max) { error = fail('big', total); break; }
          parts.push(m.HEAPU8.slice(buffer, buffer + n));
        }
        if (error) { got(null, error); continue; }
        const data = new Uint8Array(total);
        let at = 0;
        for (const p of parts) { data.set(p, at); at += p.length; }
        got(data);
      }
      return about ?? { format: 'empty', filters: [] };
    } finally {
      if (r) m._la_read_free(r);
      if (buffer) m._free(buffer);
      m._free(input);
      if (pass) m._free(pass);
    }
  }

  /**
   * Writes an archive: entries [{ path: 'a/b.txt', folder?, mtime?, data?: Uint8Array, store? }]
   * (folders before what they hold). format: 'zip' | '7zip' | 'paxr' | 'iso9660' | 'raw';
   * filter: 'none' | 'gzip' | 'bzip2' | 'xz'; options: libarchive's 'module:option=value,…';
   * store: a zip file kept as it is (already compressed). → the bytes of the archive
   */
  function write(entries, { format, filter = 'none', options = '', password = '', onEntry }) {
    const strings = [cstr(format), cstr(filter), cstr(options), cstr(password)];
    const w = m._la_write_open(...strings);
    try {
      if (!w) throw fail('memory');
      if (m._la_write_status(w) < WARN) throw say('write', m._la_write_error(w));
      for (const e of entries) {
        onEntry?.(e);
        if (format === 'zip' && !e.folder) m._la_write_zip_store(w, e.store ? 1 : 0);
        const path = cstr(e.path);
        const data = e.folder ? 0 : put(e.data ?? new Uint8Array());
        try {
          const status = m._la_write_entry(w, path, e.folder ? 1 : 0, Number.isFinite(e.mtime) ? e.mtime : -1, data, e.folder ? 0 : (e.data?.length ?? 0));
          if (status < WARN) throw say('write', m._la_write_error(w));
        } finally {
          m._free(path);
          if (data) m._free(data);
        }
      }
      if (m._la_write_close(w) < WARN) throw say('write', m._la_write_error(w));
      const at = m._la_write_bytes(w);
      return m.HEAPU8.slice(at, at + m._la_write_size(w));
    } finally {
      if (w) m._la_write_free(w);
      for (const s of strings) if (s) m._free(s);
    }
  }

  return { read, write, version: () => m.UTF8ToString(m._la_version()) };
}
