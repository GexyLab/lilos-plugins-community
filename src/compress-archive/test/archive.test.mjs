/**
 * Tests of Compress Archive's engine and of archive.js, in Node, with the engine built for Node by
 * scripts/build-libarchive.mjs (node_modules/.cache/compress-archive) and a `lilos` that keeps
 * files in memory. The rar files in fixtures/ come from libarchive's own tests.
 *
 *   node --test src/compress-archive/test/archive.test.mjs
 */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { engine } from '../engine/archive-engine.js';
import { FORMATS, pack, list, unpack } from '../archive.js';

const here = dirname(fileURLToPath(import.meta.url));
const built = join(here, '..', '..', '..', 'node_modules', '.cache', 'compress-archive', 'libarchive.node.mjs');
const fixture = name => new Uint8Array(readFileSync(join(here, 'fixtures', name)));
let lib;

before(async () => {
  assert.ok(existsSync(built), 'manca il motore per Node: node scripts/build-libarchive.mjs');
  lib = await engine((await import(pathToFileURL(built).href)).default);
});

/** A lilOS home in memory: '~/a/b' → { type, data?, modified }. */
function fakeLilos(files = {}) {
  const nodes = new Map([['~', { type: 'folder', modified: 0 }]]);
  const add = (ref, node) => {
    const up = ref.slice(0, ref.lastIndexOf('/'));
    if (!nodes.has(up)) add(up, { type: 'folder', modified: 0 });
    nodes.set(ref, node);
  };
  for (const [ref, data] of Object.entries(files)) add(ref, data === null ? { type: 'folder', modified: 0 } : { type: 'file', data: typeof data === 'string' ? new TextEncoder().encode(data) : data, modified: Date.UTC(2026, 0, 2) });
  const name = ref => ref.slice(ref.lastIndexOf('/') + 1);
  const free = (ref, folder) => {
    const dot = folder ? -1 : ref.lastIndexOf('.');
    const [base, ext] = dot > ref.lastIndexOf('/') + 1 ? [ref.slice(0, dot), ref.slice(dot)] : [ref, ''];
    let out = ref;
    for (let n = 2; [...nodes.keys()].some(k => k.toLowerCase() === out.toLowerCase()); n++) out = `${base} ${n}${ext}`;
    return out;
  };
  const get = ref => nodes.get(ref) ?? (() => { throw new Error(`not found: ${ref}`); })();
  const lilos = {
    nodes,
    text: ref => new TextDecoder().decode(get(ref).data),
    files: {
      info: async ref => {
        const n = get(ref);
        return { id: ref, name: name(ref), type: n.type, size: n.data?.length ?? 0, modified: n.modified, ref, path: ref === '~' ? '/home/test' : `/home/test${ref.slice(1)}` };
      },
      list: async ref => [...nodes].filter(([k]) => k.startsWith(`${ref}/`) && !k.slice(ref.length + 1).includes('/'))
        .map(([k, n]) => ({ name: name(k), type: n.type, size: n.data?.length ?? 0, modified: n.modified })),
      read: async ref => new Blob([get(ref).data]),
      // As lilOS 1.22: `unique` gives the nearest free name (fs.uniqueName: a number before the last extension)
      write: async (ref, data, { unique } = {}) => {
        if (unique) ref = free(ref, false);
        assert.ok(!nodes.has(ref), `sovrascritto: ${ref}`);
        add(ref, { type: 'file', data, modified: Date.now() });
        return { id: ref, name: name(ref), ref };
      },
      mkdir: async (ref, { unique } = {}) => {
        if (unique) ref = free(ref, true);
        if (!nodes.has(ref)) add(ref, { type: 'folder', modified: Date.now() });
        return { id: ref, name: name(ref), ref };
      },
    },
  };
  return lilos;
}

const sample = () => ({
  '~/Docs/Progetto/leggimi.txt': 'ciao '.repeat(2000),
  '~/Docs/Progetto/sotto/àèì ü.txt': 'accenti',
  '~/Docs/Progetto/vuota': null,
  '~/Docs/Progetto/foto.jpg': new Uint8Array(Array.from({ length: 50000 }, (_, i) => (i * 7919) % 251)),
  '~/Docs/note.txt': 'una nota',
});

test('the engine is the version pinned in the build', () => {
  assert.match(lib.version(), /libarchive 3\.8\.10/);
  assert.match(lib.version(), /zlib\/1\.3\.2/);
  assert.match(lib.version(), /liblzma\/5\.8\.4/);
  assert.match(lib.version(), /bz2lib\/1\.0\.8/);
});

for (const format of Object.keys(FORMATS).filter(f => !FORMATS[f].single)) {
  test(`${format}: a folder in, the same folder out`, async () => {
    const lilos = fakeLilos(sample());
    const made = await pack(lilos, ['~/Docs/Progetto'], { format, level: 'max' });
    assert.equal(made.name, `Progetto.${FORMATS[format].ext}`);
    assert.equal(made.count, 3);
    const seen = await list(lilos, made.ref);
    const names = seen.entries.map(e => e.path.join('/')).sort();
    assert.ok(names.includes('Progetto/sotto/àèì ü.txt'), names.join(', '));
    assert.ok(names.includes('Progetto/vuota'), names.join(', '));
    const out = await unpack(lilos, made.ref);
    assert.equal(out.name, 'Progetto 2');   // 'Progetto' is taken: never overwritten
    assert.equal(lilos.text('~/Docs/Progetto 2/leggimi.txt'), 'ciao '.repeat(2000));
    assert.equal(lilos.text('~/Docs/Progetto 2/sotto/àèì ü.txt'), 'accenti');
    assert.deepEqual(lilos.nodes.get('~/Docs/Progetto 2/foto.jpg').data, sample()['~/Docs/Progetto/foto.jpg']);
    assert.equal(lilos.nodes.get('~/Docs/Progetto 2/vuota').type, 'folder');
  });
}

