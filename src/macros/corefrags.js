// Ustawia halter i Auto Singularity (tryb czasowy) pod wybrany typ core fragmentu.
// Makro niczego nie kupuje i nie resetuje – tylko konfiguruje to, co gra już daje,
// pokazuje na żywo, który typ prowadzi, a po wyłączeniu zdejmuje wszystkie haltery.

const NAMES = ["Ancient", "Natural", "Technological", "Paradox", "Radioactive", "Cosmic", "Temporal"];
const HALTERS = ["points", "factor", "prestige", "trees", "grass", "goldenGrass", "grasshoppers",
  "code", "mods", "xp", "antimatter", "infinities", "ip", "nip"];

// Presety zmierzone symulacją na Twoim save (120 s na wariant).
// cap = halter w trybie 2 („limit") z wartością 1, czyli praktycznie zatrzymany przyrost.
const PRESETS = {
  6: { interval: 1, cap: [], lowPP: false, note: "~+200 Temporal / 2 min" },
  3: { interval: 10, cap: ["antimatter"], lowPP: false, note: "~+60 Paradox / 2 min" },
  4: { interval: 3, cap: ["factor", "nip", "antimatter"], lowPP: true, note: "~+140 Radioactive / 2 min przy niskim PP" },
  5: { interval: 30, cap: [], lowPP: true, note: "~+25 Cosmic / 2 min przy niskim PP" },
  0: { interval: 10, cap: ["antimatter", "nip"], lowPP: true, note: "teraz przegrywa z Radioactive" },
  1: { interval: 15, cap: ["factor", "nip", "antimatter", "code"], lowPP: true, note: "teraz przegrywa z Radioactive" },
  2: { interval: 15, cap: ["factor", "nip", "antimatter"], lowPP: true, note: "teraz przegrywa z Radioactive" },
};

const dec = v => new window.Decimal(v);

function snapshot() {
  const h = {};
  for (const k of HALTERS) {
    const e = window.player.po.halter[k];
    if (e) h[k] = { enabled: e.enabled, halt: String(e.halt) };
  }
  const s = window.player.sma;
  return { halter: h, sma: { toggle: s.toggle, type: s.type, input: String(s.input), amount: String(s.amount) } };
}

function allHaltersOff() {
  for (const k of HALTERS) { const e = window.player.po.halter[k]; if (e) e.enabled = 0; }
}

function apply(target, interval, autoOn) {
  const preset = PRESETS[target];
  allHaltersOff();
  for (const k of preset.cap) {
    const e = window.player.po.halter[k];
    if (e) { e.enabled = 2; e.halt = dec(1); }
  }
  const s = window.player.sma;
  s.type = true;
  s.input = dec(interval);
  s.amount = dec(interval);
  s.time = dec(0);
  if (autoOn) s.toggle = true;
}

function restore(snap) {
  for (const [k, v] of Object.entries(snap.halter)) {
    const e = window.player.po.halter[k];
    if (e) { e.enabled = v.enabled; e.halt = dec(v.halt); }
  }
  const s = window.player.sma;
  s.toggle = snap.sma.toggle; s.type = snap.sma.type;
  s.input = dec(snap.sma.input); s.amount = dec(snap.sma.amount);
}

export const coreFragmentFarm = {
  id: "core-fragment-farm",
  name: "Farma core fragmentów",
  group: "Darkness / SMA",
  description: "Wybierz typ CF – makro ustawia halter i Auto Singularity (tryb czasowy) z presetu. "
    + "Potem tylko włącz Auto Singularity w grze. Wyłączenie makra zdejmuje wszystkie haltery "
    + "i wyłącza Auto Singularity (albo przywraca stan sprzed włączenia).",
  every: 1,
  params: [
    { key: "target", label: "Typ CF", type: "select", default: "6",
      options: [6, 3, 4, 5, 0, 1, 2].map(i => [String(i), `${NAMES[i]} – ${PRESETS[i].note}`]) },
    { key: "interval", label: "Interwał Auto Singularity (s, 0 = z presetu)", type: "number", default: 0, min: 0 },
    { key: "autoOn", label: "Od razu włącz Auto Singularity", type: "bool", default: false },
    { key: "restorePrevious", label: "Po wyłączeniu przywróć poprzednie ustawienia (zamiast zdjąć wszystko)", type: "bool", default: false },
  ],
  available: () => Boolean(window.player?.po?.halter && window.player?.sma && window.player?.cof),

  onEnable(ctx) {
    if (!this.available()) return;
    ctx.state.snap ??= snapshot();
    ctx.state.applied = null;
    ctx.persist();
  },

  onDisable(ctx) {
    if (!this.available()) return;
    if (ctx.p.restorePrevious && ctx.state.snap) restore(ctx.state.snap);
    else { allHaltersOff(); window.player.sma.toggle = false; }
    ctx.state.snap = null;
    ctx.state.applied = null;
    ctx.persist();
    ctx.log("Haltery zdjęte, Auto Singularity " + (ctx.p.restorePrevious ? "przywrócone" : "wyłączone"));
  },

  run(ctx) {
    const target = Number(ctx.p.target);
    const preset = PRESETS[target];
    if (!preset) { ctx.status("Nieznany typ CF"); return; }
    const interval = Number(ctx.p.interval) > 0 ? Number(ctx.p.interval) : preset.interval;
    const key = `${target}|${interval}`;
    if (ctx.state.applied !== key) {
      ctx.state.snap ??= snapshot();
      apply(target, interval, ctx.p.autoOn);
      ctx.state.applied = key;
      ctx.persist();
      ctx.did(); ctx.log(`Preset ${NAMES[target]} (${interval} s)`);
    }

    const cof = window.player.cof;
    const lead = cof.highestScore;
    const score = i => window.format ? window.format(cof.fragmentScore[i]) : String(cof.fragmentScore[i]);
    const auto = window.player.sma.toggle ? "AS on" : "AS off";
    const parts = [`${auto}`, `cel ${NAMES[target]} ${score(target)}`];
    if (lead === target) parts.push("✓ prowadzi");
    else parts.push(`✗ prowadzi ${NAMES[lead]} ${score(lead)}`);
    if (preset.lowPP && lead === 6) parts.push("(Temporal wygrywa – wydaj PP)");
    ctx.status(parts.join(" · "));
  },
};
