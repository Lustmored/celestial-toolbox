// Hive (β): Pollen. Kupuje dostępne ulepszenia Pollen, a konwersję pollen → pszczoły robi tuż przed nadejściem
// następnej partii pollenu (pasywny przyrost pszczół liczy się od aktualnego pollenu, więc trzymamy go jak najdłużej).
// Rodzaje, które gra już sama generuje, są pomijane. Klika te same przyciski co gracz.

const H = (l, id) => window.hasUpgrade(l, id);
const ROLES = [
  { id: 11, key: "drone", label: "drony", auto: () => H("al", 103) },
  { id: 12, key: "worker", label: "robotnice", auto: () => H("al", 106) && H("bpl", 13) },
  { id: 13, key: "queen", label: "królowe", auto: () => H("al", 109) && H("bpl", 16) },
  { id: 14, key: "empress", label: "cesarzowe", auto: () => H("al", 124) },
  { id: 15, key: "mutated", label: "mutanty", auto: () => H("n", 92) },
];

function buyPollenUpgrades() {
  const D = window.Decimal, bpl = window.player.bpl;
  let bought = 0, cheapest = null;
  for (let guard = 0; guard < 50; guard++) {
    let best = null;
    for (const id of Object.keys(window.layers.bpl.upgrades || {})) {
      if (isNaN(id)) continue;
      const t = window.tmp.bpl.upgrades[id];
      if (!t || !t.unlocked || H("bpl", id)) continue;
      const cost = new D(t.cost);
      if (!best || cost.lt(best.cost)) best = { id, cost };
    }
    cheapest = best;
    if (!best || new D(bpl.pollen).lt(best.cost)) break;
    window.buyUpgrade("bpl", best.id);
    if (!H("bpl", best.id)) break;
    bought++;
    window.updateTemp?.();
  }
  return { bought, cheapest };
}

