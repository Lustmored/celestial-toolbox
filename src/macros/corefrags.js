// Farma core fragmentów: ustawia halter, pauzę uniwersów (część Haltera) i Auto Singularity
// pod wybrany typ CF. W trybie adaptacyjnym makro włącza licznik Auto Singularity tylko wtedy,
// gdy wybrany typ prowadzi – reset trafia w okno, w którym ten typ wygrywa, więc nie trzeba
// dobierać interwału, a zmiany w progresie nie psują ustawień.
// Makro niczego nie kupuje i niczego nie dodaje – steruje tylko tym, co gra już daje.

const NAMES = ["Ancient", "Natural", "Technological", "Paradox", "Radioactive", "Cosmic", "Temporal"];
const HALTERS = ["points", "factor", "prestige", "trees", "grass", "goldenGrass", "grasshoppers",
  "code", "mods", "xp", "antimatter", "infinities", "ip", "nip"];

// pause: uniwersa zatrzymane na czas farmy (po odpauzowaniu gra nadrabia czas pauzy).
// cap: halter w trybie limitu = 1. interval: dla trybu nieadaptacyjnego.
// Zmierzone na Twoim save (PP 5e5, 3–4 min na wariant).
// Zmiana presetów → nowa wersja, żeby makro przełożyło je od razu, nawet gdy było już włączone.
const PRESET_VERSION = 2;

const PRESETS = {
  // sdOff: wyłącza produkcję Singularity Dimensions (moc SD = 0 → wynik Radioactive = 0).
  // xp w cap: halter XP z Check Back – zbija wynik Temporal, ale XP z przycisków CB leci wtedy ~0.
  6: { pause: [], cap: [], sdOff: false, interval: 0.15, always: true, note: "wymaga wysokiego PP" },
  3: { pause: [], cap: ["antimatter"], sdOff: true, interval: 1, note: "" },
  1: { pause: ["U2"], cap: ["factor", "code", "xp"], sdOff: true, interval: 15, note: "SD off + halter XP" },
  2: { pause: ["U2"], cap: ["factor", "grasshoppers", "xp"], sdOff: true, interval: 15, note: "SD off + halter XP" },
  0: { pause: ["U2"], cap: ["trees", "code", "xp"], sdOff: true, interval: 10, note: "SD off + halter XP, nietestowane" },
  5: { pause: ["U1"], cap: ["infinities", "xp"], sdOff: true, interval: 30, note: "SD off + halter XP, nietestowane" },
  4: { pause: ["U1", "U2"], cap: ["xp"], sdOff: false, interval: 3, note: "halter XP, nietestowane" },
};

const dec = v => new window.Decimal(v);
const P = () => window.player;

function snapshot() {
  const h = {};
  for (const k of HALTERS) {
    const e = P().po.halter[k];
    if (e) h[k] = { enabled: e.enabled, halt: String(e.halt) };
  }
  const s = P().sma;
  return { halter: h, sma: { toggle: s.toggle, type: s.type, amount: String(s.amount) } };
}

function allHaltersOff() {
  for (const k of HALTERS) { const e = P().po.halter[k]; if (e) e.enabled = 0; }
}

function setPaused(list, state) {
  for (const u of list) {
    if (!P().uni?.[u]) continue;
    const paused = Boolean(P().uni[u].paused);
    if (state && !paused) window.pauseUniverse(u, "pause");
    if (!state && paused) window.pauseUniverse(u, "unpause");
  }
}

function applyPreset(ctx, target, interval) {
  const preset = PRESETS[target];
  // Odpauzuj to, co sami wcześniej zapauzowaliśmy, a czego nowy preset nie chce.
  const ours = ctx.state.paused ?? [];
  setPaused(ours.filter(u => !preset.pause.includes(u)), false);
  const newly = preset.pause.filter(u => P().uni?.[u] && !P().uni[u].paused);
  setPaused(newly, true);
  ctx.state.paused = [...new Set([...ours.filter(u => preset.pause.includes(u)), ...newly])];

  // Singularity Dimensions: pausedDimensions === true oznacza w grze „produkcja włączona”.
  ctx.state.sdPrev ??= P().sd.pausedDimensions;
  P().sd.pausedDimensions = preset.sdOff ? false : ctx.state.sdPrev;

  allHaltersOff();
  for (const k of preset.cap) {
    const e = P().po.halter[k];
    if (e) { e.enabled = 2; e.halt = dec(1); }
  }
  const s = P().sma;
  s.type = true;
  s.input = dec(interval);
  s.amount = dec(interval);
  s.time = dec(0);
}

function resetCount() {
  return String(P().s.singularities);
}

