export const hexVexes = {
  id: "hex-vexes",
  name: "Hex of Vexes",
  group: "Hex",
  every: 0.15,
  description:
    "Kupuje kolejny brakujący upgrade Vex wg listy priorytetów. Gdy nie da się kupić, robi Vex reset, " +
    "dopóki łączna liczba Vexów jest poniżej limitu. Nie robi respeców.",
  params: [
    { key: "priority", label: "Kolejność upgrade'ów", type: "text", default: "13 22 11 33 21 12 43 31 23 42 52 32 61 41 51 62 53 63" },
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
