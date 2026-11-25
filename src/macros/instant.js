import { settings } from "../core/settings.js";
// Iridite: „instant resources” z zapisanych statków. Kliknięcie daje zasoby zależne od typu statku i ustawia cooldown slotu
// (ten sam timer blokuje wybór i nadpisanie slotu — dlatego slot, którym latasz, wykluczamy). Ilość liczy się z aktualnie
// wybranego statku, więc makro na chwilę wybiera statek ze slotu (jak przycisk „Select”), klika, i przywraca poprzedni wybór.

// Stan tylko w pamięci (referencja do obiektu statku nie może trafić do ustawień w localStorage).
const mem = { pending: null, prevRef: null };

export const instantResources = {
  id: "instant-resources",
  name: "Space Battle: instant resources z zapisanych slotów",
  group: "A2 / Alt Universe 2",
  every: 2,
  description:
    "Poza walką klika „instant resources” dla gotowych slotów z listy (np. Space Junk, Evolution Shards), wybierając na chwilę " +
    "ich statek, a potem przywraca Twój wybrany statek. Slot, którym latasz, nie powinien być na liście — cooldown blokuje też jego wybór.",
  params: [
    { key: "slots", label: "Sloty (numery 1–6 jak w grze)", type: "text", default: "2 3 4" },
  ],
  available: () => Boolean(window.player?.ir?.shipBattleSaves && window.layers.ir?.clickables?.gainAutoStats),
  run(ctx) {
    const P = window.player, ir = P.ir;
    const st = mem;
    // Krok 2: statek ze slotu wybrany w poprzednim ticku (gra przeliczyła już ilość) → klik i powrót.
    if (st.pending != null) {
      const i = st.pending; st.pending = null;
      if (!ir.inBattle && ir.shipBattleSaveCurrent === ir.shipBattleSaves[i] && window.layers.ir.clickables.gainAutoStats.canClick()) {
        const before = { junk: String(ir.spaceJunk), gem: String(ir.spaceGem), rock: String(ir.spaceRock), evo: String(P.cb.evolutionShards) };
        window.clickClickable("ir", "gainAutoStats");
        const got = [["Space Junk", "junk", ir.spaceJunk], ["Space Gems", "gem", ir.spaceGem], ["Space Rocks", "rock", ir.spaceRock], ["Evolution Shards", "evo", P.cb.evolutionShards]]
          .map(([n, k, v]) => [n, new window.Decimal(v).sub(before[k])]).filter(([, d]) => d.gt(0)).map(([n, d]) => `+${window.formatWhole(d)} ${n}`);
        ctx.log(`Slot ${i + 1}: ${got.join(", ") || "zebrano"}`); ctx.did();
      }
      if (st.prevRef) ir.shipBattleSaveCurrent = st.prevRef;
      st.prevRef = null;
      return ctx.status(`zebrano slot ${i + 1}`);
    }
    if (ir.inBattle || ir.selectingShip) return ctx.status("w walce / przy wyborze statku — czekam");
    const cur = ir.shipBattleSaveCurrent;
    const slots = ctx.parseIds(ctx.p.slots).map(n => n - 1).filter(i => i >= 0 && i < 6);
    let next = null, soonest = Infinity;
    for (const i of slots) {
      const s = ir.shipBattleSaves[i];
      if (!s || s === cur) continue;
      const t = Number(ir.saveTimers[i].current);
      if (t <= 0) { next = i; break; }
      soonest = Math.min(soonest, t);
    }
    if (next == null) return ctx.status(Number.isFinite(soonest) ? `następny slot za ${window.formatTime(soonest)}` : "brak zapisanych slotów z listy");
    // Krok 1: wybierz statek ze slotu (jak przycisk „Select”), klik w następnym ticku.
    st.prevRef = cur; st.pending = next;
    ir.shipBattleSaveCurrent = ir.shipBattleSaves[next];
    ctx.status(`wybieram slot ${next + 1}`);
  },
  onDisable() {
    const ir = window.player?.ir;
    if (mem.pending != null && ir && mem.prevRef) ir.shipBattleSaveCurrent = mem.prevRef;
    mem.pending = null; mem.prevRef = null;
  },
};

// `arena` w grze to globalne `let`, więc nie ma go na window — czytamy przez eval w zasięgu globalnym.
const liveArena = () => { try { return window.eval("typeof arena !== 'undefined' ? arena : null"); } catch { return null; } };

