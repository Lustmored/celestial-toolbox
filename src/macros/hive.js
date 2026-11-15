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

// Nectar: łańcuch resetów (pszczoły → α → β → γ → δ → …). Każdy reset zeruje niższe poziomy, więc robimy klasyczną
// regułę „resetuj, gdy zysk ≥ R × to, co już masz na tym poziomie” — od najwyższego poziomu w dół, jeden reset na takt.
const NECTAR = ["alpha", "beta", "gamma", "delta", "epsilon", "zeta"];
const NECTAR_SYM = ["α", "β", "γ", "δ", "ε", "ζ"];

export const nectarLoop = {
  id: "nectar-loop",
  name: "Nectar: ulepszenia + resety",
  group: "Hive",
  every: 0.2,
  description:
    "Kupuje dostępne ulepszenia Nectar, a potem robi reset na najwyższym poziomie, na którym zysk jest co najmniej " +
    "R razy większy od tego, co już na nim masz (domyślnie R = 0,25 — najlepsze w testach; 1 = reset podwaja stan). Gdy na danym poziomie masz 0, " +
    "resetuje od razu, jak tylko się da. Jeden reset na takt, od góry w dół.",
  params: [
    { key: "upgrades", label: "Kupuj ulepszenia Nectar", type: "bool", default: true },
    { key: "ratio2", label: "R: resetuj, gdy zysk ≥ R × stan", type: "number", default: 0.25, min: 0.05, step: 0.05 },
    { key: "minGap", label: "Min. odstęp między resetami (s)", type: "number", default: 1, min: 0.2, step: 0.2 },
    { key: "maxTier", label: "Najwyższy poziom do resetowania (1 = tylko α)", type: "number", default: 6, min: 1, max: 6, step: 1 },
  ],
  available: g => g.layerActive("ne") && Boolean(window.player?.ne?.alpha),
  run(ctx) {
    const P = window.player, D = window.Decimal, ne = P.ne;
    let bought = 0;
    if (ctx.p.upgrades) {
      for (let pass = 0; pass < 5; pass++) {
        let any = false;
        for (const id of Object.keys(window.layers.ne.upgrades || {})) {
          if (isNaN(id) || window.hasUpgrade("ne", id)) continue;
          const t = window.tmp.ne.upgrades[id];
          if (!t || !t.unlocked) continue;
          if (window.canAffordUpgrade && !window.canAffordUpgrade("ne", id)) continue;
          window.buyUpgrade("ne", id);
          if (window.hasUpgrade("ne", id)) { bought++; any = true; }
        }
        if (!any) break;
        window.updateTemp?.();
      }
    }
    const L = window.layers.ne.clickables, T = window.tmp.ne.clickables;
    for (let k = Math.min(6, ctx.p.maxTier); k >= 1; k--) {
      const key = NECTAR[k - 1], c = L[k];
      if (!c || !ne[key] || T[k]?.unlocked === false || !c.canClick.call(c)) continue;
      const gain = new D(ne[key].gain), have = new D(ne[key].amount);
      if (gain.lte(0) || gain.lt(have.mul(ctx.p.ratio2))) continue;
      if (Date.now() - (ctx.state.lastReset || 0) < ctx.p.minGap * 1000) { ctx.status(`czekam na odstęp między resetami`); return; }
      ctx.state.lastReset = Date.now();
      c.onClick.call(c);
      ctx.did(bought + 1);
      ctx.status(`reset ${NECTAR_SYM[k - 1]}: +${window.format(gain)} (miałeś ${window.format(have)})` + (bought ? ` · ulepszeń: ${bought}` : ""));
      return;
    }
    if (bought) ctx.did(bought);
    ctx.status(`czekam · α ${window.format(ne.alpha.amount)} (+${window.format(ne.alpha.gain)})` + (bought ? ` · ulepszeń: ${bought}` : ""));
  },
};
