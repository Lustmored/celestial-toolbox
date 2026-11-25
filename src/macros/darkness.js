import { settings } from "../core/settings.js";
// Punchcards (DU1) i wejście do Starmetal Alloy.

const hasCard = id => window.getLevelableTier("pu", id, true) === true;

/** Koszt legendarnej karty w wyborach — tak samo jak liczy gra (pu.update). */
function legendaryCost(id) {
  const P = window.player;
  if (id === 401) return P.bl?.noxDefeated ? 3 : 5;
  if (id === 402) return 2;
  if (id === 403) return window.hasUpgrade("mr", 15) ? 8 : 9;
  return Infinity;
}

export const casinoKiller = {
  id: "casino-killer",
  name: "Casino Killer",
  group: "Darkness / SMA",
  every: 0.05,
  description:
    "Dopóki są zapisane wybory punchcardów, aktywuje kolejne brakujące karty z listy priorytetów dla bieżącego trybu " +
    "(Eclipse / SMA) zamiast wylosowanych — kilka naraz, jeśli wyborów starczy. " +
    "Obsługuje zwykłe karty (ID < 400, koszt 1 wyboru) i legendarne (401–403) — legendarną bierze tylko wtedy, " +
    "gdy gra pokazuje slot legendarny, i czeka, aż uzbiera się jej koszt (402 = 2 wybory). " +
    "Gdy karty nie da się aktywować, przywraca wylosowany wybór. " +
    "Polowanie na legendarną: gdy wszystkie karty z listy są aktywne, makro bierze wylosowane karty (każdy wybór to nowe losowanie, " +
    "4% na slot legendarny), a gdy wypadnie legendarna z listy — odkłada wybory na jej koszt (401 = 5, po Noxie 3). " +
    "„Profil w Eclipse”: Eclipse Shards (zwykła lista Eclipse — najpierw trawa i chmury, potem ×ES, /wymaganie resetu ES, " +
    "dłuższy Eclipse, punkty) albo Grass Jump (wymaganie skoku, Grassjumpers, trawa).",
  params: [
    { key: "eclProfile", label: "Profil w Eclipse", type: "select", default: "es",
      options: [["es", "Eclipse Shards (lista „Priorytet w Eclipse”)"], ["gj", "Grass Jump"]] },
    { key: "gj", label: "Priorytet w Eclipse – profil GJ", type: "text", default: "113 213 308 307 108 206 201" },
    { key: "sma", label: "Priorytet w SMA", type: "text", default: "100 302 300 301 111 209 203 101 201 306" },
    { key: "smaProfile", label: "Profil w SMA", type: "select", default: "alloy",
      options: [["alloy", "Starmetal Alloy (lista „Priorytet w SMA”)"], ["se", "Space Energy (lista „Priorytet w SMA – profil SE”)"]] },
    { key: "se", label: "Priorytet w SMA – profil SE (Space, ×SE, Normality, Iridite)", type: "text", default: "302 300 401 111 209 110 212 301 203 101 201 306" },
    { key: "eclipse", label: "Priorytet w Eclipse", type: "text", default: "108 112 304 200 303 211 206 307 201 101" },
    { key: "legFill", label: "Po zapełnieniu listy: dobieraj wylosowane karty, polując na legendarną", type: "bool", default: true },
    { key: "legendary", label: "Legendarne, na które polować", type: "text", default: "401" },
    { key: "legForce", label: "Legendarne jak zwykłe karty (bez czekania na 4% slot)", type: "bool", default: true },
    { key: "legAlways", label: "Legendarna wylosowana w trakcie listy: bierz od razu (czeka na jej koszt)", type: "bool", default: true },
    { key: "fill", label: "Polowanie: które wylosowane karty brać najpierw", type: "text", default: "111 209 110 306 203 301 201 101" },
    { key: "maxPerRun", label: "Maks. kart na jedno uruchomienie", type: "number", default: 10, min: 1, step: 1 },
  ],
  available: g => g.layerActive("pu") && Boolean(window.layers.pu?.clickables?.[10]),
  run(ctx) {
    const pu = window.player.pu;
    const inEclipse = Boolean(window.player.pet?.legPetTimers?.[0]?.active);
    const inSMA = Boolean(window.player.sma?.inStarmetalChallenge) && !inEclipse;
    const mode = inEclipse ? "eclipse" : inSMA ? "sma" : null;
    if (!mode) { ctx.status("poza SMA i Eclipse — wybory czekają na bieg"); return; }
    const prof = ctx.p.eclProfile;
    const listKey = mode === "eclipse" && prof === "gj" ? "gj" : mode === "sma" && ctx.p.smaProfile === "se" ? "se" : mode;
    const wanted = ctx.parseIds(ctx.p[listKey]).filter(id => (id < 400 || (id > 400 && id < 500)) && window.player.pu.levelables[id]);

    const activated = [];
    let note = "";
    const legWanted = ctx.parseIds(ctx.p.legendary).filter(id => id > 400 && id < 500);
    const offeredLeg = () => {
      if (ctx.p.legForce) {
        const id = legWanted.find(x => !hasCard(x) && window.run(window.layers.pu.levelables[x]?.canSelect, window.layers.pu.levelables[x]));
        return id || 0;
      }
      const c = pu.legendarySelectionActive ? Number(pu.selectedPunchcards[4]) : 0;
      return legWanted.includes(c) && !hasCard(c) ? c : 0;
    };
    const takeLeg = id => {
      const cost = legendaryCost(id);
      if (pu.storedSelections.lt(cost)) return `legendarna ${id} wylosowana — zbieram ${window.formatWhole(pu.storedSelections)}/${cost} wyborów`;
      const prev = pu.selectedPunchcards[4];
      pu.selectedPunchcards[4] = id; pu.selectionIndex = 4; pu.selectionCost = new window.Decimal(cost);
      if (ctx.click("pu", 10, { refresh: true }) && hasCard(id)) { activated.push(id); ctx.did(); ctx.log(`Legendarna ${id} aktywowana`); return null; }
      pu.selectedPunchcards[4] = prev;
      return `przycisk nieaktywny dla ${id}`;
    };
    while (activated.length < ctx.p.maxPerRun) {
      if (ctx.p.legAlways && !ctx.p.legForce && offeredLeg()) { const r = takeLeg(offeredLeg()); if (r) { note = r; break; } continue; }
      const missing = wanted.filter(id => !hasCard(id));
      if (!missing.length) { note = "wszystkie karty z listy są aktywne"; break; }
      if (pu.storedSelections.lt(1)) { note = `czekam na wybór (${window.player.universe})`; break; }
      const legOk = id => id < 400 || ctx.p.legForce || (pu.legendarySelectionActive && Number(pu.selectedPunchcards[4]) === id);
      const next = missing.find(id => {
        const card = window.layers.pu.levelables[id];
        return card && legOk(id) && window.run(card.canSelect, card);
      });
      if (next === undefined) { note = `karty ${missing.join(", ")} niedostępne`; break; }
      const leg = next > 400;
      const cost = leg ? legendaryCost(next) : 1;
      if (pu.storedSelections.lt(cost)) { note = `czekam na ${cost} wybory dla ${next} (mam ${window.formatWhole(pu.storedSelections)})`; break; }

      const slot = leg ? 4 : 0;
      const prev = { card: pu.selectedPunchcards[slot], index: pu.selectionIndex, cost: pu.selectionCost };
      pu.selectedPunchcards[slot] = next;
      pu.selectionIndex = slot;
      pu.selectionCost = new window.Decimal(cost);
      if (!ctx.click("pu", 10, { refresh: true }) || !hasCard(next)) {
        // Nie udało się — nie zostawiamy podmienionej karty w wyborze.
        pu.selectedPunchcards[slot] = prev.card;
        pu.selectionIndex = prev.index;
        pu.selectionCost = prev.cost;
        window.updateClickableTemp("pu");
        note = `przycisk nieaktywny dla ${next}`;
        break;
      }
      activated.push(next);
      ctx.did();
    }
    // Polowanie na legendarną: lista pełna → wylosowane karty jako kolejne losowania slotu legendarnego.
    if (ctx.p.legFill && !note.startsWith("legendarna") && !wanted.some(id => !hasCard(id))) {
      const fill = ctx.parseIds(ctx.p.fill);
      const rank = c => { const i = fill.indexOf(c); return i < 0 ? 999 : i; };
      while (legWanted.some(id => !hasCard(id)) && activated.length < ctx.p.maxPerRun) {
        if (offeredLeg()) { const r = takeLeg(offeredLeg()); if (r) { note = r; break; } continue; }
        if (pu.storedSelections.lt(1)) { note = "polowanie na legendarną: czekam na wybór"; break; }
        const slots = [0, 1, 2, 3].filter(i => { const c = Number(pu.selectedPunchcards[i]); return c > 0 && c < 400 && !hasCard(c); });
        if (!slots.length) { note = "polowanie: wszystkie dostępne karty już aktywne — legendarna w tym biegu nie wypadła"; break; }
        const slot = slots.sort((x, y) => rank(Number(pu.selectedPunchcards[x])) - rank(Number(pu.selectedPunchcards[y])))[0];
        const card = Number(pu.selectedPunchcards[slot]);
        pu.selectionIndex = slot; pu.selectionCost = new window.Decimal(1);
        if (!ctx.click("pu", 10, { refresh: true }) || !hasCard(card)) { note = `przycisk nieaktywny dla ${card}`; break; }
        activated.push(card); ctx.did();
        note = "polowanie na legendarną";
      }
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
  every: 0,
  description:
    "Po każdym resecie Space Energy odkupuje ulepszenia Normality (I–IV…) i buyable Normality (najtańsze najpierw). " +
    "Sprawdza stan w każdej klatce gry. Domyślnie resetuje Space Energy na szczycie tempa zysku (SE/s od ostatniego " +
    "resetu) — u Ciebie wychodzi to ok. 1 s; same resety co klatkę dają ~8× mniej, bo Normality nie zdąży odrosnąć. " +
    "Do wyboru też „co klatkę” i „co stały czas”. Opcjonalnie kupuje buyable Space Energy/Space i robi resety Normality.",
  params: [
    { key: "buyN", label: "Kupuj ulepszenia i buyable Normality", type: "bool", default: true },
    { key: "buyDs", label: "Kupuj też buyable Space Energy / Space (zawsze w profilu SE w Casino Killer)", type: "bool", default: false },
    { key: "seFrac", label: "Buyable za Space Energy (długość…spissitude): pojedynczy zakup maks. % posiadanej SE", type: "number", default: 5, min: 0, max: 100, step: 1 },
    { key: "seWindow", label: "…i tylko przez pierwsze N s przebiegu SMA (0 = cały przebieg)", type: "number", default: 120, min: 0, step: 10 },
    { key: "reset", label: "Rób reset Space Energy", type: "bool", default: true },
    { key: "mode", label: "Kiedy resetować", type: "select", default: "peak",
      options: [["tick", "co klatkę (najszybciej)"], ["peak", "na szczycie tempa zysku"], ["time", "co stały czas"]] },
    { key: "patience", label: "Cierpliwość (kolejne spadki tempa)", type: "number", default: 2, min: 1, step: 1 },
    { key: "minSec", label: "Min. czas między resetami (s)", type: "number", default: 0.1, min: 0, step: 0.05 },
    { key: "fixedSec", label: "Stały czas resetu (s, tryb „co stały czas”)", type: "number", default: 1, min: 0.05, step: 0.05 },
    { key: "nReset", label: "Rób też resety Normality (szczyt tempa)", type: "bool", default: false },
  ],
  available: g => g.layerActive("ds") && Boolean(window.layers.ds?.clickables?.[11]),
  run(ctx) {
    const P = window.player, D = window.Decimal, st = ctx.state, now = Date.now();
    let bought = 0;
    const buyCheapest = (layer, ids, maxFrac = null) => {
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
          if (maxFrac?.[id] != null && cost.gt(cur.mul(maxFrac[id]))) continue; // nie przepalaj waluty, która liczy się do zapasu
          if (!best || cost.lt(best.cost)) best = { id, cost };
        }
        if (!best) break;
        const before = new D(P[layer].buyables[best.id]);
        window.buyBuyable(layer, best.id);
        if (new D(P[layer].buyables[best.id]).lte(before)) break;
        bought++;
      }
    };
    // Tryb „co klatkę”: najpierw reset, potem od razu odkup — kolejna klatka rośnie już z kupionymi buyable.
    if (ctx.p.reset && ctx.p.mode === "tick" && new D(P.ds.spaceEnergyToGet).gte(1) && ctx.click("ds", 11, { refresh: true })) {
      st.n_resets = (st.n_resets || 0) + 1; ctx.did();
    }
    if (ctx.p.buyN) {
      for (const id of Object.keys(window.layers.dn.upgrades || {})) {
        if (isNaN(id) || window.hasUpgrade("dn", id)) continue;
        const u = window.tmp.dn.upgrades?.[id];
        if (u && u.unlocked && window.canAffordUpgrade("dn", id)) { window.buyUpgrade("dn", id); if (window.hasUpgrade("dn", id)) bought++; }
      }
      buyCheapest("dn", [11, 12, 13, 14, 15]);
    }
    const seProfile = settings().macros?.["casino-killer"]?.params?.smaProfile === "se";
    if (ctx.p.buyDs || seProfile) {
      // Buyable 11–14 płacą Space Energy, z której liczy się zapas przy wyjściu z SMA — kupujemy je tylko za ułamek SE.
      // …i tylko na początku przebiegu SMA: później SE trzeba już zbierać na zapas, a zakupy przestają się zwracać.
      const inSMA = Boolean(P.sma?.inStarmetalChallenge) && !P.pet?.legPetTimers?.[0]?.active;
      if (inSMA && !st.smaIn) st.smaStart = now;
      st.smaIn = inSMA;
      const early = !ctx.p.seWindow || (inSMA && st.smaStart && (now - st.smaStart) / 1000 < ctx.p.seWindow);
      const f = early ? Math.max(0, Math.min(1, ctx.p.seFrac / 100)) : 0;
      buyCheapest("ds", Object.keys(window.layers.ds.buyables || {}).filter(k => !isNaN(k)).map(Number), { 11: f, 12: f, 13: f, 14: f });
    }
    if (bought) ctx.did(bought);

    // opcjonalny reset Normality na szczycie tempa
    if (ctx.p.nReset) {
      const g = new D(P.dn.normalityToGet), ns = st.n ??= {};
      ns.t0 ??= now;
      const s = (now - ns.t0) / 1000, r = s > 0 ? g.div(s) : new D(0);
      if (s >= 1 && g.gte(1) && ns.best && r.lt(new D(ns.best)) && ctx.click("dn", 11, { refresh: true })) { ns.t0 = now; ns.best = 0; }
      else if (!ns.best || r.gt(new D(ns.best))) ns.best = r.toString();
    }

    if (ctx.p.mode === "tick") {
      st.t0 ??= now;
      if (now - (st.sLast || 0) > 1000) {
        const s = (now - st.t0) / 1000;
        ctx.status(`resety co klatkę: ${st.n_resets || 0} w ${s.toFixed(0)} s · SE ${window.format(P.ds.spaceEnergy)}`);
        st.sLast = now;
      }
      return;
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

// Punchcards: „Level Up” w kolekcji dla każdej karty, która ma XP na następny poziom (tak jak przycisk gry, łącznie z bulk).
export const punchcardLevelUp = {
  id: "punchcard-levelup",
  name: "Punchcards: Level Up w kolekcji",
  group: "Darkness / SMA",
  every: 0.5,
  description: "Awansuje każdą kartę w kolekcji, która ma XP na kolejny poziom (jak przycisk „Level Up” gry, wielokrotnie). Przydatne przy Blood Drain.",
  params: [],
  available: g => g.layerActive("pu") && Boolean(window.layers.pu?.levelables),
  run(ctx) {
    const L = window.layers.pu.levelables, pl = window.player.pu.levelables;
    const ups = [];
    for (const k of Object.keys(pl)) {
      const id = Number(k);
      if (!id || !L[id]?.xpReq) continue;
      let n = 0;
      for (; n < 1000; n++) {
        const req = new window.Decimal(window.run(L[id].xpReq, L[id]));
        if (req.lte(0) || window.getLevelableXP("pu", id).lt(req)) break;
        window.addLevelableXP("pu", id, req.neg());
        window.addLevelables("pu", id, 1);
      }
      if (n) ups.push(`${id}+${n}`);
    }
    if (ups.length) { window.updateLevelableTemp?.("pu"); ctx.did(ups.length); ctx.log("Level Up: " + ups.join(", ")); }
  },
};

// Eclipse: autopilot całego biegu (Dark Universe 1 z aktywną umiejętnością Eclipse).
// Fazy: grind (resety LE + boostery + Dark Grass) → chmury (kupno ulepszeń Vaporizera, m.in. bulk boosterów)
// → grind → finał (chmury pod Vaporized Eclipse = ×ES przy wyjściu) → wyjście.
const grassAutomated = () => window.hasUpgrade("dn", 13) || window.hasMilestone("db", 16) || window.hasMilestone("rar", 14);
const ecl = { phase: "grind", lastProg: 0, phaseStart: 0, lastDv15: 0, active: false };
const clk = (layer, id) => {
  const C = window.layers[layer]?.clickables?.[id];
  if (!C) return false;
  try { if (C.unlocked && !window.run(C.unlocked, C)) return false; if (!window.run(C.canClick, C)) return false; } catch { return false; }
  C.onClick.call(C);
  return true;
};
const buyMax = (layer, id) => {
  const b = window.layers[layer]?.buyables?.[id];
  if (!b) return 0;
  const before = Number(window.getBuyableAmount(layer, id));
  if (new window.Decimal(before).gte(b.purchaseLimit())) return 0;
  if (!b.canAfford.call(b)) return 0;
  b.buy.call(b, true);
  return Number(window.getBuyableAmount(layer, id)) - before;
};
const buyOne = (layer, id) => {
  const b = window.layers[layer]?.buyables?.[id];
  if (!b) return false;
  const before = Number(window.getBuyableAmount(layer, id));
  if (new window.Decimal(before).gte(b.purchaseLimit()) || !b.canAfford.call(b)) return false;
  b.buy.call(b);
  return Number(window.getBuyableAmount(layer, id)) > before;
};
/** Chmury: na zmianę Transpiration (16) i Vaporized Clouds (11), pojedynczo. Zwraca, czy kupiono 16. */
const growClouds = () => {
  let got16 = false;
  for (let g = 0; g < 400; g++) {
    const a = buyOne("dv", 16), b = buyOne("dv", 11);
    got16 ||= a;
    if (!a && !b) break;
  }
  return got16;
};
const dvUpgradesLeft = () => [11, 12, 13, 14].filter(id => {
  const u = window.layers.dv?.upgrades?.[id];
  return u && window.run(u.unlocked, u) && !window.hasUpgrade("dv", id);
});

// Karty dostępne tylko w Eclipse: canSelect wymaga aktywnej umiejętności Eclipse (bez negacji).
const ECL_ONLY = /(^|[^!])player\.pet\.legPetTimers\[0\]\.active/;
const eclOnly = id => { try { return ECL_ONLY.test(String(window.layers.pu.levelables[id].canSelect)); } catch { return false; } };
/** Pod koniec Eclipse: resztę wyborów na karty spoza listy Casino Killera — najpierw tylko-Eclipse, potem najniższy poziom, potem najmniej XP. */
function spendLeftoverCards(ctx) {
  const P = window.player, pu = P.pu;
  if (!pu || pu.storedSelections.lt(1)) return [];
  const ck = settings().macros?.["casino-killer"];
  if (ck?.enabled) {
    const key = ck.params?.eclProfile === "gj" ? "gj" : "eclipse";
    const missing = ctx.parseIds(ck.params?.[key] ?? "").filter(id => id < 400 && pu.levelables[id] && !hasCard(id)
      && window.run(window.layers.pu.levelables[id].canSelect, window.layers.pu.levelables[id]));
    if (missing.length) return []; // najpierw lista Casino Killera
  }
  const out = [];
  for (let guard = 0; guard < 30 && pu.storedSelections.gte(1); guard++) {
    const cands = Object.keys(pu.levelables).map(Number).filter(id => id >= 100 && id < 400 && !hasCard(id) && (() => {
      const c = window.layers.pu.levelables[id]; try { return c && window.run(c.canSelect, c); } catch { return false; } })());
    if (!cands.length) break;
    const key = id => [eclOnly(id) ? 0 : 1, Number(window.getLevelableAmount("pu", id)), Number(window.getLevelableXP("pu", id))];
    cands.sort((a, b) => { const x = key(a), y = key(b); return x[0] - y[0] || x[1] - y[1] || x[2] - y[2]; });
    const id = cands[0];
    const prev = { card: pu.selectedPunchcards[0], index: pu.selectionIndex, cost: pu.selectionCost };
    pu.selectedPunchcards[0] = id; pu.selectionIndex = 0; pu.selectionCost = new window.Decimal(1);
    if (!ctx.click("pu", 10, { refresh: true }) || !hasCard(id)) {
      pu.selectedPunchcards[0] = prev.card; pu.selectionIndex = prev.index; pu.selectionCost = prev.cost;
      break;
    }
    out.push(id);
  }
  return out;
}

export const eclipseRun = {
  id: "eclipse-run",
  name: "Eclipse: autopilot biegu",
  group: "Darkness / SMA",
  every: 0.1,
  description:
    "Prowadzi cały bieg Eclipse. 1) Grind: reset Light Extractora (Eclipse Shards), gdy tylko się da; boostery (pojedynczo do limitu, " +
    "z bulkiem bez limitu); Dark Grass buyables, dopóki gra ich nie automatyzuje. 2) Gdy postęp stanie, a brakuje ulepszeń Vaporizera: " +
    "(po wymaksowaniu trawy) produkcja chmur: Transpiration i Vaporized Clouds na zmianę, aż Transpiration stanie (max 100), ulepszenia " +
    "(m.in. bulk boosterów), reszta buyables raz/dwa, potem stop i chmury na 0. 3) Dalej grind. " +
    "4) Finał (postęp znów stoi albo kończy się czas Eclipse): chmury pod Vaporized Eclipse (×ES przy wyjściu) i wyjście. " +
    "Karty punchcard wybiera Casino Killer (profil Eclipse); w finale, gdy jego lista jest pełna, resztę wyborów makro wydaje na karty " +
    "tylko-Eclipse, potem o najniższym poziomie, potem z najmniejszym XP (podbijanie kart spoza listy).",
  params: [
    { key: "single", label: "Boostery pojedynczo: do ilu", type: "number", default: 16, min: 0, step: 1 },
    { key: "stall", label: "Przed chmurami: postęp stoi, gdy brak resetu i nowych boosterów przez (s)", type: "number", default: 5, min: 1, step: 1 },
    { key: "stall2", label: "Przed finałem: postęp stoi, gdy brak resetu i nowych boosterów przez (s)", type: "number", default: 12, min: 1, step: 1 },
    { key: "grassTarget", label: "Trawa wystarczy do chmur od (Dark Grass, np. 1e130)", type: "text", default: "1e130" },
    { key: "grassQuiet", label: "…albo gdy nic z trawy nie kupiono przez (s)", type: "number", default: 4, min: 0.5, step: 0.5 },
    { key: "bulkMin", label: "Bulk boosterów: kupuj paczkę od (szt.)", type: "number", default: 20, min: 1, step: 1 },
    { key: "bulkWait", label: "Bulk boosterów: najdłużej czekaj na paczkę (s)", type: "number", default: 3, min: 0, step: 0.5 },
    { key: "cloudStall", label: "Chmury: Transpiration się zatrzymała, gdy brak zakupu przez (s)", type: "number", default: 3, min: 1, step: 1 },
    { key: "cloudMax", label: "Faza chmur: maks. czas (s)", type: "number", default: 90, min: 5, step: 5 },
    { key: "finalAt", label: "Finał najpóźniej, gdy czasu Eclipse zostało (s)", type: "number", default: 90, min: 0, step: 10 },
    { key: "finalStall", label: "Finał: wyjdź, gdy Vaporized Eclipse nie rośnie przez (s)", type: "number", default: 5, min: 1, step: 1 },
    { key: "exit", label: "Wychodź z Eclipse po finale (inaczej czeka na koniec czasu)", type: "bool", default: true },
    { key: "endCards", label: "Finał: resztę wyborów na karty spoza listy Casino Killera (tylko-Eclipse → najniższy poziom → najmniej XP)", type: "bool", default: true },
  ],
  available: () => Boolean(window.layers.le?.clickables?.[13] && window.layers.dv?.clickables?.[13]),
  run(ctx) {
    const P = window.player, now = performance.now() / 1000;
    const inEcl = P.sma?.inStarmetalChallenge && P.pet?.legPetTimers?.[0]?.active;
    // Chmury przetrwają wyjście z Eclipse, a przyspieszają upływ jego czasu (1,2^log10 chmur) — następny Eclipse
    // wypaliłby się w kilka sekund. Poza Eclipse i na jego starcie: stop produkcji i chmury na 0.
    const cloudsLeft = () => P.dv && (P.dv.producingClouds || new window.Decimal(P.dv.clouds).gt(0));
    if (!inEcl) {
      ecl.active = false;
      if (cloudsLeft()) { clk("dv", 12); clk("dv", 13); ctx.did(); ctx.log("Chmury po Eclipse wyzerowane"); }
      return ctx.status("poza Eclipse");
    }
    if (!ecl.active) {
      if (cloudsLeft()) { clk("dv", 12); clk("dv", 13); }
      Object.assign(ecl, { phase: "grind", lastProg: now, phaseStart: now, lastDv15: now, lastDv16: now, lastGrass: now, active: true });
    }
    const did = [];
    const timeLeft = Number(P.pet.legPetTimers[0].current);
    const timerUp = window.getLevelableTier?.("pu", 403, true); // z tą kartą czas rośnie, Eclipse nie kończy się sam

    if (ecl.phase === "grind") {
      if (clk("le", 13)) { ecl.lastProg = now; did.push(`reset LE (${Number(P.le.resetAmount)})`); }
      const bulk = window.hasUpgrade("dv", 13);
      const b0 = Number(P.db.boosters);
      // Z bulkiem: większe paczki (każdy reset boosterów zeruje generatory), ale nie dłużej niż bulkWait.
      const bulkReady = Number(P.db.boosterBulk) >= ctx.p.bulkMin || now - (ecl.lastBoost ?? 0) >= ctx.p.bulkWait;
      if ((bulk ? bulkReady : b0 < ctx.p.single) && clk("db", 11) && Number(P.db.boosters) > b0) {
        ecl.lastProg = ecl.lastBoost = now; did.push(`boostery ${b0}→${Number(P.db.boosters)}`);
      }
      if (!grassAutomated()) for (const id of [11, 12, 13, 14, 15, 16]) if (buyMax("dgr", id)) { ecl.lastGrass = now; did.push(`grass ${id}`); }
      // Trawa musi być wymaksowana przed chmurami (Transpiration skaluje się z trawą).
      const grassDone = grassAutomated() || new window.Decimal(P.dgr.grass).gte(ctx.p.grassTarget) || now - (ecl.lastGrass ?? 0) > ctx.p.grassQuiet;
      const upgLeft = dvUpgradesLeft().length > 0;
      const stallFor = upgLeft ? ctx.p.stall : ctx.p.stall2; // po chmurach boostery w bulku rosną wolniej
      // Pierwsze chmury: od razu, gdy trawy wystarczy i nie czeka reset LE.
      const cloudNow = upgLeft && grassDone && new window.Decimal(P.dgr.grass).gte(ctx.p.grassTarget) && !window.run(window.layers.le.clickables[13].canClick, window.layers.le.clickables[13]);
      const stalled = cloudNow || (now - ecl.lastProg > stallFor && grassDone);
      if (!timerUp && timeLeft <= ctx.p.finalAt) { ecl.phase = "final"; ecl.phaseStart = ecl.lastDv15 = ecl.lastDv16 = now; }
      else if (stalled) {
        ecl.phase = dvUpgradesLeft().length ? "cloud" : "final";
        ecl.phaseStart = ecl.lastDv15 = ecl.lastDv16 = now;
      }
    } else if (ecl.phase === "cloud") {
      if (!P.dv.producingClouds) clk("dv", 11);
      for (const id of dvUpgradesLeft()) if (window.canAffordUpgrade("dv", id)) { window.buyUpgrade("dv", id); did.push(`dv upg ${id}`); }
      if (growClouds()) ecl.lastDv16 = now;
      const n16 = Number(window.getBuyableAmount("dv", 16));
      const grown = n16 >= 100 || now - (ecl.lastDv16 ?? ecl.phaseStart) > ctx.p.cloudStall;
      // Transpiration stanęła: kończymy fazę (gdy ulepszeń nie stać — wrócimy po kolejnym resecie, z większą trawą).
      if (grown || now - ecl.phaseStart > ctx.p.cloudMax) {
        for (let k = 0; k < 2; k++) for (const id of [12, 13, 14, 15]) buyOne("dv", id); // reszta raz/dwa
        clk("dv", 12); clk("dv", 13); // stop i chmury na 0 (zdejmuje nerf i szybszy upływ czasu)
        ecl.phase = "grind"; ecl.lastProg = now; did.push(`chmury: koniec (Transpiration ${n16})`);
      }
    } else if (ecl.phase === "final") {
      // Bez resetu LE w finale — wyzerowałby trawę, a Transpiration skaluje się z trawą.
      if (ctx.p.endCards) { const cards = spendLeftoverCards(ctx); if (cards.length) did.push(`karty ${cards.join(", ")}`); }
      if (!P.dv.producingClouds) clk("dv", 11);
      // Najpierw rozkręcamy chmury (16/11 na zmianę), potem wszystko w Vaporized Eclipse.
      if (growClouds()) ecl.lastDv16 = now;
      const n16 = Number(window.getBuyableAmount("dv", 16));
      const grown = n16 >= 100 || now - (ecl.lastDv16 ?? ecl.phaseStart) > ctx.p.cloudStall;
      if (grown) {
        const n15 = buyMax("dv", 15);
        if (n15) { ecl.lastDv15 = now; did.push(`Vaporized Eclipse +${n15}`); }
      } else ecl.lastDv15 = now;
      const doneBuying = grown && now - ecl.lastDv15 > ctx.p.finalStall;
      if (ctx.p.exit && doneBuying && clk("le", 14)) {
        ecl.active = false; ctx.did(); ctx.log("Eclipse: wyjście");
        return ctx.status("wyszedłem z Eclipse");
      }
    }
    if (did.length) ctx.did(did.length);
    const left = timerUp ? "" : ` · czas ${window.formatTime(timeLeft)}`;
    ctx.status(`${ecl.phase} · resety ${Number(P.le.resetAmount)} · ES ${window.formatWhole(P.le.eclipseShardsToGetTrue)} · boostery ${Number(P.db.boosters)}${left}${did.length ? " · " + did.join(", ") : ""}`);
  },
};