export const pollenLoop = {
  id: "pollen-loop",
  name: "Pollen: ulepszenia + konwersja (rotacja)",
  group: "Hive",
  every: 0.05,
  description:
    "Kupuje dostępne ulepszenia Pollen, a pollen konwertuje w pszczoły tuż przed nadejściem następnej partii pollenu — " +
    "do tego czasu pollen leży i napędza pasywny przyrost pszczół. Przy każdej konwersji bierze kolejny rodzaj " +
    "(drony → robotnice → królowe → …), pomijając te, które gra już generuje sama. Jeśli najtańsze niekupione ulepszenie " +
    "kosztuje nie więcej niż podaną liczbę partii, zamiast konwertować zbiera na nie (0 = nigdy).",
  params: [
    { key: "upgrades", label: "Kupuj ulepszenia Pollen", type: "bool", default: true },
    { key: "convert", label: "Konwertuj pollen w pszczoły", type: "bool", default: true },
    { key: "skipAuto", label: "Pomijaj rodzaje generowane automatycznie", type: "bool", default: true },
    { key: "lead", label: "Konwertuj tyle sekund przed partią", type: "number", default: 0.15, min: 0.05, step: 0.05 },
    { key: "everySec", label: "Bez partii (pollen na sekundę): konwertuj co (s)", type: "number", default: 5, min: 0.5, step: 0.5 },
    { key: "saveForN", label: "Zbieraj na ulepszenie, jeśli kosztuje ≤ tyle partii", type: "number", default: 5, min: 0, step: 1 },
    { key: "drone", label: "Rotuj: drony", type: "bool", default: true },
    { key: "worker", label: "Rotuj: robotnice", type: "bool", default: true },
    { key: "queen", label: "Rotuj: królowe", type: "bool", default: true },
    { key: "empress", label: "Rotuj: cesarzowe", type: "bool", default: true },
    { key: "mutated", label: "Rotuj: mutanty", type: "bool", default: true },
  ],
  available: g => g.layerActive("bpl") && Boolean(window.player?.bpl),
  run(ctx) {
    const P = window.player, D = window.Decimal, st = ctx.state, bpl = P.bpl;
    const { bought, cheapest } = ctx.p.upgrades ? buyPollenUpgrades() : { bought: 0, cheapest: null };
    if (bought) ctx.did(bought);
    if (!ctx.p.convert) { ctx.status(`kupiono ulepszeń: ${bought}`); return; }

    // Kiedy konwertować: tuż przed końcem bieżącej partii (timer), albo co X s, gdy pollen leci na sekundę.
    const perSec = H("al", 112);
    const batch = new D(bpl.pollenGain);
    let due, left;
    if (!perSec) {
      left = new D(bpl.pollenTimerMax).sub(bpl.pollenTimer).toNumber();
      due = left <= ctx.p.lead;
      // ta sama partia: nie konwertujemy drugi raz, zanim nie przyjdzie nowa
      if (due && st.doneAt !== undefined && Number(bpl.pollenTimer) >= st.doneAt) due = false;
      if (!due && st.doneAt !== undefined && Number(bpl.pollenTimer) < st.doneAt) st.doneAt = undefined;
    } else {
      left = ctx.p.everySec - (Date.now() - (st.lastConv || 0)) / 1000;
      due = left <= 0;
    }
    if (!due) {
      ctx.status(`pollen ${window.format(bpl.pollen)} · konwersja za ${Math.max(0, left).toFixed(1)} s` + (bought ? ` · kupiono ulepszeń: ${bought}` : ""));
      return;
    }
    if (cheapest && ctx.p.saveForN > 0 && cheapest.cost.lte(batch.mul(ctx.p.saveForN)) && new D(bpl.pollen).lt(cheapest.cost)) {
      if (!perSec) st.doneAt = Number(bpl.pollenTimer); else st.lastConv = Date.now();
      ctx.status(`zbieram na ulepszenie: ${window.format(bpl.pollen)} / ${window.format(cheapest.cost)}`);
      return;
    }
    const T = window.tmp.bpl.clickables, L = window.layers.bpl.clickables;
    const ok = ROLES.filter(r => ctx.p[r.key] !== false && !(ctx.p.skipAuto && r.auto())
      && T[r.id]?.unlocked !== false && L[r.id]?.canClick?.call(L[r.id]));
    if (!ok.length) { ctx.status("nic do konwersji (wszystko zautomatyzowane albo za mało pollenu)"); return; }
    const idx = st.next ?? 0;
    let pick = null;
    for (let k = 0; k < ROLES.length && !pick; k++) {
      const r = ROLES[(idx + k) % ROLES.length];
      if (ok.includes(r)) pick = r;
    }
    const gain = new D(P.bpl.roles[pick.key].gain);
    if (ctx.click("bpl", pick.id, { refresh: true })) {
      st.next = (ROLES.indexOf(pick) + 1) % ROLES.length;
      if (!perSec) st.doneAt = Number(bpl.pollenTimer); else st.lastConv = Date.now();
      ctx.did();
      ctx.status(`+${window.format(gain)} ${pick.label}` + (bought ? ` · kupiono ulepszeń: ${bought}` : ""));
    }
  },
};

// Nectar: łańcuch resetów (pszczoły → α → β → γ → δ → …). Każdy reset zeruje niższe poziomy, więc robimy klasyczną
// regułę „resetuj, gdy zysk ≥ R × to, co już masz na tym poziomie” — od najwyższego poziomu w dół, jeden reset na takt.
const NECTAR = ["alpha", "beta", "gamma", "delta", "epsilon", "zeta"];
const NECTAR_SYM = ["α", "β", "γ", "δ", "ε", "ζ"];
// Poziomy, które gra już sama generuje (pasywny przyrost) — ich resetów nie klikamy.
const NECTAR_AUTO = [
  () => H("al", 203),
  () => H("al", 206) && H("ne", 103),
  () => H("al", 209) && H("ne", 203),
  () => H("al", 212) && H("ne", 303),
  () => H("al", 221) && H("ne", 403),
  () => H("n", 92),
];

