// Punchcards (DU1) i wejście do Starmetal Alloy.

const hasCard = id => window.getLevelableTier("pu", id, true) === true;

export const casinoKiller = {
  id: "casino-killer",
  name: "Casino Killer",
  group: "Darkness / SMA",
  every: 0.05,
  description:
    "Dopóki są zapisane wybory punchcardów, aktywuje kolejne brakujące karty z listy priorytetów dla bieżącego trybu " +
    "(Eclipse / SMA / zwykłe Darkness) zamiast wylosowanych — kilka naraz, jeśli wyborów starczy. " +
    "Obsługuje karty o koszcie 1 wyboru (ID < 400). Gdy karty nie da się aktywować, przywraca wylosowany wybór.",
  params: [
    { key: "sma", label: "Priorytet w SMA", type: "text", default: "301 201 302 300" },
    { key: "eclipse", label: "Priorytet w Eclipse", type: "text", default: "201" },
    { key: "darkness", label: "Priorytet w Darkness", type: "text", default: "301 201" },
    { key: "maxPerRun", label: "Maks. kart na jedno uruchomienie", type: "number", default: 10, min: 1, step: 1 },
  ],
  available: g => g.layerActive("pu") && Boolean(window.layers.pu?.clickables?.[10]),
  run(ctx) {
    const pu = window.player.pu;
    const inEclipse = Boolean(window.player.pet?.legPetTimers?.[0]?.active);
    const inSMA = Boolean(window.player.sma?.inStarmetalChallenge) && !inEclipse;
    const mode = inEclipse ? "eclipse" : inSMA ? "sma" : "darkness";
    const wanted = ctx.parseIds(ctx.p[mode]).filter(id => id < 400 && window.player.pu.levelables[id]);

    const activated = [];
    let note = "";
    while (activated.length < ctx.p.maxPerRun) {
      const missing = wanted.filter(id => !hasCard(id));
      if (!missing.length) { note = "wszystkie karty z listy są aktywne"; break; }
      if (pu.storedSelections.lt(1)) { note = `czekam na wybór (${window.player.universe})`; break; }
      const next = missing.find(id => {
        const card = window.layers.pu.levelables[id];
        return card && window.run(card.canSelect, card);
      });
      if (next === undefined) { note = `karty ${missing.join(", ")} niedostępne`; break; }

      const prev = { card: pu.selectedPunchcards[0], index: pu.selectionIndex, cost: pu.selectionCost };
      pu.selectedPunchcards[0] = next;
      pu.selectionIndex = 0;
      pu.selectionCost = new window.Decimal(1);
      if (!ctx.click("pu", 10, { refresh: true }) || !hasCard(next)) {
        // Nie udało się — nie zostawiamy podmienionej karty w wyborze.
        pu.selectedPunchcards[0] = prev.card;
        pu.selectionIndex = prev.index;
        pu.selectionCost = prev.cost;
        window.updateClickableTemp("pu");
        note = `przycisk nieaktywny dla ${next}`;
        break;
      }
      activated.push(next);
      ctx.did();
    }
    if (activated.length) ctx.status(`${mode}: aktywowano ${activated.join(", ")}` + (note ? ` · ${note}` : ""));
    else ctx.status(`${mode}: ${note}`);
  },
};

export const smaAutoEnter = {
  id: "sma-auto-enter",
  name: "SMA Auto-enter",
  group: "Darkness / SMA",
  every: 0.25,
  description:
    "Gdy jesteś w U3, poza SMA i poza Eclipse, klika ten sam przycisk, którym ręcznie wchodzisz do SMA. " +
    "Po włączeniu wyłącza wbudowane (zbugowane) Auto Enter gry. Wbudowane Auto Reset i Auto Leave zostaw włączone.",
  available: g => g.layerActive("sma"),
  onEnable(ctx) {
    if (window.player.sme?.autoEnterToggle) {
      window.player.sme.autoEnterToggle = false;
      ctx.log("Wyłączono wbudowane Auto Enter.");
    }
  },
  run(ctx) {
    const p = window.player;
    if (p.universe === "U3" && !p.sma.inStarmetalChallenge && !p.pet?.legPetTimers?.[0]?.active) {
      if (ctx.click("sma", 11)) { ctx.did(); ctx.status("weszło do SMA"); }
    }
  },
};

