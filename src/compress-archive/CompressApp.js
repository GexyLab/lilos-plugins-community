import { h } from '../shared/sandbox/dom.js';
import { fileFromArgs, frame } from '../shared/sandbox/app.js';
import { STYLE, keepKeys } from './ui.js';
import { explain, skippedText, MAX_FILE } from './text.js';

/**
 * Compress Archive: makes and opens archives (zip, 7z, tar, tar.gz, tar.bz2, tar.xz, iso, gz, bz2,
 * xz; rar only opened). An installable app (sdk 2), not part of lilOS. The windows are here; the
 * work is done by the entry point `work` (work.js, with the archive engine), called with
 * lilos.app.call:
 *   main        an archive opened with the app: what is inside (a tree), Extract here, Extract the
 *               selected items, the password of an encrypted zip
 *   compressAs  Compress → Compress as…: format, name, level, password
 */
const SHOWN = 1000;   // rows listed in the window
const KINDS = ['zip', '7z', 'tar', 'tar.gz', 'tar.bz2', 'tar.xz', 'iso'];
const SINGLE = ['gz', 'bz2', 'xz'];
const LEVELS = ['fast', 'normal', 'max'];
const NO_LEVEL = ['tar', 'iso'];
const SETTINGS = 'compressAs';

/** A call to `work`; its errors come back as { error, detail }. */
async function call(lilos, data) {
  const result = await lilos.app.call('work', data);
  if (result?.error) throw Object.assign(new Error(result.error), { error: result.error, detail: result.detail });
  return result;
}

/** Entries of an archive as a tree: { key: 'a/b', name, folder, size, mtime, locked, children }. */
function treeOf(entries) {
  const root = { key: '', children: new Map() };
  for (const e of entries) {
    let node = root;
    e.path.forEach((name, i) => {
      const id = name.toLowerCase();
      if (!node.children.has(id)) {
        node.children.set(id, { key: e.path.slice(0, i + 1).join('/'), name, folder: true, size: 0, mtime: -1, locked: false, children: new Map() });
      }
      node = node.children.get(id);
    });
    Object.assign(node, { folder: e.folder, size: e.size, mtime: e.mtime, locked: e.locked });
  }
  const sort = node => {
    node.children = [...node.children.values()].sort((a, b) => (b.folder - a.folder) || a.name.localeCompare(b.name));
    node.children.forEach(sort);
    return node;
  };
  return sort(root);
}

// ---------- Main: an archive opened with the app ----------

