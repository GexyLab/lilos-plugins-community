/**
 * Builds the apps of the repository and writes each package: apps/<id>/lilos.json (from
 * src/<id>/app.json) with the hash of every built file. The built files are committed: lilOS
 * installs them as they are, without building anything.
 * The translations (src/<id>/locales.json) go to apps/<id>/locales.json; the build stops if a
 * language lacks keys of English, and if THIRD_PARTY.md misses a library the apps bundle.
 * An app's `alone` files are built as modules of their own next to index.js (dist/<file>), with
 * nothing shared: Compress Archive's engine is only in dist/work.js, not in its windows.
 *
 *   npm run build                  every app
 *   npm run build -- arduino-ide   only the ones named
 *   npm run check:credits          only the THIRD_PARTY.md check
 */
import { build } from 'vite';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { appConfig } from '../vite.config.js';
import { SOURCES as LIBARCHIVE, TOOLCHAIN as EMSCRIPTEN } from './build-libarchive.mjs';

/** Apps of src/ and the module each one starts from. */
const APPS = [
  { id: 'arduino-ide', entry: 'ArduinoApp.js' },
  { id: 'compress-archive', entry: 'CompressApp.js', alone: ['work.js'] },
];

const readJson = file => JSON.parse(readFileSync(file, 'utf8'));
const walk = dir => readdirSync(dir, { withFileTypes: true }).flatMap(e => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
const sha256 = data => `sha256-${createHash('sha256').update(data).digest('base64')}`;

/**
 * Every package the apps bundle (the dependencies of package.json and what they bring, from
 * package-lock.json) and every program a kernel module downloads (modules/<name>/tools.js) has
 * a line in THIRD_PARTY.md with its name and version; so do the native libraries compiled into
 * Compress Archive's engine (scripts/build-libarchive.mjs).
 */
function checkCredits() {
  const { packages } = readJson('package-lock.json');
  const queue = Object.keys(readJson('package.json').dependencies ?? {}).map(d => `node_modules/${d}`);
  const wanted = new Set();
  for (const seen = new Set(); queue.length;) {
    const path = queue.shift();
    if (seen.has(path) || !packages[path]) continue;
    seen.add(path);
    wanted.add(`${path.slice(path.lastIndexOf('node_modules/') + 13)} ${packages[path].version}`);
    for (const d of Object.keys(packages[path].dependencies ?? {})) queue.push(existsSync(`${path}/node_modules/${d}`) ? `${path}/node_modules/${d}` : `node_modules/${d}`);
  }
  for (const name of readdirSync('modules')) {
    const tools = join('modules', name, 'tools.js');
    if (existsSync(tools)) for (const [, n, v] of readFileSync(tools, 'utf8').matchAll(/name: '([^']+)', version: '([^']+)'/g)) wanted.add(`${n} ${v}`);
  }
  for (const s of [...LIBARCHIVE, ...EMSCRIPTEN]) {
    wanted.add(`${s.name} ${s.version ?? readFileSync(join('src', 'compress-archive', 'engine', 'licenses', s.name, 'VERSION'), 'utf8').trim()}`);
  }
  const text = readFileSync('THIRD_PARTY.md', 'utf8');
  const missing = [...wanted].filter(w => !text.includes(`| ${w.replace(' ', ' | ')} |`));
  if (missing.length) throw new Error(`THIRD_PARTY.md lacks ${missing.join(', ')}`);
}

/** Every language without `extends` has every key of English, and none that English lacks. */
function checkLocales(id, table) {
  const en = Object.keys(table.en?.strings ?? {});
  if (!en.length) throw new Error(`${id}: locales.json has no "en"`);
  for (const [lang, { extends: ext, strings = {} }] of Object.entries(table)) {
    if (lang === 'en' || ext) continue;
    const missing = en.filter(k => !Object.hasOwn(strings, k));
    const extra = Object.keys(strings).filter(k => !en.includes(k));
    if (missing.length || extra.length) throw new Error(`${id}: locales.json, ${lang}: ${missing.length ? `missing ${missing.join(', ')}` : ''}${extra.length ? ` extra ${extra.join(', ')}` : ''}`);
  }
}

checkCredits();
if (process.argv.includes('--check-credits')) {
  console.log('THIRD_PARTY.md: up to date');
  process.exit(0);
}

for (const { id, entry, alone = [] } of APPS.filter(a => !process.argv[2] || process.argv.slice(2).includes(a.id))) {
  await build({ configFile: false, ...appConfig(id, entry) });
  for (const f of alone) {
    const config = appConfig(id, f);
    await build({
      configFile: false, ...config,
      build: {
        ...config.build, emptyOutDir: false, copyPublicDir: false,
        lib: { ...config.build.lib, fileName: () => f },
        rollupOptions: { output: { inlineDynamicImports: true } },
      },
    });
  }
  const pkg = join('apps', id);
  const locales = join('src', id, 'locales.json');
  if (existsSync(locales)) {
    checkLocales(id, readJson(locales));
    copyFileSync(locales, join(pkg, 'locales.json'));
  }
  const files = {};
  for (const file of walk(join(pkg, 'dist')).sort()) files[relative(pkg, file).split(sep).join('/')] = sha256(readFileSync(file));
  if (existsSync(locales)) files['locales.json'] = sha256(readFileSync(join(pkg, 'locales.json')));
  const styles = readdirSync(join(pkg, 'dist')).filter(f => f.endsWith('.css')).map(f => `dist/${f}`);
  const manifest = {
    ...readJson(join('src', id, 'app.json')),
    entry: 'dist/index.js',
    ...(styles.length && { styles }),
    ...(existsSync(locales) && { locales: 'locales.json' }),
    files,
  };
  writeFileSync(join(pkg, 'lilos.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`${id} ${manifest.version}: ${Object.keys(files).length} files`);
}
