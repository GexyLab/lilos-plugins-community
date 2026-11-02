# ArduinoIDE4LilOS: how it works

This is for people who want to change ArduinoIDE4LilOS or the `arduino` kernel module. How to use the app is in [apps/arduino-ide/README.md](../apps/arduino-ide/README.md), in Italian, as the AppStore shows it.

## The two halves

The board is plugged into the computer of the person using lilOS. The kernel may run somewhere else: on a server or in the cloud. So the work is split:

| Who | Does | Where |
|---|---|---|
| The browser (the app) | Edits the sketch. Opens the serial port, uploads to the board, runs the serial monitor. | `src/arduino-ide/` |
| The kernel (`arduino` module) | Compiles, keeps the boards' packages and the libraries, runs the language server. | `modules/arduino/` |

Why:

- **The browser uploads**, because only the browser sees the serial port of the user's computer.
- **The kernel compiles**, because the compiler is too heavy to run in the browser (hundreds of MB, no usable WebAssembly build), and every user needs the same one.

Rejected alternatives:

- uploading from the kernel: the board would have to be plugged into the kernel's computer;
- a bridge program to install on the user's computer;
- compiling in the browser.

## What lilOS gives the app

ArduinoIDE4LilOS is an isolated app: it runs in a sandboxed iframe and reaches lilOS through `window.lilos`. It uses three permissions from `app.json`:

| Permission | API | What for |
|---|---|---|
| `fs.write:~/Arduino` | `lilos.files.*` | The sketches, one folder per sketch. The user's own libraries are in `~/Arduino/libraries`. |
| `serial` | `lilos.serial.*` | The serial ports, through Web Serial. |
| `kernel:arduino` | `lilos.kernel.request`, `lilos.kernel.channel` | The module's HTTP route and WebSocket. |

The serial ports need some explaining:

- A sandboxed iframe has an opaque origin, so it has no Web Serial. The lilOS page opens the port and hands the app a `MessagePort`. The app never gets the `SerialPort` object.
- Bytes travel as `ArrayBuffer`. DTR, RTS and break are JSON messages. `sync` and `done` tell when a write has reached the port, which the board reset needs.
- The channel closes with the window.

These APIs are lilOS's, documented in its repository: [api.md](https://github.com/GexyLab/lilos/blob/development/doc/sviluppatore/api.md) (`serial`, `kernel.channel`, `kernel.module`, the `window.lilos` bridge, the permissions `serial` and `kernel:<module>`). For kernel modules, `ctx.socket(path, handler)` and `ctx.dataDir` are documented there too. They need lilOS 1.18.0 (SDK 0.11.0).

## The app (`src/arduino-ide/`)

| File | What |
|---|---|
| `ArduinoApp.js` | The window: sidebar (Sketchbook, Examples, Library manager), toolbar, the Output / Problems / Serial monitor panels, board and port dialog, first-run setup. |
| `editor.js` | CodeMirror 6 with C++ highlighting. Suggestions come from the language server through `@codemirror/lsp-client`, over a custom transport on the module's WebSocket (full-document sync). |
| `backend.js` | The WebSocket session with the module: requests `{ id, op, …}`, replies, progress events, LSP messages. |
| `boards.js` | Uno, Nano and Mega: FQBN, processors, upload protocol and speed, flash page size, signatures, USB ids. |
| `hex.js` | Intel HEX parser for the compiled program. |
| `link.js` | The serial channel: reads with timeouts, writes, DTR/RTS. |
| `stk500.js` | Upload in JavaScript: STK500 v1 (Optiboot and the old ATmegaBOOT on Uno, Nano, Mega 1280) and STK500 v2 (stk500boot on the Mega 2560). It resets the board (DTR/RTS off, then on), writes page by page and reads it back to verify. |
| `monitor.js` | The serial monitor view. |
| `examples.js` | The built-in examples, as text. |
| `style.js` | The app's CSS. |
| `locales.json` | Texts in English and Italian. |

An upload runs these steps:

1. The app compiles in the kernel, which returns the HEX file.
2. The app pauses the serial monitor.
3. It runs STK500 on the same port.
4. It reopens the monitor.

## The module (`modules/arduino/`)

