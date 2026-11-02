import { Editors } from './editor.js';
import { Backend } from './backend.js';
import { Link, sleep } from './link.js';
import { upload } from './stk500.js';
import { parseHex } from './hex.js';
import { MonitorView } from './monitor.js';
import { BOARDS, GENERIC_USB, boardOfPort, fqbnOf, parseFqbn, uploadOf, usbKey } from './boards.js';
import { EXAMPLES } from './examples.js';
import { STYLE } from './style.js';

/**
 * ArduinoIDE4LilOS: sketches for Arduino Uno, Nano and Mega in lilOS (sdk 2, an installable app; it has
 * only `lilos`, no lilOS SDK).
 *
 * - The sketches are folders of ~/Arduino (permission fs.write:~/Arduino); the user's own libraries
 *   are in ~/Arduino/libraries and go with every compilation.
 * - Compiling, libraries and the editor's suggestions: the kernel module «arduino» (permission
 *   kernel:arduino, backend.js).
 * - The board is plugged into the user's computer: uploading (stk500.js) and the serial monitor
 *   use its serial port through lilOS (permission serial, Web Serial: Chrome, Edge, Firefox 151+).
 */
const ROOT = '~/Arduino';
const NAME = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,62}$/;
const FILE = /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,99}\.(ino|h|hpp|c|cpp|S)$/;
const SOURCE = /\.(ino|pde|h|hh|hpp|hxx|c|cc|cpp|cxx|s|S|tpp|ipp|txt|md|properties|json)$/;
const BAUDS = [300, 1200, 2400, 4800, 9600, 19200, 38400, 57600, 74880, 115200, 230400, 250000, 500000, 1000000, 2000000];
const ENDINGS = { none: '', lf: '\n', cr: '\r', crlf: '\r\n' };
const AUTOSAVE = 1500;

const ICONS = {
  verify: '<path d="m5 12.5 4.5 4.5L19 7"/>',
  upload: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  book: '<path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5z"/><path d="M5 19.5A1.5 1.5 0 0 0 6.5 21H19v-3M9 7h6"/>',
  bulb: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0 0 12 3z"/>',
  serial: '<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M7 9h2M11 9h6M7 12.5h6"/>',
  chip: '<rect x="7" y="7" width="10" height="10" rx="1.5"/><path d="M10 3v4M14 3v4M10 17v4M14 17v4M3 10h4M3 14h4M17 10h4M17 14h4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  chev: '<path d="M6 9l6 6 6-6"/>',
  file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>',
  err: '<circle cx="12" cy="12" r="9"/><path d="M15 9l-6 6M9 9l6 6"/>',
  warn: '<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17h.01"/>',
  check: '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  save: '<path d="M5 3h11l3 3v15H5z"/><path d="M8 3v5h7V3M8 21v-7h8v7"/>',
  search: '<circle cx="11" cy="11" r="6"/><path d="m20 20-4.5-4.5"/>',
};
const ico = (name, cls = 'ico') => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;

function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;   // only our constants (icons)
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  el.append(...children.flat().filter(c => c != null && c !== false));
  return el;
}

