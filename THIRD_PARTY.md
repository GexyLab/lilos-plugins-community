# Third-party software

Libraries and programs of other authors used by the packages of this repository. `npm run build` stops if a library bundled by an app, or a program downloaded by a kernel module, is missing here.

## Bundled in ArduinoIDE4LilOS (`apps/arduino-ide`)

The editor is [CodeMirror 6](https://codemirror.net) with its LSP client. These libraries are compiled into `apps/arduino-ide/dist/`.

| Name | Version | License | Copyright | Site |
|---|---|---|---|---|
| @codemirror/autocomplete | 6.20.4 | MIT | Copyright (C) 2018-2021 by Marijn Haverbeke <marijn@haverbeke.berlin> and others | https://code.haverbeke.berlin/codemirror/autocomplete |
| @codemirror/commands | 6.11.1 | MIT | Copyright (C) 2018-2021 by Marijn Haverbeke <marijn@haverbeke.berlin> and others | https://code.haverbeke.berlin/codemirror/commands |
| @codemirror/lang-cpp | 6.0.3 | MIT | Copyright (C) 2018-2021 by Marijn Haverbeke <marijn@haverbeke.berlin> and others | https://github.com/codemirror/lang-cpp |
| @codemirror/language | 6.13.1 | MIT | Copyright (C) 2018-2021 by Marijn Haverbeke <marijn@haverbeke.berlin> and others | https://code.haverbeke.berlin/codemirror/language |
| @codemirror/lint | 6.9.7 | MIT | Copyright (C) 2018-2021 by Marijn Haverbeke <marijn@haverbeke.berlin> and others | https://code.haverbeke.berlin/codemirror/lint |
| @codemirror/lsp-client | 6.3.0 | MIT | Copyright (C) 2025 by Marijn Haverbeke <marijn@haverbeke.berlin> and others | https://www.npmjs.com/package/@codemirror/lsp-client |
| @codemirror/search | 6.7.2 | MIT | Copyright (C) 2018-2021 by Marijn Haverbeke <marijn@haverbeke.berlin> and others | https://code.haverbeke.berlin/codemirror/search |
| @codemirror/state | 6.7.6 | MIT | Copyright (C) 2018-2021 by Marijn Haverbeke <marijn@haverbeke.berlin> and others | https://code.haverbeke.berlin/codemirror/state |
| @codemirror/streamparser | 6.0.0 | MIT | Copyright (C) 2018-2021 by Marijn Haverbeke <marijn@haverbeke.berlin> and others | https://code.haverbeke.berlin/codemirror/streamparser |
| @codemirror/view | 6.43.15 | MIT | Copyright (C) 2018-2021 by Marijn Haverbeke <marijn@haverbeke.berlin> and others | https://code.haverbeke.berlin/codemirror/view |
| @lezer/common | 1.5.5 | MIT | Copyright (C) 2018 by Marijn Haverbeke <marijn@haverbeke.berlin> and others | https://code.haverbeke.berlin/lezer/common |
| @lezer/cpp | 1.1.6 | MIT | Copyright (C) 2020 by Marijn Haverbeke <marijn@haverbeke.berlin> and others | https://code.haverbeke.berlin/lezer/cpp |
| @lezer/highlight | 1.2.5 | MIT | Copyright (C) 2018 by Marijn Haverbeke <marijn@haverbeke.berlin> and others | https://code.haverbeke.berlin/lezer/highlight |
| @lezer/lr | 1.4.12 | MIT | Copyright (C) 2018 by Marijn Haverbeke <marijn@haverbeke.berlin> and others | https://code.haverbeke.berlin/lezer/lr |
| @marijn/find-cluster-break | 1.0.4 | MIT | Copyright (C) 2024 by Marijn Haverbeke <marijn@haverbeke.berlin> | https://code.haverbeke.berlin/marijn/find-cluster-break |
| codemirror | 6.0.2 | MIT | Copyright (C) 2018-2021 by Marijn Haverbeke <marijn@haverbeke.berlin> and others | https://github.com/codemirror/basic-setup |
| crelt | 1.0.7 | MIT | Copyright (C) 2020 by Marijn Haverbeke <marijn@haverbeke.berlin> | https://code.haverbeke.berlin/marijn/crelt |
| marked | 15.0.12 | MIT | Copyright (c) 2018+, MarkedJS (https://github.com/markedjs/) | https://marked.js.org |
| style-mod | 4.1.4 | MIT | Copyright (C) 2018 by Marijn Haverbeke <marijn@haverbeke.berlin> and others | https://code.haverbeke.berlin/marijn/style-mod |
| vscode-jsonrpc | 10.0.0 | MIT | Copyright (c) Microsoft Corporation | https://github.com/microsoft/vscode-languageserver-node/tree/main/jsonrpc |
| vscode-languageserver-protocol | 3.18.5 | MIT | Copyright (c) Microsoft Corporation | https://github.com/microsoft/vscode-languageserver-node/tree/main/protocol |
| vscode-languageserver-types | 3.18.5 | MIT | Copyright (c) Microsoft Corporation | https://github.com/microsoft/vscode-languageserver-node/tree/main/types |
| w3c-keyname | 2.2.8 | MIT | Copyright (C) 2016 by Marijn Haverbeke <marijn@haverbeke.berlin> and others | https://github.com/marijnh/w3c-keyname |

## Downloaded by the `arduino` kernel module (`modules/arduino`)

Not part of this repository: an administrator's setup downloads them from Arduino, checks the SHA-256 listed in `modules/arduino/tools.js` and runs them, unmodified, as separate programs.

| Name | Version | License | Copyright | Site |
|---|---|---|---|---|
| arduino-cli | 1.5.1 | GPL-3.0 | Copyright © ARDUINO SA | https://github.com/arduino/arduino-cli |
| arduino-language-server | 0.7.7 | AGPL-3.0 | Copyright © ARDUINO SA | https://github.com/arduino/arduino-language-server |
| clangd | 14.0.0 | Apache-2.0 WITH LLVM-exception | Copyright © The LLVM Project | https://clangd.llvm.org |

## Build tools

| Name | Version | License | Copyright | Site |
|---|---|---|---|---|
| vite | 8.3.5 | MIT | Copyright (c) 2019-present, VoidZero Inc. and Vite contributors | https://vite.dev |
