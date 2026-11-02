import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { findTool } from './tools.js';
import { SKETCH_NAME, blank, checkFiles, writeFiles } from './sketch.js';

/**
 * The editor's suggestions for one window: arduino-language-server (with clangd) on a copy of the
 * sketch in <data>/work/<user>/l-<id>/<Name>. The page speaks LSP with addresses of its own,
 * file:///sketch/<Name>/<file>: they are turned into the copy's and back, so the page never
 * needs the kernel's paths. Addresses outside the sketch (the core's headers) are left as they are.
 *
 * The documents always arrive whole (the answer to 'initialize' says so): each text passes through
 * blank() before the server sees it, so an #include of a file of the kernel's computer stays
 * unread by clangd too.
 */
export const MAX_PER_USER = 3;
const MAX_MESSAGE = 8 << 20;
/** What a page may ask the server; anything else (configuration, workspace changes…) is dropped. */
const METHODS = new Set([
  'initialize', 'initialized', 'shutdown', 'exit', '$/cancelRequest',
  'textDocument/didOpen', 'textDocument/didChange', 'textDocument/didClose', 'textDocument/didSave',
  'textDocument/completion', 'completionItem/resolve', 'textDocument/hover', 'textDocument/signatureHelp',
  'textDocument/definition', 'textDocument/declaration', 'textDocument/typeDefinition', 'textDocument/implementation',
  'textDocument/references', 'textDocument/documentHighlight', 'textDocument/documentSymbol',
  'textDocument/formatting', 'textDocument/rangeFormatting', 'textDocument/rename', 'textDocument/prepareRename',
]);
const VIRTUAL = name => `file:///sketch/${name}`;

/** 'file:///C:/a/b' and 'file:///c%3A/a/b' are the same place: compare decoded, case-insensitive on Windows. */
const comparable = uri => {
  let s;
  try { s = decodeURIComponent(uri); } catch { s = uri; }
  s = s.replace(/^file:\/\/\/?/, '').replace(/\\/g, '/');
  return process.platform === 'win32' ? s.toLowerCase() : s;
};

export class LanguageServer {
  #child = null;
  #buffer = Buffer.alloc(0);
  #initId = null;
  onMessage = () => {};
  onExit = () => {};

  constructor({ arduino, principal, fqbn, sketch }) {
    this.arduino = arduino;
    this.principal = principal;
    this.fqbn = fqbn;
    this.name = sketch?.name;
    this.files = sketch?.files;
  }

  async start() {
    if (!SKETCH_NAME.test(this.name ?? '')) throw Object.assign(new Error('Nome dello sketch non valido'), { code: 'invalid' });
    if (!/^[a-zA-Z0-9_.-]+:[a-zA-Z0-9_.-]+:[a-zA-Z0-9_.-]+(:[a-zA-Z0-9_.=,-]+)?$/.test(this.fqbn ?? '')) throw Object.assign(new Error('Scheda non valida'), { code: 'invalid' });
    const dir = this.arduino.dir;
    const [ls, clangd, cli] = await Promise.all([findTool(dir, 'ls'), findTool(dir, 'clangd'), findTool(dir, 'cli')]);
    if (!ls || !clangd || !cli) throw Object.assign(new Error('I suggerimenti non sono disponibili su questo kernel'), { code: 'unavailable' });
    const { file, key } = await this.arduino.configFor(this.principal);
    this.work = join(dir, 'work', key, `l-${randomBytes(6).toString('hex')}`);
    this.sketchDir = join(this.work, this.name);
    await this.sync(this.files ?? {});
    this.real = pathToFileURL(this.sketchDir).href.replace(/\/$/, '');
    this.realKey = comparable(this.real);
    this.virtual = VIRTUAL(this.name);
    this.#child = spawn(ls, ['-cli', cli, '-cli-config', file, '-clangd', clangd, '-fqbn', this.fqbn, '-jobs', '1'], { cwd: this.work, env: this.arduino.env, windowsHide: true });
    this.#child.stdin.on('error', () => {});   // the server went: 'close' follows (an EPIPE must not stop the kernel)
    this.#child.stdout.on('data', chunk => this.#receive(chunk));
    this.#child.stderr.on('data', () => {});   // its log: very verbose, not kept
    this.#child.on('error', () => this.close());
    this.#child.on('close', code => { this.#child = null; this.onExit(code); this.#clean(); });
  }

