// Stały panel po prawej stronie okna. Gra jest zwężana o szerokość panelu,
// więc nic się nie nakłada. Panel żyje poza drzewem Vue gry (Shadow DOM).

import { macros, info, setEnabled, runOnce } from "./scheduler.js";
import { cloudSave, cloudFetch } from "./galaxy.js";
import { settings, macroSettings, save, exportSettings, importSettings } from "./settings.js";
import { startPerf, onPerf } from "./perf.js";

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

function applyLayout() {}

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

  // Panel jest nakładką (position: fixed) — nie zmieniamy stylów strony gry (psuło to m.in. canvas w Star battle).
  document.getElementById("celestial-toolbox-style")?.remove(); // sprzątanie po starszych wersjach
  document.documentElement.style.removeProperty("--ctb-width");

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

  // Licznik płynności: osobny, stały dymek przy dolnej krawędzi ekranu (poza panelem), stała szerokość pól.
  document.getElementById("ctb-perf")?.remove(); // po aktualizacji bez odświeżania
  const perfEl = document.createElement("div");
  perfEl.id = "ctb-perf";
  perfEl.title = "FPS: klatki przeglądarki/s · TPS: ticki gry/s (gra celuje w 20) · max: najdłuższa przerwa między tickami (5 s) · gra/toolbox: % czasu CPU w ticku";
  Object.assign(perfEl.style, {
    position: "fixed", bottom: "4px", left: "50%", transform: "translateX(-50%)", zIndex: "2147483646",
    font: "11px/1.4 ui-monospace, Consolas, monospace", whiteSpace: "pre", padding: "2px 8px",
    background: "rgba(20,21,28,0.85)", color: "#9aa0b4", border: "1px solid #3a3d4d", borderRadius: "8px",
    pointerEvents: "auto", userSelect: "none",
  });
  perfEl.textContent = "Toolbox: pomiar…";
  document.body.append(perfEl);
  startPerf();
  const pad = (v, n) => String(v).padStart(n, " ");
  const perfShown = () => Boolean(settings().macros?.["perf-bar"]?.enabled);
  perfEl.style.display = perfShown() ? "" : "none";
  onPerf(p => {
    perfEl.style.display = perfShown() ? "" : "none";
    const bad = p.tps < 18 || p.maxGap > 200;
    perfEl.style.color = bad ? "#ff7a7a" : "#9aa0b4";
    perfEl.style.borderColor = bad ? "#7a3a3a" : "#3a3d4d";
    perfEl.textContent =
      `${pad(Math.round(p.fps), 3)} FPS │ ${pad(p.tps.toFixed(1), 4)} TPS │ max ${pad(Math.round(p.maxGap), 5)} ms │ ` +
      `gra ${pad(p.gamePct.toFixed(0), 3)}% │ toolbox ${pad(p.tbPct.toFixed(1), 5)}%${p.hidden ? " │ karta w tle" : ""}`;
  });
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
      h("button", { title: "Wklej ustawienia", onclick: pasteSettings }, "Import"),
      h("button", { title: "Sprawdź i od razu wczytaj nową wersję toolboxa (bez odświeżania strony)", onclick: () => manualUpdate() }, "⟳ Aktualizuj")),
    h("div", { class: "foot cloud" },
      h("span", { class: "keys" }, "galaxy.click, slot 0"),
      h("button", { title: "Zapisz grę w chmurze galaxy.click (slot 0)", onclick: doCloudSave }, "☁ Zapisz"),
      h("button", { title: "Wczytaj grę z chmury galaxy.click (slot 0)", onclick: doCloudLoad }, "☁ Wczytaj")),
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
  async function doCloudSave() {
    cloudNote("Zapisuję…", 60000);
    try { const n = await cloudSave(exportSettings()); cloudNote(`Zapisano grę i ustawienia (${Math.round(n / 1000)} kB).`); }
    catch (err) { cloudNote("Błąd: " + err.message, 6000); }
  }
  async function doCloudLoad() {
    cloudNote("Pobieram…", 60000);
    try {
      const { label, save: data, toolbox } = await cloudFetch();
      cloudNote("Pobrano.");
      const extra = toolbox ? "\nUstawienia toolboxa też zostaną zastąpione zapisanymi." : "";
      if (!window.confirm(`Wczytać save z galaxy.click?\n${label ?? ""}\n\nBieżący postęp zostanie nadpisany.${extra}`)) return;
      if (toolbox) importSettings(toolbox);
      window.importSave(data, true);
    } catch (err) { cloudNote("Błąd: " + err.message, 6000); }
  }
  function cloudNote(msg, ms = 3000) {
    const el = root.querySelector(".cloud .keys");
    clearTimeout(cloudNote.t);
    el.textContent = msg;
    cloudNote.t = setTimeout(() => { el.textContent = "galaxy.click, slot 0"; }, ms);
  }
  function alertish(msg) {
    const foot = root.querySelector(".keys");
    const prev = foot.textContent;
    foot.textContent = msg;
    setTimeout(() => { foot.textContent = prev; }, 2500);
  }

  const onKey = e => {
    if (!e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.code === "KeyM") { e.preventDefault(); e.stopPropagation(); toggleCollapse(); }
    if (e.code === "KeyP") { e.preventDefault(); e.stopPropagation(); togglePause(); }
  };
  window.addEventListener("keydown", onKey, true);

  render();
  const refresh = () => { if (!st.collapsed) rows.forEach(r => r.update()); };
  refresh();
  const refreshTimer = setInterval(refresh, 500);

  // Aktualizacja bez odświeżania strony: co 5 min sprawdzamy version.json; gdy jest nowsza, pokazujemy przycisk.
  const updBtn = h("button", { class: "upd", style: "display:none", title: "Wczytaj najnowszą wersję toolboxa bez odświeżania strony", onclick: () => window.CelestialToolbox?.reload() });
  root.querySelector(".head").insertBefore(updBtn, pauseBtn);
  const checkUpdate = async () => {
    const v = await window.CelestialToolbox?.latestVersion?.();
    if (v && v !== version) { updBtn.textContent = "⟳ v" + v; updBtn.style.display = ""; }
  };
  async function manualUpdate() {
    alertish("Sprawdzam…");
    const v = await window.CelestialToolbox?.latestVersion?.();
    if (!v) { alertish("Nie udało się sprawdzić wersji."); return; }
    if (v === version) { alertish("Masz najnowszą (v" + version + ")."); return; }
    window.CelestialToolbox.reload();
  }
  const updTimer = setInterval(checkUpdate, 5 * 60 * 1000);
  setTimeout(checkUpdate, 10000);

  unmountUI = () => {
    window.removeEventListener("keydown", onKey, true);
    clearInterval(refreshTimer); clearInterval(updTimer);
    host.remove();
    document.documentElement.style.removeProperty("--ctb-width");
  };
}

export let unmountUI = () => {};
