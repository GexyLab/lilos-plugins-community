/** The window's styles: lilOS's theme tokens (--surface, --text, --accent…) with Arduino's teal. */
export const STYLE = `
  :host { display: block; height: 100%; }
  html, body { height: 100%; margin: 0; }
  .ard { --teal: #0f7d74; --teal-soft: color-mix(in srgb, #0f7d74 14%, transparent); --mono: "JetBrains Mono", ui-monospace, Consolas, monospace;
    position: relative; box-sizing: border-box; height: 100%; display: flex; flex-direction: column; color: var(--text); background: var(--surface);
    font: 12.5px/1.4 var(--font, system-ui); outline: none; }
  .ard *, .ard *::before, .ard *::after { box-sizing: border-box; }
  .ard [hidden] { display: none !important; }
  .ard button { font: inherit; color: inherit; background: none; border: 0; cursor: pointer; }
  .ard button:disabled { cursor: default; opacity: .55; }
  .ico { width: 15px; height: 15px; flex: none; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; display: block; }
  .sp { flex: 1; }
  .faint { color: var(--faint); }
  .pad { padding: 8px 10px; }
  .error { color: var(--danger, #e5484d); }

  .tools { height: 44px; flex: none; display: flex; align-items: center; gap: 6px; padding: 0 10px; border-bottom: 1px solid var(--border); }
  .rbtn { width: 30px; height: 30px; border-radius: 50% !important; display: grid; place-items: center; background: var(--teal) !important; color: #fff !important; position: relative; }
  .rbtn .ico { stroke-width: 2.3; }
  .rbtn:disabled::after { content: ""; position: absolute; inset: -4px; border-radius: 50%; border: 2px solid var(--teal-soft); border-top-color: var(--teal); animation: spin .9s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .tsep { width: 1px; height: 22px; background: var(--border); margin: 0 4px; }
  .boardpick { height: 30px; display: flex; align-items: center; gap: 8px; padding: 0 8px 0 10px !important; border: 1px solid var(--border) !important; border-radius: var(--radius-sm, 5px); min-width: 250px; white-space: nowrap; }
  .boardpick:hover { background: var(--hover) !important; }
  .boardpick code { font-family: var(--mono); font-size: 11px; color: var(--dim); }
  .boardpick .chev { margin-left: auto; width: 12px; height: 12px; color: var(--dim); }
  .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--faint); flex: none; display: inline-block; }
  .dot.on { background: #30a46c; }
  .iconbtn { width: 26px; height: 26px; display: grid; place-items: center; border-radius: var(--radius-sm, 5px); color: var(--dim) !important; flex: none; }
  .iconbtn:hover { background: var(--hover) !important; color: var(--text) !important; }
  .iconbtn.big { width: 30px; height: 30px; }

  .body { flex: 1; display: flex; min-height: 0; }
  .act { width: 42px; flex: none; background: var(--side); border-right: 1px solid var(--border); display: flex; flex-direction: column; align-items: center; padding: 6px 0; gap: 4px; }
  .act button { width: 32px; height: 32px; border-radius: 6px; display: grid; place-items: center; color: var(--dim) !important; }
  .act button .ico { width: 17px; height: 17px; }
  .act button:hover { background: var(--hover) !important; }
  .act button[aria-current] { background: var(--teal-soft) !important; color: var(--teal) !important; }
  .side { width: 270px; flex: none; border-right: 1px solid var(--border); background: var(--side); display: flex; flex-direction: column; min-height: 0; }
  .side h6 { margin: 0; font-size: 10.5px; font-weight: 600; color: var(--faint); text-transform: uppercase; letter-spacing: .05em; padding: 10px 10px 4px; display: flex; align-items: center; }
  .side h6 span { flex: 1; }
  .list { flex: 1; overflow: auto; padding: 0 6px 6px; }
  .item { width: 100%; height: 28px; display: flex; align-items: center; gap: 8px; padding: 0 6px !important; border-radius: var(--radius-sm, 5px); text-align: left; }
  .item:hover { background: var(--hover) !important; }
  .item.cur { background: var(--teal-soft) !important; color: var(--teal); font-weight: 600; }
  .item .ico { color: var(--dim); }
  .item.i1 { padding-left: 22px !important; }
  .item .nm { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .group { font-size: 11px; font-weight: 600; color: var(--dim); padding: 10px 6px 4px; }
  .sub { font-size: 11.5px; padding: 6px 6px 2px; color: var(--text); font-weight: 600; }
  .foot { margin: 0; padding: 8px 10px; font-size: 11px; color: var(--faint); border-top: 1px solid var(--border); }
  .search { padding: 6px 8px 8px; display: grid; gap: 6px; border-bottom: 1px solid var(--border); }
  .libs { flex: 1; overflow: auto; padding: 8px; display: grid; gap: 8px; align-content: start; }
  .lib { border: 1px solid var(--border); border-radius: 7px; background: var(--surface); padding: 8px 10px; display: grid; gap: 3px; }
  .lib .t { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
  .lib .t small { color: var(--dim); font-size: 11px; }
  .lib .d { font-size: 11.5px; color: var(--dim); line-height: 1.35; }
  .lib .a { display: flex; gap: 6px; align-items: center; margin-top: 4px; }
  .pill { font-size: 10px; font-weight: 700; padding: 1px 5px; border-radius: 3px; background: color-mix(in srgb, #30a46c 16%, transparent); color: #1d6f57; white-space: nowrap; }
  .pill.up { background: var(--accent-soft); color: var(--accent); }
  .pill.gray { background: var(--hover); color: var(--dim); margin-left: auto; }

  .field { height: 28px; border: 1px solid var(--border); border-radius: var(--radius-sm, 5px); padding: 0 8px; background: var(--field-bg, var(--surface)); color: var(--text); font: inherit; min-width: 0; }
  .field:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent-soft); }
  .field.small { height: 24px; font-size: 11.5px; }
  .field.grow { flex: 1; }
  .btn { height: 28px; padding: 0 12px !important; border-radius: var(--radius-sm, 5px); border: 1px solid var(--border) !important; background: var(--surface) !important; display: inline-flex; align-items: center; gap: 6px; font-weight: 500; white-space: nowrap; }
  .btn:hover:not(:disabled) { background: var(--hover) !important; }
  .btn.primary { background: var(--teal) !important; border-color: var(--teal) !important; color: #fff !important; }
  .btn.danger { color: var(--danger, #e5484d) !important; }
  .btn.small { height: 24px; padding: 0 9px !important; font-size: 11.5px; }
  .btn[aria-busy="true"]::after { content: ""; width: 10px; height: 10px; border-radius: 50%; border: 2px solid currentColor; border-top-color: transparent; animation: spin .8s linear infinite; }
  .btn .ico { width: 13px; height: 13px; }
  .row { display: flex; gap: 8px; align-items: center; }
  .row.end { justify-content: flex-end; }
  .left { margin-right: auto; }

  .center { flex: 1; display: flex; flex-direction: column; min-width: 0; }
  .tabs { height: 31px; flex: none; display: flex; align-items: flex-end; gap: 2px; padding: 0 6px; background: var(--chrome); border-bottom: 1px solid var(--border); overflow-x: auto; }
  .tab { height: 26px; display: flex; align-items: center; gap: 6px; padding: 0 10px; border-radius: 6px 6px 0 0; color: var(--dim); border: 1px solid transparent; border-bottom: 0; font-family: var(--mono); font-size: 11.5px; white-space: nowrap; cursor: pointer; }
  .tab[aria-selected="true"] { background: var(--surface); color: var(--text); border-color: var(--border); margin-bottom: -1px; height: 27px; }
  .tab .dot { background: var(--dim); }
  .tabs .iconbtn { margin-bottom: 2px; }
  .editors { flex: 1; min-height: 0; position: relative; }
  .ed-view { position: absolute; inset: 0; }
  .empty { position: absolute; inset: 0; display: grid; place-content: center; justify-items: center; gap: 10px; color: var(--dim); text-align: center; padding: 20px; }

  .panel { height: 220px; flex: none; border-top: 1px solid var(--border); display: flex; flex-direction: column; }
  .ptabs { height: 30px; flex: none; display: flex; align-items: center; gap: 2px; padding: 0 6px; border-bottom: 1px solid var(--border); }
  .ptab { height: 30px; display: flex; align-items: center; gap: 6px; padding: 0 10px !important; color: var(--dim) !important; font-weight: 500; border-bottom: 2px solid transparent !important; }
  .ptab[aria-selected="true"] { color: var(--text) !important; border-bottom-color: var(--teal) !important; font-weight: 600; }
  .cnt { font-size: 10px; font-weight: 700; background: color-mix(in srgb, var(--danger, #e5484d) 14%, transparent); color: var(--danger, #e5484d); border-radius: 7px; padding: 0 5px; }
  .pbody { flex: 1; min-height: 0; display: flex; }
  .pane { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .out { flex: 1; min-height: 0; margin: 0; overflow: auto; font: 11.5px/1.6 var(--mono); padding: 6px 12px; white-space: pre-wrap; word-break: break-word; }
  .out .ok { color: #30a46c; } .out .err { color: var(--danger, #e5484d); } .out .faint { color: var(--faint); }
  .memrow { display: flex; gap: 22px; padding: 6px 12px; border-top: 1px solid var(--border); font-size: 11px; color: var(--dim); }
  .mem { display: flex; align-items: center; gap: 8px; }
  .mem b { color: var(--text); }
  .bar { display: block; width: 120px; height: 6px; border-radius: 3px; background: var(--hover); overflow: hidden; }
  .bar i { display: block; height: 100%; background: var(--teal); }
  .mem.high .bar i { background: var(--danger, #e5484d); }
  .montools { display: flex; gap: 6px; align-items: center; padding: 6px 8px; border-bottom: 1px solid var(--border); }
  .montools .field { height: 26px; }
  .chip { height: 26px; padding: 0 8px !important; border-radius: var(--radius-sm, 5px); border: 1px solid var(--border) !important; color: var(--dim) !important; white-space: nowrap; }
  .chip.on { background: var(--teal-soft) !important; color: var(--teal) !important; font-weight: 600; }
  .mon { flex: 1; min-height: 0; overflow: auto; background: #15171b; color: #d7dae0; font: 11.5px/1.6 var(--mono); padding: 6px 12px; }
  .mon-line { white-space: pre-wrap; word-break: break-all; }
  .mon-time { color: #6b7380; margin-right: 10px; }
  .mon-line.tx .mon-text { color: #6ea8ff; }
  .mon-line.sys .mon-text { color: #e8c35a; }
  .mon-line.err .mon-text { color: #ff6b6b; }
  .probs { flex: 1; overflow: auto; }
  .prob { width: 100%; display: grid; grid-template-columns: 16px 1fr auto; gap: 8px; align-items: center; padding: 6px 12px !important; border-bottom: 1px solid var(--border) !important; text-align: left; }
  .prob:hover { background: var(--hover) !important; }
  .prob .ico.e { color: var(--danger, #e5484d); width: 13px; height: 13px; }
  .prob .ico.w { color: #d9822b; width: 13px; height: 13px; }
  .prob code { font-family: var(--mono); font-size: 11px; color: var(--dim); }
  .fix:not(:empty) { margin: 6px 12px 8px 36px; display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 7px 9px; border: 1px solid color-mix(in srgb, var(--teal) 35%, transparent); background: var(--teal-soft); border-radius: var(--radius-sm, 5px); }
  .fix small { display: block; color: var(--dim); font-size: 11px; }
  .fix .btn { margin-left: auto; }
  .fix .others { flex-basis: 100%; }

  .status { height: 24px; flex: none; display: flex; align-items: center; gap: 14px; padding: 0 12px; font-size: 11px; color: var(--faint); border-top: 1px solid var(--border); background: var(--side); white-space: nowrap; overflow: hidden; }

  .overlay, .modal { position: absolute; inset: 0; z-index: 20; display: grid; place-items: center; background: color-mix(in srgb, var(--surface) 70%, transparent); padding: 20px; }
  .modal { background: rgba(0,0,0,.25); z-index: 30; }
  .card, .dialog { width: min(560px, 100%); max-height: 100%; overflow: auto; background: var(--surface); border: 1px solid var(--border); border-radius: 10px; box-shadow: 0 16px 40px -12px rgba(0,0,0,.45); padding: 18px 20px; display: grid; gap: 10px; }
  .dialog.small { width: min(400px, 100%); }
  .dialog.wide { width: min(760px, 100%); }
  .card h2, .dialog h3 { margin: 0; display: flex; align-items: center; gap: 10px; font-size: 15px; }
  .card h2 .ico { width: 22px; height: 22px; color: var(--teal); }
  .card p, .dialog p { margin: 0; }
  .dialog label { display: grid; gap: 4px; color: var(--dim); font-size: 11.5px; }
  .steps { display: grid; gap: 6px; }
  .step { display: grid; grid-template-columns: 180px 1fr 110px; gap: 10px; align-items: center; font-size: 12px; }
  .step .bar { width: 100%; }
  .step.busy .bar i { width: 40% !important; animation: slide 1.2s ease-in-out infinite; }
  .step.done .bar i { width: 100% !important; animation: none; background: #30a46c; }
  .step small { color: var(--faint); text-align: right; }
  @keyframes slide { 0% { transform: translateX(-100%); } 100% { transform: translateX(250%); } }
  .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
  .cols h5 { margin: 4px 0; font-size: 10.5px; font-weight: 600; color: var(--faint); text-transform: uppercase; letter-spacing: .05em; }
  .opts { display: grid; gap: 4px; margin-bottom: 8px; }
  .opt { display: grid !important; grid-template-columns: 14px 1fr; gap: 9px; align-items: center; padding: 6px 8px !important; border-radius: var(--radius-sm, 5px); text-align: left; }
  .opt:hover { background: var(--hover) !important; }
  .opt.on { background: var(--teal-soft) !important; }
  .opt .nm { font-weight: 600; min-width: 0; }
  .opt .nm small { display: block; font-weight: 400; font-family: var(--mono); font-size: 10.5px; color: var(--dim); }
  .opt .nm small.txt { font-family: inherit; font-size: 11px; }
  .radio { width: 14px; height: 14px; border-radius: 50%; border: 1.5px solid var(--faint); }
  .radio.on { border: 4.5px solid var(--teal); }
  .deps { border: 1px solid var(--border); border-radius: var(--radius-sm, 5px); }
  .deps div { display: flex; align-items: center; gap: 6px; padding: 7px 10px; border-bottom: 1px solid var(--border); }
  .deps div:last-child { border-bottom: 0; }
  @media (max-width: 760px) { .side { width: 210px; } .cols { grid-template-columns: 1fr; } .boardpick { min-width: 0; } }
`;
