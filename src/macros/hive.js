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
  name: "Pollen + Bee Bread: ulepszenia, konwersja, resety",
  group: "Hive",
  every: 0.05,
  description:
    "Kupuje dostępne ulepszenia Pollen, a pollen konwertuje w pszczoły tuż przed nadejściem następnej partii pollenu — " +
    "do tego czasu pollen leży i napędza pasywny przyrost pszczół. Przy każdej konwersji bierze kolejny rodzaj " +
    "(drony → robotnice → królowe → …), pomijając te, które gra już generuje sama. Jeśli najtańsze niekupione ulepszenie " +
    "kosztuje nie więcej niż podaną liczbę partii, zamiast konwertować zbiera na nie (0 = nigdy). " +
    "Bee Bread: reset na szczycie tempa cyklu (przyrost BB/s z resetu ÷ czas od ostatniego resetu). Tier BB — od razu, gdy dostępny.",
  params: [
    { key: "upgrades", label: "Kupuj ulepszenia Pollen", type: "bool", default: true },
    { key: "convert", label: "Konwertuj pollen w pszczoły", type: "bool", default: true },
    { key: "skipAuto", label: "Pomijaj rodzaje generowane automatycznie", type: "bool", default: true },
    { key: "lead", label: "Konwertuj tyle sekund przed partią", type: "number", default: 0.15, min: 0.05, step: 0.05 },
    { key: "everySec", label: "Bez partii (pollen na sekundę): konwertuj co (s)", type: "number", default: 5, min: 0.5, step: 0.5 },
    { key: "saveForN", label: "Zbieraj na ulepszenie, jeśli kosztuje ≤ tyle partii", type: "number", default: 5, min: 0, step: 1 },
    { key: "bbMode", label: "Bee Bread: reset", type: "select", default: "peak",
      options: [["off", "nie rób"], ["peak", "na szczycie tempa cyklu"]] },
    { key: "bbJump", label: "Bee Bread: reset od razu, gdy da ≥ tyle × obecne BB/s (0 = wyłącz)", type: "number", default: 3, min: 0, step: 1 },
    { key: "bbPatience", label: "Szczyt tempa: ile partii z rzędu poniżej najlepszego", type: "number", default: 3, min: 1, step: 1 },
    { key: "bbTier", label: "Bee Bread: tier od razu, gdy dostępny", type: "bool", default: true },
    { key: "drone", label: "Rotuj: drony", type: "bool", default: true },
    { key: "worker", label: "Rotuj: robotnice", type: "bool", default: true },
    { key: "queen", label: "Rotuj: królowe", type: "bool", default: true },
    { key: "empress", label: "Rotuj: cesarzowe", type: "bool", default: true },
    { key: "mutated", label: "Rotuj: mutanty", type: "bool", default: true },
  ],
  available: g => g.layerActive("bpl") && Boolean(window.player?.bpl),
  run(ctx) {
    const P = window.player, D = window.Decimal, st = ctx.state, bpl = P.bpl;

    // Tier Bee Bread — zawsze, gdy tylko dostępny.
    const BBC = window.layers.bb?.clickables;
    if (ctx.p.bbTier && BBC?.[12]?.canClick?.call(BBC[12])) {
      BBC[12].onClick.call(BBC[12]);
      ctx.did(); ctx.log(`tier Bee Bread → ${window.format(P.bb.breadTier)}`);
      st.phase = "build"; st.cycleT = 0; st.bestR = 0; st.below = 0;
    }
    const bbOn = ctx.p.bbMode !== "off" && BBC?.[11];
    st.phase ??= "build"; st.cycleT ??= 0;
    const harvesting = bbOn && ctx.p.bbMode === "harvest" && st.phase === "harvest";

    // W fazie zbierania nie kupujemy ulepszeń Pollen — reset BB i tak je zabierze.
    const { bought, cheapest } = ctx.p.upgrades && !harvesting ? buyPollenUpgrades() : { bought: 0, cheapest: null };
    if (bought) ctx.did(bought);
    if (!ctx.p.convert && !bbOn) { ctx.status(`kupiono ulepszeń: ${bought}`); return; }

    // Moment decyzji: tuż przed końcem bieżącej partii (timer), albo co X s, gdy pollen leci na sekundę.
    const perSec = H("al", 112);
    const batch = new D(bpl.pollenGain);
    let due, left;
    if (!perSec) {
      left = new D(bpl.pollenTimerMax).sub(bpl.pollenTimer).toNumber();
      due = left <= ctx.p.lead;
      if (due && st.doneAt !== undefined && Number(bpl.pollenTimer) >= st.doneAt) due = false;
      if (!due && st.doneAt !== undefined && Number(bpl.pollenTimer) < st.doneAt) st.doneAt = undefined;
    } else {
      left = ctx.p.everySec - (Date.now() - (st.lastConv || 0)) / 1000;
      due = left <= 0;
    }
    const tag = bbOn ? (harvesting ? "[zbieranie] " : "[budowa] ") : "";
    if (!due) {
      ctx.status(`${tag}pollen ${window.format(bpl.pollen)} · decyzja za ${Math.max(0, left).toFixed(1)} s` + (bought ? ` · kupiono ulepszeń: ${bought}` : ""));
      return;
    }
    const markDone = () => { if (!perSec) st.doneAt = Number(bpl.pollenTimer); else st.lastConv = Date.now(); };
    // czas cyklu liczony w partiach (działa tak samo w grze i w symulacji)
    st.cycleT += perSec ? ctx.p.everySec : Number(bpl.pollenTimerMax);

    // Bee Bread: tempo cyklu R = przyrost BB/s z resetu teraz / czas cyklu. Budowa trwa, dopóki R rośnie (R liczone z pollenu
    // jednej partii); po szczycie albo resetujemy („peak”), albo przestajemy konwertować i zbieramy pollen, aż R znów
    // przestanie rosnąć („harvest”) — przy zysku ~√pollen opłaca się zbierać mniej więcej tyle, ile trwała budowa.
    if (bbOn) {
      const can = BBC[11].canClick.call(BBC[11]);
      const R = can ? new D(P.bb.beeBreadGain).div(st.cycleT).toNumber() : 0;
      st.bestR ??= 0; st.below ??= 0;
      if (R > st.bestR) { st.bestR = R; st.below = 0; } else if (can) st.below++;
      const need = st.phase === "harvest" ? 1 : ctx.p.bbPatience;
      // Druga reguła: reset, gdy dałby ≥ X × obecne BB/s (BB napędza resztę, więc duży skok opłaca się od razu,
      // nawet jeśli tempo cyklu jeszcze rośnie — np. +2500/s przy obecnych 0,01/s).
      const jump = can && ctx.p.bbJump > 0 && new D(P.bb.beeBreadGain).gte(new D(P.bb.beeBreadPerSecond).mul(ctx.p.bbJump)) && new D(P.bb.beeBreadGain).gt(0);
      const peaked = (can && st.bestR > 0 && st.below >= need) || jump;
      const resetBB = () => {
        const g = new D(P.bb.beeBreadGain);
        BBC[11].onClick.call(BBC[11]);
        ctx.did(); ctx.log(`reset Bee Bread: +${window.format(g)} BB/s po ${st.cycleT.toFixed(0)} s cyklu`);
        st.phase = "build"; st.cycleT = 0; st.bestR = 0; st.below = 0; markDone();
        ctx.status(`reset Bee Bread: +${window.format(g)} BB/s`);
      };
      if (peaked && (ctx.p.bbMode === "peak" || st.phase === "harvest")) { resetBB(); return; }
      if (peaked && ctx.p.bbMode === "harvest" && st.phase === "build") {
        st.phase = "harvest"; st.below = 0; markDone();
        ctx.log("Bee Bread: koniec budowy, zbieram pollen");
        ctx.status(`[zbieranie] start · reset dałby +${window.format(P.bb.beeBreadGain)} BB/s`);
        return;
      }
      if (harvesting) { markDone(); ctx.status(`[zbieranie] pollen ${window.format(bpl.pollen)} · reset dałby +${window.format(P.bb.beeBreadGain)} BB/s`); return; }
      if (!ctx.p.convert) { markDone(); return; }
    }

    if (cheapest && ctx.p.saveForN > 0 && cheapest.cost.lte(batch.mul(ctx.p.saveForN)) && new D(bpl.pollen).lt(cheapest.cost)) {
      markDone();
      ctx.status(`${tag}zbieram na ulepszenie: ${window.format(bpl.pollen)} / ${window.format(cheapest.cost)}`);
      return;
    }
    const T = window.tmp.bpl.clickables, L = window.layers.bpl.clickables;
    const ok = ROLES.filter(r => ctx.p[r.key] !== false && !(ctx.p.skipAuto && r.auto())
      && T[r.id]?.unlocked !== false && L[r.id]?.canClick?.call(L[r.id]));
    if (!ok.length) { markDone(); ctx.status(`${tag}nic do konwersji`); return; }
    const idx = st.next ?? 0;
    let pick = null;
    for (let k = 0; k < ROLES.length && !pick; k++) {
      const r = ROLES[(idx + k) % ROLES.length];
      if (ok.includes(r)) pick = r;
    }
    const gain = new D(P.bpl.roles[pick.key].gain);
    if (ctx.click("bpl", pick.id, { refresh: true })) {
      st.next = (ROLES.indexOf(pick) + 1) % ROLES.length;
      markDone();
      ctx.did();
      ctx.status(`${tag}+${window.format(gain)} ${pick.label}` + (bought ? ` · kupiono ulepszeń: ${bought}` : ""));
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
  name: "Nectar + Honey: ulepszenia, resety",
  group: "Hive",
  every: 0.1,
  description:
    "Kupuje dostępne ulepszenia Nectar, a potem robi reset na najwyższym poziomie, na którym zysk jest co najmniej " +
    "R razy większy od tego, co już na nim masz (domyślnie R = 0,25 — najlepsze w testach; 1 = reset podwaja stan). Gdy na danym poziomie masz 0, " +
    "resetuje od razu, jak tylko się da. Jeden reset na takt, od góry w dół. Poziomy, które gra już generuje sama, są pomijane. " +
    "Honey: kupuje ulepszenia Honey i robi reset za honey-cells na szczycie tempa cyklu (honey-cells z resetu ÷ czas od poprzedniego).",
  params: [
    { key: "upgrades", label: "Kupuj ulepszenia Nectar", type: "bool", default: true },
    { key: "ratio2", label: "R: resetuj, gdy zysk ≥ R × stan", type: "number", default: 0.25, min: 0.05, step: 0.05 },
    { key: "skipAuto", label: "Pomijaj poziomy generowane automatycznie", type: "bool", default: true },
    { key: "researchPause", label: "Pauza na badanie Hive: maks. czas czekania (s, 0 = nie pauzuj)", type: "number", default: 60, min: 0, step: 10 },
    { key: "researchProbe", label: "Pauza na badanie: próbuj, gdy przy stałym BPS brakuje ≤ tyle × maks. czasu", type: "number", default: 10, min: 1, step: 1 },
    { key: "cellMode", label: "Honey-cells: reset", type: "select", default: "peak",
      options: [["off", "nie rób"], ["peak", "na szczycie tempa cyklu"]] },
    { key: "cellJump", label: "Honey-cells: reset od razu, gdy da ≥ tyle × obecne cells (0 = wyłącz)", type: "number", default: 10, min: 0, step: 1 },
    { key: "cellPatience", label: "Honey-cells: szczyt = tyle sekund poniżej najlepszego tempa", type: "number", default: 5, min: 1, step: 1 },
    { key: "honeyUpg", label: "Kupuj ulepszenia Honey", type: "bool", default: true },
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
    // Badania Hive kosztują pszczoły, a każdy reset nektaru (i Honey) zeruje pszczoły. Gdy następne badanie wygląda na
    // osiągalne, wstrzymujemy resety, aż pszczoły się uzbierają, i kupujemy je. W czasie pauzy BPS szybko rośnie, więc:
    //  - pauzę próbujemy już wtedy, gdy przy STAŁYM BPS brakowałoby ≤ N × „próba” sekund,
    //  - w trakcie mierzymy tempo wzrostu BPS (g na sekundę) i liczymy czas z uwzględnieniem wzrostu:
    //    pszczoły(t) = pszczoły + BPS·(gᵗ − 1)/ln g; jeśli i tak wychodzi > N s, przerywamy pauzę na 30 s.
    // Duży skok honey-cells ma pierwszeństwo przed pauzą na badanie (inaczej seria pauz potrafi blokować reset Honey bardzo długo).
    const HC0 = window.layers.ho?.clickables?.[1];
    const honeyJump = ctx.p.cellMode === "peak" && ctx.p.cellJump > 0 && HC0 && window.tmp.ho?.layerShown && HC0.canClick.call(HC0)
      && new D(P.ho.cellGain).gt(0) && new D(P.ho.cellGain).gte(new D(P.ho.cell).mul(ctx.p.cellJump));
    if (ctx.p.researchPause > 0 && !window.hasMilestone?.("n", 16) && !honeyJump) {
      const rs = ctx.state.rp || (ctx.state.rp = { active: false, until: 0 });
      const now = ctx.gameTime ? ctx.gameTime() : Date.now() / 1000;
      const r = nextResearch();
      if (r && r.affordable) {
        const n = buyResearch();
        if (n) { ctx.did(n); ctx.log(`badania Hive: +${n}` + (rs.active ? ` po ${(now - rs.start).toFixed(0)} s pauzy` : "")); }
        rs.active = false;
      }
      const r2 = nextResearch();
      if (!r2 || r2.affordable) rs.active = false;
      else {
        const bps = new D(P.bee.bps), need = r2.cost.sub(P.bee.bees);
        const lin = bps.gt(0) ? need.div(bps).toNumber() : Infinity;
        if (!rs.active && now >= rs.until && lin <= ctx.p.researchPause * ctx.p.researchProbe) {
          if (!(now - (rs.lastActive ?? -1e9) <= 10)) rs.since = now; // nowa seria pauz
          Object.assign(rs, { active: true, start: now, t: now, bps: bps.toNumber(), g: 1 });
        }
        if (rs.active) {
          if (now - rs.t >= 1) {
            const b = bps.toNumber();
            if (rs.bps > 0 && b > 0) rs.g = Math.max(1, Math.pow(b / rs.bps, 1 / (now - rs.t)));
            rs.t = now; rs.bps = b;
          }
          const lg = Math.log(rs.g);
          const eta = lg > 1e-6 && bps.gt(0)
            ? Math.log(1 + need.toNumber() * lg / bps.toNumber()) / lg
            : lin;
          rs.since ??= rs.start; rs.lastActive = now;
          if (now - rs.since > ctx.p.researchPause * 3) { // seria pauz trwa za długo — dajmy resetom 30 s
            rs.active = false; rs.until = now + 30; rs.since = undefined;
            ctx.log("seria pauz na badania za długa — 30 s resetów");
          } else if (now - rs.start >= 3 && !(eta <= ctx.p.researchPause)) {
            rs.active = false; rs.until = now + 30;
            ctx.log(`pauza na badanie przerwana (prognoza ${isFinite(eta) ? Math.ceil(eta) + " s" : "∞"})`);
          } else {
            ctx.status(`pauza na badanie Hive: ${window.format(P.bee.bees)} / ${window.format(r2.cost)} pszczół · ` +
              `BPS ×${rs.g.toFixed(2)}/s · ~${isFinite(eta) ? Math.ceil(eta) : "?"} s`);
            return;
          }
        }
      }
    }

    // Honey: ulepszenia (jeśli gra nie kupuje ich sama) i reset za honey-cells na szczycie tempa cyklu
    // (tempo = honey-cells z resetu teraz ÷ czas od poprzedniego resetu; próbka co 1 s).
    if (ctx.p.honeyUpg && window.layers.ho && !(H("al", 218) && P.bee.path == 2)) {
      for (const id of [1, 2, 3, 4, 5, 6]) {
        if (H("ho", id) || !window.tmp.ho?.upgrades?.[id]?.unlocked) continue;
        if (window.canAffordUpgrade("ho", id)) { window.buyUpgrade("ho", id); if (H("ho", id)) { ctx.did(); ctx.log(`Honey ${id}`); } }
      }
    }
    const HC = window.layers.ho?.clickables?.[1];
    if (ctx.p.cellMode === "peak" && HC && window.tmp.ho?.layerShown) {
      const st = ctx.state, now = ctx.gameTime ? ctx.gameTime() : Date.now() / 1000;
      st.cellT0 ??= now; st.cellBest ??= 0; st.cellBelow ??= 0;
      if (now - (st.cellSample ?? 0) >= 1) {
        st.cellSample = now;
        const can = HC.canClick.call(HC);
        const R = can ? new D(P.ho.cellGain).div(Math.max(1, now - st.cellT0)).toNumber() : 0;
        if (R > st.cellBest) { st.cellBest = R; st.cellBelow = 0; } else if (can) st.cellBelow++;
        // Druga reguła: reset, gdy dałby ≥ X × obecne honey-cells. Nektar rośnie wykładniczo, więc samo „tempo cyklu”
        // potrafi rosnąć bez końca, choć reset dałby już wielokrotność wszystkich cells.
        const jump = can && ctx.p.cellJump > 0 && new D(P.ho.cellGain).gte(new D(P.ho.cell).mul(ctx.p.cellJump)) && new D(P.ho.cellGain).gt(0);
        if ((can && st.cellBest > 0 && st.cellBelow >= ctx.p.cellPatience) || jump) {
          const g = new D(P.ho.cellGain);
          HC.onClick.call(HC);
          ctx.did(); ctx.log(`reset Honey: +${window.format(g)} honey-cells po ${(now - st.cellT0).toFixed(0)} s`);
          st.cellT0 = now; st.cellBest = 0; st.cellBelow = 0; st.cnt = {};
          ctx.status(`reset Honey: +${window.format(g)} honey-cells`);
          return;
        }
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


/** Najtańsze niekupione (odblokowane, poniżej limitu) badanie Hive: {id, cost, affordable}. */
function nextResearch() {
  const D = window.Decimal, B = window.layers.bee?.buyables;
  if (!B) return null;
  let best = null;
  for (const id of Object.keys(B)) {
    if (isNaN(id)) continue;
    const b = B[id], t = window.tmp.bee.buyables[id];
    if (!t || !t.unlocked) continue;
    if (b.purchaseLimit && window.getBuyableAmount("bee", id).gte(b.purchaseLimit.call(b))) continue;
    const cost = new D(b.cost.call(b));
    if (!best || cost.lt(best.cost)) best = { id, cost };
  }
  if (best) best.affordable = new D(window.player.bee.bees).gte(best.cost);
  return best;
}

/** Kupuje badania Hive, najtańsze najpierw, aż nic nie da się kupić. Zwraca liczbę zakupów. */
function buyResearch() {
  let n = 0;
  for (let guard = 0; guard < 300; guard++) {
    const r = nextResearch();
    if (!r || !r.affordable) break;
    const before = window.getBuyableAmount("bee", r.id);
    window.buyBuyable("bee", r.id);
    if (!window.getBuyableAmount("bee", r.id).gt(before)) break;
    n++;
  }
  return n;
}

// Hive research (warstwa bee): kupuje dostępne badania za pszczoły, najtańsze najpierw, aż nic nie da się kupić.
export const hiveResearch = {
  id: "hive-research",
  name: "Hive research: kupowanie",
  group: "Hive",
  every: 0.5,
  description:
    "Kupuje dostępne badania Hive (za pszczoły), zawsze najtańsze najpierw, aż nic więcej nie da się kupić. " +
    "Gdy gra sama zacznie je kupować, makro nic nie robi.",
  available: g => g.layerActive("bee") && Boolean(window.layers?.bee?.buyables),
  run(ctx) {
    if (window.hasMilestone?.("n", 16)) { ctx.status("gra kupuje badania sama"); return; }
    const n = buyResearch();
    if (n) { ctx.did(n); ctx.log(`kupiono badań: ${n}`); }
    ctx.status(`badania łącznie: ${window.format(window.player.bee.totalResearch)}` + (n ? ` · teraz +${n}` : ""));
  },
};

// Twigs: jak gracz z wciśniętą myszką — „trzyma” kursor na jednym drzewie naraz (onHold gry, 0,05 × obrażenia na takt),
// najpierw najwyższy tier, przy remisie to najbliższe pęknięcia. Nic nie kupuje.
export const twigCollector = {
  id: "twig-collector",
  name: "Twigs: łamanie drzew",
  group: "Hive",
  every: 0,
  description:
    "W każdej klatce gry przytrzymuje kursor na jednym drzewie (tak jak wciśnięta mysz — ten sam efekt przytrzymania z gry), " +
    "zaczynając od najwyższego tieru; przy remisie bierze drzewo najbliższe złamania. Ulepszeń nie kupuje.",
  params: [],
  available: g => g.layerActive("tw") && Boolean(window.layers?.tw?.grid?.onHold),
  run(ctx) {
    const grid = window.layers.tw.grid, st = ctx.state;
    let best = null, n = 0;
    for (let r = 1; r <= 5; r++) {
      for (let c = 1; c <= 8; c++) {
        const id = r * 100 + c, v = window.getGridData("tw", id);
        if (!v || !(v[0] > 0)) continue;
        n++;
        const tier = new window.Decimal(v[1]), hp = new window.Decimal(v[2]);
        if (!best || tier.gt(best.tier) || (tier.eq(best.tier) && hp.lt(best.hp))) best = { id, tier, hp };
      }
    }
    if (best) {
      grid.onHold(window.getGridData("tw", best.id), best.id);
      if (window.getGridData("tw", best.id)[2].lte(0)) { st.broken = (st.broken || 0) + 1; ctx.did(); }
    }
    if (Date.now() - (st.sLast || 0) > 500) {
      st.sLast = Date.now();
      ctx.status(best ? `drzew: ${n} · łamię tier ${window.formatWhole(best.tier)} · złamane: ${st.broken || 0}` : `czekam na drzewa · złamane: ${st.broken || 0}`);
    }
  },
};
