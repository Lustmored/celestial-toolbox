// Stały panel po prawej stronie okna. Gra jest zwężana o szerokość panelu,
// więc nic się nie nakłada. Panel żyje poza drzewem Vue gry (Shadow DOM).

import { macros, info, setEnabled, runOnce } from "./scheduler.js";
import { settings, macroSettings, save, exportSettings, importSettings } from "./settings.js";

const WIDTH = 300;
const STRIP = 26;

const STATE_LABEL = {
  off: "wyłączone",
  on: "działa",
  waiting: "czeka (niedostępne)",
  paused: "pauza",
  error: "błąd — wyłączone",
};

const CSS = `
:host { all: initial; }
* { box-sizing: border-box; }
.root { text-align: left; position: fixed; top: 0; right: 0; height: 100vh; width: ${WIDTH}px; display: flex; flex-direction: column;
  background: #15161c; color: #d8d8e0; border-left: 2px solid #3a3c4a;
  font: 12px/1.35 system-ui, -apple-system, "Segoe UI", sans-serif; }
.root.collapsed { width: ${STRIP}px; }
.root.collapsed .body, .root.collapsed .head .title, .root.collapsed .head .pause, .root.collapsed .foot { display: none; }
.root.collapsed .head { flex-direction: column; padding: 6px 0; }
.head { display: flex; align-items: center; gap: 6px; padding: 8px 10px; border-bottom: 1px solid #2c2e3a; }
.title { font-weight: 600; flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.title small { color: #888a99; font-weight: 400; }
button { font: inherit; color: inherit; background: #262836; border: 1px solid #3a3c4a; border-radius: 4px;
  padding: 2px 8px; cursor: pointer; }
button:hover { background: #30334a; }
button.on { background: #6b4b12; border-color: #a7761c; }
.body { flex: 1; overflow-y: auto; padding: 4px 0 10px; }
details.group > summary { cursor: pointer; padding: 6px 10px 4px; color: #9a9db0; font-size: 11px;
  text-transform: uppercase; letter-spacing: .04em; list-style: none; user-select: none; }
details.group > summary::before { content: "▸ "; }
details.group[open] > summary::before { content: "▾ "; }
.macro { padding: 4px 10px; border-top: 1px solid #1f2029; }
.row { display: flex; align-items: center; gap: 6px; }
.row label { flex: 1; display: flex; align-items: center; gap: 6px; cursor: pointer; min-width: 0; }
.row label span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dot { width: 8px; height: 8px; border-radius: 50%; background: #4a4c5a; flex: none; }
.dot.on { background: #3fcf6a; } .dot.waiting { background: #d9b23a; }
.dot.paused { background: #6a8bd9; } .dot.error { background: #e0504a; }
input[type=number], input[type=text], select { font: inherit; color: inherit; background: #0f1015; border: 1px solid #3a3c4a;
  border-radius: 3px; padding: 1px 4px; }
input.every { width: 52px; text-align: right; }
.unit { color: #888a99; }
.more { padding: 0 6px; }
.detail { margin: 6px 0 4px 20px; display: none; }
.macro.open .detail { display: block; }
.desc { color: #a0a3b5; margin-bottom: 6px; }
.param { display: flex; align-items: center; gap: 6px; margin: 3px 0; }
.param span { flex: 1; color: #b9bccb; }
.param input[type=number] { width: 70px; }
.param input[type=text] { width: 100%; }
.param.wide { flex-direction: column; align-items: stretch; }
.meta { color: #888a99; margin-top: 4px; word-break: break-word; }
.meta .err { color: #e0807a; }
.foot { border-top: 1px solid #2c2e3a; padding: 6px 10px; color: #6f7283; display: flex; gap: 6px; align-items: center; }
.foot .keys { flex: 1; }
`;

function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "class") el.className = v;
    else el.setAttribute(k, v);
  }
  for (const c of children.flat()) if (c != null) el.append(c);
  return el;
}

function applyLayout(collapsed) {
  const w = collapsed ? STRIP : WIDTH;
  document.documentElement.style.setProperty("--ctb-width", w + "px");
}

function paramInput(macro, p, s) {
  const set = v => { s.params[p.key] = v; save(); };
  if (p.type === "bool") {
    const input = h("input", { type: "checkbox", onchange: e => set(e.target.checked) });
    input.checked = Boolean(s.params[p.key]);
    return h("label", { class: "param" }, input, h("span", {}, p.label));
  }
  if (p.type === "select") {
    const sel = h("select", { onchange: e => set(e.target.value) });
    for (const [value, label] of p.options) {
      const o = h("option", {}, label);
      o.value = value;
      sel.appendChild(o);
    }
    sel.value = String(s.params[p.key]);
    return h("label", { class: "param wide" }, h("span", {}, p.label), sel);
  }
  const input = h("input", {
    type: p.type === "number" ? "number" : "text",
    onchange: e => set(p.type === "number" ? Number(e.target.value) : e.target.value),
  });
  if (p.type === "number") {
    if (p.min != null) input.min = p.min;
    if (p.max != null) input.max = p.max;
    input.step = p.step ?? "any";
  }
  input.value = s.params[p.key];
  return h("label", { class: "param" + (p.type === "number" ? "" : " wide") }, h("span", {}, p.label), input);
}

