/**
 * Builds the engine of Compress Archive: libarchive with zlib, bzip2, xz (liblzma) and mbedTLS,
 * compiled to WebAssembly with Emscripten in Docker (src/compress-archive/native/build.sh). The
 * sources are downloaded from their official releases and checked against the SHA-256 below.
 * Results, committed: src/compress-archive/engine/libarchive.js (an ES module with the WebAssembly
 * inside: an isolated app cannot fetch files of its own) and the licenses next to it. The same
 * engine for Node, used only by the tests, goes to node_modules/.cache/compress-archive.
 *
 *   node scripts/build-libarchive.mjs      (in plugins/; needs Docker)
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Versions pinned on purpose (published at least two weeks before being adopted)
const IMAGE = 'emscripten/emsdk:6.0.12@sha256:77638e6c215a65f25a704c0c831d5c2463a8c0468a58c6cb82489dbe621dfa05';
export const SOURCES = [
  { name: 'zlib', version: '1.3.2', license: 'Zlib', copyright: 'Copyright (C) 1995-2026 Jean-loup Gailly and Mark Adler', site: 'https://zlib.net',
    url: 'https://github.com/madler/zlib/releases/download/v1.3.2/zlib-1.3.2.tar.gz', sha256: 'bb329a0a2cd0274d05519d61c667c062e06990d72e125ee2dfa8de64f0119d16' },
  { name: 'bzip2', version: '1.0.8', license: 'bzip2-1.0.6', copyright: 'Copyright (C) 1996-2019 Julian R Seward', site: 'https://sourceware.org/bzip2/',
    url: 'https://sourceware.org/pub/bzip2/bzip2-1.0.8.tar.gz', sha256: 'ab5a03176ee106d3f0fa90e381da478ddae405918153cca248e682cd0c4a2269' },
  { name: 'xz', version: '5.8.4', license: '0BSD', copyright: 'Lasse Collin, Igor Pavlov and the XZ Utils contributors', site: 'https://tukaani.org/xz/',
    url: 'https://github.com/tukaani-project/xz/releases/download/v5.8.4/xz-5.8.4.tar.gz', sha256: '0014c7886930454fe8bd4228665b51af55eeae560ea135c9c4cd33f55b2591d9' },
  { name: 'mbedtls', version: '3.6.7', license: 'Apache-2.0', copyright: 'Copyright The Mbed TLS Contributors', site: 'https://www.trustedfirmware.org/projects/mbed-tls/',
    url: 'https://github.com/Mbed-TLS/mbedtls/releases/download/mbedtls-3.6.7/mbedtls-3.6.7.tar.bz2', sha256: 'a7e8bcbec0e6f761b4af24f25677626b35f762f68eef79c08677a363212d11f6' },
  { name: 'libarchive', version: '3.8.10', license: 'BSD-2-Clause', copyright: 'Copyright Tim Kientzle and the libarchive contributors', site: 'https://www.libarchive.org',
    url: 'https://github.com/libarchive/libarchive/releases/download/v3.8.10/libarchive-3.8.10.tar.gz', sha256: 'a1bffbe5152cfe869751179e7b16648c87c461cb8c46eee75062efbe164cc57c' },
];
// Compiled in with them: Emscripten's runtime (the JavaScript around the WebAssembly) and its C
// library, musl; their licenses are copied from the image (musl's version too, in VERSION)
export const TOOLCHAIN = [
  { name: 'emscripten', version: IMAGE.match(/:([\d.]+)@/)[1], license: 'MIT', copyright: 'Copyright (c) 2010-2014 Emscripten authors', site: 'https://emscripten.org' },
  { name: 'musl', license: 'MIT', copyright: 'Copyright © 2005-2020 Rich Felker, et al.', site: 'https://musl.libc.org' },
];

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const app = join(root, 'src', 'compress-archive');

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const cache = join(tmpdir(), 'lilos-libarchive-sources');
  mkdirSync(cache, { recursive: true });
  const out = mkdtempSync(join(tmpdir(), 'lilos-libarchive-'));
  try {
    const sources = mkdtempSync(join(tmpdir(), 'lilos-libarchive-src-'));
    for (const s of SOURCES) {
      const file = join(cache, s.url.slice(s.url.lastIndexOf('/') + 1));
      if (!existsSync(file)) {
        const res = await fetch(s.url);
        if (!res.ok) throw new Error(`${s.name}: download non riuscito (${res.status})`);
        writeFileSync(file, Buffer.from(await res.arrayBuffer()));
      }
      const hash = createHash('sha256').update(readFileSync(file)).digest('hex');
      if (hash !== s.sha256) { rmSync(file); throw new Error(`${s.name}: SHA-256 diverso da quello atteso (${hash})`); }
      cpSync(file, join(sources, s.url.slice(s.url.lastIndexOf('/') + 1)));
    }
    const env = Object.fromEntries(SOURCES.map(s => [`V_${s.name.toUpperCase()}`, s.version]));
    execFileSync('docker', [
      'run', '--rm', '--network', 'none',
      '-v', `${sources}:/sources:ro`, '-v', `${join(app, 'native')}:/native:ro`, '-v', `${out}:/out`,
      ...Object.entries(env).flatMap(([k, v]) => ['-e', `${k}=${v}`]),
      IMAGE, 'bash', '/native/build.sh',
    ], { stdio: 'inherit' });
    rmSync(sources, { recursive: true, force: true });

    const engine = join(app, 'engine');
    cpSync(join(out, 'libarchive.js'), join(engine, 'libarchive.js'));
    rmSync(join(engine, 'licenses'), { recursive: true, force: true });
    cpSync(join(out, 'licenses'), join(engine, 'licenses'), { recursive: true });
    const tests = join(root, 'node_modules', '.cache', 'compress-archive');
    mkdirSync(tests, { recursive: true });
    cpSync(join(out, 'libarchive.node.mjs'), join(tests, 'libarchive.node.mjs'));
    console.log(`libarchive ${SOURCES.at(-1).version} → src/compress-archive/engine/libarchive.js`);
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
}
