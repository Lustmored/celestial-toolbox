export const hexVexes = {
  id: "hex-vexes",
  name: "Hex of Vexes",
  group: "Hex",
  every: 0.15,
  description:
    "Kupuje kolejny brakujący upgrade Vex wg listy priorytetów. Gdy nie da się kupić, robi Vex reset, " +
    "dopóki łączna liczba Vexów jest poniżej limitu. Nie robi respeców.",
  params: [
    { key: "priority", label: "Kolejność upgrade'ów", type: "text", default: "13 22 11 33 21 12 43 31 23 41 53 32 63 42 51 61 52 62" },
    { key: "maxVex", label: "Vex reset do łącznie", type: "number", default: 18, min: 0, step: 1 },
    { key: "onlyInUA", label: "Tylko gdy patrzę na uniwersum α", type: "bool", default: true },
  ],
  available: g => g.layerActive("hve"),
  run(ctx) {
    const hve = window.player.hve;
    if (ctx.p.onlyInUA && window.player.universe !== "UA") return ctx.status("czekam na uniwersum α");

    const next = ctx.parseIds(ctx.p.priority).find(id => !window.hasUpgrade("hve", id));
    if (next === undefined) return ctx.status("wszystkie upgrade'y z listy kupione");

    const row = Math.floor(next / 10) - 1;
    if (hve.rowCurrent[row] > 0 && hve.vex.gte(1) && window.canAffordUpgrade("hve", next)) {
      window.buyUpgrade("hve", next);
      if (window.hasUpgrade("hve", next)) { ctx.did(); ctx.status("kupiono " + next); }
      return;
    }
    if (hve.vexTotal.lt(ctx.p.maxVex) && ctx.click("hve", 1)) {
      ctx.did();
      ctx.status(`Vex reset (łącznie ${hve.vexTotal})`);
    } else {
      ctx.status("czekam na " + next);
    }
  },
};

// ── Dream Realm ──────────────────────────────────────────────────────────────
// W Dream Realm (60 s) automatyka Hex jest wyłączona: provenance, refinement i blessing
// trzeba klikać ręcznie, a boonów nic nie wpłaca do boosterów. Makro robi to samo, co gracz:
// najwyższa dostępna provenance → refinement, gdy daje ≥1 → blessing, gdy domyka cel
// (albo na koniec czasu) → wpłaty boonów do boosterów. Opcjonalnie samo wchodzi do realmu,
// dopóki są ukończenia do zdobycia.

const DREAM = 15;

function live(layer, id) {
  const c = window.layers[layer]?.clickables?.[id];
  if (!c) return null;
  const val = v => (typeof v === "function" ? v.call(c) : v);
  return val(c.unlocked) !== false && val(c.canClick) ? c : null;
}
function press(layer, id) {
  const c = live(layer, id);
  if (!c) return false;
  window.run(c.onClick, c);
  return true;
}

// Wpłata do boostera: 1 kliknięcie przy deposit = 100% dopełnia poziom, jeśli stać.
// Kolejność: Blessing (6), Hex Point (2), Boon (3), potem pozostałe.
const BOOSTERS = [6, 2, 3, 5, 4, 7];
function depositBoosters() {
  const hbl = window.player.hbl;
  const old = hbl.boosterDeposit;
  let n = 0;
  try {
    hbl.boosterDeposit = 1;
    for (const id of BOOSTERS) {
      const b = hbl.boosters[id - 2];
      if (!b || !live("hbl", id)) continue;
      for (let k = 0; k < 20; k++) {
        const need = b.req.sub(b.xp);
        if (need.lte(0) || hbl.boons.lt(need)) break;
        press("hbl", id);
        n++;
      }
    }
  } finally {
    hbl.boosterDeposit = old;
  }
  return n;
}

export const dreamRealm = {
  id: "dream-realm",
  name: "Dream Realm",
  group: "Hex",
  every: 0,
  description:
    "Gra Dream Realm za Ciebie: provenance → refinement → blessing + wpłaty boonów do boosterów. " +
    "Opcjonalnie sam wchodzi do realmu, dopóki są ukończenia do zdobycia (wejście robi power reset, jak w grze).",
  params: [
    { key: "autoEnter", label: "Sam wchodź do Dream Realm, gdy są ukończenia", type: "bool", default: true },
    { key: "finalSeconds", label: "Blessing awaryjny na tyle s przed końcem", type: "number", default: 2, min: 0, step: 0.5 },
    { key: "boosters", label: "Wpłacaj boony do boosterów", type: "bool", default: true },
  ],
  available: g => g.layerActive("hrm") && Boolean(window.layers.hrm?.challenges?.[DREAM]),
  run(ctx) {
    const p = window.player;
    const ch = window.layers.hrm.challenges[DREAM];
    const done = p.hrm.challenges[DREAM] ?? 0;
    const limit = Number(window.tmp.hrm.challenges[DREAM]?.completionLimit ?? ch.completionLimit());

    if (!window.inChallenge("hrm", DREAM)) {
      if (done >= limit) return ctx.status(`ukończone ${done}/${limit}`);
      if (!ch.canClick()) return ctx.status("Dream Realm zablokowany (brak Might E:0)");
      if (p.hrm.activeChallenge) return ctx.status("jesteś w innym realmie");
      if (!ctx.p.autoEnter) return ctx.status(`czekam na wejście (${done}/${limit})`);
      window.updateTemp();
      window.startChallenge("hrm", DREAM);
      ctx.did();
      ctx.log(`Wejście do Dream Realm (${done}/${limit})`);
      return;
    }

    const goal = ch.goal();
    const left = Number(p.hrm.dreamTimer);
    const fmt = v => window.format(v);
    if (p.hbl.blessings.gte(goal)) {
      return ctx.status(`cel ${fmt(goal)} osiągnięty · koniec za ${left.toFixed(0)} s`);
    }

    if (ctx.p.boosters) depositBoosters();

    // Blessing, gdy domyka cel albo kończy się czas.
    const blessReady = p.hre.refinement.gte(18) && live("hbl", 1);
    if (blessReady && (p.hbl.blessings.add(p.hbl.blessingsGain).gte(goal) || left <= ctx.p.finalSeconds)) {
      press("hbl", 1);
      ctx.did();
    } else if (live("hre", 1)) {
      press("hre", 1);
    } else {
      for (let id = 6; id >= 1; id--) if (press("hpr", id)) break;
    }

    ctx.status(`${left.toFixed(0)} s · ref ${fmt(p.hre.refinement)} · bless ${fmt(p.hbl.blessings)}/${fmt(goal)} ` +
      `(+${fmt(p.hbl.blessingsGain)})`);
  },
};
