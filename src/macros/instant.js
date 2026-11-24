import { settings } from "../core/settings.js";
// Iridite: „instant resources” z zapisanych statków. Kliknięcie daje zasoby zależne od typu statku i ustawia cooldown slotu
// (ten sam timer blokuje wybór i nadpisanie slotu — dlatego slot, którym latasz, wykluczamy). Ilość liczy się z aktualnie
// wybranego statku, więc makro na chwilę wybiera statek ze slotu (jak przycisk „Select”), klika, i przywraca poprzedni wybór.

// Stan tylko w pamięci (referencja do obiektu statku nie może trafić do ustawień w localStorage).
const mem = { pending: null, prevRef: null };

export const instantResources = {
  id: "instant-resources",
  name: "Space Battle: instant resources z zapisanych slotów",
  group: "Iridite",
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
    if (P.ir?.inBattle || cbs.inBattle) return ctx.status("trwa walka");
    // Walka >90 s daje 1 Shard of Ascension zamiast 2 — bez bota statek nic nie zdziała, więc nie wchodzimy.
    if (!settings().macros?.["ship-hunter"]?.enabled) return ctx.status("włącz „Walka statkami: bot” — bez niego rytuał trwa >90 s (1 shard zamiast 2)");
    if (mem.pending != null) return ctx.status("czekam na makro instant resources");
    if (D(cbs.ritualSpiritCooldown).gt(0)) return ctx.status(`cooldown ${window.formatTime(cbs.ritualSpiritCooldown)}`);
    const [evo, ps] = cbs.ritualCosts.map(x => D(x));
    if (D(P.cb.paragonShards).lt(ps.add(ctx.p.psReserve)) || D(P.cb.evolutionShards).lt(evo))
      return ctx.status(`brak zasobów: ${window.formatWhole(evo)} Evo / ${window.formatWhole(ps)} Paragon Shards`);
    if (!window.layers.cbs.clickables.enter.canClick()) return ctx.status("statek się chłodzi albo brak wybranego statku");
    window.clickClickable("cbs", "enter");
    if (P.ir?.inBattle || cbs.inBattle || window.arena) { ctx.log(`Ritual: start (−${window.formatWhole(evo)} Evo, −${window.formatWhole(ps)} PS)`); ctx.did(); ctx.status("walka z duchem"); }
  },
};