function macroRow(macro) {
  const s = macroSettings(macro);
  const toggle = h("input", { type: "checkbox", onchange: e => setEnabled(macro, e.target.checked) });
  toggle.checked = s.enabled;
  const every = h("input", {
    type: "number", class: "every", min: "0", step: "any", title: "Interwał w sekundach",
    onchange: e => { s.every = Math.max(0, Number(e.target.value) || 0); save(); },
  });
  every.value = s.every;
  const dot = h("span", { class: "dot" });
  const meta = h("div", { class: "meta" });
  const el = h("div", { class: "macro" },
    h("div", { class: "row" },
      dot,
      h("label", { title: macro.description ?? "" }, toggle, h("span", {}, macro.name)),
      macro.toggle ? null : every, macro.toggle ? null : h("span", { class: "unit" }, "s"),
      h("button", { class: "more", title: "Szczegóły", onclick: () => el.classList.toggle("open") }, "⋯"),
    ),
    h("div", { class: "detail" },
      macro.description ? h("div", { class: "desc" }, macro.description) : null,
      (macro.params ?? []).map(p => paramInput(macro, p, s)),
      macro.toggle ? null : h("div", { class: "param" }, h("button", { onclick: () => runOnce(macro) }, "Uruchom raz")),
      meta,
    ),
  );
  const update = () => {
    const rt = info(macro.id);
    dot.className = "dot " + rt.state;
    toggle.checked = s.enabled;
    dot.title = STATE_LABEL[rt.state] ?? rt.state;
    meta.replaceChildren(
      `${STATE_LABEL[rt.state] ?? rt.state} · akcje: ${rt.actions}`,
      rt.status ? h("div", {}, rt.status) : null,
      rt.error ? h("div", { class: "err" }, "Błąd: " + rt.error) : null,
    );
  };
  return { el, update };
}

export function mountUI(version) {
  if (document.getElementById("celestial-toolbox")) return;
  const st = settings();

  const style = document.createElement("style");
  style.textContent = `body { width: calc(100% - var(--ctb-width, ${WIDTH}px)) !important; position: absolute !important; left: 0 !important; top: 0 !important; margin: 0 !important; }`;
  document.head.append(style);

  const host = h("div", { id: "celestial-toolbox", style: "position:fixed;top:0;right:0;z-index:2147483000;" });
  const shadow = host.attachShadow({ mode: "open" });
  shadow.append(h("style", {}, CSS));

  // Klawisze wpisywane w pola panelu nie mogą odpalać skrótów gry.
  for (const type of ["keydown", "keyup", "keypress"]) {
    host.addEventListener(type, e => {
      const t = e.composedPath()[0];
      if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) e.stopPropagation();
    });
  }

  const pauseBtn = h("button", { class: "pause", title: "Pauza wszystkich makr (Alt+P)", onclick: () => togglePause() });
  const collapseBtn = h("button", { title: "Zwiń/rozwiń (Alt+M)", onclick: () => toggleCollapse() });
  const root = h("div", { class: "root" });

  const groups = new Map();
  const rows = [];
  for (const m of macros) {
    const g = m.group ?? "Inne";
    if (!groups.has(g)) groups.set(g, []);
    const row = macroRow(m);
    groups.get(g).push(row.el);
    rows.push(row);
  }

  root.append(
    h("div", { class: "head" },
      h("div", { class: "title" }, "Celestial Toolbox ", h("small", {}, "v" + version)),
      pauseBtn, collapseBtn),
    h("div", { class: "body" },
      [...groups].map(([name, els]) => {
        const d = h("details", { class: "group", open: "" }, h("summary", {}, name), els);
        return d;
      })),
    h("div", { class: "foot" },
      h("span", { class: "keys" }, "Alt+M panel · Alt+P pauza"),
      h("button", { title: "Skopiuj ustawienia do schowka", onclick: copySettings }, "Eksport"),
      h("button", { title: "Wklej ustawienia", onclick: pasteSettings }, "Import")),
  );
  shadow.append(root);
  document.body.append(host);

  function render() {
    root.classList.toggle("collapsed", Boolean(st.collapsed));
    collapseBtn.textContent = st.collapsed ? "‹" : "›";
    pauseBtn.textContent = st.paused ? "▶ Wznów" : "⏸ Pauza";
    pauseBtn.classList.toggle("on", Boolean(st.paused));
    applyLayout(st.collapsed);
  }
  function toggleCollapse() { st.collapsed = !st.collapsed; save(); render(); }
  function togglePause() { st.paused = !st.paused; save(); render(); }
  async function copySettings() {
    try { await navigator.clipboard.writeText(exportSettings()); alertish("Skopiowano ustawienia."); }
    catch { window.prompt("Skopiuj ustawienia:", exportSettings()); }
  }
  function pasteSettings() {
    const json = window.prompt("Wklej ustawienia (JSON):");
    if (!json) return;
    try { importSettings(json); location.reload(); }
    catch (err) { alertish("Niepoprawne ustawienia: " + err.message); }
  }
  function alertish(msg) {
    const foot = root.querySelector(".keys");
    const prev = foot.textContent;
    foot.textContent = msg;
    setTimeout(() => { foot.textContent = prev; }, 2500);
  }

  window.addEventListener("keydown", e => {
    if (!e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.code === "KeyM") { e.preventDefault(); e.stopPropagation(); toggleCollapse(); }
    if (e.code === "KeyP") { e.preventDefault(); e.stopPropagation(); togglePause(); }
  }, true);

  render();
  const refresh = () => { if (!st.collapsed) rows.forEach(r => r.update()); };
  refresh();
  setInterval(refresh, 500);
}
