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
