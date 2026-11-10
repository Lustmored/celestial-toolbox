// Ustawienia toolboxa w localStorage — osobno od sejwa gry.

const KEY = "celestialToolbox.settings.v1";

const defaults = () => ({ paused: false, collapsed: false, macros: {} });

let state = load();
let saveTimer = null;

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaults();
    return { ...defaults(), ...JSON.parse(raw) };
  } catch {
    return defaults();
  }
}

export function settings() {
  return state;
}

/** Ustawienia jednego makra, uzupełnione o wartości domyślne z jego definicji. */
export function macroSettings(macro) {
  const s = (state.macros[macro.id] ??= {});
  s.enabled ??= false;
  s.every ??= macro.every;
  s.params ??= {};
  for (const p of macro.params ?? []) s.params[p.key] ??= p.default;
  return s;
}

export function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (err) {
      console.warn("[Toolbox] Nie udało się zapisać ustawień:", err);
    }
  }, 200);
}

export function exportSettings() {
  return JSON.stringify(state);
}

export function importSettings(json) {
  state = { ...defaults(), ...JSON.parse(json) };
  // Zapis od razu (bez opóźnienia), bo zaraz po imporcie strona zwykle się przeładowuje.
  clearTimeout(saveTimer);
  localStorage.setItem(KEY, JSON.stringify(state));
}
