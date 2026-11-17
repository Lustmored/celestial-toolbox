// A1 / Funify — challenge Numbness: pętla resetów apathy.
// Po każdym resecie odkupuje Feature (cp 11–17) i ulepszenia anonymity, kupuje ulepszenia Apathy oraz wybrane
// buyables za numbness, a reset apathy robi na szczycie tempa (apathy z resetu ÷ czas od poprzedniego resetu).
// Klika te same przyciski co gracz.

const NUMB_BUYABLES = [
  { id: 81, key: "doubler", label: "Numbness Doubler" },
  { id: 88, key: "reducer", label: "Challenge Reducer" },
  { id: 89, key: "booster", label: "Apathy Booster" },
];

const D = () => window.Decimal;
const has = (l, id) => window.hasUpgrade(l, id);

function buyUpgradesOf(layer, ids) {
  let n = 0;
  for (const id of ids) {
    if (has(layer, id)) continue;
    const t = window.tmp[layer]?.upgrades?.[id];
    if (!t || t.unlocked === false) continue;
    if (!window.canAffordUpgrade(layer, id)) continue;
    window.buyUpgrade(layer, id);
    if (has(layer, id)) n++;
  }
  return n;
}

function upgradeIds(layer, filter = () => true) {
  return Object.keys(window.layers[layer]?.upgrades || {}).filter(x => !isNaN(x)).map(Number).filter(filter).sort((a, b) => a - b);
}

export const numbnessLoop = {
  id: "numbness-loop",
  name: "Numbness: resety apathy + zakupy",
  group: "A1 / Funify",
  every: 0.25,
  description:
    "Działa tylko w challenge'u Numbness. Po każdym resecie odkupuje Feature I–VII i ulepszenia anonymity, kupuje ulepszenia " +
    "Apathy oraz wybrane buyables za numbness (najtańszy najpierw), a reset apathy robi na szczycie tempa: gdy apathy z resetu " +
    "÷ czas od poprzedniego resetu przez kilka sekund nie przebija najlepszej wartości.",
  params: [
    { key: "features", label: "Odkupuj Feature I–VII", type: "bool", default: true },
    { key: "anonymity", label: "Kupuj ulepszenia anonymity", type: "bool", default: true },
    { key: "apathyUpg", label: "Kupuj ulepszenia Apathy", type: "bool", default: true },
    { key: "doubler", label: "Kupuj Numbness Doubler", type: "bool", default: true },
    { key: "reducer", label: "Kupuj Challenge Reducer", type: "bool", default: true },
    { key: "booster", label: "Kupuj Apathy Booster", type: "bool", default: true },
    { key: "reset", label: "Rób reset apathy", type: "bool", default: true },
    { key: "patience", label: "Szczyt tempa: tyle sekund poniżej najlepszego", type: "number", default: 3, min: 1, step: 1 },
    { key: "minSec", label: "Min. czas runu przed resetem (s)", type: "number", default: 10, min: 1, step: 1 },
  ],
  available: () => Boolean(window.player?.fu && window.inChallenge?.("fu", 12)),
  run(ctx) {
    const P = window.player, Dec = D(), st = ctx.state, now = Date.now() / 1000;
    if (new Dec(P.fu.funifyPause).gt(0)) { ctx.status("reset w toku…"); return; }
    let bought = 0;
    if (ctx.p.features) bought += buyUpgradesOf("cp", [11, 12, 13, 14, 15, 16, 17]);
    if (ctx.p.anonymity && window.layers.an) bought += buyUpgradesOf("an", upgradeIds("an"));
    if (ctx.p.apathyUpg) bought += buyUpgradesOf("fu", upgradeIds("fu", id => id > 100 && id < 200));

    // buyables za numbness: najtańszy dostępny, aż nic nie da się kupić
    for (let guard = 0; guard < 100; guard++) {
      let best = null;
      for (const b of NUMB_BUYABLES) {
        if (!ctx.p[b.key]) continue;
        const t = window.tmp.fu.buyables?.[b.id], L = window.layers.fu.buyables[b.id];
        if (!t || t.unlocked === false || !L) continue;
        if (L.purchaseLimit && window.getBuyableAmount("fu", b.id).gte(L.purchaseLimit.call(L))) continue;
        const cost = new Dec(t.cost);
        if (new Dec(P.fu.numb).lt(cost)) continue;
        if (!best || cost.lt(best.cost)) best = { ...b, cost };
      }
      if (!best) break;
      const before = window.getBuyableAmount("fu", best.id);
      window.buyBuyable("fu", best.id);
      if (!window.getBuyableAmount("fu", best.id).gt(before)) break;
      bought++;
      ctx.log(`${best.label} → ${window.formatWhole(window.getBuyableAmount("fu", best.id))}`);
    }
    if (bought) { ctx.did(bought); window.updateTemp?.(); }

    // reset apathy na szczycie tempa
    st.t0 ??= now; st.best ??= 0; st.below ??= 0;
    const gain = new Dec(P.fu.apathyToGet), sec = now - st.t0;
    const C = window.layers.fu.clickables?.[32];
    const can = C && C.canClick.call(C);
    if (now - (st.sample ?? 0) >= 1) {
      st.sample = now;
      const R = can && sec > 0 ? gain.toNumber() / sec : 0;
      if (R > st.best) { st.best = R; st.below = 0; } else if (can) st.below++;
    }
    const rate = st.best * 60;
    if (ctx.p.reset && can && sec >= ctx.p.minSec && st.best > 0 && st.below >= ctx.p.patience) {
      C.onClick.call(C);
      ctx.did();
      st.runs = (st.runs || 0) + 1;
      ctx.log(`reset apathy: +${window.format(gain)} po ${sec.toFixed(0)} s`);
      st.t0 = now; st.best = 0; st.below = 0;
      ctx.status(`reset #${st.runs}: +${window.format(gain)} apathy (${rate.toFixed(0)}/min)`);
      return;
    }
    ctx.status(`run ${sec.toFixed(0)} s · +${window.format(gain)} apathy` + (st.best ? ` · najlepiej ${rate.toFixed(0)}/min` : "") + (bought ? ` · kupiono ${bought}` : ""));
  },
};