// Ritual (Check Back Shrine): wejście po cooldownie, gdy stać na koszt (Evolution + Paragon Shardy).
// Walka toczy się w Space Battle — prowadzi ją makro „Walka statkami: bot”. Po pokonaniu ducha gra sama wychodzi z walki.
export const ritualAutoEnter = {
  id: "ritual-auto-enter",
  name: "Ritual: wejście po cooldownie",
  group: "Universe Epsilon",
  every: 5,
  description:
    "Gdy cooldown rytuału minął, stać na koszt i statek jest gotowy, wchodzi do walki z duchem (Ascension Shardy). " +
    "Wchodzi tylko przy włączonym makrze „Walka statkami: bot” (walka poniżej 90 s daje 2 Shards of Ascension, dłuższa 1). Nie przerywa innej walki statkiem.",
  params: [
    { key: "psReserve", label: "Zostaw co najmniej Paragon Shardów ponad koszt rytuału", type: "number", default: 0, min: 0, step: 1 },
  ],
  available: () => Boolean(window.player?.cbs && window.layers.cbs?.clickables?.enter),
  run(ctx) {
    const P = window.player, cbs = P.cbs, D = x => new window.Decimal(x);
    if (P.ir?.inBattle && P.ir.battleStage === "ascensionRitual" && !liveArena()) {
      // Rytuał „zawieszony” bez areny (np. wejście spoza zakładki shrine) — chowa zakładki Ritual/Pylon. Wychodzimy.
      P.tab = "cbs"; window.SB_exitRun?.(); P.subtabs.cbs.stuff = "Ritual";
      ctx.log("Ritual: wyjście z zawieszonej walki (brak areny)"); ctx.did(); return;
    }
    if (P.ir?.inBattle && P.ir.battleStage === "ascensionRitual" && P.subtabs.cbs?.stuff !== "Battle") {
      // Arena jest, ale gra nie przełączyła widoku — pokazujemy walkę w zakładce shrine.
      if (P.tab !== "cbs") window.showTab ? window.showTab("cbs") : (P.tab = "cbs");
      P.subtabs.cbs.stuff = "Battle"; ctx.did(); return ctx.status("walka z duchem — przywrócono widok");
    }
    if (P.ir?.inBattle || cbs.inBattle) return ctx.status("trwa walka");
    // Walka >90 s daje 1 Shard of Ascension zamiast 2 — bez bota statek nic nie zdziała, więc nie wchodzimy.
    if (!settings().macros?.["ship-hunter"]?.enabled) return ctx.status("włącz „Walka statkami: bot” — bez niego rytuał trwa >90 s (1 shard zamiast 2)");
    if (mem.pending != null) return ctx.status("czekam na makro instant resources");
    if (D(cbs.ritualSpiritCooldown).gt(0)) return ctx.status(`cooldown ${window.formatTime(cbs.ritualSpiritCooldown)}`);
    const [evo, ps] = cbs.ritualCosts.map(x => D(x));
    if (D(P.cb.paragonShards).lt(ps.add(ctx.p.psReserve)) || D(P.cb.evolutionShards).lt(evo))
      return ctx.status(`brak zasobów: ${window.formatWhole(evo)} Evo / ${window.formatWhole(ps)} Paragon Shards`);
    if (!window.layers.cbs.clickables.enter.canClick()) return ctx.status("statek się chłodzi albo brak wybranego statku");
    // Gra ustawia widok walki i pauzy uniwersów tylko, gdy otwarta jest zakładka shrine — przełączamy na nią.
    if (P.tab !== "cbs") window.showTab ? window.showTab("cbs") : (P.tab = "cbs");
    window.clickClickable("cbs", "enter");
    if (P.ir?.inBattle || cbs.inBattle || liveArena()) { ctx.log(`Ritual: start (−${window.formatWhole(evo)} Evo, −${window.formatWhole(ps)} PS)`); ctx.did(); ctx.status("walka z duchem"); }
  },
};

// Iridite: farma Space Gems — wejście do strefy kosmicznej od wybranego poziomu co cooldown statku.
// Walkę prowadzi „Walka statkami: bot”. Gra sama wychodzi po przekroczeniu limitu strefy (100); po zniszczeniu statku
// zostaje ekran „You lost.” — wtedy klikamy „Leave Battle”, żeby ruszył cooldown.
const ZONES = [["spaceZone1", "Zone I"], ["spaceZone2", "Zone II"], ["spaceZone3", "Zone III"], ["spaceZone4", "Zone IV"]];
const zoneMem = { prevTab: null, lvl: 0, t0: 0, gem0: null };

