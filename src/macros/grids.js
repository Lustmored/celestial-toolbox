// Siatki 5×8, które w grze wymagają machania myszką (onHover).
// ID komórek w TMT: wiersz*100 + kolumna, wiersze 1–5, kolumny 1–8.

function* cells() {
  for (let row = 1; row <= 5; row++)
    for (let col = 1; col <= 8; col++) yield row * 100 + col;
}

export const moonstone = {
  id: "moonstone",
  name: "Moonstone Killer",
  group: "Overworld",
  every: 1,
  description: "Bije moonstone'y na siatce trawy, aż pękną. Limit ciosów na jedno uruchomienie chroni przed zawieszeniem.",
  params: [{ key: "maxHits", label: "Limit ciosów na uruchomienie", type: "number", default: 5000, min: 1, step: 100 }],
  available: () => Boolean(window.player.g?.grid && window.layers.g?.grid?.onHover),
  run(ctx) {
    let hits = 0;
    for (const id of cells()) {
      while (hits < ctx.p.maxHits && window.getGridData("g", id)?.[0] === 3) {
        window.layers.g.grid.onHover(window.getGridData("g", id), id);
        hits++;
      }
      if (hits >= ctx.p.maxHits) break;
    }
    if (hits) { ctx.did(hits); ctx.status(`ostatnio ${hits} ciosów`); }
  },
};
