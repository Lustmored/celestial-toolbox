import { spendWhenFull } from "./lib/spendWhenFull.js";

// Planets (uniwersum A2): buyables za Space Dust. 11 = Capacity Increaser, 12–17 = reszta.
export const spaceDust = {
  id: "space-dust",
  name: "Space Dust",
  group: "Alt U2 / Space",
  every: 4,
  description:
    "Gdy Space Dust jest pełny: kupuje ID z listy „najpierw” (domyślnie nic), potem pozostałe buyables tańsze " +
    "niż ułamek pojemności (od najtańszych), a jeśli nic nie kupiło — Capacity Increaser.",
  params: [
    { key: "first", label: "Najpierw kupuj (ID, np. 12 13)", type: "text", default: "" },
    { key: "cheapFraction", label: "Próg „tanie” (ułamek pojemności)", type: "number", default: 0.2, min: 0, max: 1, step: 0.05 },
    { key: "maxBuys", label: "Maks. zakupów na raz", type: "number", default: 6, min: 1, step: 1 },
  ],
  available: g => g.layerActive("pl") && Boolean(window.layers.pl?.buyables?.[11]),
  onEnable() {
    const b = window.layers.pl.buyables[11];
    if (!/capacity/i.test(String(typeof b.title === "function" ? b.title() : b.title))) {
      throw new Error("Układ buyables Planets się zmienił — 11 to już nie Capacity.");
    }
  },
  run(ctx) {
    const pl = window.player.pl;
    const all = [12, 13, 14, 15, 16, 17];
    const first = ctx.parseIds(ctx.p.first).filter(id => all.includes(id));
    const result = spendWhenFull(ctx, {
      layer: "pl",
      points: () => pl.spaceDust,
      max: () => pl.spaceDustCapacity,
      first,
      others: all.filter(id => !first.includes(id)),
      capacity: 11,
      cheapFraction: ctx.p.cheapFraction,
      maxBuys: ctx.p.maxBuys,
    });
    if (result) ctx.status(result);
  },
};
