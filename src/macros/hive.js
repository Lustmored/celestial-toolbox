// Hive (β): Pollen. Po każdym przyroście pollenu: kupuje dostępne ulepszenia Pollen, potem konwertuje pollen
// w pszczoły, rotując rodzaj przy każdej konwersji. Klika te same przyciski co gracz.

const ROLES = [
  { id: 11, key: "drone", label: "drony" },
  { id: 12, key: "worker", label: "robotnice" },
  { id: 13, key: "queen", label: "królowe" },
  { id: 14, key: "empress", label: "cesarzowe" },
  { id: 15, key: "mutated", label: "mutanty" },
];

export const pollenLoop = {
  id: "pollen-loop",
  name: "Pollen: ulepszenia + konwersja (rotacja)",
  group: "Hive",
  every: 0.1,
  description:
    "Po każdym przyroście pollenu kupuje wszystkie dostępne ulepszenia Pollen, a potem konwertuje pollen w pszczoły, " +
    "za każdym razem w kolejny dostępny rodzaj (drony → robotnice → królowe → …). Jeśli najtańsze niekupione ulepszenie " +
    "kosztuje nie więcej niż podaną liczbę przyrostów, makro wstrzymuje konwersję i zbiera na nie (0 = nigdy nie zbieraj).",
  params: [
    { key: "upgrades", label: "Kupuj ulepszenia Pollen", type: "bool", default: true },
    { key: "convert", label: "Konwertuj pollen w pszczoły", type: "bool", default: true },
    { key: "saveForN", label: "Zbieraj na ulepszenie, jeśli kosztuje ≤ tyle przyrostów", type: "number", default: 5, min: 0, step: 1 },
    { key: "drone", label: "Rotuj: drony", type: "bool", default: true },
    { key: "worker", label: "Rotuj: robotnice", type: "bool", default: true },
    { key: "queen", label: "Rotuj: królowe", type: "bool", default: true },
    { key: "empress", label: "Rotuj: cesarzowe", type: "bool", default: true },
    { key: "mutated", label: "Rotuj: mutanty", type: "bool", default: true },
  ],
  available: g => g.layerActive("bpl") && Boolean(window.player?.bpl),
  run(ctx) {
    const P = window.player, D = window.Decimal, st = ctx.state, bpl = P.bpl;
    const pollen = new D(bpl.pollen);
    const last = st.last !== undefined ? new D(st.last) : null;
    st.last = pollen.toString();
    if (last === null || !pollen.gt(last)) return; // czekamy na przyrost
    const inc = pollen.sub(last);

    // 1. Ulepszenia Pollen (najtańsze najpierw, aż nic nie da się kupić)
    let bought = 0, cheapest = null;
    if (ctx.p.upgrades) {
      for (let guard = 0; guard < 50; guard++) {
        let best = null;
        for (const id of Object.keys(window.layers.bpl.upgrades || {})) {
          if (isNaN(id)) continue;
          const t = window.tmp.bpl.upgrades[id];
          if (!t || !t.unlocked || window.hasUpgrade("bpl", id)) continue;
          const cost = new D(t.cost);
          if (!best || cost.lt(best.cost)) best = { id, cost };
        }
        cheapest = best;
        if (!best || new D(bpl.pollen).lt(best.cost)) break;
        window.buyUpgrade("bpl", best.id);
        if (!window.hasUpgrade("bpl", best.id)) break;
        bought++;
        window.updateTemp?.();
      }
    }

    // 2. Konwersja z rotacją rodzajów
    if (!ctx.p.convert) { if (bought) ctx.did(bought); ctx.status(`kupiono ulepszeń: ${bought}`); return; }
    if (cheapest && ctx.p.saveForN > 0 && cheapest.cost.lte(inc.mul(ctx.p.saveForN)) && new D(bpl.pollen).lt(cheapest.cost)) {
      if (bought) ctx.did(bought);
      ctx.status(`zbieram na ulepszenie: ${window.format(bpl.pollen)} / ${window.format(cheapest.cost)}`);
      return;
    }
    const T = window.tmp.bpl.clickables, L = window.layers.bpl.clickables;
    const ok = ROLES.filter(r => ctx.p[r.key] !== false && T[r.id]?.unlocked !== false && L[r.id]?.canClick?.call(L[r.id]));
    if (!ok.length) { if (bought) ctx.did(bought); ctx.status("brak konwersji do zrobienia"); return; }
    const idx = st.next ?? 0;
    // pierwszy dostępny rodzaj w kolejności rotacji, zaczynając od „następnego”
    let pick = null;
    for (let k = 0; k < ROLES.length && !pick; k++) {
      const r = ROLES[(idx + k) % ROLES.length];
      if (ok.includes(r)) pick = r;
    }
    const gain = new D(P.bpl.roles[pick.key].gain);
    if (ctx.click("bpl", pick.id, { refresh: true })) {
      st.next = (ROLES.indexOf(pick) + 1) % ROLES.length;
      st.last = new D(bpl.pollen).toString();
      ctx.did(bought + 1);
      ctx.status(`+${window.format(gain)} ${pick.label}` + (bought ? ` · kupiono ulepszeń: ${bought}` : ""));
    }
  },
};
