// Light Rift: automatyczne depozyty (gra tylko sprawdza próg, nic nie zabiera) i wyłączenie Auto-Singularity
// po depozycie singularities — dalej bez resetów fragmenty (w tym Tech) rosną najszybciej.
export const lightRiftDeposit = {
  id: "light-rift-deposit",
  name: "Light Rift: depozyty + wyłączenie Auto-Singularity po singularities",
  group: "Singularity",
  every: 5,
  description:
    "Klika depozyty Light Rift, gdy tylko próg jest osiągnięty (gra nic nie zabiera). Po wpłaceniu singularities " +
    "raz wyłącza Auto-Singularity — bez resetów Core Fragments (także Tech) rosną najszybciej. Możesz je potem włączyć ręcznie.",
  params: [
    { key: "smaOff", label: "Po depozycie singularities wyłącz Auto-Singularity", type: "bool", default: true },
  ],
  available: () => Boolean(window.layers.lightRift?.clickables?.[102]),
  run(ctx) {
    const P = window.player, c = P.lightRift.interspaceConditions, st = ctx.state;
    const names = { 101: "Space Energy", 102: "Singularities", 103: "Stars", 104: "Core Fragments" };
    for (const id of [101, 102, 103, 104]) {
      const k = window.layers.lightRift.clickables[id];
      if (k && window.tmp.lightRift.clickables[id]?.canClick) {
        window.clickClickable("lightRift", id);
        ctx.log(`Light Rift: wpłacono ${names[id]}`); ctx.did();
      }
    }
    if (ctx.p.smaOff && c[1] && !st.smaOffDone) {
      if (P.sma.toggle) { P.sma.toggle = false; ctx.log("Auto-Singularity wyłączone (singularities wpłacone)"); ctx.did(); }
      st.smaOffDone = true;
    }
    ctx.status(`warunki: ${c.filter(Boolean).length}/4` + (c[1] && !c[3] ? " — Tech rośnie bez resetów" : ""));
  },
};
