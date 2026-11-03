import { baseStyle } from '../shared/sandbox/dom.js';

/**
 * What the windows of Compress Archive add to the shared sandbox helpers (../shared/sandbox):
 * the keys kept for the window and the style of the tree, the format buttons and the dialog.
 */
const KEYS = new Set(['Enter', ' ', 'Escape', 'Delete', 'Backspace', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown', 'Tab']);

/**
 * Keeps the keys typed in the window for the window: outside the sandbox lilOS's own shortcuts
 * would take Delete, Esc… (the selected desk items). Fields keep every key without Ctrl or Alt.
 */
export function keepKeys(el) {
  el.addEventListener('keydown', e => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.composedPath()[0]?.matches?.('input, textarea') || KEYS.has(e.key)) e.stopPropagation();
  });
}

export const STYLE = `${baseStyle('ca', { gap: 10 })}
  .ca { position: relative; }
  .ca.form { overflow: auto; gap: 14px; }
  .ca h1 { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
  .ca h2 { font-size: 14px; font-weight: 600; margin: 0; }
  .ca header { display: grid; gap: 3px; }
  .ca .badge { font: 600 11px/1 ui-monospace, Consolas, monospace; padding: 3px 6px; border-radius: 3px; background: color-mix(in srgb, #b07a2a 18%, transparent); color: var(--text); }
  .ca .badge.lock { background: color-mix(in srgb, var(--danger, #d64545) 16%, transparent); }
  .ca .field { min-width: 0; width: 100%; }
  .ca .field:disabled { opacity: .55; }
  .ca .table { flex: 1; min-height: 80px; display: flex; flex-direction: column; border: 1px solid var(--border); border-radius: var(--radius-sm, 6px); overflow: hidden; }
  .ca .head, .ca .tree .node { display: grid; grid-template-columns: 22px minmax(0, 1fr) 84px 92px; align-items: center; gap: 6px; padding: 0 8px; }
  .ca .head { height: 26px; font-size: 11.5px; font-weight: 600; color: var(--dim); background: var(--side, var(--chrome)); border-bottom: 1px solid var(--border); }
  .ca .tree { flex: 1; overflow: auto; border: 0; border-radius: 0; }
  .ca .tree li + li { border-top: 0; }
  .ca .tree .node { min-height: 26px; }
  .ca .tree .node:nth-child(even) { background: color-mix(in srgb, var(--text) 3%, transparent); }
  .ca .tree .node.sel { background: color-mix(in srgb, var(--accent) 14%, transparent); }
  .ca .tree input[type=checkbox] { margin: 0; padding: 0; accent-color: var(--accent); }
  .ca .tree .name { display: flex; align-items: center; gap: 4px; min-width: 0; }
  .ca .label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ca .twisty { width: 18px; height: 18px; flex: none; padding: 0; border: 0; background: none; color: var(--dim); font-size: 11px; line-height: 18px; text-align: center; cursor: pointer; border-radius: 3px; }
  .ca button.twisty:hover { background: var(--hover); }
  .ca .ico { width: 14px; height: 14px; flex: none; border-radius: 2px; background: color-mix(in srgb, var(--text) 30%, transparent); }
  .ca .ico.folder { background: #e0a63b; }
  .ca .lock { font-size: 11px; }
  .ca .size, .ca .date { text-align: right; color: var(--dim); font-size: 12px; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .ca .tree .more { display: block; padding: 8px 10px; color: var(--dim); font-style: italic; }
  .ca .empty { border: 1px solid var(--border); border-radius: var(--radius-sm, 6px); }
  .ca .warn { font-size: 12px; }
  .ca .ok { color: var(--text); }
  .ca .fieldset { display: grid; gap: 6px; }
  .ca .fieldset.off { opacity: .6; }
  .ca .fieldset > .label { font-size: 12px; font-weight: 600; color: var(--dim); }
  .ca .seg { display: flex; flex-wrap: wrap; border: 1px solid var(--border); border-radius: var(--radius-sm, 6px); overflow: hidden; width: fit-content; max-width: 100%; }
  .ca .seg button { border: 0; border-right: 1px solid var(--border); border-radius: 0; padding: 5px 11px; font-weight: 600; font-size: 12px; color: var(--dim); }
  .ca .seg button:last-child { border-right: 0; }
  .ca .seg button[aria-checked="true"] { background: color-mix(in srgb, var(--accent) 16%, transparent); color: var(--accent); }
  .ca .suffixed { display: flex; align-items: center; gap: 6px; }
  .ca .suffix { color: var(--dim); font: 12px ui-monospace, Consolas, monospace; white-space: nowrap; }
  .ca .scrim { position: absolute; inset: 0; background: color-mix(in srgb, #000 30%, transparent); display: grid; place-items: center; padding: 16px; }
  .ca .dialog { width: min(340px, 100%); background: var(--surface); border-radius: 8px; box-shadow: 0 16px 40px rgba(0,0,0,.35); padding: 16px; display: grid; gap: 10px; }
`;