export async function main({ lilos, root, args }) {
  const t = (k, p) => lilos.locale.i18n.t(k, p);
  const i18n = lilos.locale.i18n;
  const size = n => lilos.locale.formatBytes(n);
  const { box, off } = frame(lilos, root, { style: STYLE, className: 'ca' }, () => draw());
  keepKeys(box);

  let file = null, content = null, tree = null, error = '', done = null, working = false;
  let password = '', asking = false, askError = '', extractAfter = false;
  let pending = null;            // what Extract was asked for before the password (null: everything)
  let query = '';
  const open = new Set();       // keys of the folders shown open
  const selected = new Set();   // keys chosen (a folder brings what it holds)

  const take = a => {
    file = fileFromArgs(a);
    content = tree = done = null;
    error = askError = '';
    password = '';
    asking = false;
    pending = null;
    extractAfter = a?.extract === true;
    open.clear();
    selected.clear();
  };

  const inSelection = key => [...selected].some(s => key === s || key.startsWith(`${s}/`));
  const underSelected = key => [...selected].some(s => key.startsWith(`${s}/`));

  /** The rows to show: the open part of the tree, or what matches the search. */
  function rows() {
    const out = [];
    if (query) {
      const q = query.toLowerCase();
      const walk = node => node.children.forEach(n => {
        if (n.name.toLowerCase().includes(q)) out.push({ node: n, depth: 0, path: true });
        walk(n);
      });
      walk(tree);
      return out;
    }
    const walk = (node, depth) => node.children.forEach(n => {
      out.push({ node: n, depth });
      if (n.folder && open.has(n.key)) walk(n, depth + 1);
    });
    walk(tree, 0);
    return out;
  }

  function row({ node, depth, path }) {
    const checked = inSelection(node.key);
    const label = path ? node.key : node.name;
    return h('li', { role: 'treeitem', class: `node${checked ? ' sel' : ''}`, 'aria-level': String(depth + 1), 'aria-selected': checked ? 'true' : 'false', ...(node.folder && !path && { 'aria-expanded': open.has(node.key) ? 'true' : 'false' }) },
      h('input', {
        type: 'checkbox', checked, disabled: underSelected(node.key) || working, 'aria-label': t('main.choose', { name: label }),
        onchange: e => { if (e.target.checked) selected.add(node.key); else selected.delete(node.key); draw(); },
      }),
      h('span', { class: 'name', style: `padding-left:${depth * 16}px` },
        node.folder && !path
          ? h('button', { type: 'button', class: 'twisty', 'aria-label': t(open.has(node.key) ? 'main.close' : 'main.open', { name: node.name }), onclick: () => { if (open.has(node.key)) open.delete(node.key); else open.add(node.key); draw(); } }, open.has(node.key) ? '▾' : '▸')
          : h('span', { class: 'twisty', 'aria-hidden': 'true' }),
        h('span', { class: node.folder ? 'ico folder' : 'ico', 'aria-hidden': 'true' }),
        h('span', { class: 'label', title: node.key }, label),
        node.locked && h('span', { class: 'lock', title: t('main.locked') }, '🔒')),
      h('span', { class: 'size' }, node.folder ? '' : size(node.size)),
      h('span', { class: 'date' }, node.mtime > 0 ? i18n.date(node.mtime, { dateStyle: 'short' }) : ''));
  }

  // No <form>: the sandbox has no allow-forms, and a submit never comes
  function askBox() {
    const go = () => {
      if (!input.value) return input.focus();
      password = input.value;
      asking = false;
      askError = '';
      // The list was read: the password is for the extraction asked; otherwise the list needs it
      if (content) extract(pending);
      else load();
    };
    const cancel = () => { asking = false; pending = null; draw(); };
    const input = h('input', {
      type: 'password', class: 'field', autocomplete: 'off', 'aria-label': t('ask.label'), value: password,
      onkeydown: e => { if (e.key === 'Enter') { e.preventDefault(); go(); } else if (e.key === 'Escape') { e.preventDefault(); cancel(); } },
    });
    const dialog = h('div', { class: 'dialog', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'ca-ask' },
      h('h2', { id: 'ca-ask' }, t('ask.title')),
      h('p', {}, t('ask.text', { name: content?.name ?? '' })),
      askError && h('p', { class: 'error', role: 'alert' }, askError),
      input,
      h('div', { class: 'row' },
        h('button', { type: 'button', onclick: cancel }, t('common.cancel')),
        h('button', { type: 'button', class: 'primary', onclick: go }, t('ask.open'))));
    queueMicrotask(() => input.focus());
    return h('div', { class: 'scrim' }, dialog);
  }

  const draw = () => {
    if (!file) {
      lilos.window.setTitle('Compress Archive');
      return box.replaceChildren(h('h1', {}, 'Compress Archive'), h('p', {}, t('main.intro')), h('p', { class: 'hint' }, t('main.limits', { limit: size(MAX_FILE) })));
    }
    lilos.window.setTitle(content?.name ?? 'Compress Archive');
    if (error && !content) return box.replaceChildren(h('div', { class: 'error', role: 'alert' }, error));
    if (!content) return box.replaceChildren(h('p', { class: 'hint', 'aria-busy': 'true' }, t('main.reading')), asking && askBox());
    const files = content.entries.filter(e => !e.folder);
    const total = files.reduce((s, e) => s + e.size, 0);
    const list = rows();
    const many = selected.size;
    const extractAll = h('button', { type: 'button', class: 'primary', disabled: working || !content.entries.length, 'aria-busy': working ? 'true' : 'false', onclick: () => extract(null) }, t(working ? 'main.extracting' : 'main.extract'));
    const extractSome = many > 0 && h('button', { type: 'button', disabled: working, onclick: () => extract([...selected]) }, t('main.extractSome', { n: many }));
    box.replaceChildren(...[
      h('header', {},
        h('h1', {}, content.name, content.kind && h('span', { class: 'badge' }, content.kind), content.locked && h('span', { class: 'badge lock' }, t('main.encrypted'))),
        h('p', {}, content.raw
          ? t('main.single', { size: size(content.size) })
          : t('main.summary', { n: files.length, size: size(total), packed: size(content.size) }))),
      !content.raw && content.entries.length > 0 && h('input', {
        type: 'search', class: 'field', placeholder: t('main.search'), 'aria-label': t('main.search'), value: query,
        oninput: e => { query = e.target.value; const at = e.target.selectionStart; draw(); const s = box.querySelector('input[type=search]'); s?.focus(); s?.setSelectionRange(at, at); },
      }),
      content.entries.length
        ? h('div', { class: 'table' },
          h('div', { class: 'head', 'aria-hidden': 'true' }, h('span'), h('span', {}, t('main.name')), h('span', { class: 'size' }, t('main.size')), h('span', { class: 'date' }, t('main.modified'))),
          h('ul', { class: 'tree', role: 'tree', 'aria-label': t('main.content'), 'aria-multiselectable': 'true' },
            ...list.slice(0, SHOWN).map(row),
            list.length > SHOWN && h('li', { class: 'more' }, t('main.more', { n: list.length - SHOWN })),
            !list.length && h('li', { class: 'more' }, t('main.noMatch'))))
        : h('div', { class: 'empty' }, t('main.empty')),
      content.skipped.length > 0 && h('p', { class: 'warn' }, skippedText(t, content.skipped)),
      error && h('p', { class: 'error', role: 'alert' }, error),
      done && h('p', { class: 'ok', role: 'status' }, done),
      h('div', { class: 'row' }, h('button', { type: 'button', onclick: () => lilos.window.close() }, t('common.close')), extractSome, extractAll),
      asking && askBox(),
    ].filter(Boolean));
  };

  async function extract(only) {
    if (working) return;
    if (content.locked && !password) {
      pending = only;
      asking = true;
      return draw();
    }
    working = true;
    done = null;
    error = '';
    draw();
    try {
      const result = await call(lilos, { op: 'extract', file, password, only });
      done = [t('done.unpack', { name: result.name, n: result.count }), skippedText(t, result.skipped)].filter(Boolean).join(' ');
      selected.clear();
    } catch (err) {
      if (err.error === 'password') {
        askError = password ? t('ask.wrong') : '';
        password = '';
        pending = only;
        asking = true;
      } else {
        error = explain(lilos, err);
      }
    }
    working = false;
    draw();
  }

  async function load() {
    draw();
    if (!file) return;
    try {
      content = await call(lilos, { op: 'list', file, password });
      tree = treeOf(content.entries);
      // A single folder at the top: shown open
      if (tree.children.length === 1 && tree.children[0].folder) open.add(tree.children[0].key);
      // Opened by Extract here on an encrypted archive: the password, then the extraction
      if (extractAfter) {
        extractAfter = false;
        if (content.locked && !password) asking = true;
        else { draw(); return extract(null); }
      }
    } catch (err) {
      if (err.error === 'password') {
        askError = password ? t('ask.wrong') : '';
        password = '';
        asking = true;
      } else {
        error = explain(lilos, err);
      }
    }
    draw();
  }

  take(args);
  // Asked again (another archive) while open
  const offLaunch = lilos.on('launch', a => { take(a); load(); });
  await load();
  return () => { offLaunch(); off(); };
}

