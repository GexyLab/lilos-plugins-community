import { EditorView, keymap, Decoration } from '@codemirror/view';
import { EditorState, StateField, StateEffect } from '@codemirror/state';
import { basicSetup } from 'codemirror';
import { cpp } from '@codemirror/lang-cpp';
import { indentUnit, HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import { autocompletion, completeFromList } from '@codemirror/autocomplete';
import { indentWithTab } from '@codemirror/commands';
import {
  LSPClient, serverCompletion, hoverTooltips, signatureHelp, serverDiagnostics,
  formatKeymap, renameKeymap, jumpToDefinitionKeymap, findReferencesKeymap,
} from '@codemirror/lsp-client';

/**
 * The editors of a sketch: one CodeMirror view per open file (only the active one shown), C++
 * highlighting, the suggestions of the kernel's language server when there is one (LSPClient on
 * the Backend's transport), Arduino's main names when there is not, and the lines of the last
 * compilation's errors.
 *
 * Files have addresses file:///sketch/<Sketch>/<path> for the server (the module maps them).
 */

/** Arduino's functions and constants: the suggestions without a language server. */
const ARDUINO_WORDS = [
  'pinMode', 'digitalWrite', 'digitalRead', 'analogRead', 'analogWrite', 'analogReference', 'delay', 'delayMicroseconds',
  'millis', 'micros', 'tone', 'noTone', 'pulseIn', 'pulseInLong', 'shiftIn', 'shiftOut', 'attachInterrupt', 'detachInterrupt',
  'digitalPinToInterrupt', 'interrupts', 'noInterrupts', 'map', 'constrain', 'random', 'randomSeed', 'bitRead', 'bitWrite',
  'bitSet', 'bitClear', 'bit', 'lowByte', 'highByte', 'Serial', 'Serial.begin', 'Serial.print', 'Serial.println',
  'Serial.available', 'Serial.read', 'Serial.write', 'Serial.readStringUntil', 'Serial.parseInt', 'setup', 'loop',
  'HIGH', 'LOW', 'INPUT', 'OUTPUT', 'INPUT_PULLUP', 'LED_BUILTIN', 'A0', 'A1', 'A2', 'A3', 'A4', 'A5', 'String', 'byte', 'word', 'boolean',
].map(label => ({ label, type: /^[A-Z_0-9]+$/.test(label) ? 'constant' : /^[A-Z]/.test(label) ? 'class' : 'function' }));

const setMarks = StateEffect.define();
/** The lines with an error or a warning of the last compilation: [{ line, severity, message }]. */
const marks = StateField.define({
  create: () => Decoration.none,
  update(deco, tr) {
    deco = deco.map(tr.changes);
    for (const e of tr.effects) {
      if (!e.is(setMarks)) continue;
      const doc = tr.state.doc;
      const ranges = e.value.filter(m => m.line >= 1 && m.line <= doc.lines)
        .map(m => Decoration.line({ attributes: { class: `cm-mark-${m.severity === 'error' ? 'error' : 'warning'}`, title: m.message } }).range(doc.line(m.line).from));
      deco = Decoration.set(ranges, true);
    }
    return deco;
  },
  provide: f => EditorView.decorations.from(f),
});

const theme = EditorView.theme({
  '&': { height: '100%', fontSize: '13px', backgroundColor: 'var(--surface)', color: 'var(--text)' },
  '.cm-scroller': { fontFamily: '"JetBrains Mono", ui-monospace, Consolas, monospace', lineHeight: '1.55' },
  '.cm-gutters': { backgroundColor: 'var(--surface)', color: 'var(--faint)', border: 'none' },
  '.cm-activeLine': { backgroundColor: 'color-mix(in srgb, var(--accent) 6%, transparent)' },
  '.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'var(--text)' },
  '.cm-cursor': { borderLeftColor: 'var(--text)' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': { backgroundColor: 'color-mix(in srgb, var(--accent) 25%, transparent) !important' },
  '.cm-tooltip': { backgroundColor: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: '6px', boxShadow: '0 8px 24px -8px rgba(0,0,0,.35)' },
  '.cm-tooltip-autocomplete ul li[aria-selected]': { backgroundColor: 'var(--accent)', color: '#fff' },
  '.cm-tooltip.cm-tooltip-hover, .cm-lsp-documentation': { maxWidth: '520px', padding: '6px 9px', fontSize: '12px' },
  '.cm-mark-error': { backgroundColor: 'color-mix(in srgb, var(--danger, #e5484d) 12%, transparent)' },
  '.cm-mark-warning': { backgroundColor: 'color-mix(in srgb, #d9822b 12%, transparent)' },
  '.cm-panels': { backgroundColor: 'var(--chrome)', color: 'var(--text)' },
  '.cm-textfield': { backgroundColor: 'var(--field-bg, var(--surface))', color: 'var(--text)', border: '1px solid var(--border)' },
  '.cm-button': { backgroundImage: 'none', backgroundColor: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)' },
});

/** Colours that read on lilOS's light and dark themes alike. */
const highlight = HighlightStyle.define([
  { tag: [tags.keyword, tags.controlKeyword, tags.modifier, tags.operatorKeyword], color: '#a25ddc' },
  { tag: [tags.typeName, tags.className, tags.namespace, tags.standard(tags.typeName)], color: '#0f9d8f' },
  { tag: [tags.function(tags.variableName), tags.function(tags.propertyName), tags.macroName], color: '#3e8ee0' },
  { tag: [tags.number, tags.bool, tags.atom, tags.null], color: '#e0803a' },
  { tag: [tags.string, tags.character, tags.special(tags.string)], color: '#2ea86a' },
  { tag: [tags.comment, tags.lineComment, tags.blockComment], color: 'var(--faint)', fontStyle: 'italic' },
  { tag: [tags.processingInstruction, tags.meta], color: '#d06a3a' },
  { tag: tags.invalid, color: 'var(--danger, #e5484d)' },
]);

/** Strips what a server's Markdown could carry beyond text (the docs are shown as HTML). */
function sanitize(html) {
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  const ALLOWED = new Set(['DIV', 'P', 'PRE', 'CODE', 'EM', 'STRONG', 'B', 'I', 'UL', 'OL', 'LI', 'BR', 'HR', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'SPAN', 'BLOCKQUOTE', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TH', 'TD']);
  const walk = el => {
    for (const child of [...el.children]) {
      if (!ALLOWED.has(child.tagName)) { child.replaceWith(doc.createTextNode(child.textContent ?? '')); continue; }
      for (const a of [...child.attributes]) if (a.name !== 'class') child.removeAttribute(a.name);
      walk(child);
    }
  };
  const root = doc.body.firstElementChild;
  walk(root);
  return root.innerHTML;
}

export class Editors {
  #parent; #root; #views = new Map(); #client = null; #lspTransport = null;
  active = null;
  onChange = () => {};          // (path) a file changed (not yet saved)
  onCursor = () => {};          // ({ line, col }) the caret moved

  constructor(parent, root) {
    this.#parent = parent;
    this.#root = root;
  }

  get lsp() { return !!this.#client; }

  uri(sketch, path) { return `file:///sketch/${sketch}/${path}`; }

  /** Starts the suggestions on a transport (Backend.transport()); the open files get them on reopen. */
  async connect(transport, sketch) {
    this.disconnect();
    const client = new LSPClient({
      rootUri: `file:///sketch/${sketch}`,
      timeout: 20_000,
      sanitizeHTML: sanitize,
      highlightLanguage: () => cpp().language,
      extensions: [serverCompletion({ override: true }), hoverTooltips(), signatureHelp(), serverDiagnostics(),
        keymap.of([...formatKeymap, ...renameKeymap, ...jumpToDefinitionKeymap, ...findReferencesKeymap])],
      notificationHandlers: { '$/progress': () => true },
    });
    client.connect(transport);
    this.#client = client;
    this.#lspTransport = transport;
    await client.initializing.catch(() => {});
  }

  disconnect() {
    try { this.#client?.disconnect(); } catch { /* already gone */ }
    this.#client = null;
    this.#lspTransport = null;
  }

  #extensions(uri) {
    return [
      basicSetup,
      cpp(),
      syntaxHighlighting(highlight),
      indentUnit.of('  '),
      EditorState.tabSize.of(2),
      keymap.of([indentWithTab]),   // Ctrl+S is the app's Save command
      theme,
      marks,
      this.#client ? this.#client.plugin(uri, 'cpp') : autocompletion({ override: [completeFromList(ARDUINO_WORDS)] }),
      EditorView.updateListener.of(u => {
        if (u.docChanged) this.onChange(this.#pathOf(u.view));
        if (u.selectionSet || u.docChanged) {
          const pos = u.state.selection.main.head, line = u.state.doc.lineAt(pos);
          if (u.view === this.#views.get(this.active)?.view) this.onCursor({ line: line.number, col: pos - line.from + 1 });
        }
      }),
    ];
  }

  #pathOf(view) {
    for (const [path, v] of this.#views) if (v.view === view) return path;
    return null;
  }

  /** Opens (or shows) a file with `text`. */
  open(sketch, path, text) {
    let v = this.#views.get(path);
    if (!v) {
      const box = document.createElement('div');
      box.className = 'ed-view';
      this.#parent.append(box);
      const uri = this.uri(sketch, path);
      const view = new EditorView({ state: EditorState.create({ doc: text, extensions: this.#extensions(uri) }), parent: box, root: this.#root });
      v = { view, box, uri };
      this.#views.set(path, v);
    }
    this.show(path);
    return v.view;
  }

  /** Re-creates every view (after the suggestions were connected or went), keeping texts and carets. */
  rebuild(sketch) {
    for (const [path, v] of this.#views) {
      const { doc, selection } = v.view.state;
      v.view.destroy();
      v.view = new EditorView({ state: EditorState.create({ doc, selection, extensions: this.#extensions(this.uri(sketch, path)) }), parent: v.box, root: this.#root });
    }
    if (this.active) this.show(this.active);
  }

  show(path) {
    this.active = path;
    for (const [p, v] of this.#views) v.box.hidden = p !== path;
    const view = this.#views.get(path)?.view;
    if (view) { view.requestMeasure(); queueMicrotask(() => view.focus()); }
  }

  close(path) {
    const v = this.#views.get(path);
    if (!v) return;
    v.view.destroy();
    v.box.remove();
    this.#views.delete(path);
    if (this.active === path) this.active = null;
  }

  closeAll() {
    for (const path of [...this.#views.keys()]) this.close(path);
  }

  text(path) { return this.#views.get(path)?.view.state.doc.toString() ?? null; }
  paths() { return [...this.#views.keys()]; }

  /** Puts the caret on a line (and column) of a file already open. */
  reveal(path, line, col = 1) {
    const view = this.#views.get(path)?.view;
    if (!view) return;
    this.show(path);
    const l = view.state.doc.line(Math.max(1, Math.min(line, view.state.doc.lines)));
    const pos = Math.min(l.from + Math.max(0, col - 1), l.to);
    view.dispatch({ selection: { anchor: pos }, effects: EditorView.scrollIntoView(pos, { y: 'center' }) });
    view.focus();
  }

  /** The compilation's marks: { path: [{ line, severity, message }] } (files not listed are cleared). */
  mark(byPath) {
    for (const [path, v] of this.#views) v.view.dispatch({ effects: setMarks.of(byPath[path] ?? []) });
  }

  /** Inserts lines at the top of a file (Includi), after the comments that open it. */
  insertTop(path, text) {
    const view = this.#views.get(path)?.view;
    if (!view) return;
    const doc = view.state.doc;
    let at = 0;
    for (let n = 1; n <= doc.lines; n++) {
      const line = doc.line(n);
      if (/^\s*(\/\/|\/\*|\*|#include)/.test(line.text) || !line.text.trim()) { if (/^\s*#include/.test(line.text)) at = line.to + 1; continue; }
      break;
    }
    at = Math.min(at, doc.length);
    view.dispatch({ changes: { from: at, insert: `${text}\n` } });
  }
}
