// src/shared/sandbox/dom.js
function e(e, t = {}, ...n) {
	let r = document.createElement(e);
	for (let [e, n] of Object.entries(t ?? {})) n != null && n !== !1 && (e === "class" ? r.className = n : e.startsWith("on") && typeof n == "function" ? r.addEventListener(e.slice(2), n) : e in r && typeof n != "string" ? r[e] = n : r.setAttribute(e, n === !0 ? "" : String(n)));
	return r.append(...n.flat(Infinity).filter((e) => e != null && e !== !1).map((e) => e instanceof Node ? e : document.createTextNode(String(e)))), r;
}
function t(e, { gap: t = 12, overflow: n = "hidden" } = {}) {
	let r = `.${e}`;
	return `
  :host, body { margin: 0; }
  ${r} { box-sizing: border-box; height: 100%; overflow: ${n}; padding: 18px 20px; display: flex; flex-direction: column; gap: ${t}px; color: var(--text); font: 13px/1.45 var(--font, system-ui); }
  ${r} * { box-sizing: border-box; }
  ${r} h1 { font-size: 15px; font-weight: 600; margin: 0; overflow-wrap: anywhere; }
  ${r} p { margin: 0; color: var(--dim); }
  ${r} .hint { font-size: 12px; color: var(--dim); }
  ${r} .row { display: flex; gap: 8px; align-items: center; justify-content: flex-end; flex-wrap: wrap; }
  ${r} button { font: inherit; padding: 6px 14px; border-radius: var(--radius-sm, 6px); border: 1px solid var(--border); background: var(--surface); color: var(--text); cursor: pointer; }
  ${r} button:hover:not(:disabled) { background: var(--hover); }
  ${r} button.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
  ${r} button.primary:hover:not(:disabled) { filter: brightness(1.08); background: var(--accent); }
  ${r} button:disabled { opacity: .55; cursor: default; }
  ${r} input, ${r} select { font: inherit; color: var(--text); background: var(--field-bg, var(--surface)); border: 1px solid var(--border); border-radius: var(--radius-sm, 6px); padding: 7px 9px; }
  ${r} button:focus-visible, ${r} input:focus-visible, ${r} select:focus-visible, ${r} summary:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
  ${r} [aria-busy="true"] { cursor: progress; }
  ${r} .error { color: var(--danger, #d64545); }
  ${r} .warn { padding: 8px 10px; border-radius: var(--radius-sm, 6px); background: color-mix(in srgb, #e0a030 14%, transparent); color: var(--text); }
  ${r} ul { list-style: none; margin: 0; padding: 0; border: 1px solid var(--border); border-radius: var(--radius-sm, 6px); }
  ${r} li { display: flex; align-items: center; gap: 10px; padding: 6px 10px; }
  ${r} li + li { border-top: 1px solid var(--border); }
  ${r} li .name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  ${r} .empty { padding: 12px 10px; color: var(--dim); }
`;
}
// src/shared/sandbox/app.js
var n = (e) => e?.file ?? (Array.isArray(e?.files) ? e.files[0] : null) ?? null, r = (e, t) => e.on("locale", t);
function i(t, n, { style: i, className: a }, o) {
	i && n.append(e("style", {}, i));
	let s = e("div", { class: a });
	n.append(s);
	let c = () => o(s);
	return {
		box: s,
		redraw: c,
		off: r(t, c)
	};
}
function a(e, t, n, r = {}) {
	let i = t?.message, a = Array.isArray(n) ? n.includes(i) ? `error.${i}` : null : n && Object.hasOwn(n, i) ? n[i] : null;
	return a ? e(a, {
		detail: String(t?.detail ?? ""),
		...r
	}) : e("error.generic", { error: i ?? String(t) });
}
// src/compress-archive/ui.js
var o = /* @__PURE__ */ new Set([
	"Enter",
	" ",
	"Escape",
	"Delete",
	"Backspace",
	"ArrowUp",
	"ArrowDown",
	"ArrowLeft",
	"ArrowRight",
	"Home",
	"End",
	"PageUp",
	"PageDown",
	"Tab"
]);
function s(e) {
	e.addEventListener("keydown", (e) => {
		e.ctrlKey || e.metaKey || e.altKey || (e.composedPath()[0]?.matches?.("input, textarea") || o.has(e.key)) && e.stopPropagation();
	});
}
var c = `${t("ca", { gap: 10 })}
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
`, l = 10 << 20, u = [
	"nothing",
	"tooMany",
	"tooBig",
	"resultTooBig",
	"read",
	"corrupt",
	"empty",
	"skippedAll",
	"notArchive",
	"outside",
	"format",
	"single",
	"write",
	"password",
	"encrypted",
	"compression",
	"memory"
];
function d(e, t) {
	let n = (t) => e.locale.formatBytes(t), r = {
		message: t?.error ?? t?.message,
		detail: t?.detail
	};
	return a((t, n) => e.locale.i18n.t(t, n), r, u, {
		...typeof r.detail == "number" && { detail: n(r.detail) },
		limit: n(l),
		max: r.detail
	});
}
function f(e, t) {
	if (!t?.length) return "";
	let n = t.slice(0, 3).map((t) => `${t.name} (${e(`why.${t.why}`)})`).join(", ");
	return e("skipped", {
		n: t.length,
		names: t.length > 3 ? `${n}, …` : n
	});
}
// src/compress-archive/CompressApp.js
var p = 1e3, m = [
	"zip",
	"7z",
	"tar",
	"tar.gz",
	"tar.bz2",
	"tar.xz",
	"iso"
], h = [
	"gz",
	"bz2",
	"xz"
], g = [
	"fast",
	"normal",
	"max"
], _ = ["tar", "iso"], v = "compressAs";
async function y(e, t) {
	let n = await e.app.call("work", t);
	if (n?.error) throw Object.assign(Error(n.error), {
		error: n.error,
		detail: n.detail
	});
	return n;
}
function b(e) {
	let t = {
		key: "",
		children: /* @__PURE__ */ new Map()
	};
	for (let n of e) {
		let e = t;
		n.path.forEach((t, r) => {
			let i = t.toLowerCase();
			e.children.has(i) || e.children.set(i, {
				key: n.path.slice(0, r + 1).join("/"),
				name: t,
				folder: !0,
				size: 0,
				mtime: -1,
				locked: !1,
				children: /* @__PURE__ */ new Map()
			}), e = e.children.get(i);
		}), Object.assign(e, {
			folder: n.folder,
			size: n.size,
			mtime: n.mtime,
			locked: n.locked
		});
	}
	let n = (e) => (e.children = [...e.children.values()].sort((e, t) => t.folder - e.folder || e.name.localeCompare(t.name)), e.children.forEach(n), e);
	return n(t);
}
async function x({ lilos: t, root: r, args: a }) {
	let o = (e, n) => t.locale.i18n.t(e, n), u = t.locale.i18n, m = (e) => t.locale.formatBytes(e), { box: h, off: g } = i(t, r, {
		style: c,
		className: "ca"
	}, () => z());
	s(h);
	let _ = null, v = null, x = null, S = "", C = null, w = !1, T = "", E = !1, D = "", O = !1, k = null, A = "", j = /* @__PURE__ */ new Set(), M = /* @__PURE__ */ new Set(), N = (e) => {
		_ = n(e), v = x = C = null, S = D = "", T = "", E = !1, k = null, O = e?.extract === !0, j.clear(), M.clear();
	}, P = (e) => [...M].some((t) => e === t || e.startsWith(`${t}/`)), F = (e) => [...M].some((t) => e.startsWith(`${t}/`));
	function I() {
		let e = [];
		if (A) {
			let t = A.toLowerCase(), n = (r) => r.children.forEach((r) => {
				r.name.toLowerCase().includes(t) && e.push({
					node: r,
					depth: 0,
					path: !0
				}), n(r);
			});
			return n(x), e;
		}
		let t = (n, r) => n.children.forEach((n) => {
			e.push({
				node: n,
				depth: r
			}), n.folder && j.has(n.key) && t(n, r + 1);
		});
		return t(x, 0), e;
	}
	function L({ node: t, depth: n, path: r }) {
		let i = P(t.key), a = r ? t.key : t.name;
		return e("li", {
			role: "treeitem",
			class: `node${i ? " sel" : ""}`,
			"aria-level": String(n + 1),
			"aria-selected": i ? "true" : "false",
			...t.folder && !r && { "aria-expanded": j.has(t.key) ? "true" : "false" }
		}, e("input", {
			type: "checkbox",
			checked: i,
			disabled: F(t.key) || w,
			"aria-label": o("main.choose", { name: a }),
			onchange: (e) => {
				e.target.checked ? M.add(t.key) : M.delete(t.key), z();
			}
		}), e("span", {
			class: "name",
			style: `padding-left:${n * 16}px`
		}, t.folder && !r ? e("button", {
			type: "button",
			class: "twisty",
			"aria-label": o(j.has(t.key) ? "main.close" : "main.open", { name: t.name }),
			onclick: () => {
				j.has(t.key) ? j.delete(t.key) : j.add(t.key), z();
			}
		}, j.has(t.key) ? "▾" : "▸") : e("span", {
			class: "twisty",
			"aria-hidden": "true"
		}), e("span", {
			class: t.folder ? "ico folder" : "ico",
			"aria-hidden": "true"
		}), e("span", {
			class: "label",
			title: t.key
		}, a), t.locked && e("span", {
			class: "lock",
			title: o("main.locked")
		}, "🔒")), e("span", { class: "size" }, t.folder ? "" : m(t.size)), e("span", { class: "date" }, t.mtime > 0 ? u.date(t.mtime, { dateStyle: "short" }) : ""));
	}
	function R() {
		let t = () => {
			if (!r.value) return r.focus();
			T = r.value, E = !1, D = "", v ? B(k) : V();
		}, n = () => {
			E = !1, k = null, z();
		}, r = e("input", {
			type: "password",
			class: "field",
			autocomplete: "off",
			"aria-label": o("ask.label"),
			value: T,
			onkeydown: (e) => {
				e.key === "Enter" ? (e.preventDefault(), t()) : e.key === "Escape" && (e.preventDefault(), n());
			}
		}), i = e("div", {
			class: "dialog",
			role: "dialog",
			"aria-modal": "true",
			"aria-labelledby": "ca-ask"
		}, e("h2", { id: "ca-ask" }, o("ask.title")), e("p", {}, o("ask.text", { name: v?.name ?? "" })), D && e("p", {
			class: "error",
			role: "alert"
		}, D), r, e("div", { class: "row" }, e("button", {
			type: "button",
			onclick: n
		}, o("common.cancel")), e("button", {
			type: "button",
			class: "primary",
			onclick: t
		}, o("ask.open"))));
		return queueMicrotask(() => r.focus()), e("div", { class: "scrim" }, i);
	}
	let z = () => {
		if (!_) return t.window.setTitle("Compress Archive"), h.replaceChildren(e("h1", {}, "Compress Archive"), e("p", {}, o("main.intro")), e("p", { class: "hint" }, o("main.limits", { limit: m(l) })));
		if (t.window.setTitle(v?.name ?? "Compress Archive"), S && !v) return h.replaceChildren(e("div", {
			class: "error",
			role: "alert"
		}, S));
		if (!v) return h.replaceChildren(e("p", {
			class: "hint",
			"aria-busy": "true"
		}, o("main.reading")), E && R());
		let n = v.entries.filter((e) => !e.folder), r = n.reduce((e, t) => e + t.size, 0), i = I(), a = M.size, s = e("button", {
			type: "button",
			class: "primary",
			disabled: w || !v.entries.length,
			"aria-busy": w ? "true" : "false",
			onclick: () => B(null)
		}, o(w ? "main.extracting" : "main.extract")), c = a > 0 && e("button", {
			type: "button",
			disabled: w,
			onclick: () => B([...M])
		}, o("main.extractSome", { n: a }));
		h.replaceChildren(...[
			e("header", {}, e("h1", {}, v.name, v.kind && e("span", { class: "badge" }, v.kind), v.locked && e("span", { class: "badge lock" }, o("main.encrypted"))), e("p", {}, v.raw ? o("main.single", { size: m(v.size) }) : o("main.summary", {
				n: n.length,
				size: m(r),
				packed: m(v.size)
			}))),
			!v.raw && v.entries.length > 0 && e("input", {
				type: "search",
				class: "field",
				placeholder: o("main.search"),
				"aria-label": o("main.search"),
				value: A,
				oninput: (e) => {
					A = e.target.value;
					let t = e.target.selectionStart;
					z();
					let n = h.querySelector("input[type=search]");
					n?.focus(), n?.setSelectionRange(t, t);
				}
			}),
			v.entries.length ? e("div", { class: "table" }, e("div", {
				class: "head",
				"aria-hidden": "true"
			}, e("span"), e("span", {}, o("main.name")), e("span", { class: "size" }, o("main.size")), e("span", { class: "date" }, o("main.modified"))), e("ul", {
				class: "tree",
				role: "tree",
				"aria-label": o("main.content"),
				"aria-multiselectable": "true"
			}, ...i.slice(0, p).map(L), i.length > p && e("li", { class: "more" }, o("main.more", { n: i.length - p })), !i.length && e("li", { class: "more" }, o("main.noMatch")))) : e("div", { class: "empty" }, o("main.empty")),
			v.skipped.length > 0 && e("p", { class: "warn" }, f(o, v.skipped)),
			S && e("p", {
				class: "error",
				role: "alert"
			}, S),
			C && e("p", {
				class: "ok",
				role: "status"
			}, C),
			e("div", { class: "row" }, e("button", {
				type: "button",
				onclick: () => t.window.close()
			}, o("common.close")), c, s),
			E && R()
		].filter(Boolean));
	};
	async function B(e) {
		if (!w) {
			if (v.locked && !T) return k = e, E = !0, z();
			w = !0, C = null, S = "", z();
			try {
				let n = await y(t, {
					op: "extract",
					file: _,
					password: T,
					only: e
				});
				C = [o("done.unpack", {
					name: n.name,
					n: n.count
				}), f(o, n.skipped)].filter(Boolean).join(" "), M.clear();
			} catch (n) {
				n.error === "password" ? (D = T ? o("ask.wrong") : "", T = "", k = e, E = !0) : S = d(t, n);
			}
			w = !1, z();
		}
	}
	async function V() {
		if (z(), _) {
			try {
				if (v = await y(t, {
					op: "list",
					file: _,
					password: T
				}), x = b(v.entries), x.children.length === 1 && x.children[0].folder && j.add(x.children[0].key), O) {
					if (O = !1, v.locked && !T) E = !0;
					else return z(), B(null);
				}
			} catch (e) {
				e.error === "password" ? (D = T ? o("ask.wrong") : "", T = "", E = !0) : S = d(t, e);
			}
			z();
		}
	}
	N(a);
	let H = t.on("launch", (e) => {
		N(e), V();
	});
	return await V(), () => {
		H(), g();
	};
}
async function S({ lilos: t, root: n, args: r }) {
	let a = (e, n) => t.locale.i18n.t(e, n), o = (e) => t.locale.formatBytes(e), { box: u, off: f } = i(t, n, {
		style: c,
		className: "ca form"
	}, () => M());
	s(u);
	let p = [], b = [], x = "zip", S = "normal", C = "", w = !1, T = !1, E = "", D = "", O = "";
	try {
		let e = await t.storage.get(v);
		[...m, ...h].includes(e?.format) && (x = e.format), g.includes(e?.level) && (S = e.level);
	} catch {}
	let k = () => b.length === 1 && b[0].type === "file", A = () => {
		if (b.length !== 1) return a("archive.name");
		let [e] = b;
		if (e.type === "folder" || h.includes(x)) return e.name;
		let t = e.name.lastIndexOf(".");
		return t > 0 ? e.name.slice(0, t) : e.name;
	}, j = (t, n, r, i, o, s = () => !1) => e("div", {
		class: "seg",
		role: "radiogroup",
		"aria-label": i
	}, ...n.map((n) => e("button", {
		type: "button",
		role: "radio",
		"aria-checked": n === r ? "true" : "false",
		disabled: s(n) || T,
		onclick: () => o(n)
	}, a(`${t}.${n}`)))), M = () => {
		t.window.setTitle(a("as.title")), w || (C = A()), h.includes(x) && !k() && (x = "zip");
		let n = x === "zip", r = (e) => {
			e.key === "Enter" && (e.preventDefault(), N());
		}, i = e("input", {
			class: "field",
			id: "ca-name",
			value: C,
			disabled: T,
			onkeydown: r,
			oninput: (e) => {
				C = e.target.value, w = !0;
			}
		}), s = e("input", {
			type: "password",
			class: "field",
			id: "ca-pass",
			autocomplete: "new-password",
			value: D,
			disabled: !n || T,
			onkeydown: r,
			oninput: (e) => {
				D = e.target.value;
			}
		}), c = e("input", {
			type: "password",
			class: "field",
			id: "ca-pass2",
			autocomplete: "new-password",
			value: O,
			disabled: !n || T,
			onkeydown: r,
			oninput: (e) => {
				O = e.target.value;
			},
			placeholder: a("as.repeat"),
			"aria-label": a("as.repeat")
		});
		u.replaceChildren(...[
			e("p", { class: "hint" }, b.length === 1 ? a("as.one", { name: b[0]?.name ?? "" }) : a("as.many", { n: b.length })),
			e("div", { class: "fieldset" }, e("span", {
				class: "label",
				id: "ca-format"
			}, a("as.format")), j("format", m, x, a("as.format"), (e) => {
				x = e, M();
			}), j("format", h, x, a("as.single"), (e) => {
				x = e, M();
			}, () => !k()), e("span", { class: "hint" }, a("as.singleHint"))),
			e("label", {
				class: "fieldset",
				for: "ca-name"
			}, e("span", { class: "label" }, a("as.name")), e("span", { class: "suffixed" }, i, e("span", { class: "suffix" }, `.${x}`))),
			e("div", { class: "fieldset" }, e("span", { class: "label" }, a("as.level")), j("level", g, S, a("as.level"), (e) => {
				S = e, M();
			}, () => _.includes(x))),
			e("div", { class: `fieldset${n ? "" : " off"}` }, e("label", {
				class: "label",
				for: "ca-pass"
			}, a("as.password")), s, c, e("span", { class: "hint" }, a(n ? "as.passwordHint" : "as.passwordZip"))),
			e("p", { class: "warn" }, a("as.limit", { limit: o(l) })),
			E && e("p", {
				class: "error",
				role: "alert"
			}, E),
			e("div", { class: "row" }, e("button", {
				type: "button",
				disabled: T,
				onclick: () => t.window.close()
			}, a("common.cancel")), e("button", {
				type: "button",
				class: "primary",
				disabled: T || !b.length,
				"aria-busy": T ? "true" : "false",
				onclick: () => N()
			}, a(T ? "as.working" : "as.go")))
		].filter(Boolean));
	};
	async function N() {
		if (T || !b.length) return;
		let e = x === "zip" ? D : "";
		if (e !== (x === "zip" ? O : "")) return E = a("as.mismatch"), M();
		T = !0, E = "", M();
		try {
			await Promise.resolve().then(() => t.storage.set(v, {
				format: x,
				level: S
			})).catch(() => {}), await y(t, {
				op: "compress",
				files: p,
				format: x,
				level: S,
				password: e,
				name: C.trim()
			}), t.window.close();
			return;
		} catch (e) {
			E = d(t, e);
		}
		T = !1, M();
	}
	let P = async (e) => {
		p = Array.isArray(e?.files) ? e.files.filter((e) => typeof e == "string") : [], b = (await Promise.all(p.map((e) => t.files.info(e).catch(() => null)))).filter(Boolean), w = !1, E = b.length ? "" : a("error.nothing"), M();
	}, F = t.on("launch", (e) => P(e));
	return await P(r), () => {
		F(), f();
	};
}
export { S as compressAs, x as main };