export function main({ lilos, root, args }) {
  const t = (k, p) => lilos.locale.i18n.t(k, p);
  const box = h('div', { class: 'ard', tabindex: '-1' });
  root.append(h('style', {}, STYLE), box);

  // ---------- State ----------
  let backend = null, status = null, moduleMissing = false;
  let sketch = null;                // { name, folder, fileId, files: Map(path → { saved, dirty }) }
  let fqbn = 'arduino:avr:uno';
  let ports = [], portId = null;
  let portBoards = {};              // usb key → fqbn, for adapters that do not say
  let monitor = { link: null, baud: 9600, ending: 'lf', open: false };
  let busy = false, lastDiagnostics = [], disposed = false;
  let autosaveTimer = null;
  const serialOk = { value: false };

  // ---------- Layout ----------
  const verifyBtn = h('button', { class: 'rbtn', type: 'button', html: ico('verify'), onclick: () => verify() });
  const uploadBtn = h('button', { class: 'rbtn', type: 'button', html: ico('upload'), onclick: () => doUpload() });
  const boardBtn = h('button', { class: 'boardpick', type: 'button', onclick: () => boardDialog() });
  const monitorBtn = h('button', { class: 'iconbtn big', type: 'button', html: ico('serial'), onclick: () => { showPanel('monitor'); if (!monitor.open) openMonitor(); } });
  const tools = h('header', { class: 'tools' }, verifyBtn, uploadBtn, h('span', { class: 'tsep' }), boardBtn, h('span', { class: 'sp' }), monitorBtn);

  const actButtons = {};
  const act = h('nav', { class: 'act' }, ...['sketchbook', 'libraries', 'examples'].map(id => {
    actButtons[id] = h('button', { type: 'button', html: ico({ sketchbook: 'folder', libraries: 'book', examples: 'bulb' }[id]), onclick: () => showSide(id) });
    return actButtons[id];
  }));
  const side = h('aside', { class: 'side' });
  const tabs = h('div', { class: 'tabs', role: 'tablist' });
  const edBox = h('div', { class: 'editors' });
  const empty = h('div', { class: 'empty' });
  edBox.append(empty);
  const panelTabs = h('div', { class: 'ptabs', role: 'tablist' });
  const panelBody = h('div', { class: 'pbody' });
  const panel = h('section', { class: 'panel' }, panelTabs, panelBody);
  const statusLeft = h('span'), statusRight = h('span', { class: 'sr' });
  const statusBar = h('footer', { class: 'status' }, statusLeft, h('span', { class: 'sp' }), statusRight);
  const center = h('main', { class: 'center' }, tabs, edBox, panel);
  const overlay = h('div', { class: 'overlay', hidden: true });
  box.append(tools, h('div', { class: 'body' }, act, side, center), statusBar, overlay);

  const editors = new Editors(edBox, root.getRootNode?.() ?? document);

  // Output, monitor, problems
  const output = h('pre', { class: 'out', 'aria-live': 'polite' });
  const memRow = h('div', { class: 'memrow', hidden: true });
  const outPane = h('div', { class: 'pane' }, output, memRow);
  const monLines = h('div', { class: 'mon', role: 'log' });
  const monView = new MonitorView(monLines);
  const monInput = h('input', { class: 'field grow', type: 'text', spellcheck: 'false' });
  const endingSel = h('select', { class: 'field' });
  const baudSel = h('select', { class: 'field' }, ...BAUDS.map(b => h('option', { value: b }, `${b} baud`)));
  const timesChk = h('button', { class: 'chip on', type: 'button', 'aria-pressed': 'true' });
  const followChk = h('button', { class: 'chip on', type: 'button', 'aria-pressed': 'true' });
  const monOpenBtn = h('button', { class: 'btn', type: 'button' });
  const monTools = h('div', { class: 'montools' }, monOpenBtn, monInput, endingSel, baudSel, timesChk, followChk,
    h('button', { class: 'iconbtn', type: 'button', html: ico('save'), onclick: () => saveMonitor() }),
    h('button', { class: 'iconbtn', type: 'button', html: ico('trash'), onclick: () => monView.clear() }));
  const monPane = h('div', { class: 'pane' }, monTools, monLines);
  const probList = h('div', { class: 'probs' });
  const probPane = h('div', { class: 'pane' }, probList);
  const panes = { output: outPane, monitor: monPane, problems: probPane };
  let activePanel = 'output';
  const panelBtn = {};
  for (const id of Object.keys(panes)) {
    panelBtn[id] = h('button', { class: 'ptab', type: 'button', role: 'tab', onclick: () => showPanel(id) });
    panelTabs.append(panelBtn[id]);
  }
  panelBody.append(...Object.values(panes));

  // ---------- Texts ----------
  function texts() {
    verifyBtn.title = t('verify');
    verifyBtn.setAttribute('aria-label', t('verify'));
    uploadBtn.title = t('upload');
    uploadBtn.setAttribute('aria-label', t('upload'));
    monitorBtn.title = t('panel.monitor');
    monitorBtn.setAttribute('aria-label', t('panel.monitor'));
    for (const id of Object.keys(actButtons)) { actButtons[id].title = t(`side.${id}`); actButtons[id].setAttribute('aria-label', t(`side.${id}`)); }
    panelBtn.output.textContent = t('panel.output');
    panelBtn.monitor.textContent = t('panel.monitor');
    panelBtn.problems.textContent = t('panel.problems');
    if (lastDiagnostics.length) panelBtn.problems.append(h('span', { class: 'cnt' }, String(lastDiagnostics.length)));
    monInput.placeholder = t('monitor.placeholder');
    endingSel.replaceChildren(...Object.keys(ENDINGS).map(k => h('option', { value: k }, t(`monitor.ending.${k}`))));
    endingSel.value = monitor.ending;
    timesChk.textContent = t('monitor.times');
    followChk.textContent = t('monitor.follow');
    monTools.children[monTools.children.length - 2].title = t('monitor.save');
    monTools.children[monTools.children.length - 1].title = t('monitor.clear');
    monOpenBtn.textContent = monitor.open ? t('monitor.close') : t('monitor.open');
    empty.replaceChildren(h('p', {}, t('empty')), h('button', { class: 'btn primary', type: 'button', onclick: () => newSketch() }, t('sketch.new')));
    drawBoard();
    drawStatus();
  }

  const say = (text, kind = '') => {
    const line = h('span', { class: kind }, `${text}\n`);
    output.append(line);
    output.scrollTop = output.scrollHeight;
  };

  function drawStatus(extra) {
    const path = editors.active;
    statusLeft.textContent = extra ?? (sketch ? `${sketch.name}${path ? ` · ${path}` : ''}` : '');
    const parsed = parseFqbn(fqbn);
    const port = ports.find(p => p.id === portId);
    statusRight.textContent = `${parsed?.board.name ?? fqbn}${port ? ` · ${portLabel(port)}` : ''}${editors.lsp ? ` · ${t('status.suggestions')}` : ''}`;
  }

  // ---------- Panels ----------
  function showPanel(id) {
    activePanel = id;
    for (const [k, pane] of Object.entries(panes)) { pane.hidden = k !== id; panelBtn[k].setAttribute('aria-selected', String(k === id)); }
    if (id === 'monitor') monInput.focus();
  }

  function showSide(id) {
    const same = side.dataset.pane === id && !side.hidden;
    side.hidden = same;
    for (const [k, b] of Object.entries(actButtons)) b.toggleAttribute('aria-current', !same && k === id);
    if (same) return;
    side.dataset.pane = id;
    if (id === 'sketchbook') drawSketchbook();
    else if (id === 'libraries') drawLibraries();
    else drawExamples();
  }

  // ---------- Setup and the kernel ----------
  async function connect() {
    try {
      status = await lilos.kernel.request('arduino', 'GET', '/status');
    } catch (err) {
      moduleMissing = true;
      return showOverlay('missing', String(err.message ?? err));
    }
    try {
      backend = await Backend.open(lilos);
      backend.onClose = () => { if (!disposed) { editors.disconnect(); drawStatus(); say(t('kernel.closed'), 'err'); } };
      backend.onLspExit = () => { editors.disconnect(); editors.rebuild(sketch?.name ?? ''); drawStatus(); };
    } catch (err) {
      return showOverlay('missing', String(err.message ?? err));
    }
    if (!status.ready) return showOverlay('setup');
    overlay.hidden = true;
    startSuggestions();
  }

  function showOverlay(kind, detail = '') {
    overlay.hidden = false;
    if (kind === 'missing') {
      overlay.replaceChildren(h('div', { class: 'card' },
        h('h2', { html: ico('chip') }, t('missing.title')),
        h('p', {}, t('missing.text')),
        detail ? h('p', { class: 'faint' }, detail) : null));
      return;
    }
    const bars = h('div', { class: 'steps' });
    const start = h('button', { class: 'btn primary', type: 'button' }, t('setup.start'));
    const note = h('p', { class: 'faint' });
    overlay.replaceChildren(h('div', { class: 'card' },
      h('h2', { html: ico('chip') }, t('setup.title')),
      h('p', {}, t('setup.text')),
      bars, note, h('div', { class: 'row end' }, start)));
    const steps = new Map();
    const stepRow = step => {
      if (!steps.has(step)) {
        const bar = h('i');
        const row = h('div', { class: 'step' }, h('span', {}, t(`setup.step.${step}`)), h('span', { class: 'bar' }, bar), h('small'));
        bars.append(row);
        steps.set(step, { row, bar });
      }
      return steps.get(step);
    };
    start.onclick = async () => {
      start.disabled = true;
      start.setAttribute('aria-busy', 'true');
      note.textContent = '';
      try {
        status = await backend.call('setup', {}, p => {
          for (const [s, r] of steps) if (s !== p.step) r.row.classList.add('done');
          const r = stepRow(p.step);
          if (p.total) { r.bar.style.width = `${Math.round((p.done / p.total) * 100)}%`; r.row.lastChild.textContent = `${lilos.locale.formatBytes(p.done)} / ${lilos.locale.formatBytes(p.total)}`; }
          else r.row.classList.add('busy');
        });
        overlay.hidden = true;
        lilos.ui.notify({ text: t('setup.done'), level: 'success' }).catch(() => {});
        startSuggestions();
      } catch (err) {
        note.textContent = err.code === 'forbidden' ? t('setup.admin') : t('setup.failed', { message: err.message });
        start.disabled = false;
        start.removeAttribute('aria-busy');
      }
    };
  }

  // ---------- Sketches ----------
  const ensureRoot = () => lilos.files.mkdir(ROOT);   // the folder that is there, or a new one

  async function listSketches() {
    await ensureRoot();
    const items = await lilos.files.list(ROOT);
    return items.filter(i => i.type === 'folder' && i.name !== 'libraries' && NAME.test(i.name)).map(i => i.name).sort((a, b) => a.localeCompare(b));
  }

  /** The files of a sketch folder: the top level and src/ (as the Arduino builder compiles them). */
  async function readFolder(folder) {
    const files = {};
    const walk = async (path, rel, depth) => {
      for (const item of await lilos.files.list(path)) {
        const r = rel ? `${rel}/${item.name}` : item.name;
        if (item.type === 'folder' && depth < 4 && (rel || item.name === 'src')) await walk(`${path}/${item.name}`, r, depth + 1);
        else if (item.type === 'file' && SOURCE.test(item.name) && item.size <= 1 << 20) files[r] = await lilos.files.read(`${path}/${item.name}`);
      }
    };
    await walk(folder, '', 0);
    return files;
  }

  async function openSketch(name) {
    if (sketch?.name === name) return;
    await flushSave();
    const folder = `${ROOT}/${name}`;
    let files;
    try { files = await readFolder(folder); } catch (err) { return say(t('sketch.readFailed', { message: err.message }), 'err'); }
    if (!Object.hasOwn(files, `${name}.ino`)) {
      const ino = Object.keys(files).find(f => f.endsWith('.ino') && !f.includes('/'));
      if (!ino) return say(t('sketch.noIno', { name }), 'err');
    }
    load({ name, folder, fileId: null }, files);
  }

  /** Opened with a .ino file: its folder if it is in ~/Arduino, else only that file. */
  async function openFile(id) {
    try {
      const info = await lilos.files.info(id);
      const m = /^~\/Arduino\/([^/]+)\/[^/]+\.ino$/i.exec(info.ref ?? '');
      if (m && NAME.test(m[1])) return openSketch(m[1]);
      const name = info.name.replace(/\.ino$/i, '');
      if (!NAME.test(name)) return say(t('sketch.badName'), 'err');
      load({ name, folder: null, fileId: id }, { [`${name}.ino`]: await lilos.files.read(id) });
    } catch (err) {
      say(t('sketch.readFailed', { message: err.message }), 'err');
    }
  }

  function load(info, files) {
    editors.closeAll();
    sketch = { ...info, files: new Map(Object.entries(files).map(([p, text]) => [p, { saved: text, dirty: false }])) };
    const main = `${sketch.name}.ino`;
    const order = [...sketch.files.keys()].sort((a, b) => (a === main ? -1 : b === main ? 1 : a.localeCompare(b)));
    for (const path of order.filter(p => /\.(ino|h|hpp|c|cpp|S)$/.test(p))) editors.open(sketch.name, path, sketch.files.get(path).saved);
    if (sketch.files.has(main)) editors.show(main);
    empty.hidden = true;
    lilos.window.setTitle(`ArduinoIDE4LilOS — ${sketch.name}`).catch(() => {});
    lilos.storage.set('last', sketch.folder ? sketch.name : null).catch(() => {});
    drawTabs();
    drawStatus();
    if (side.dataset.pane === 'sketchbook' && !side.hidden) drawSketchbook();
    startSuggestions();
  }

  function drawTabs() {
    tabs.replaceChildren();
    if (!sketch) return;
    for (const path of editors.paths()) {
      const f = sketch.files.get(path);
      const tab = h('div', { class: 'tab', role: 'tab', 'aria-selected': String(path === editors.active), tabindex: '0',
        onclick: () => { editors.show(path); drawTabs(); drawStatus(); },
        onkeydown: e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); editors.show(path); drawTabs(); } } },
      h('span', {}, path), f?.dirty ? h('span', { class: 'dot', title: t('tab.unsaved') }) : null);
      tabs.append(tab);
    }
    if (sketch.folder) tabs.append(h('button', { class: 'iconbtn', type: 'button', html: ico('plus'), title: t('tab.newFile'), 'aria-label': t('tab.newFile'), onclick: () => newFile() }));
  }

  editors.onChange = path => {
    const f = sketch?.files.get(path);
    if (!f) return;
    const was = f.dirty;
    f.dirty = editors.text(path) !== f.saved;
    if (was !== f.dirty) drawTabs();
    clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(() => save().catch(() => {}), AUTOSAVE);
  };
  editors.onCursor = ({ line, col }) => drawStatus(`${sketch?.name ?? ''} · ${editors.active ?? ''} · ${t('status.position', { line, col })}`);

  async function save() {
    clearTimeout(autosaveTimer);
    if (!sketch) return;
    let changed = false;
    for (const path of editors.paths()) {
      const f = sketch.files.get(path), text = editors.text(path);
      if (!f || text === f.saved) continue;
      if (sketch.folder) await lilos.files.write(`${sketch.folder}/${path}`, text);
      else await lilos.files.write(sketch.fileId, text);
      f.saved = text;
      f.dirty = false;
      changed = true;
    }
    if (changed) {
      drawTabs();
      if (editors.lsp) backend?.call('lspSync', { files: currentFiles() }).catch(() => {});
    }
  }
  const flushSave = () => save().catch(err => say(t('sketch.saveFailed', { message: err.message }), 'err'));

  const currentFiles = () => Object.fromEntries([...sketch.files.keys()].map(p => [p, editors.text(p) ?? sketch.files.get(p).saved]));

  /** A name to fill in, in lilOS's message box; check(name) → what is wrong with it, or null. The name, or null. */
  async function ask(title, label, value = '', check = () => null) {
    const { button, values } = await lilos.ui.messageBox({
      title, fields: [{ name: 'name', label, value }], buttons: ['cancel', 'ok'],
      validate: v => check(String(v.name ?? '').trim()),
    });
    return button === 'ok' ? String(values.name ?? '').trim() : null;
  }

  async function uniqueName(base) {
    const existing = new Set((await listSketches()).map(n => n.toLowerCase()));
    if (!existing.has(base.toLowerCase())) return base;
    for (let i = 2; ; i++) if (!existing.has(`${base}_${i}`.toLowerCase())) return `${base}_${i}`;
  }

  async function createSketch(name, files) {
    await ensureRoot();
    await lilos.files.mkdir(`${ROOT}/${name}`);
    for (const [path, text] of Object.entries(files)) await lilos.files.write(`${ROOT}/${name}/${path}`, text);
    await openSketch(name);
  }

  async function newSketch() {
    const existing = new Set((await listSketches()).map(n => n.toLowerCase()));
    const name = await ask(t('sketch.new'), t('sketch.name'), await uniqueName('Sketch'),
      v => (!NAME.test(v) ? t('sketch.badName') : existing.has(v.toLowerCase()) ? t('sketch.exists') : null));
    if (!name) return;
    await createSketch(name, { [`${name}.ino`]: 'void setup() {\n  // runs once, at start\n}\n\nvoid loop() {\n  // runs again and again\n}\n' });
  }

  async function newFile() {
    if (!sketch?.folder) return;
    const path = await ask(t('tab.newFile'), t('tab.fileName'), 'config.h',
      v => (!FILE.test(v) ? t('tab.badName') : sketch.files.has(v) ? t('tab.exists') : null));
    if (!path) return;
    const text = /\.(h|hpp)$/.test(path) ? `#pragma once\n\n` : '';
    await lilos.files.write(`${sketch.folder}/${path}`, text);
    sketch.files.set(path, { saved: text, dirty: false });
    editors.open(sketch.name, path, text);
    drawTabs();
    if (editors.lsp) backend?.call('lspSync', { files: currentFiles() }).catch(() => {});
  }

  async function drawSketchbook() {
    const list = h('div', { class: 'list' });
    side.replaceChildren(
      h('h6', {}, h('span', {}, t('side.sketchbook')), h('button', { class: 'iconbtn', type: 'button', html: ico('plus'), title: t('sketch.new'), 'aria-label': t('sketch.new'), onclick: () => newSketch() })),
      list, h('p', { class: 'foot' }, t('sketchbook.where')));
    try {
      const names = await listSketches();
      if (!names.length) list.append(h('p', { class: 'faint pad' }, t('sketchbook.empty')));
      for (const name of names) {
        list.append(h('button', { class: `item${sketch?.name === name && sketch.folder ? ' cur' : ''}`, type: 'button', onclick: () => openSketch(name) },
          h('span', { html: ico('folder') }), h('span', { class: 'nm' }, name)));
      }
    } catch (err) {
      list.append(h('p', { class: 'error pad' }, err.message));
    }
  }

  function drawExamples() {
    const list = h('div', { class: 'list' });
    side.replaceChildren(h('h6', {}, h('span', {}, t('side.examples'))), list);
    list.append(h('div', { class: 'group' }, t('examples.builtin')));
    for (const ex of EXAMPLES) {
      list.append(h('button', { class: 'item', type: 'button', title: t('examples.open'), onclick: async () => {
        const name = await uniqueName(ex.id);
        await createSketch(name, { [`${name}.ino`]: ex.text });
      } }, h('span', { html: ico('file') }), h('span', { class: 'nm' }, ex.id)));
    }
    if (!backend || !status?.ready) return;
    const libs = h('div');
    list.append(h('div', { class: 'group' }, t('examples.libraries')), libs);
    backend.call('libInstalled').then(installed => {
      for (const lib of installed.filter(l => l.examples.length)) {
        libs.append(h('div', { class: 'sub' }, lib.name));
        for (const path of lib.examples) {
          libs.append(h('button', { class: 'item i1', type: 'button', onclick: async () => {
            const ex = await backend.call('libExample', { library: lib.name, path });
            const base = ex.name.replace(/[^A-Za-z0-9_.-]/g, '_');
            const name = await uniqueName(NAME.test(base) ? base : 'Example');
            const files = {};
            for (const [p, text] of Object.entries(ex.files)) files[p.replace(new RegExp(`^${ex.name}\\.ino$`), `${name}.ino`)] = text;
            if (!files[`${name}.ino`]) { const ino = Object.keys(files).find(p => p.endsWith('.ino') && !p.includes('/')); if (ino) { files[`${name}.ino`] = files[ino]; delete files[ino]; } }
            await createSketch(name, files);
          } }, h('span', { html: ico('file') }), h('span', { class: 'nm' }, path.split('/').at(-1))));
        }
      }
    }).catch(() => {});
  }

  // ---------- Libraries ----------
  function drawLibraries() {
    const input = h('input', { class: 'field', type: 'search', placeholder: t('libs.search'), spellcheck: 'false' });
    const type = h('select', { class: 'field' }, ...['all', 'installed', 'updatable'].map(v => h('option', { value: v }, t(`libs.type.${v}`))));
    const results = h('div', { class: 'libs' });
    side.replaceChildren(h('h6', {}, h('span', {}, t('side.libraries'))), h('div', { class: 'search' }, input, type), results);
    if (!backend || !status?.ready) return results.append(h('p', { class: 'faint pad' }, t('libs.notReady')));
    let timer = null, seq = 0;
    const run = async () => {
      const mine = ++seq;
      results.replaceChildren(h('p', { class: 'faint pad' }, t('libs.searching')));
      try {
        const [list, installed] = await Promise.all([backend.call('libSearch', { query: input.value, type: type.value }), backend.call('libInstalled')]);
        if (mine !== seq) return;
        const includes = new Map(installed.map(l => [l.name, l.includes]));
        results.replaceChildren(...(list.length ? list.map(l => libCard(l, includes.get(l.name) ?? [], run)) : [h('p', { class: 'faint pad' }, t('libs.none'))]));
      } catch (err) {
        if (mine === seq) results.replaceChildren(h('p', { class: 'error pad' }, err.message));
      }
    };
    input.oninput = () => { clearTimeout(timer); timer = setTimeout(run, 300); };
    input.onkeydown = e => e.stopPropagation();
    type.onchange = run;
    run();
  }

  function libCard(lib, includes, refresh) {
    const version = h('select', { class: 'field small' }, ...lib.versions.map(v => h('option', { value: v }, v)));
    const actions = h('div', { class: 'a' });
    const card = h('div', { class: 'lib' },
      h('div', { class: 't' }, h('b', {}, lib.name), h('small', {}, t('libs.by', { author: lib.author })),
        lib.installed ? h('span', { class: `pill${lib.installed !== lib.version ? ' up' : ''}` }, lib.installed !== lib.version ? t('libs.update', { from: lib.installed, to: lib.version }) : t('libs.installed', { version: lib.installed })) : null),
      h('div', { class: 'd' }, lib.sentence), actions);
    const busyBtn = (label, cls, fn) => h('button', { class: `btn small ${cls}`, type: 'button', onclick: async e => {
      const b = e.currentTarget;
      b.disabled = true; b.setAttribute('aria-busy', 'true');
      try { await fn(); } catch (err) { say(err.message, 'err'); showPanel('output'); } finally { b.disabled = false; b.removeAttribute('aria-busy'); }
    } }, label);
    if (lib.installed) {
      if (includes.length && sketch) actions.append(busyBtn(t('libs.include'), '', async () => includeLib(includes)));
      actions.append(h('span', { class: 'sp' }));
      if (lib.installed !== lib.version) actions.append(busyBtn(t('libs.updateBtn'), 'primary', async () => { await installLib(lib.name, lib.version); refresh(); }));
      actions.append(busyBtn(t('libs.remove'), 'danger', async () => { await backend.call('libRemove', { name: lib.name }); say(t('libs.removed', { name: lib.name })); refresh(); }));
    } else {
      actions.append(version, h('span', { class: 'sp' }), busyBtn(t('libs.install'), 'primary', async () => { await installLib(lib.name, version.value); refresh(); }));
    }
    return card;
  }

  function includeLib(includes) {
    if (!sketch) return;
    const main = `${sketch.name}.ino`;
    const path = editors.active?.endsWith('.ino') ? editors.active : main;
    const have = editors.text(path) ?? '';
    const lines = includes.filter(i => !have.includes(`<${i}>`)).map(i => `#include <${i}>`);
    if (lines.length) { editors.insertTop(path, lines.join('\n')); say(t('libs.included', { lines: lines.join(', '), file: path })); }
  }

  /** Installs a library, asking first about the ones it needs. Returns false if the user gave up. */
  async function installLib(name, version) {
    const deps = (await backend.call('libDeps', { name, version })).filter(d => d.name !== name && d.installed !== d.version);
    let withDeps = true;
    if (deps.length) {
      const list = deps.map(d => `• ${d.name} ${d.version} (${d.installed ? t('deps.updateFrom', { version: d.installed }) : t('deps.new')})`);
      const { button } = await lilos.ui.messageBox({
        title: t('deps.title'),
        message: `${t('deps.text', { name, version, count: deps.length })}\n\n${list.join('\n')}`,
        buttons: [{ value: 'only', label: t('deps.only') }, 'cancel', { value: 'all', label: t('deps.all'), primary: true }],
      });
      if (button !== 'only' && button !== 'all') return false;
      withDeps = button === 'all';
    }
    say(t('libs.installing', { name, version }));
    await backend.call('libInstall', { name, version, deps: withDeps });
    say(t('libs.installedOk', { name, version }), 'ok');
    return true;
  }

  // ---------- Boards and ports ----------
  const portLabel = p => {
    const key = usbKey(p);
    const board = boardOfPort(p);
    return board ? `${board.name} (${key})` : key ? `${GENERIC_USB[key] ?? 'USB'} ${key}` : t('port.serial');
  };

  function drawBoard() {
    const parsed = parseFqbn(fqbn);
    const port = ports.find(p => p.id === portId);
    boardBtn.replaceChildren(h('span', { class: `dot${port ? ' on' : ''}` }), h('b', {}, parsed?.board.name ?? fqbn),
      h('code', {}, port ? (usbKey(port) ?? t('port.serial')) : t('port.none')), h('span', { html: ico('chev', 'ico chev') }));
    boardBtn.title = t('board.choose');
  }

  async function refreshPorts() {
    if (!serialOk.value) return;
    try { ports = await lilos.serial.ports(); } catch { ports = []; }
    if (portId && !ports.some(p => p.id === portId)) portId = null;
    if (!portId) {
      // One port for the chosen board (or a remembered adapter): take it
      const fit = ports.filter(p => boardOfPort(p)?.fqbn === parseFqbn(fqbn)?.board.fqbn || portBoards[usbKey(p)] === fqbn);
      const only = fit.length === 1 ? fit[0] : ports.length === 1 ? ports[0] : null;
      if (only) choosePort(only, { quiet: true });
    }
    drawBoard();
    drawStatus();
  }

  function choosePort(port, { quiet = false } = {}) {
    portId = port.id;
    const sure = boardOfPort(port);
    const remembered = portBoards[usbKey(port)];
    if (sure && parseFqbn(fqbn)?.board.id !== sure.id) setBoard(fqbnOf(sure, sure.default ?? ''));
    else if (!sure && remembered && remembered !== fqbn) setBoard(remembered);
    if (!quiet) say(t('port.chosen', { port: portLabel(port) }));
  }

  function setBoard(next) {
    if (next === fqbn) return;
    fqbn = next;
    lilos.storage.set('board', fqbn).catch(() => {});
    const port = ports.find(p => p.id === portId);
    if (port && !boardOfPort(port) && usbKey(port)) {
      portBoards[usbKey(port)] = fqbn;
      lilos.storage.set('portBoards', portBoards).catch(() => {});
    }
    drawBoard();
    drawStatus();
    startSuggestions();
  }

  /** What the board dialog says of a port: the board it surely is, the one remembered for it, or its adapter. */
  const portNote = p => {
    const key = usbKey(p), sure = boardOfPort(p);
    return sure ? sure.name : portBoards[key] ? t('port.remembered', { board: parseFqbn(portBoards[key])?.board.name ?? '' })
      : GENERIC_USB[key] ? t('port.generic', { chip: GENERIC_USB[key] }) : t('port.unknown');
  };
  /** The fqbn a port brings with it (its board, or the one remembered for its adapter), or null. */
  const fqbnOfPort = p => {
    const sure = boardOfPort(p);
    return sure ? fqbnOf(sure, sure.default ?? '') : portBoards[usbKey(p)] ?? null;
  };

  /**
   * Board and port, in lilOS's message box: one list of boards (with their processor), one of
   * ports. «Add a port…» asks the browser for one, then the box comes back with it chosen; a port
   * chosen without touching the board brings its own board.
   */
  let choosing = false;
  async function boardDialog() {
    if (choosing) return;
    choosing = true;
    try {
      await refreshPorts();
      const now = parseFqbn(fqbn) ?? { board: BOARDS[0], cpu: BOARDS[0].default ?? '' };
      let board = fqbnOf(now.board, now.cpu), port = portId ?? '', added = null;
      const boards = BOARDS.flatMap(b => {
        const cpus = Object.keys(b.cpus).filter(Boolean);
        return cpus.length ? cpus.map(c => ({ value: fqbnOf(b, c), label: `${b.name} · ${t(`cpu.${c}`)}` })) : [{ value: fqbnOf(b, ''), label: b.name }];
      });
      for (;;) {
        const shown = { board, port };
        const { button, values } = await lilos.ui.messageBox({
          title: t('board.title'), width: 460,
          fields: [
            { name: 'board', type: 'select', label: t('board.board'), value: board, options: boards, hint: t('board.only') },
            { name: 'port', type: 'select', label: t('board.port'), value: port,
              options: [{ value: '', label: t('port.noneOption') }, ...ports.map(p => ({ value: p.id, label: `${usbKey(p) ?? t('port.serial')} · ${portNote(p)}` }))],
              hint: !serialOk.value ? t('serial.unsupported') : ports.length ? t('board.where') : t('port.noneYet') },
          ],
          buttons: [...(serialOk.value ? [{ value: 'add', label: t('port.add') }] : []), 'cancel', 'ok'],
          default: 'ok',
          // «Add a port…»: the browser's own list; the box stays open if the user closes it
          validate: async (v, pressed) => {
            if (pressed !== 'add') return true;
            try { added = await lilos.serial.request({ filters: [] }); } catch (err) { return err.message; }
            return added ? true : false;
          },
        });
        if (button === 'add' && added) {
          await refreshPorts();
          port = added.id;
          board = fqbnOfPort(added) ?? values.board;
          added = null;
          continue;
        }
        if (button !== 'ok') return;
        const chosenPort = ports.find(p => p.id === values.port) ?? null;
        board = values.board;
        if (chosenPort && values.port !== shown.port && values.board === shown.board) board = fqbnOfPort(chosenPort) ?? board;
        portId = chosenPort ? chosenPort.id : null;
        if (chosenPort && !boardOfPort(chosenPort) && usbKey(chosenPort)) { portBoards[usbKey(chosenPort)] = board; lilos.storage.set('portBoards', portBoards).catch(() => {}); }
        setBoard(board);
        drawBoard();
        drawStatus();
        return;
      }
    } finally {
      choosing = false;
    }
  }

  // ---------- Suggestions ----------
  let lspFor = null;
  async function startSuggestions() {
    if (!backend || !status?.ready || !sketch) return;
    const key = `${sketch.name}|${fqbn}`;
    if (lspFor === key) return;
    lspFor = key;
    editors.disconnect();
    if (!status.lsp) { editors.rebuild(sketch.name); drawStatus(); return; }
    try {
      await backend.call('lspStart', { fqbn, sketch: { name: sketch.name, files: currentFiles() } });
      await editors.connect(backend.transport(), sketch.name);
    } catch (err) {
      editors.disconnect();
      say(t('lsp.failed', { message: err.message }), 'faint');
    }
    editors.rebuild(sketch.name);
    drawStatus();
  }

  // ---------- Compiling ----------
  async function readLibraries() {
    const files = {};
    try {
      const walk = async (path, rel, depth) => {
        for (const item of await lilos.files.list(path)) {
          const r = rel ? `${rel}/${item.name}` : item.name;
          if (item.type === 'folder' && depth < 5) await walk(`${path}/${item.name}`, r, depth + 1);
          else if (item.type === 'file' && SOURCE.test(item.name) && item.size <= 1 << 20) files[r] = await lilos.files.read(`${path}/${item.name}`);
        }
      };
      await walk(`${ROOT}/libraries`, '', 0);
    } catch { /* no folder of own libraries */ }
    return files;
  }

  function setBusy(on) {
    busy = on;
    verifyBtn.disabled = uploadBtn.disabled = on;
  }

  /** Compiles; returns the result (with hex) or null. */
  async function compile() {
    if (!sketch) { say(t('noSketch'), 'err'); return null; }
    if (!backend || !status?.ready) { say(t('kernel.notReady'), 'err'); return null; }
    await flushSave();
    output.replaceChildren();
    memRow.hidden = true;
    showPanel('output');
    const parsed = parseFqbn(fqbn);
    say(t('compile.start', { sketch: sketch.name, board: parsed?.board.name ?? fqbn }), 'faint');
    const started = Date.now();
    let result;
    try {
      result = await backend.call('compile', { fqbn, sketch: { name: sketch.name, files: currentFiles() }, libraries: await readLibraries() });
    } catch (err) {
      say(err.message, 'err');
      return null;
    }
    // arduino-cli's own lines on the memory used are said below, in the user's language
    const text0 = result.output.split(/\r?\n/).filter(l => !/^(Sketch uses|Global variables use) /.test(l)).join('\n').trimEnd();
    if (text0.trim()) say(text0);
    showDiagnostics(result.diagnostics);
    if (!result.success) {
      say(t('compile.failed'), 'err');
      if (lastDiagnostics.some(d => d.severity === 'error')) showPanel('problems');
      return null;
    }
    const text = result.sizes.find(s => s.name === 'text'), data = result.sizes.find(s => s.name === 'data');
    if (text) say(t('compile.flash', { size: text.size, max: text.max, pct: Math.round((text.size / text.max) * 100) }));
    if (data) say(t('compile.ram', { size: data.size, max: data.max, pct: Math.round((data.size / data.max) * 100), left: data.max - data.size }));
    say(t('compile.done', { seconds: ((Date.now() - started) / 1000).toFixed(1) }), 'ok');
    memRow.hidden = !text;
    memRow.replaceChildren(...[[t('mem.flash'), text], [t('mem.ram'), data]].filter(([, s]) => s && s.max).map(([label, s]) => {
      const pct = Math.round((s.size / s.max) * 100);
      return h('span', { class: `mem${pct > 90 ? ' high' : ''}` }, label, h('span', { class: 'bar' }, h('i', { style: `width:${Math.min(100, pct)}%` })), h('b', {}, `${pct}%`));
    }));
    return result;
  }

  async function verify() {
    if (busy) return;
    setBusy(true);
    try { await compile(); } finally { setBusy(false); }
  }

  function showDiagnostics(list) {
    lastDiagnostics = (list ?? []).filter(d => d.severity !== 'note');
    texts();
    const byPath = {};
    for (const d of lastDiagnostics) if (sketch?.files.has(d.file)) (byPath[d.file] ??= []).push(d);
    editors.mark(byPath);
    probList.replaceChildren(...(lastDiagnostics.length ? lastDiagnostics.map(d => {
      const row = h('button', { class: 'prob', type: 'button', onclick: () => { if (sketch?.files.has(d.file)) editors.reveal(d.file, d.line, d.col); } },
        h('span', { html: ico(d.severity === 'error' ? 'err' : 'warn', `ico ${d.severity === 'error' ? 'e' : 'w'}`) }),
        h('span', { class: 'msg' }, d.message), h('code', {}, `${d.file}:${d.line}:${d.col}`));
      const missing = /^(.+?): No such file or directory$/.exec(d.message);
      if (!missing || !backend) return row;
      const fix = h('div', { class: 'fix' });
      backend.call('provides', { header: missing[1] }).then(libs => {
        if (!libs.length) return;
        const [first, ...others] = libs;
        fix.append(h('div', {}, h('b', {}, first.name), ` ${first.version}`, h('small', {}, t('fix.provides', { author: first.author, header: missing[1] }))),
          h('button', { class: 'btn small primary', type: 'button', onclick: async e => {
            e.currentTarget.disabled = true;
            try { if (await installLib(first.name, first.version)) await verify(); } catch (err) { say(err.message, 'err'); }
          } }, t('fix.install')));
        if (others.length) fix.append(h('small', { class: 'others' }, t('fix.others', { names: others.map(o => o.name).join(', ') })));
      }).catch(() => {});
      return h('div', {}, row, fix);
    }) : [h('p', { class: 'faint pad' }, t('problems.none'))]));
  }

  // ---------- Uploading ----------
  async function doUpload() {
    if (busy) return;
    if (!serialOk.value) { say(t('serial.unsupported'), 'err'); showPanel('output'); return; }
    if (!portId) { boardDialog(); return; }
    const params = uploadOf(fqbn);
    if (!params) { say(t('upload.unknownBoard'), 'err'); return; }
    setBusy(true);
    let link = null;
    const reopen = monitor.open;
    try {
      const result = await compile();
      if (!result?.hex) return;
      const image = parseHex(result.hex, { max: params.flash + 8192 });
      if (monitor.open) { await closeMonitor({ quiet: true }); monView.note(t('monitor.paused')); }
      say(t('upload.start', { port: portLabel(ports.find(p => p.id === portId) ?? {}), speed: params.speed }), 'faint');
      link = new Link(await lilos.serial.open(portId, { baudRate: params.speed }));
      let lastPct = -1;
      const started = Date.now();
      const info = await upload(link, image, params, p => {
        if (p.step === 'sync') drawStatus(t('upload.syncing'));
        if (p.total) {
          const pct = Math.round((p.done / p.total) * 100);
          if (pct !== lastPct) { lastPct = pct; drawStatus(t(`upload.${p.step}`, { pct })); }
        }
      });
      say(t('upload.done', { bytes: info.bytes, seconds: ((Date.now() - started) / 1000).toFixed(1) }), 'ok');
      lilos.ui.notify({ text: t('upload.notify', { board: parseFqbn(fqbn)?.board.name ?? '', sketch: sketch.name, bytes: info.bytes }), level: 'success' }).catch(() => {});
    } catch (err) {
      say(t('upload.failed', { message: err.message }), 'err');
      showPanel('output');
      lilos.ui.notify({ text: t('upload.failed', { message: err.message }), level: 'error' }).catch(() => {});
    } finally {
      if (link) { link.close(); await sleep(150); }
      setBusy(false);
      drawStatus();
      if (reopen) { await openMonitor(); monView.note(t('monitor.resumed')); }
    }
  }

  // ---------- Serial monitor ----------
  async function openMonitor() {
    if (monitor.open) return;
    if (!serialOk.value) { monView.note(t('serial.unsupported')); return; }
    if (!portId) { boardDialog(); return; }
    try {
      const link = new Link(await lilos.serial.open(portId, { baudRate: monitor.baud }));
      link.onData = bytes => monView.data(bytes);
      link.onClose = reason => {
        if (monitor.link !== link) return;
        monitor = { ...monitor, link: null, open: false };
        monView.note(reason ? t('monitor.lost', { reason }) : t('monitor.closed'));
        texts();
      };
      monitor = { ...monitor, link, open: true };
      monView.note(t('monitor.opened', { port: portLabel(ports.find(p => p.id === portId) ?? {}), baud: monitor.baud }));
    } catch (err) {
      monView.note(err.message, 'err');
    }
    texts();
  }

  async function closeMonitor({ quiet = false } = {}) {
    const link = monitor.link;
    monitor = { ...monitor, link: null, open: false };
    if (link) { link.close(); await sleep(150); }
    if (!quiet) monView.note(t('monitor.closed'));
    texts();
  }

  monOpenBtn.onclick = () => (monitor.open ? closeMonitor() : openMonitor());
  baudSel.onchange = async () => {
    monitor.baud = Number(baudSel.value);
    lilos.storage.set('baud', monitor.baud).catch(() => {});
    if (monitor.open) { await closeMonitor({ quiet: true }); await openMonitor(); }
  };
  endingSel.onchange = () => { monitor.ending = endingSel.value; lilos.storage.set('ending', monitor.ending).catch(() => {}); };
  monInput.onkeydown = e => {
    e.stopPropagation();
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const text = monInput.value;
    if (!monitor.link) { monView.note(t('monitor.notOpen')); return; }
    try {
      monitor.link.write(new TextEncoder().encode(text + ENDINGS[monitor.ending]));
      monView.note(`→ ${text}`, 'tx');
      monInput.value = '';
    } catch (err) { monView.note(err.message, 'err'); }
  };
  const toggleChip = (el, key) => {
    const on = el.getAttribute('aria-pressed') !== 'true';
    el.setAttribute('aria-pressed', String(on));
    el.classList.toggle('on', on);
    monView[key] = on;
    if (key === 'follow' && on) monLines.scrollTop = monLines.scrollHeight;
  };
  timesChk.onclick = () => toggleChip(timesChk, 'times');
  followChk.onclick = () => toggleChip(followChk, 'follow');
  monLines.addEventListener('follow', e => { followChk.setAttribute('aria-pressed', String(e.detail)); followChk.classList.toggle('on', e.detail); });

  async function saveMonitor() {
    const stamp = new Date().toISOString().slice(0, 19).replace('T', ' ').replace(/:/g, '.');
    try {
      await ensureRoot();
      // Saved twice in the same second: a second file ('… 2.txt'), never over the first
      const saved = await lilos.files.write(`${sketch?.folder ?? ROOT}/monitor ${stamp}.txt`, monView.text(), { unique: true });
      monView.note(t('monitor.saved', { path: saved.ref }));
    } catch (err) { monView.note(err.message, 'err'); }
  }

  // ---------- Keys ----------
  // Verify, Upload and Save are commands of the manifest (contributes.commands: Ctrl+R, Ctrl+U,
  // Ctrl+S unless the user changes them in Control Panel): lilOS sends their id.
  const COMMANDS = { 'arduino-ide.verify': () => verify(), 'arduino-ide.upload': () => doUpload(), 'arduino-ide.save': () => flushSave() };
  const offs = [lilos.on('command', id => COMMANDS[id]?.())];
  // Not isolated, the app shares lilOS's keyboard: Delete, Backspace and the combos the editor
  // used (Ctrl+Z, Ctrl+A…) must not reach lilOS's own shortcuts too
  box.addEventListener('keydown', e => {
    if (e.key === 'Delete' || e.key === 'Backspace' || ((e.ctrlKey || e.metaKey) && e.defaultPrevented)) e.stopPropagation();
  });

  // ---------- Start ----------
  // A suggestion that comes too late (the server still warming up) is not an error for the user
  const lateAnswer = e => { if (/Request timed out|non-existent request/.test(String(e.reason?.message ?? e.reason ?? ''))) e.preventDefault(); };
  addEventListener('unhandledrejection', lateAnswer);
  offs.push(() => removeEventListener('unhandledrejection', lateAnswer));
  (async () => {
    texts();
    showPanel('output');
    side.hidden = true;
    try { serialOk.value = await lilos.serial.supported(); } catch { serialOk.value = false; }
    const [savedBoard, savedPorts, savedBaud, savedEnding, last] = await Promise.all(['board', 'portBoards', 'baud', 'ending', 'last'].map(k => lilos.storage.get(k).catch(() => null)));
    if (typeof savedBoard === 'string' && parseFqbn(savedBoard)) fqbn = savedBoard;
    if (savedPorts && typeof savedPorts === 'object') portBoards = Object.fromEntries(Object.entries(savedPorts).filter(([k, v]) => /^[0-9a-f]{4}:[0-9a-f]{4}$/.test(k) && parseFqbn(v)));
    if (BAUDS.includes(savedBaud)) monitor.baud = savedBaud;
    if (Object.hasOwn(ENDINGS, savedEnding ?? '')) monitor.ending = savedEnding;
    baudSel.value = String(monitor.baud);
    texts();
    if (!serialOk.value) say(t('serial.unsupported'), 'faint');
    offs.push(lilos.on('serial', () => refreshPorts()));
    offs.push(lilos.on('locale', () => { texts(); drawTabs(); }));
    await refreshPorts();
    await connect();
    if (args?.file) await openFile(args.file);
    else if (typeof last === 'string' && NAME.test(last)) await openSketch(last).catch(() => {});
    if (!sketch) showSide('sketchbook');
  })().catch(err => say(err.message, 'err'));

  return () => {
    disposed = true;
    save().catch(() => {});
    offs.forEach(off => { try { off?.(); } catch { /* gone */ } });
    monitor.link?.close();
    backend?.close();
    editors.closeAll();
  };
}
