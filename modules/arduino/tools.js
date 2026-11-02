import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { chmod, mkdir, readdir, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

/**
 * The programs the module runs, downloaded from Arduino the first time they are needed and checked
 * against the SHA-256 written here (from the checksums Arduino publishes with each release; clangd
 * hashed by hand): a file that does not match is thrown away.
 *
 *   arduino-cli               compiles, installs the boards' packages and the libraries
 *   arduino-language-server   the editor's suggestions, on top of clangd
 *   clangd                    the C++ language server (none for 32-bit ARM Linux: no suggestions there)
 *
 * Archives are opened with the system's `tar` (Windows 10+, Linux, macOS: zip, tar.gz, tar.bz2).
 */
const run = promisify(execFile);

export const PLATFORM = {
  'win32-x64': 'Windows_64bit',
  'linux-x64': 'Linux_64bit',
  'linux-arm64': 'Linux_ARM64',
  'linux-arm': 'Linux_ARMv7',
  'darwin-x64': 'macOS_64bit',
  'darwin-arm64': 'macOS_ARM64',
}[`${process.platform}-${process.arch}`] ?? null;

const EXE = process.platform === 'win32' ? '.exe' : '';
const ARCHIVE = PLATFORM?.startsWith('Windows') ? 'zip' : 'tar.gz';

export const TOOLS = {
  cli: {
    name: 'arduino-cli', version: '1.5.1', exe: `arduino-cli${EXE}`,
    url: p => `https://downloads.arduino.cc/arduino-cli/arduino-cli_1.5.1_${p}.${ARCHIVE}`,
    sha256: {
      Windows_64bit: 'fabe42e0eb04d00e776a66178299ff95a46c623dbc260f997e58fd514853dd40',
      Linux_64bit: '28a8e119c498a25607821c36cb2dc49e8463941b261a0d99091baa7bc692dd2b',
      Linux_ARM64: '1e69e077479f300614d4551334e0a33f08ee40b04315d83b8e7e0e94f0d0ee62',
      Linux_ARMv7: '890af36e9873606e4dfa743534846186621b9f3a339175ea3ec481adecf07143',
      macOS_64bit: 'c982e940027996bea9901050e95fae99c59c1dcfee54beedecaf28141e7bf2e7',
      macOS_ARM64: 'cb952e8c1621c95ef5f1d17831c945e3d0ec5973f89c557a7ec8feb9c4f7d4c9',
    },
  },
  ls: {
    name: 'arduino-language-server', version: '0.7.7', exe: `arduino-language-server${EXE}`,
    url: p => `https://downloads.arduino.cc/arduino-language-server/arduino-language-server_0.7.7_${p}.${ARCHIVE}`,
    sha256: {
      Windows_64bit: '1b034b53b13df7e5126eccfae9b6bbfa2b99d72ebdd888812713db8347eebfea',
      Linux_64bit: 'a9586965f951ffe8d2c366fb0206a1fa672bec5f3b38f2a3883fcf3abada6a2e',
      Linux_ARM64: '8da0ae4b94efda24a17d3c3c271ae004cb590f6de634981bfe48e4f506ad60d5',
      Linux_ARMv7: 'c7c3091a11760b01a0fc0a4630cde19126a17adca845f683691d77dfa5ebc8b9',
      macOS_64bit: 'c86b838efe247d45d32f585696af9aa114d5527a2cfc52cdcac1845343bc4a3b',
      macOS_ARM64: '77f3a9fa71bd4c61dd293c6b623cebfaf424f6b794ede1a7b042e9b42a76e4c5',
    },
  },
  clangd: {
    name: 'clangd', version: '14.0.0', exe: `clangd${EXE}`,
    url: p => `https://downloads.arduino.cc/tools/clangd_14.0.0_${p}.tar.bz2`,
    sha256: {
      Windows_64bit: '7768d34c9669de8b54f58ca8d03395babfc320f621b2a2bfb80e82b5732968e1',
      Linux_64bit: 'aa58931ef6c9987b708ba7fa320d51f060b9525c4832359f6980d352ee4ef798',
      Linux_ARM64: '8adfc17f8d8da5660a2d148399fe9afa476968399d0a0d8b2390d91af29e9895',
      macOS_64bit: '4062a0e5cb897a076a9cf59a0ab02bf634a1448067bb8bd650a5cd47202a57d3',
      macOS_ARM64: '94fe0a73b0eb556cc428dd77700dc9261acae2cde726e12771750dbb833e8f40',
    },
  },
};

/** Where a tool goes once unpacked: <data>/tools/<name>-<version>. */
const folderOf = (dataDir, key) => join(dataDir, 'tools', `${TOOLS[key].name}-${TOOLS[key].version}`);

/** The tool's program, searched in its folder (clangd sits in a subfolder), or null if it is not there. */
export async function findTool(dataDir, key) {
  const want = TOOLS[key].exe;
  const look = async (dir, depth) => {
    for (const e of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
      if (e.isFile() && e.name === want) return join(dir, e.name);
      if (e.isDirectory() && depth > 0) {
        const found = await look(join(dir, e.name), depth - 1);
        if (found) return found;
      }
    }
    return null;
  };
  return look(folderOf(dataDir, key), 2);
}

/** Can this computer run the tool at all? */
export const available = key => !!PLATFORM && !!TOOLS[key].sha256[PLATFORM];

/**
 * Downloads, checks and unpacks a tool if it is not there yet. progress({ tool, done, total })
 * while it downloads. Returns the path of its program.
 */
export async function ensureTool(dataDir, key, { progress = () => {}, signal } = {}) {
  const found = await findTool(dataDir, key);
  if (found) return found;
  if (!available(key)) throw new Error(`${TOOLS[key].name} non esiste per questo sistema (${process.platform} ${process.arch})`);
  const tool = TOOLS[key], url = tool.url(PLATFORM);
  const tmp = join(dataDir, 'tmp', `${tool.name}-${Date.now().toString(36)}`);
  await mkdir(tmp, { recursive: true });
  try {
    const file = join(tmp, url.slice(url.lastIndexOf('/') + 1));
    const res = await fetch(url, { signal, redirect: 'follow' });
    if (!res.ok || !res.body) throw new Error(`Download di ${tool.name} non riuscito (${res.status})`);
    const total = Number(res.headers.get('content-length')) || 0;
    const hash = createHash('sha256');
    let done = 0, last = 0;
    const body = Readable.fromWeb(res.body);
    body.on('data', chunk => {
      hash.update(chunk);
      done += chunk.length;
      if (done - last > 256 << 10 || done === total) { last = done; progress({ tool: key, done, total }); }
    });
    await pipeline(body, createWriteStream(file));
    if (hash.digest('hex') !== tool.sha256[PLATFORM]) throw new Error(`${tool.name}: il file scaricato non corrisponde (impronta SHA-256 diversa)`);
    const out = join(tmp, 'x');
    await mkdir(out);
    await run(process.platform === 'win32' ? join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe') : 'tar', ['-xf', file, '-C', out], { timeout: 300_000, windowsHide: true });
    const target = folderOf(dataDir, key);
    await rm(target, { recursive: true, force: true });
    await mkdir(join(dataDir, 'tools'), { recursive: true });
    await rename(out, target);
    const path = await findTool(dataDir, key);
    if (!path) throw new Error(`${tool.name}: programma non trovato nell'archivio`);
    if (process.platform !== 'win32') await chmod(path, 0o755);
    return path;
  } finally {
    await rm(tmp, { recursive: true, force: true }).catch(() => {});
  }
}

