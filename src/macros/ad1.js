// AD1: zbieranie latającej radiacji (cząsteczki z onClick, jak złote ciasteczka).
// Zwykła radiacja (dark, kolorowa, ascended) to czysty zysk — zbierana zawsze.
// Radiacje „prestiżowe” (time, space, mind, heart, hope, rage) robią reset (np. time: czas Eclipse → 1 s, dark i kolorowa
// radiacja oraz buyables Aniciffo → 0), więc każdą włącza się osobno. Labirynt (deadly, zegar Marcela) — nigdy.
const SKIP = /deadlyRadiation|clock\.png/;
const PLAIN = /(dark|red|orange|yellow|green|blue|violet|ascended)Radiation\.png/;
const RESET = { time: /time\d\.png/, space: /space\.png/, mind: /mind\.png/, heart: /heart\.png/, hope: /hope\.png/, rage: /rage\.png/ };
const order = img => { const m = /time(\d)\.png/.exec(img); return m ? Number(m[1]) : 0; };

export const radiationCollector = {
  id: "ad1-radiation",
  name: "AD1: zbieranie radiacji latającej po ekranie",
  group: "AD1",
  every: 0.2,
  description:
    "Klika zwykłą radiację (dark, kolorowa, ascended), gdy tylko się pojawi. Radiacje z resetem (time, space, mind, heart, hope, rage) " +
    "tylko te, które włączysz — każda z nich resetuje część postępu. Pomija radiację z labiryntu i zegar Marcela.",
  params: [
    { key: "time", label: "Time radiation (reset: czas Eclipse → 1 s, dark/kolorowa radiacja i buyables Aniciffo → 0)", type: "bool", default: false },
    { key: "space", label: "Space radiation (reset)", type: "bool", default: false },
    { key: "mind", label: "Mind radiation (reset)", type: "bool", default: false },
    { key: "heart", label: "Heart radiation (reset)", type: "bool", default: false },
    { key: "hope", label: "Hope radiation (reset Starmetal)", type: "bool", default: false },
    { key: "rage", label: "Rage radiation (reset Starmetal ×60)", type: "bool", default: false },
  ],
  available: () => typeof window.particles === "object",
  run(ctx) {
    const list = [];
    for (const id of Object.keys(window.particles ?? {})) {
      const p = window.particles[id];
      if (!p || typeof p.onClick !== "function") continue;
      const img = String(p.image ?? "");
      if (!img.includes("resources/radiation/") || SKIP.test(img)) continue;
      const kind = Object.keys(RESET).find(k => RESET[k].test(img));
      if (kind ? !ctx.p[kind] : !PLAIN.test(img)) continue;
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