export const coreFragmentFarm = {
  id: "core-fragment-farm",
  name: "Farma core fragmentów",
  group: "Darkness / SMA",
  description: "Wybierz typ CF i włącz. Makro ustawia halter, pauzę uniwersów, pauzę Singularity Dimensions i Auto Singularity. "
    + "Presety z halterem XP sprawiają, że przyciski XP w Check Back dają ~0 – wyłącz na ten czas CB Claim All. "
    + "Tryb adaptacyjny: licznik Auto Singularity chodzi tylko, gdy wybrany typ prowadzi "
    + "(z resetem awaryjnym, gdy utknie). Wyłączenie zdejmuje haltery, odpauzowuje uniwersa "
    + "i wyłącza Auto Singularity.",
  every: 0,
  params: [
    { key: "target", label: "Typ CF", type: "select", default: "6",
      options: [6, 3, 1, 2, 0, 5, 4].map(i => [String(i), NAMES[i] + (PRESETS[i].note ? ` (${PRESETS[i].note})` : "")]) },
    { key: "adaptive", label: "Adaptacyjnie (reset tylko, gdy cel prowadzi)", type: "bool", default: true },
    { key: "fastInterval", label: "Interwał w trybie adaptacyjnym (s)", type: "number", default: 0.15, min: 0.05 },
    { key: "stuckReset", label: "Reset awaryjny po tylu s bez okna (0 = nigdy)", type: "number", default: 30, min: 0 },
    { key: "restorePrevious", label: "Po wyłączeniu przywróć poprzednie haltery i AS", type: "bool", default: false },
  ],
  available: () => Boolean(window.player?.po?.halter && window.player?.sma && window.player?.cof && window.player?.sd
    && typeof window.pauseUniverse === "function"),

  onEnable(ctx) {
    if (!this.available()) return;
    ctx.state.snap ??= snapshot();
    ctx.state.applied = null;
    ctx.persist();
  },

  onDisable(ctx) {
    if (!this.available()) return;
    setPaused(ctx.state.paused ?? [], false);
    if (ctx.state.sdPrev !== undefined && ctx.state.sdPrev !== null) P().sd.pausedDimensions = ctx.state.sdPrev;
    ctx.state.sdPrev = null;
    if (ctx.p.restorePrevious && ctx.state.snap) {
      for (const [k, v] of Object.entries(ctx.state.snap.halter)) {
        const e = P().po.halter[k];
        if (e) { e.enabled = v.enabled; e.halt = dec(v.halt); }
      }
      const s = P().sma, o = ctx.state.snap.sma;
      s.toggle = o.toggle; s.type = o.type; s.input = dec(o.amount); s.amount = dec(o.amount);
    } else {
      allHaltersOff();
      P().sma.toggle = false;
    }
    ctx.state.snap = null;
    ctx.state.paused = [];
    ctx.state.applied = null;
    ctx.persist();
  },

  run(ctx) {
    const target = Number(ctx.p.target);
    const preset = PRESETS[target];
    if (!preset) { ctx.status("Nieznany typ CF"); return; }
    const adaptive = Boolean(ctx.p.adaptive);
    const interval = adaptive && !preset.always ? Math.max(0.05, Number(ctx.p.fastInterval) || 0.15) : preset.interval;
    const key = `${target}|${interval}|${PRESET_VERSION}`;
    const rt = (ctx.state.rt ??= {});
    if (ctx.state.applied !== key) {
      ctx.state.snap ??= snapshot();
      applyPreset(ctx, target, interval);
      ctx.state.applied = key;
      ctx.persist();
      // lastReset = 0: pierwszy reset od razu, żeby zbić wyniki, które przed włączeniem były wysokie.
      Object.assign(rt, { lastReset: 0, count: resetCount(), gained: 0, start: Date.now(),
        cf: String(P().cof.coreFragments[target]) });
      ctx.did();
    }

    const cof = P().cof;
    const lead = cof.highestScore;
    const leading = lead === target && cof.coreFragmentsToGet[target].gte(1);

    const c = resetCount();
    if (c !== rt.count) { rt.count = c; rt.lastReset = Date.now(); }

    let mode;
    if (!adaptive || preset.always) {
      // Temporal się nie resetuje, więc częste resety tylko zbijają konkurencję.
      P().sma.toggle = true;
      mode = `stały ${interval} s`;
    } else {
      const stuck = Number(ctx.p.stuckReset) > 0 && Date.now() - rt.lastReset > Number(ctx.p.stuckReset) * 1000;
      P().sma.toggle = leading || stuck;
      mode = leading ? "okno ✓" : stuck ? "reset awaryjny" : "czekam na okno";
    }

    const fmt = v => (window.format ? window.format(v) : String(v));
    const got = dec(cof.coreFragments[target]).sub(dec(rt.cf ?? 0));
    const mins = Math.max(1 / 60, (Date.now() - (rt.start ?? Date.now())) / 60000);
    const parts = [mode, `${NAMES[target]} ${fmt(cof.fragmentScore[target])}`];
    if (lead !== target) parts.push(`prowadzi ${NAMES[lead]} ${fmt(cof.fragmentScore[lead])}`);
    parts.push(`+${fmt(got)} (${fmt(got.div(mins))}/min)`);
    ctx.status(parts.join(" · "));
  },
};
