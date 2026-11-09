import macros from "./macros/index.js";
import { register, hookGameLoop, macros as registered, setEnabled, runOnce, info } from "./core/scheduler.js";
import { settings, macroSettings } from "./core/settings.js";
import { mountUI } from "./core/ui.js";

const VERSION = __VERSION__;

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
  };
  hookGameLoop(() => {
    const boot = () => { mountUI(VERSION); console.log("[Toolbox] v" + VERSION + " gotowy. Alt+M — panel."); };
    if (document.body) boot(); else document.addEventListener("DOMContentLoaded", boot);
  });
})();
