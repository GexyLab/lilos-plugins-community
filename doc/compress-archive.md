# Compress Archive: how it works

This is for people who want to change Compress Archive. How to use the app is in [apps/compress-archive/README.md](../apps/compress-archive/README.md), in Italian, as the AppStore shows it.

Compress Archive was an official lilOS app (it replaced the Zip app in the official catalog for a short time) and moved here on 3 November 2026. The reasoning behind its engine is decision D72 in the lilOS repository ([doc/interna/decisioni.md](https://github.com/GexyLab/lilos/blob/development/doc/interna/decisioni.md)).

## The engine: libarchive in WebAssembly

No JavaScript library covers zip, 7z, tar, gz, bz2, xz, iso and rar. libarchive (the library behind bsdtar) does, so the app carries it, compiled to WebAssembly:

| Library | What for |
|---|---|
| libarchive 3.8.10 | the formats |
| zlib 1.3.2, bzip2 1.0.8, xz (liblzma) 5.8.4 | gzip/deflate, bzip2, xz/lzma |
| Mbed TLS 3.6.7 | only the cryptography for AES zip |

The versions are in [scripts/build-libarchive.mjs](../scripts/build-libarchive.mjs). We build it ourselves instead of using libarchive.js 2.0.2, which ships libarchive 3.7.2 with known holes in the RAR and tar readers (fixed in 3.7.4–3.8.x). Those are the readers that open untrusted files.

Only what is needed is compiled in:

- **reading:** zip, tar, rar, rar5, iso9660, 7zip, and the filters gzip, bzip2, xz and lzma;
- **writing:** zip, 7zip, pax tar, iso9660, and the same filters.

zstd, lz4, lzip, lzop and compress (.Z) are recognised by their first bytes (`UNSUPPORTED` in `archive.js`) and reported as not supported.

### Building it

```sh
npm run build:libarchive   # needs Docker; about 35 minutes
```

The script:

1. downloads the official source tarballs (kept in `%TEMP%/lilos-libarchive-sources`, or the system temp folder) and checks them against the SHA-256 in the script;
2. runs [src/compress-archive/native/build.sh](../src/compress-archive/native/build.sh) in `emscripten/emsdk:6.0.12`, pinned by digest, with `--network none`;
3. copies the results.

The results, committed:

- `src/compress-archive/engine/libarchive.js`: an ES module with the WebAssembly inside as base64 (`SINGLE_FILE`). An isolated app cannot fetch a `.wasm` of its own: its code reaches it as text checked against the manifest's hashes.
- `src/compress-archive/engine/licenses/`: the licenses, including Emscripten's and musl's, which end up in the file. musl's version is in its `VERSION`.

The same engine built for Node goes to `node_modules/.cache/compress-archive/libarchive.node.mjs`, for the tests only.

`native/glue.c` is a small C layer over libarchive that reads and writes archives in memory only. It calls `archive_write_set_bytes_in_last_block(a, 1)`, otherwise libarchive pads every archive to 10240 bytes. `build.sh` reads the versions from `V_*` variables, because bzip2's own build reads a `BZIP2` variable as options.

When you change a version, update it in `SOURCES` (with the new SHA-256) and in [THIRD_PARTY.md](../THIRD_PARTY.md). `npm run build` checks both: it stops if a library of the engine has no line there.

## The app

| File | Does |
|---|---|
| `engine/archive-engine.js` | libarchive from JavaScript: `read(bytes, …)` and `write(entries, …)`, nothing of lilOS |
| `archive.js` | formats and levels, `pack`, `list`, `unpack` on lilOS files: safe paths, free names, limits |
| `work.js` | the background entry point `work`: the menu actions, the Automata actions and the windows' requests |
| `CompressApp.js` | the windows `main` (the archive's content, extract) and `compressAs` (Comprimi come…) |
| `text.js`, `ui.js` | error messages, styles, keys |
| `../shared/sandbox/` | small helpers shared by isolated apps (`h`, `frame`, `background`…), copied from the lilOS repository's `plugins/src/shared/sandbox` |

The engine (~1 MB) is only in the background entry point `work`, built alone into `dist/work.js` (`alone` in `scripts/build.mjs`). The windows (~20 KB) ask it for the work with `lilos.app.call('work', …)` and get results and errors back as data. So a window opens without loading the engine, and the heavy work runs in a process of its own.

Rules worth knowing:

- **Limits.** lilOS files are at most 10 MB, so archives and extracted files are too. One operation handles at most 256 MB and 10,000 entries, all in memory.
- **What extraction leaves out.** Absolute paths and paths with `..`, links, devices and files over the limit stay out, and the notification says why. Junk (`__MACOSX`, `.DS_Store`, `Thumbs.db`, `desktop.ini`) is skipped.
- **Passwords.** libarchive decrypts only zip. Encrypted rar and 7z entries are skipped as `encrypted`, so the app does not ask for a useless password. Passwords are never saved, and operations with a password or a selection are not recorded by Automata.
- **No forms.** The isolated iframe has no `allow-forms`: a `<form>` never submits. Use buttons and Enter.
- **Notifications are best-effort.** `lilos.ui.notify` allows 10 per minute per app and rejects after that. A refused notification must not turn a finished archive into a failure.
- **No overwrites.** Writes use `{ unique: true }`, so an existing name gets a number.

## Tests

```sh
npm run build:libarchive        # once: the tests need the Node build of the engine
npm run test:compress-archive
```

19 tests with a fake `lilos` that keeps files in memory and behaves like lilOS 1.22 (`unique`, `ref`, `{ id, name, ref }`). The rar files in `test/fixtures/` come from libarchive's own test suite.