export const nectarLoop = {
  id: "nectar-loop",
  name: "Nectar: ulepszenia + resety",
  group: "Hive",
  every: 0.1,
  description:
    "Kupuje dostępne ulepszenia Nectar, a potem robi reset na najwyższym poziomie, na którym zysk jest co najmniej " +
    "R razy większy od tego, co już na nim masz (domyślnie R = 0,25 — najlepsze w testach; 1 = reset podwaja stan). Gdy na danym poziomie masz 0, " +
    "resetuje od razu, jak tylko się da. Jeden reset na takt, od góry w dół. Poziomy, które gra już generuje sama, są pomijane.",
  params: [
    { key: "upgrades", label: "Kupuj ulepszenia Nectar", type: "bool", default: true },
    { key: "ratio2", label: "R: resetuj, gdy zysk ≥ R × stan", type: "number", default: 0.25, min: 0.05, step: 0.05 },
    { key: "skipAuto", label: "Pomijaj poziomy generowane automatycznie", type: "bool", default: true },
    { key: "lowerFirst", label: "Ile resetów niższego poziomu przed resetem wyższego", type: "number", default: 5, min: 1, step: 1 },
    { key: "minGap2", label: "Min. odstęp między resetami (s)", type: "number", default: 0.1, min: 0.05, step: 0.05 },
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
      if (ctx.p.skipAuto && NECTAR_AUTO[k - 1]()) continue;
      const gain = new D(ne[key].gain), have = new D(ne[key].amount);
      if (gain.lte(0) || gain.lt(have.mul(ctx.p.ratio2))) continue;
      // Wyższy poziom dopiero po kilku resetach poziomu niżej (empirycznie dużo wydajniej niż od razu po jednym).
      const cnt = ctx.state.cnt || (ctx.state.cnt = {});
      // (gdy niższy poziom jest automatyczny, nie klikamy go wcale — wtedy nie czekamy na jego resety)
      if (k > 1 && !(ctx.p.skipAuto && NECTAR_AUTO[k - 2]()) && (cnt[k - 1] || 0) < ctx.p.lowerFirst) continue;
      if (Date.now() - (ctx.state.lastReset || 0) < ctx.p.minGap2 * 1000) { ctx.status(`czekam na odstęp między resetami`); return; }
      ctx.state.lastReset = Date.now();
      { const cnt = ctx.state.cnt || (ctx.state.cnt = {}); cnt[k] = (cnt[k] || 0) + 1; for (let j = 1; j < k; j++) cnt[j] = 0; }
      c.onClick.call(c);
      ctx.did(bought + 1);
      ctx.status(`reset ${NECTAR_SYM[k - 1]}: +${window.format(gain)} (miałeś ${window.format(have)})` + (bought ? ` · ulepszeń: ${bought}` : ""));
      return;
    }
    if (bought) ctx.did(bought);
    ctx.status(`czekam · α ${window.format(ne.alpha.amount)} (+${window.format(ne.alpha.gain)})` + (bought ? ` · ulepszeń: ${bought}` : ""));
  },
};

// Kwiaty (fl): siatka 5×5; każdy kwiat ma „HP”, kliknięcie odejmuje Picking Power, a kliknięcie przy HP ≤ 0 go zbiera.
// Makro klika każdy kwiat na siatce raz na takt — dokładnie to, co robi kliknięcie myszą.
export const flowerPicker = {
  id: "flower-picker",
  name: "Kwiaty: zbieranie",
  group: "Hive",
  every: 0.1,
  description:
    "Co takt klika raz każdy kwiat na siatce (tak jak kliknięcie myszą): zbija mu licznik o Picking Power, " +
    "a gdy licznik spadnie do zera — zbiera go do glosariusza.",
  params: [
    { key: "cps", label: "Kliknięć na kwiat na sekundę", type: "number", default: 10, min: 1, max: 10, step: 1 },
  ],
  available: g => g.layerActive("fl") && Boolean(window.layers?.fl?.grid),
  run(ctx) {
    const st = ctx.state, now = Date.now();
    if (now - (st.last || 0) < 1000 / Math.max(1, Math.min(10, ctx.p.cps)) - 5) return;
    st.last = now;
    const grid = window.layers.fl.grid;
    let clicks = 0, picked = 0;
    for (let r = 1; r <= 5; r++) {
      for (let c = 1; c <= 5; c++) {
        const id = r * 100 + c;
        const v = window.getGridData("fl", id);
        if (!v || v[0] == 0) continue;
        grid.onClick(v, id);
        clicks++;
        if (window.getGridData("fl", id)[0] == 0) picked++;
      }
    }
    if (picked) { st.picked = (st.picked || 0) + picked; ctx.did(picked); }
    ctx.status(clicks ? `kwiatów na siatce: ${clicks} · zebrano łącznie: ${st.picked || 0}` : `czekam na kwiaty · zebrano łącznie: ${st.picked || 0}`);
  },
};
