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
    // Mind i heart: gra robi reset tylko, gdy licznik jest DOKŁADNIE równy wymaganiu (eq). Kilka kliknięć w jednym ticku
    // potrafi przeskoczyć wartość i licznik utyka powyżej (np. 43/25). Klikamy więc po jednej i nigdy ponad wymaganie.
    const COUNTER = { mind: "mr", heart: "hr" };
    const usedCounter = {};
    let n = 0;
    for (const p of list) {
      if (!window.particles[p.id]) continue;
      const kind = Object.keys(COUNTER).find(k => RESET[k].test(String(p.image)));
      if (kind) {
        const L = window.player[COUNTER[kind]];
        if (usedCounter[kind] || !L || new window.Decimal(L.particleClick).gte(L.particleClickReq)) continue;
        usedCounter[kind] = true;
      }
      try { window.run(p.onClick, p); n++; } catch (e) { /* cząsteczka zniknęła */ }
    }
    if (n) { ctx.did(n); ctx.status(`zebrano ${n}`); }
  },
};

// AD1: buyables Aniciffo za Dark Radiation (11–14) — najtańszy najpierw, po jednym (zbalansowanie efektów).
// Z ulepszeniem „ani 23” zakupy są darmowe, więc wtedy od razu maks. Opcjonalnie buyables za kamienie (21–24, 31–34).
const buyCheapest = (ids, max = 2000) => {
  const L = window.layers.ani, D = window.Decimal;
  const free = window.hasUpgrade("ani", 23);
  let n = 0;
  if (free) {
    for (const id of ids) {
      const B = L.buyables[id];
      if (!B || window.tmp.ani.buyables[id]?.unlocked === false) continue;
      const before = new D(window.getBuyableAmount("ani", id));
      if (before.gte(B.purchaseLimit()) || !B.canAfford.call(B)) continue;
      B.buy.call(B, true);
      n += Number(new D(window.getBuyableAmount("ani", id)).sub(before));
    }
    return n;
  }
  for (let g = 0; g < max; g++) {
    const ok = ids.filter(id => {
      const B = L.buyables[id];
      return B && window.tmp.ani.buyables[id]?.unlocked !== false
        && new D(window.getBuyableAmount("ani", id)).lt(B.purchaseLimit()) && B.canAfford.call(B);
    });
    if (!ok.length) break;
    const id = ok.reduce((a, b) => (Number(L.buyables[a].cost()) <= Number(L.buyables[b].cost()) ? a : b));
    L.buyables[id].buy.call(L.buyables[id]); n++;
  }
  return n;
};

export const aniciffoBuyables = {
  id: "ad1-buyables",
  name: "AD1: buyables za Dark Radiation (i opcjonalnie za kamienie)",
  group: "AD1",
  every: 0.5,
  description:
    "Kupuje buyables Aniciffo za Dark Radiation (11–14): zawsze najtańszy, po jednym, żeby efekty rosły równo " +
    "(z darmowymi zakupami od razu do oporu). Opcjonalnie to samo za Temporal i Cosmic Stones.",
  params: [
    { key: "stones", label: "Kupuj też za Temporal/Cosmic Stones (21–24, 31–34)", type: "bool", default: false },
  ],
  available: () => Boolean(window.layers.ani?.buyables?.[11]),
  run(ctx) {
    // Z ulepszeniem „ani 23” gra sama kupuje 11–14 (za darmo) — wtedy zostają tylko kamienie.
    let n = window.hasUpgrade("ani", 23) ? 0 : buyCheapest([11, 12, 13, 14]);
    if (ctx.p.stones) n += buyCheapest([21, 22, 23, 24]) + buyCheapest([31, 32, 33, 34]);
    if (n) { ctx.did(n); ctx.status(`kupiono ${n}`); }
  },
};
