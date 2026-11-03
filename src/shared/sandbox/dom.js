/**
 * DOM helpers for isolated apps (Zip, FileCrypt, Calculator): they run in a sandbox or in a
 * Shadow DOM and have no lilOS SDK, only `lilos`. Nothing here imports the SDK.
 */

/**
 * An element: h('button', { class: 'primary', onclick: fn, disabled: true }, 'Testo', childEl).
 * Texts always go in as text, never as HTML (names of files and archives are untrusted).
 * null/false attributes and children are skipped, arrays of children flattened; a non-string
 * value of a property the element has (disabled, checked, value…) is set as that property.
 */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k in el && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  el.append(...children.flat(Infinity).filter(c => c != null && c !== false).map(c => (c instanceof Node ? c : document.createTextNode(String(c)))));
  return el;
}

/**
 * The style every isolated app's window starts from, for the class `prefix` of its box
 * (<div class="zp">): the box, h1, p, .hint, .row of buttons, buttons (.primary, disabled, focus),
 * inputs and selects, .error, .warn, lists (ul > li, li .name), .empty, [aria-busy]. lilOS's
 * colors come as CSS variables (--text, --dim, --accent…). The app adds its own rules after it.
 *   gap        between the parts of the box (px)
 *   overflow   of the box: 'hidden' when a part scrolls by itself, 'auto' when the box does
 */
export function baseStyle(prefix, { gap = 12, overflow = 'hidden' } = {}) {
  const p = `.${prefix}`;
  return `
  :host, body { margin: 0; }
  ${p} { box-sizing: border-box; height: 100%; overflow: ${overflow}; padding: 18px 20px; display: flex; flex-direction: column; gap: ${gap}px; color: var(--text); font: 13px/1.45 var(--font, system-ui); }
  ${p} * { box-sizing: border-box; }
  ${p} h1 { font-size: 15px; font-weight: 600; margin: 0; overflow-wrap: anywhere; }
  ${p} p { margin: 0; color: var(--dim); }
  ${p} .hint { font-size: 12px; color: var(--dim); }
  ${p} .row { display: flex; gap: 8px; align-items: center; justify-content: flex-end; flex-wrap: wrap; }
  ${p} button { font: inherit; padding: 6px 14px; border-radius: var(--radius-sm, 6px); border: 1px solid var(--border); background: var(--surface); color: var(--text); cursor: pointer; }
  ${p} button:hover:not(:disabled) { background: var(--hover); }
  ${p} button.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
  ${p} button.primary:hover:not(:disabled) { filter: brightness(1.08); background: var(--accent); }
  ${p} button:disabled { opacity: .55; cursor: default; }
  ${p} input, ${p} select { font: inherit; color: var(--text); background: var(--field-bg, var(--surface)); border: 1px solid var(--border); border-radius: var(--radius-sm, 6px); padding: 7px 9px; }
  ${p} button:focus-visible, ${p} input:focus-visible, ${p} select:focus-visible, ${p} summary:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
  ${p} [aria-busy="true"] { cursor: progress; }
  ${p} .error { color: var(--danger, #d64545); }
  ${p} .warn { padding: 8px 10px; border-radius: var(--radius-sm, 6px); background: color-mix(in srgb, #e0a030 14%, transparent); color: var(--text); }
  ${p} ul { list-style: none; margin: 0; padding: 0; border: 1px solid var(--border); border-radius: var(--radius-sm, 6px); }
  ${p} li { display: flex; align-items: center; gap: 10px; padding: 6px 10px; }
  ${p} li + li { border-top: 1px solid var(--border); }
  ${p} li .name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  ${p} .empty { padding: 12px 10px; color: var(--dim); }
`;
}
