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

// Eclipse (SMA z aktywną umiejętnością Eclipse): boostery i Dark Grass, póki gra ich sama nie automatyzuje.
const grassAutomated = () => window.hasUpgrade("dn", 13) || window.hasMilestone("db", 16) || window.hasMilestone("rar", 14);
export const eclipseBoosters = {
  id: "eclipse-boosters",
  name: "Eclipse: boostery i Dark Grass",
  group: "Darkness / SMA",
  every: 0.1,
  description:
    "W Dark Universe 1 (domyślnie tylko podczas Eclipse): klika reset Boosterów — pojedynczo do podanego limitu, " +
    "a gdy masz już bulk (dv 13), za każdym razem, gdy jest dostępny. Kupuje max Dark Grass buyables, dopóki gra " +
    "ich nie automatyzuje (30 Boosterów + SME-161 ×3, dn 13 albo rar 14).",
  params: [
    { key: "single", label: "Boostery pojedynczo: do ilu", type: "number", default: 16, min: 0, step: 1 },
    { key: "bulk", label: "Z bulkiem: kupuj bez limitu", type: "bool", default: true },
    { key: "grass", label: "Kupuj Dark Grass buyables (gdy nie są zautomatyzowane)", type: "bool", default: true },
    { key: "onlyEclipse", label: "Tylko podczas Eclipse", type: "bool", default: true },
  ],
  available: g => g.layerActive("db") || g.layerActive("dgr"),
  run(ctx) {
    const P = window.player, D = x => new window.Decimal(x);
    if (!P.sma?.inStarmetalChallenge) return ctx.status("poza SMA");
    if (ctx.p.onlyEclipse && !P.pet?.legPetTimers?.[0]?.active) return ctx.status("poza Eclipse");
    const done = [];
    // Boostery
    const bulk = window.hasUpgrade("dv", 13);
    const n = Number(P.db.boosters);
    const want = bulk ? ctx.p.bulk : n < ctx.p.single;
    const B = window.layers.db?.clickables?.[11];
    if (want && B && B.canClick.call(B)) {
      const before = n;
      B.onClick.call(B);
      if (Number(P.db.boosters) > before) { ctx.did(); done.push(`Boostery ${before}→${Number(P.db.boosters)}`); }
    }
    // Dark Grass
    if (ctx.p.grass && !grassAutomated() && window.tmp.dgr?.layerShown !== false) {
      for (const id of [11, 12, 13, 14, 15, 16]) {
        const b = window.layers.dgr.buyables[id], t = window.tmp.dgr.buyables?.[id];
        if (!b || t?.unlocked === false) continue;
        if (D(window.getBuyableAmount("dgr", id)).gte(b.purchaseLimit())) continue;
        if (!b.canAfford.call(b)) continue;
        const before = Number(window.getBuyableAmount("dgr", id));
        b.buy.call(b, true);
        const after = Number(window.getBuyableAmount("dgr", id));
        if (after > before) { ctx.did(); done.push(`grass ${id}+${after - before}`); }
      }
    }
    ctx.status(`boostery ${Number(P.db.boosters)}${bulk ? " (bulk)" : ""}${grassAutomated() ? " · grass auto" : ""}${done.length ? " · " + done.join(", ") : ""}`);
  },
};
