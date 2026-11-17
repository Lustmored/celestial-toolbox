import macros from "./macros/index.js";
import { register, hookGameLoop, unhook, macros as registered, setEnabled, runOnce, info } from "./core/scheduler.js";
import { settings, macroSettings, flush } from "./core/settings.js";
import { mountUI, unmountUI } from "./core/ui.js";

const VERSION = __VERSION__;
// Skąd wczytano bundle (do przeładowania tej samej wersji źródła); na Pages obok leży version.json.
const SRC = (document.currentScript?.src || __BASE__ + "/celestial-toolbox.js").split("?")[0];
const BASE = SRC.replace(/\/[^/]*$/, "");

(function start() {
  if (window.CelestialToolbox) {
    console.warn("[Toolbox] już załadowany, v" + window.CelestialToolbox.version);
    return;
  }
  register(macros);
  const find = id => {
    const m = registered.find(x => x.id === id);
    if (!m) throw new Error("Nie ma makra " + id);
    return m;
  };
  // Dostęp z konsoli, np. CelestialToolbox.enable("moonstone")
  window.CelestialToolbox = {
    version: VERSION,
    list: () => console.table(registered.map(m => ({ id: m.id, name: m.name, enabled: macroSettings(m).enabled, state: info(m.id).state, actions: info(m.id).actions }))),
    enable: id => setEnabled(find(id), true),
    disable: id => setEnabled(find(id), false),
    runOnce: id => runOnce(find(id)),
    info: id => info(id),
    settings,
    /** Najnowsza opublikowana wersja (z version.json) albo null. */
    latestVersion: async () => {
      try { const r = await fetch(BASE + "/version.json?t=" + Date.now(), { cache: "no-store" }); return (await r.json()).version; }
      catch { return null; }
    },
    /** Zdejmuje toolbox z gry (makra dostają onDisable, ustawienia zostają). */
    unload: () => { flush(); unhook(); unmountUI(); delete window.CelestialToolbox; },
    /** Wczytuje najnowszy bundle bez odświeżania strony. Włączone makra startują ponownie. */
    reload: () => {
      window.CelestialToolbox.unload();
      const s = document.createElement("script");
      s.src = SRC + "?t=" + Date.now();
      s.onerror = () => console.error("[Toolbox] Nie udało się pobrać " + s.src);
      document.head.append(s);
    },
  };
  hookGameLoop(() => {
    const boot = () => { mountUI(VERSION); console.log("[Toolbox] v" + VERSION + " gotowy. Alt+M — panel."); };
    if (document.body) boot(); else document.addEventListener("DOMContentLoaded", boot);
  });
})();