| File | What |
|---|---|
| `index.js` | Routes: `GET /status` and the WebSocket `/session`, one per window. The header comment lists every operation and message. |
| `tools.js` | The programs to download for each platform, with their SHA-256: arduino-cli 1.5.1, arduino-language-server 0.7.7, clangd 14.0.0 (no clangd on 32-bit Linux ARM). |
| `arduino.js` | Setup, boards, compile, libraries; per-user arduino-cli configuration; limits and locks. |
| `libraries.js` | The library index, summarised in a worker; search and "which library provides this header". |
| `sketch.js` | Checks sketches before they reach the compiler or the language server (see Security). |
| `lsp.js` | One arduino-language-server per window, behind a proxy. |

How the module works:

- **Setup**: done once, by an administrator. It downloads the tools, the indexes and the `arduino:avr` package. About 150 MB to download and 500 MB on disk.
- **Shared and per-user data**: the boards' packages are shared by all users. Libraries are per user, under `users/<hash>/` with their own `cli.yaml`.
- **Where the data goes**: `ctx.dataDir` (`<kernel data>/modules-data/arduino`), or the `dataPath` setting. This survives module updates, and removing the module does not delete it.
- **Compile**: it works on a copy of the sketch, with a build cache per sketch and board. Caches unused for 14 days are deleted.
- **Limits**:
  - two compiles at a time overall;
  - per user, two compiles (running or waiting), five windows and three language servers;
  - the library index is updated once a day, and after a failure it is retried after 10 minutes.
- **Language server**: the browser sees URIs `file:///sketch/<Name>/…`, which the proxy maps to the real folder. Only the LSP methods the editor needs pass, and `initialize` is rewritten onto the sketch folder.

## Security

The compiler and the language server run with the kernel's rights, on the kernel's computer. A sketch must not make them read files of that computer. `sketch.js` and `lsp.js` are a **filter, not a sandbox**.

**How the filter reads the text.** It reads it the way the C preprocessor does:

- lines may end in `\r`, `\r\n` or `\n`;
- line continuations count, even with spaces after the backslash;
- comments, strings and raw strings are recognised, and so is the digraph `%:`.

**What it rejects:**

- `#include`, `#include_next`, `#import` and `#embed`, and `__has_include` / `__has_embed`, whose path is absolute, contains `..`, or is made by a macro;
- inline assembler (`asm`, `__asm`, `__asm__`), `.incbin` and `.include`;
- `.s` and `.S` files;
- file names that arduino-cli reads as options: `build_opt.h`, `build_extra_flags.h`, `platform.txt`, `boards.txt`, `programmers.txt`, and Windows device names;
- `ldflags`, `precompiled` and `dot_a_linkage` in a user library's `library.properties`.

**What else protects the kernel:**

- The language server gets the texts with the same parts blanked out.
- It gets only whitelisted methods.
- URIs outside the sketch, or with encoded dots or slashes, are refused.
- Child processes get a reduced environment, with none of the kernel's variables.

**Known limits:**

- Libraries installed from Arduino's index do not go through the filter.
- The user is fixed when the WebSocket opens.
- On a server with untrusted users, run the kernel as an OS user that cannot read anything secret. A real fix would put the compiler in an OS-level sandbox.

Every change to `sketch.js` or `lsp.js` deserves a security review: each fix so far came from a bypass someone found.

## Testing

There are no automated tests in this repository yet. During development, the app was tested end to end in Chromium (Playwright) with a fake Web Serial board that emulates Optiboot and stk500boot, against a real kernel with real arduino-cli compiles. It has **not been tested on a real board, or in real Chrome or Firefox**. In particular, nobody has checked that a real browser lets `requestPort` run after a click inside the sandboxed iframe.

On Windows, `avr-gcc` fails with paths longer than 260 characters. Give the module a short `dataPath` (for example `C:\lilos-arduino`).

## Not done yet

- Other boards: ESP32, RP2040, Leonardo and the like. They have other upload protocols and much larger tools.
- Serial plotter and debugging.
- A board package manager in the UI.
- A Terminal `arduino` command, and sketch actions in the File Manager menu.
- An OS-level sandbox for the compiler.
