// Uruchamia makra z wnętrza gameLoop gry, każde według własnego interwału.

import * as game from "./game.js";
import { settings, macroSettings, save } from "./settings.js";

const MAX_ERRORS = 3;

export const macros = [];
const runtime = new Map(); // id -> { last, actions, status, state, error, errors }

export function register(list) {
  for (const m of list) {
    macros.push(m);
    runtime.set(m.id, { last: 0, actions: 0, status: "", state: "off", error: null, errors: 0 });
  }
}

export const info = id => runtime.get(id);

function log(macro, ...args) {
  console.log(`[Toolbox:${macro.id}]`, ...args);
}

function makeCtx(macro, rt) {
  const s = macroSettings(macro);
  return {
    ...game,
    p: s.params,
    log: (...a) => log(macro, ...a),
    status: msg => { rt.status = String(msg); },
    did: (n = 1) => { rt.actions += n; },
  };
}

function availability(macro) {
  if (!macro.available) return true;
  try {
    return macro.available(game);
  } catch {
    return false;
  }
}

export function setEnabled(macro, enabled) {
  const s = macroSettings(macro);
  const rt = runtime.get(macro.id);
  s.enabled = enabled;
  rt.error = null;
  rt.errors = 0;
  rt.last = 0;
  save();
  if (!game.gameReady()) return;
  try {
    if (enabled) macro.onEnable?.(makeCtx(macro, rt));
    else macro.onDisable?.(makeCtx(macro, rt));
  } catch (err) {
    fail(macro, rt, err);
  }
}

function fail(macro, rt, err) {
  rt.errors++;
  rt.error = err?.message ?? String(err);
  console.error(`[Toolbox:${macro.id}] błąd (${rt.errors}/${MAX_ERRORS}):`, err);
  if (rt.errors >= MAX_ERRORS) {
    macroSettings(macro).enabled = false;
    rt.state = "error";
    save();
    console.error(`[Toolbox:${macro.id}] wyłączone po ${MAX_ERRORS} błędach z rzędu.`);
  }
}

export function runOnce(macro) {
  const rt = runtime.get(macro.id);
  try {
    macro.run(makeCtx(macro, rt));
    rt.errors = 0;
    rt.error = null;
  } catch (err) {
    fail(macro, rt, err);
  }
}

/** Wywoływane po każdym ticku gry. */
export function tick() {
  const paused = settings().paused;
  const now = performance.now();
  for (const macro of macros) {
    const s = macroSettings(macro);
    const rt = runtime.get(macro.id);
    if (!s.enabled) {
      if (rt.state !== "error") rt.state = "off";
      continue;
    }
    if (paused) { rt.state = "paused"; continue; }
    if (!availability(macro)) { rt.state = "waiting"; continue; }
    rt.state = "on";
    const everyMs = Math.max(0, Number(s.every) || 0) * 1000;
    // 5 ms luzu: tick gry trwa ~50 ms i lekko się waha.
    if (now - rt.last < everyMs - 5) continue;
    rt.last = now;
    runOnce(macro);
  }
}

/** Opakowuje gameLoop gry, gdy tylko gra będzie gotowa. */
export function hookGameLoop(onReady) {
  const attempt = () => {
    if (!game.gameReady()) return false;
    const original = window.gameLoop;
    if (original.__toolbox) return true;
    const wrapped = function (diff) {
      original.apply(this, arguments);
      try {
        tick();
      } catch (err) {
        console.error("[Toolbox] błąd schedulera:", err);
      }
    };
    wrapped.__toolbox = true;
    wrapped.__original = original;
    window.gameLoop = wrapped;
    // Makra włączone w zapisanych ustawieniach dostają onEnable po starcie.
    for (const m of macros) {
      if (macroSettings(m).enabled && m.onEnable) {
        try { m.onEnable(makeCtx(m, runtime.get(m.id))); } catch (err) { fail(m, runtime.get(m.id), err); }
      }
    }
    onReady?.();
    return true;
  };
  if (attempt()) return;
  const timer = setInterval(() => { if (attempt()) clearInterval(timer); }, 250);
}