export const spaceZoneFarm = {
  id: "space-zone-farm",
  name: "Strefa kosmiczna: farma Space Gems (wejście co cooldown)",
  group: "A2 / Alt Universe 2",
  every: 1,
  description:
    "Gdy statek jest gotowy, ustawia poziom startowy, wchodzi do strefy (domyślnie Zone III od 0) i czeka do końca biegu: " +
    "gra sama wychodzi po poziomie 100, a po zniszczeniu statku makro klika „Leave Battle”. Potem przywraca poprzednią zakładkę. " +
    "Wymaga włączonego makra „Walka statkami: bot”. Nie wchodzi, gdy zaraz będzie gotowy Ritual (pierwszeństwo, bo dzieli cooldown statku).",
  params: [
    { key: "zone", label: "Strefa", type: "select", default: "spaceZone3", options: ZONES },
    { key: "start", label: "Poziom startowy (0/20/40/60/80)", type: "number", default: 0, min: 0, max: 80, step: 20 },
    { key: "exitAt", label: "Wyjdź po ukończeniu poziomu (100 = do końca strefy)", type: "number", default: 100, min: 1, max: 100, step: 1 },
    { key: "ritualMin", label: "Nie wchodź, gdy Ritual będzie gotowy w ciągu (min, 0 = ignoruj)", type: "number", default: 15, min: 0, step: 5 },
  ],
  available: () => Boolean(window.player?.ir && window.layers.spaceZone3?.clickables?.enter),
  run(ctx) {
    const P = window.player, ir = P.ir, D = x => new window.Decimal(x);
    const zone = ctx.p.zone || "spaceZone3", Z = window.layers[zone];
    if (!Z?.clickables?.enter) return ctx.status("strefa niedostępna");
    const gemNow = () => D(ir.spaceGem);
    const finish = why => {
      const got = zoneMem.gem0 ? gemNow().sub(zoneMem.gem0) : null;
      const mins = zoneMem.t0 ? ((Date.now() - zoneMem.t0) / 60000).toFixed(1) : "?";
      ctx.log(`${why} (poziom ${zoneMem.lvl}, ${mins} min${got ? `, +${window.formatWhole(got.max(0))} Space Gems` : ""})`);
      zoneMem.gem0 = null; zoneMem.t0 = 0; ctx.did();
    };

    if (ir.inBattle) {
      if (ir.battleStage !== zone) return ctx.status("trwa inna walka");
      const a = liveArena();
      if (!a) {
        // Statek zniszczony: gra zostawia ekran „You lost.” i nie odpala cooldownu, dopóki nie wyjdziemy.
        if (P.tab !== "ir") P.tab = "ir";
        window.clickClickable("ir", 12);
        finish("Statek zniszczony");
        return;
      }
      const lvl = Number(ir.battleLevel);
      zoneMem.lvl = Math.max(zoneMem.lvl, lvl);
      if (ctx.p.exitAt < 100 && lvl > ctx.p.exitAt && ir.menu == 0) { window.clickClickable("ir", 12); finish("Wyjście"); return; }
      return ctx.status(`walka: poziom ${lvl}`);
    }
    if (zoneMem.gem0) finish("Koniec biegu");
    if (zoneMem.prevTab) { if (P.tab === "ir") window.showTab ? window.showTab(zoneMem.prevTab) : (P.tab = zoneMem.prevTab); zoneMem.prevTab = null; }

    if (!settings().macros?.["ship-hunter"]?.enabled) return ctx.status("włącz „Walka statkami: bot”");
    if (ir.selectingShip) return ctx.status("wybór statku — czekam");
    if (mem.pending != null) return ctx.status("czekam na makro instant resources");
    const cbs = P.cbs, rit = settings().macros?.["ritual-auto-enter"];
    if (rit?.enabled && ctx.p.ritualMin > 0 && cbs && D(cbs.ritualSpiritCooldown).lte(ctx.p.ritualMin * 60))
      return ctx.status(`Ritual za ${window.formatTime(D(cbs.ritualSpiritCooldown).max(0))} — ma pierwszeństwo`);
    if (!Z.clickables.enter.canClick()) {
      const sc = ir.shipBattleSaveCurrent;
      if (!sc) return ctx.status("brak wybranego statku");
      let t = D(ir.timers[sc.shipType].current); if (sc.slot >= 0) t = t.max(ir.saveTimers[sc.slot].current);
      return ctx.status(`statek się chłodzi: ${window.formatTime(t.max(0))}`);
    }
    // Poziom startowy: tylko odblokowany punkt zapisu (0/20/40/60/80).
    const start = Math.max(0, Math.min(80, Math.floor(ctx.p.start / 20) * 20));
    P[zone].selectedStageStart = D(D(P[zone].highestLevel).gte(start) ? start : 0);
    // Gra pauzuje A2 i pokazuje walkę tylko z otwartej zakładki Iridite.
    if (P.tab !== "ir") { zoneMem.prevTab = P.tab; window.showTab ? window.showTab("ir") : (P.tab = "ir"); }
    zoneMem.gem0 = gemNow(); zoneMem.t0 = Date.now(); zoneMem.lvl = 0;
    window.clickClickable(zone, "enter");
    if (ir.inBattle) { ctx.did(); ctx.status(`start: ${ZONES.find(z => z[0] === zone)?.[1]} od ${Number(P[zone].selectedStageStart)}`); }
    else { zoneMem.gem0 = null; ctx.status("nie udało się wejść"); }
  },
};