// ---------- Compress as…: format, name, level, password ----------

export async function compressAs({ lilos, root, args }) {
  const t = (k, p) => lilos.locale.i18n.t(k, p);
  const size = n => lilos.locale.formatBytes(n);
  // No <form>: the sandbox has no allow-forms, and a submit never comes
  const { box, off } = frame(lilos, root, { style: STYLE, className: 'ca form' }, () => draw());
  keepKeys(box);

  let ids = [], items = [], format = 'zip', level = 'normal', name = '', named = false, working = false, error = '';
  let pass1 = '', pass2 = '';   // kept while the window is drawn again
  try {
    const saved = await lilos.storage.get(SETTINGS);
    if ([...KINDS, ...SINGLE].includes(saved?.format)) format = saved.format;
    if (LEVELS.includes(saved?.level)) level = saved.level;
  } catch { /* the defaults */ }

  const single = () => items.length === 1 && items[0].type === 'file';
  const suggested = () => {
    if (items.length !== 1) return t('archive.name');
    const [item] = items;
    if (item.type === 'folder' || SINGLE.includes(format)) return item.name;
    const dot = item.name.lastIndexOf('.');
    return dot > 0 ? item.name.slice(0, dot) : item.name;
  };

  /** Buttons of which one is chosen; their texts are `<words>.<value>` of locales.json. */
  const seg = (words, values, current, label, choose, disabled = () => false) => h('div', { class: 'seg', role: 'radiogroup', 'aria-label': label },
    ...values.map(v => h('button', {
      type: 'button', role: 'radio', 'aria-checked': v === current ? 'true' : 'false', disabled: disabled(v) || working,
      onclick: () => choose(v),
    }, t(`${words}.${v}`))));

  const draw = () => {
    lilos.window.setTitle(t('as.title'));
    if (!named) name = suggested();
    if (SINGLE.includes(format) && !single()) format = 'zip';
    const pass = format === 'zip';
    const enter = e => { if (e.key === 'Enter') { e.preventDefault(); go(); } };
    const nameInput = h('input', { class: 'field', id: 'ca-name', value: name, disabled: working, onkeydown: enter, oninput: e => { name = e.target.value; named = true; } });
    const p1 = h('input', { type: 'password', class: 'field', id: 'ca-pass', autocomplete: 'new-password', value: pass1, disabled: !pass || working, onkeydown: enter, oninput: e => { pass1 = e.target.value; } });
    const p2 = h('input', { type: 'password', class: 'field', id: 'ca-pass2', autocomplete: 'new-password', value: pass2, disabled: !pass || working, onkeydown: enter, oninput: e => { pass2 = e.target.value; }, placeholder: t('as.repeat'), 'aria-label': t('as.repeat') });
    box.replaceChildren(...[
      h('p', { class: 'hint' }, items.length === 1 ? t('as.one', { name: items[0]?.name ?? '' }) : t('as.many', { n: items.length })),
      h('div', { class: 'fieldset' },
        h('span', { class: 'label', id: 'ca-format' }, t('as.format')),
        seg('format', KINDS, format, t('as.format'), v => { format = v; draw(); }),
        seg('format', SINGLE, format, t('as.single'), v => { format = v; draw(); }, () => !single()),
        h('span', { class: 'hint' }, t('as.singleHint'))),
      h('label', { class: 'fieldset', for: 'ca-name' },
        h('span', { class: 'label' }, t('as.name')),
        h('span', { class: 'suffixed' }, nameInput, h('span', { class: 'suffix' }, `.${format}`))),
      h('div', { class: 'fieldset' },
        h('span', { class: 'label' }, t('as.level')),
        seg('level', LEVELS, level, t('as.level'), v => { level = v; draw(); }, () => NO_LEVEL.includes(format))),
      h('div', { class: `fieldset${pass ? '' : ' off'}` },
        h('label', { class: 'label', for: 'ca-pass' }, t('as.password')),
        p1, p2,
        h('span', { class: 'hint' }, t(pass ? 'as.passwordHint' : 'as.passwordZip'))),
      h('p', { class: 'warn' }, t('as.limit', { limit: size(MAX_FILE) })),
      error && h('p', { class: 'error', role: 'alert' }, error),
      h('div', { class: 'row' },
        h('button', { type: 'button', disabled: working, onclick: () => lilos.window.close() }, t('common.cancel')),
        h('button', { type: 'button', class: 'primary', disabled: working || !items.length, 'aria-busy': working ? 'true' : 'false', onclick: () => go() }, t(working ? 'as.working' : 'as.go'))),
    ].filter(Boolean));
  };

  async function go() {
    if (working || !items.length) return;
    const password = format === 'zip' ? pass1 : '';
    if (password !== (format === 'zip' ? pass2 : '')) { error = t('as.mismatch'); return draw(); }
    working = true;
    error = '';
    draw();
    try {
      await Promise.resolve().then(() => lilos.storage.set(SETTINGS, { format, level })).catch(() => {});
      await call(lilos, { op: 'compress', files: ids, format, level, password, name: name.trim() });
      lilos.window.close();
      return;
    } catch (err) {
      error = explain(lilos, err);
    }
    working = false;
    draw();
  }

  const take = async a => {
    ids = Array.isArray(a?.files) ? a.files.filter(f => typeof f === 'string') : [];
    items = (await Promise.all(ids.map(id => lilos.files.info(id).catch(() => null)))).filter(Boolean);
    named = false;
    error = items.length ? '' : t('error.nothing');
    draw();
  };
  const offLaunch = lilos.on('launch', a => take(a));
  await take(args);
  return () => { offLaunch(); off(); };
}
