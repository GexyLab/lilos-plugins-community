import { resolve } from 'node:path';

/**
 * Build of one app (scripts/build.mjs builds them all): an ES module in apps/<id>/dist with its
 * chunks, workers, styles and public files next to it. '@lilos/sdk' is not bundled: an app that
 * imports it gets lilOS's own, which lilOS serves as /host/sdk.js.
 */
const HOST = { '@lilos/sdk': '/host/sdk.js', '@lilos/system': '/host/system.js' };

const host = () => ({
  name: 'lilos-host',
  resolveId: id => (HOST[id] ? { id: HOST[id], external: true } : null),
});

export function appConfig(app, entry) {
  const root = resolve('src', app);
  return {
    root,
    base: './',   // chunks, workers and assets are found next to the module that asks for them
    publicDir: resolve(root, 'public'),
    logLevel: 'warn',
    plugins: [host()],
    build: {
      outDir: resolve('apps', app, 'dist'),
      emptyOutDir: true,
      target: 'es2022',
      minify: true,
      copyPublicDir: true,
      lib: { entry: resolve(root, entry), formats: ['es'], fileName: () => 'index.js', cssFileName: 'index' },
      rollupOptions: {
        output: { chunkFileNames: '[name]-[hash].js', assetFileNames: '[name]-[hash][extname]' },
      },
    },
    worker: {
      format: 'es',
      plugins: () => [host()],
      rollupOptions: { output: { entryFileNames: '[name]-[hash].js', chunkFileNames: '[name]-[hash].js' } },
    },
  };
}