for (const format of ['gz', 'bz2', 'xz']) {
  test(`${format}: one file compressed as it is`, async () => {
    const lilos = fakeLilos(sample());
    const made = await pack(lilos, ['~/Docs/note.txt'], { format });
    assert.equal(made.name, `note.txt.${format}`);
    const seen = await list(lilos, made.ref);
    assert.equal(seen.raw, true);
    assert.equal(seen.kind, format);
    const out = await unpack(lilos, made.ref);
    assert.equal(out.name, 'note 2.txt');
    assert.equal(lilos.text('~/Docs/note 2.txt'), 'una nota');
    await assert.rejects(pack(lilos, ['~/Docs/Progetto'], { format }), { message: 'single' });
  });
}

test('more items: one archive with the name given, a number when it is taken', async () => {
  const lilos = fakeLilos({ ...sample(), '~/Docs/Insieme.tar.gz': 'x' });
  const made = await pack(lilos, ['~/Docs/Progetto', '~/Docs/note.txt'], { format: 'tar.gz', name: 'Insieme' });
  assert.equal(made.name, 'Insieme 2.tar.gz');
  const out = await unpack(lilos, made.ref);
  assert.equal(out.name, 'Insieme 2');
  assert.equal(lilos.text('~/Docs/Insieme 2/note.txt'), 'una nota');
});

test('zip with a password: AES-256, asked for and checked', async () => {
  const lilos = fakeLilos(sample());
  const made = await pack(lilos, ['~/Docs/note.txt'], { format: 'zip', password: 'segreta' });
  const seen = await list(lilos, made.ref);
  assert.equal(seen.locked, true);
  await assert.rejects(unpack(lilos, made.ref), { message: 'password' });
  await assert.rejects(unpack(lilos, made.ref, { password: 'sbagliata' }), { message: 'password' });
  const out = await unpack(lilos, made.ref, { password: 'segreta' });
  assert.equal(lilos.text(`${out.ref}/note.txt`), 'una nota');
});

test('only the chosen items', async () => {
  const lilos = fakeLilos(sample());
  const made = await pack(lilos, ['~/Docs/Progetto'], { format: '7z' });
  const out = await unpack(lilos, made.ref, { only: ['Progetto/sotto'] });
  assert.equal(out.count, 1);
  assert.equal(lilos.text(`${out.ref}/sotto/àèì ü.txt`), 'accenti');
  assert.ok(!lilos.nodes.has(`${out.ref}/leggimi.txt`));
});

test('unsafe paths and junk are left out', async () => {
  const bytes = lib.write([
    { path: '../fuori.txt', data: new TextEncoder().encode('no') },
    { path: '__MACOSX/x', data: new Uint8Array(1) },
    { path: 'buono.txt', data: new TextEncoder().encode('sì') },
  ], { format: 'paxr' });
  const lilos = fakeLilos({ '~/a.tar': bytes });
  const out = await unpack(lilos, '~/a.tar');
  assert.deepEqual(out.skipped, [{ name: '../fuori.txt', why: 'unsafe' }]);
  assert.equal(lilos.text('~/a/buono.txt'), 'sì');
  assert.ok(![...lilos.nodes.keys()].some(k => k.includes('fuori') || k.includes('MACOSX')));
});

test('rar 4 and rar 5 are read', async () => {
  for (const [name, kind] of [['rar4.rar', 'RAR 4'], ['rar5.rar', 'RAR 5']]) {
    const lilos = fakeLilos({ [`~/${name}`]: fixture(name) });
    const seen = await list(lilos, `~/${name}`);
    assert.equal(seen.kind, kind);
    assert.ok(seen.entries.length > 0);
    const out = await unpack(lilos, `~/${name}`);
    assert.ok(out.count > 0);
  }
});

test('the encrypted files of a rar are left out and said, the others extracted', async () => {
  // b.txt and d.txt are encrypted, a.txt and c.txt are not: libarchive cannot decrypt a rar
  const lilos = fakeLilos({ '~/c.rar': fixture('rar-encrypted.rar') });
  const seen = await list(lilos, '~/c.rar');
  assert.equal(seen.locked, false);   // no password asked: it would not help
  const out = await unpack(lilos, '~/c.rar');
  assert.equal(out.count, 2);
  assert.deepEqual(out.skipped.map(s => `${s.name} ${s.why}`).sort(), ['b.txt encrypted', 'd.txt encrypted']);
  assert.equal(lilos.text('~/c/a.txt'), 'This is from a.txt');
  assert.ok(!lilos.nodes.has('~/c/b.txt'));
});

test('what is not an archive, or uses another compression, is said', async () => {
  const lilos = fakeLilos({ '~/a.zip': 'not an archive at all', '~/b.tar.zst': new Uint8Array([0x28, 0xb5, 0x2f, 0xfd, 1, 2, 3]) });
  await assert.rejects(list(lilos, '~/a.zip'), { message: 'notArchive' });
  await assert.rejects(list(lilos, '~/b.tar.zst'), { message: 'compression', detail: 'zstd' });
});

test('an archive bigger than lilOS saves is not written', async () => {
  const noise = new Uint8Array(6 << 20);
  for (let i = 0, x = 1; i < noise.length; i++) { x = (x * 1103515245 + 12345) >>> 0; noise[i] = x >>> 24; }
  const lilos = fakeLilos({ '~/a.bin': noise, '~/b.bin': noise.slice().reverse() });
  await assert.rejects(pack(lilos, ['~/a.bin', '~/b.bin'], { format: 'tar' }), { message: 'resultTooBig' });
});
