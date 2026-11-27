// AD1: zbieranie latającej radiacji (cząsteczki z onClick, jak złote ciasteczka). Pomijamy labirynt:
// „deadly radiation” (kara) i zegar Marcela (nie nasza decyzja, kiedy zatrzymać czas).
// Time radiation trzeba kliknąć w kolejności 1 → 2 → 3, więc sortujemy po numerze.
const SKIP = /deadlyRadiation|clock\.png/;
const order = img => { const m = /time(\d)\.png/.exec(img); return m ? Number(m[1]) : 0; };

export const radiationCollector = {
  id: "ad1-radiation",
  name: "AD1: zbieranie radiacji latającej po ekranie",
  group: "AD1",
  every: 0.2,
  description:
    "Klika każdą cząsteczkę radiacji (dark, kolorowe, hope/rage/mind/heart/space, time 1→2→3), gdy tylko się pojawi. " +
    "Pomija radiację z labiryntu (deadly) i zegar Marcela.",
  params: [],
  available: () => typeof window.particles === "object",
  run(ctx) {
    const list = [];
    for (const id of Object.keys(window.particles ?? {})) {
      const p = window.particles[id];
      if (!p || typeof p.onClick !== "function") continue;
      const img = String(p.image ?? "");
      if (!img.includes("resources/radiation/") || SKIP.test(img)) continue;
      list.push(p);
    }
    list.sort((a, b) => order(String(a.image)) - order(String(b.image)));
    let n = 0;
    for (const p of list) {
      if (!window.particles[p.id]) continue;
      try { window.run(p.onClick, p); n++; } catch (e) { /* cząsteczka zniknęła */ }
    }
    if (n) { ctx.did(n); ctx.status(`zebrano ${n}`); }
  },
};