// Dark Grass: siatka 5×5, ID komórki = kolumna*100 + wiersz. Komórki rosną do limitu
// (Max Grass) i dalej stoją, więc zbieranie wszystkiego, co > 0, niczego nie traci.
export const darkGrass = {
  id: "dark-grass",
  name: "Dark Grass",
  group: "Darkness / SMA",
  every: 1,
  description: "Zbiera trawę ze wszystkich pól siatki Dark Grass (to samo, co klikanie pól).",
  available: () => Boolean(window.player?.dgr && window.layers?.dgr?.grid?.onClick && window.tmp?.dgr?.layerShown === true),
  run(ctx) {
    let n = 0;
    for (let col = 1; col <= 5; col++) {
      for (let row = 1; row <= 5; row++) {
        const id = col * 100 + row;
        const v = window.getGridData("dgr", id);
        if (v?.gt?.(0)) { window.layers.dgr.grid.onClick(v, id); n++; }
      }
    }
    if (n) { ctx.did(n); ctx.status(`ostatnio ${n} pól`); }
  },
};

// Hive (UB) potrafi zostać zapauzowany na stałe: gra pauzuje go chwilowo przy Eclipse (umiejętność legendarnego peta)
// i przy walce w Black Heart. Gdy te dwie pauzy się nałożą, po obu gra przywraca „pauzę” jako stan zapamiętany.
// To makro odpauzowuje Hive tylko wtedy, gdy żadna z tych chwilowych pauz nie powinna już trwać.
export const hiveUnpause = {
  id: "hive-unpause",
  name: "Pilnuj, żeby Hive nie wisiał na pauzie",
  group: "Darkness / SMA",
  every: 5,
  description:
    "Gra chwilowo pauzuje Hive (β) w czasie Eclipse i walki w Black Heart, a gdy obie pauzy się nałożą, Hive zostaje " +
    "zapauzowany na stałe. Makro odpauzowuje go, gdy Eclipse nie trwa i nie toczy się walka w Black Heart. " +
    "Wyłącz je, jeśli sam chcesz trzymać Hive na pauzie.",
  available: () => Boolean(window.player?.uni?.UB && window.player.pol?.unlockHive >= 2 && typeof window.pauseUniverse === "function"),
  run(ctx) {
    const P = window.player;
    if (!P.uni.UB.paused) { ctx.status("Hive działa"); return; }
    const eclipse = Boolean(P.pet?.legPetTimers?.[0]?.active);
    const bhFight = P.subtabs?.bh?.stuff === "bullet";
    if (eclipse || bhFight) { ctx.status(`Hive na pauzie przez ${eclipse ? "Eclipse" : "walkę w Black Heart"} — czekam`); return; }
    window.pauseUniverse("UB", "unpause");
    P.uni.UB.lastPaused = false;
    ctx.did();
    ctx.log("odpauzowano Hive");
    ctx.status("odpauzowano Hive");
  },
};