  /** Writes the sketch's files (all of them, checked) into the copy. */
  async sync(files) {
    const checked = checkFiles(files);
    const safe = Object.fromEntries(Object.entries(checked).map(([p, t]) => [p, blank(t)]));
    await mkdir(this.sketchDir, { recursive: true });
    await writeFiles(this.sketchDir, safe);
  }

  /**
   * A message from the page (an object): only the methods of METHODS and answers to the server's
   * requests; every 'file://' address must be in the sketch (anything else drops the message);
   * 'initialize' gets the sketch's folder whatever the page said; texts checked.
   */
  send(message) {
    if (!this.#child?.stdin.writable || !message || typeof message !== 'object') return;
    const request = typeof message.method === 'string';
    if (request && !METHODS.has(message.method)) return;
    if (!request && message.id === undefined) return;
    let outside = false;
    const out = this.#map(message, uri => {
      const rest = uri === this.virtual ? '' : uri.startsWith(`${this.virtual}/`) ? uri.slice(this.virtual.length) : null;
      if (rest === null || /%2e|%5c|%2f|\\|\/\.\.?(\/|$)/i.test(rest)) { outside = true; return uri; }
      return this.real + rest;
    });
    if (outside) return;
    if (out.method === 'initialize') {
      this.#initId = out.id ?? null;
      out.params = {
        processId: null, rootUri: this.real, workspaceFolders: [{ uri: this.real, name: this.name }],
        capabilities: out.params?.capabilities && typeof out.params.capabilities === 'object' ? out.params.capabilities : {},
      };
    }
    const params = out?.params;
    if (out?.method === 'textDocument/didOpen' && typeof params?.textDocument?.text === 'string') params.textDocument.text = blank(params.textDocument.text);
    if (out?.method === 'textDocument/didChange' && Array.isArray(params?.contentChanges)) {
      // Whole documents only (see #fromServer): a ranged change would bypass the check
      params.contentChanges = params.contentChanges.filter(c => typeof c?.text === 'string' && !c.range).map(c => ({ text: blank(c.text) }));
      if (!params.contentChanges.length) return;
    }
    const text = JSON.stringify(out);
    this.#child.stdin.write(`Content-Length: ${Buffer.byteLength(text)}\r\n\r\n${text}`);
  }

  close() {
    this.#child?.kill();
    this.#clean();
  }

  async #clean() {
    if (this.work) await rm(this.work, { recursive: true, force: true }).catch(() => {});
  }

  #receive(chunk) {
    this.#buffer = Buffer.concat([this.#buffer, chunk]);
    for (;;) {
      const sep = this.#buffer.indexOf('\r\n\r\n');
      if (sep < 0) return;
      const m = /Content-Length:\s*(\d+)/i.exec(this.#buffer.subarray(0, sep).toString('latin1'));
      if (!m) { this.#buffer = this.#buffer.subarray(sep + 4); continue; }
      const length = Number(m[1]);
      if (length > MAX_MESSAGE) return this.close();
      if (this.#buffer.length < sep + 4 + length) return;
      const body = this.#buffer.subarray(sep + 4, sep + 4 + length).toString('utf8');
      this.#buffer = this.#buffer.subarray(sep + 4 + length);
      let message;
      try { message = JSON.parse(body); } catch { continue; }
      this.#fromServer(message);
    }
  }

  #fromServer(message) {
    const out = this.#map(message, uri => {
      const key = comparable(uri);
      return key === this.realKey || key.startsWith(`${this.realKey}/`) ? this.virtual + uri.slice(uri.length - (key.length - this.realKey.length)) : uri;
    });
    // Diagnostics of the server's own files (its .clangd…) are not the user's business
    if (out?.method === 'textDocument/publishDiagnostics' && !String(out.params?.uri ?? '').startsWith(`${this.virtual}/`)) return;
    if (this.#initId !== null && out?.id === this.#initId && out.result?.capabilities) {
      this.#initId = null;
      const sync = out.result.capabilities.textDocumentSync;
      out.result.capabilities.textDocumentSync = typeof sync === 'object' && sync ? { ...sync, change: 1 } : { openClose: true, change: 1 };
    }
    this.onMessage(out);
  }

  /** A copy of the message with every 'file://' string passed through fn. */
  #map(value, fn) {
    if (typeof value === 'string') return value.startsWith('file://') ? fn(value) : value;
    if (Array.isArray(value)) return value.map(v => this.#map(v, fn));
    if (value && typeof value === 'object') {
      const out = {};
      for (const [k, v] of Object.entries(value)) out[this.#map(k, fn)] = this.#map(v, fn);
      return out;
    }
    return value;
  }
}