// Space Energy (DU1): reset Space Energy → kupno ulepszeń i buyabli Normality → reset… Normality przybywa pasywnie.
// Klika ten sam reset co gracz (ds 11) i kupuje to, co gracz mógłby kupić — nic nie dodaje.
export const spaceLoop = {
  id: "space-loop",
  name: "Space Energy: reset + Normality",
  group: "Darkness / SMA",
  every: 0.25,
  description:
    "Po każdym resecie Space Energy odkupuje ulepszenia Normality (I–IV…) i buyable Normality (najtańsze najpierw). " +
    "Reset Space Energy robi w chwili, gdy zysk Space Energy na sekundę od ostatniego resetu przestaje rosnąć " +
    "(szczyt tempa; „cierpliwość” = ile kolejnych spadków przeczekać). Opcjonalnie kupuje też buyable Space Energy/Space " +
    "i robi resety Normality.",
  params: [
    { key: "buyN", label: "Kupuj ulepszenia i buyable Normality", type: "bool", default: true },
    { key: "buyDs", label: "Kupuj też buyable Space Energy / Space", type: "bool", default: false },
    { key: "reset", label: "Rób reset Space Energy", type: "bool", default: true },
    { key: "mode", label: "Kiedy resetować", type: "select", default: "peak",
      options: [["peak", "na szczycie tempa zysku"], ["time", "co stały czas"]] },
    { key: "patience", label: "Cierpliwość (kolejne spadki tempa)", type: "number", default: 3, min: 1, step: 1 },
    { key: "minSec", label: "Min. czas między resetami (s)", type: "number", default: 2, min: 0.25, step: 0.25 },
    { key: "fixedSec", label: "Stały czas resetu (s, tryb „co stały czas”)", type: "number", default: 30, min: 0.25 },
    { key: "nReset", label: "Rób też resety Normality (szczyt tempa)", type: "bool", default: false },
  ],
  available: g => g.layerActive("ds") && Boolean(window.layers.ds?.clickables?.[11]),
  run(ctx) {
    const P = window.player, D = window.Decimal, st = ctx.state, now = Date.now();
    let bought = 0;
    const buyCheapest = (layer, ids) => {
      for (let guard = 0; guard < 500; guard++) {
        let best = null;
        for (const id of ids) {
          const B = window.layers[layer].buyables?.[id], t = window.tmp[layer].buyables?.[id];
          if (!B || !t || !t.unlocked) continue;
          let cost, cur;
          try { cost = new D(B.cost.call(B)); cur = new D(B.currency ? B.currency.call(B) : 0); } catch (e) { continue; }
          const lim = B.purchaseLimit ? new D(B.purchaseLimit.call(B)) : null;
          if (lim && new D(P[layer].buyables[id]).gte(lim)) continue;
          if (cur.lt(cost)) continue;
          if (!best || cost.lt(best.cost)) best = { id, cost };
        }
        if (!best) break;
        const before = new D(P[layer].buyables[best.id]);
        window.buyBuyable(layer, best.id);
        if (new D(P[layer].buyables[best.id]).lte(before)) break;
        bought++;
      }
    };
    if (ctx.p.buyN) {
      for (const id of Object.keys(window.layers.dn.upgrades || {})) {
        if (isNaN(id) || window.hasUpgrade("dn", id)) continue;
        const u = window.tmp.dn.upgrades?.[id];
        if (u && u.unlocked && window.canAffordUpgrade("dn", id)) { window.buyUpgrade("dn", id); if (window.hasUpgrade("dn", id)) bought++; }
      }
      buyCheapest("dn", [11, 12, 13, 14, 15]);
    }
    if (ctx.p.buyDs) buyCheapest("ds", Object.keys(window.layers.ds.buyables || {}).filter(k => !isNaN(k)).map(Number));
    if (bought) ctx.did(bought);

    // opcjonalny reset Normality na szczycie tempa
    if (ctx.p.nReset) {
      const g = new D(P.dn.normalityToGet), ns = st.n ??= {};
      ns.t0 ??= now;
      const s = (now - ns.t0) / 1000, r = s > 0 ? g.div(s) : new D(0);
      if (s >= 1 && g.gte(1) && ns.best && r.lt(new D(ns.best)) && ctx.click("dn", 11, { refresh: true })) { ns.t0 = now; ns.best = 0; }
      else if (!ns.best || r.gt(new D(ns.best))) ns.best = r.toString();
    }

    const gain = new D(P.ds.spaceEnergyToGet);
    st.t0 ??= now;
    if (st.lastGain && gain.lt(new D(st.lastGain).mul(0.5))) { st.t0 = now; st.bestRate = 0; st.down = 0; } // reset z zewnątrz
    st.lastGain = gain.toString();
    const sec = (now - st.t0) / 1000;
    const rate = sec > 0 ? gain.div(sec) : new D(0);
    let why = "";
    if (ctx.p.reset && sec >= ctx.p.minSec && gain.gte(1)) {
      if (ctx.p.mode === "time") { if (sec >= ctx.p.fixedSec) why = "czas"; }
      else if (st.bestRate && rate.lt(new D(st.bestRate))) { st.down = (st.down || 0) + 1; if (st.down >= ctx.p.patience) why = "szczyt tempa"; }
      else st.down = 0;
    }
    if (!st.bestRate || rate.gt(new D(st.bestRate))) st.bestRate = rate.toString();
    if (why && ctx.click("ds", 11, { refresh: true })) {
      ctx.did();
      st.t0 = now; st.bestRate = 0; st.lastGain = null; st.down = 0;
      ctx.status(`reset (${why}) po ${sec.toFixed(1)} s, +${window.format(gain)} SE · kupiono ${bought}`);
      return;
    }
    ctx.status(`+${window.format(gain)} SE po ${sec.toFixed(1)} s · kupiono ${bought}`);
  },
};
