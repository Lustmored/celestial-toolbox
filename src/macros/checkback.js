import { spendWhenFull } from "./lib/spendWhenFull.js";

// Check Back: Claim All, Dot Knight, Fragmentation, Singularity Pets.

// Pety: awans poziomu za zebrane XP (duplikaty) i Ascend po dobiciu limitu poziomu.
// Tylko pety o ID < 1000 – wyższe ID kosztują Shards of Ascension, tych makro nie rusza.
function petIds() {
  return Object.keys(window.layers.pet?.levelables ?? {})
    .map(Number).filter(id => Number.isInteger(id) && id > 0 && id < 1000);
}
function levelPets(ids) {
  let n = 0;
  for (const id of ids) {
    for (let k = 0; k < 200; k++) {
      const t = window.tmp.pet.levelables[id];
      if (!t?.unlocked || !t.canBuy) break;
      const before = String(window.getLevelableAmount("pet", id));
      window.buyLevelable("pet", id);
      if (String(window.getLevelableAmount("pet", id)) === before) break;
      n++;
    }
  }
  return n;
}
function ascendPets(ids) {
  if (!window.player.ev?.evolutionsUnlocked?.[3]) return 0;
  const L = window.layers.pet.levelables;
  const prev = L.index;
  let n = 0;
  try {
    for (const id of ids) {
      const limit = window.tmp.pet.levelables[id]?.levelLimit;
      if (limit === undefined || !window.tmp.pet.levelables[id]?.unlocked) continue;
      if (window.getLevelableAmount("pet", id).lt(limit)) continue;
      // Ten sam przycisk „Ascend Pet”, co w grze – działa na aktualnie wybranym pecie.
      L.index = id;
      window.updateClickableTemp("pet");
      window.clickClickable("pet", 7);
      n++;
    }
  } finally {
    L.index = prev;
    window.updateClickableTemp("pet");
  }
  return n;
}

export const cbClaimAll = {
  id: "cb-claim-all",
  name: "CB Claim All",
  group: "Check Back",
  every: 1,
  description:
    "Klika trzy przyciski Claim All w Check Back (XP, skrzynki, Pet Points), dwa Claim All u Marcela (Evo i Paragon Shards) " +
    "oraz gotowe przyciski Dragona (tylko te, które gra Ci pokazuje). Opcjonalnie awansuje pety za zebrane XP " +
    "i robi Ascend petów, które doszły do limitu poziomu (potem znów awansuje za resztę XP).",
  params: [
    { key: "levelPets", label: "Awansuj pety za zebrane XP", type: "bool", default: true },
    { key: "ascendPets", label: "Ascend petów na limicie poziomu", type: "bool", default: true },
  ],
  available: g => g.layerActive("cb"),
  run(ctx) {
    for (const id of [99, 199, 299]) if (ctx.click("cb", id)) ctx.did();
    // Marcel (ev8): Claim All dla Evo Shardów i Paragon Shardów.
    for (const id of [99, 199]) if (ctx.click("ev8", id)) ctx.did();
    // Dragon: przyciski 1–3 (złoto) i 4–6; ctx.click pomija ukryte i nieodblokowane.
    for (let id = 1; id <= 6; id++) if (ctx.click("ep1", id)) ctx.did();

    if (!window.layers.pet?.levelables || !(ctx.p.levelPets || ctx.p.ascendPets)) return;
    window.updateLevelableTemp("pet");
    const ids = petIds();
    let lv = 0, asc = 0;
    for (let round = 0; round < 5; round++) {
      const a = ctx.p.levelPets ? levelPets(ids) : 0;
      const b = ctx.p.ascendPets ? ascendPets(ids) : 0;
      if (b) window.updateLevelableTemp("pet");
      lv += a; asc += b;
      if (!a && !b) break;
    }
    if (lv || asc) { ctx.did(lv + asc); ctx.log(`Pety: +${lv} poziomów, ${asc}× Ascend`); }
  },
};

export const dotKnight = {
  id: "dot-knight",
  name: "Dot Knight",
  group: "Check Back",
  every: 1,
  description: "Odbiera każdy odblokowany przycisk Dot Knight, gdy skończy się jego cooldown.",
  available: g => g.layerActive("ep0") && Boolean(window.player.ep0?.timers),
  run(ctx) {
    for (const i of Object.keys(window.player.ep0.timers)) {
      if (ctx.click("ep0", 11 + Number(i))) ctx.did();
    }
  },
};

export const fragmentation = {
  id: "fragmentation",
  name: "Fragmentation",
  group: "Check Back",
  every: 1,
  description: "Fragmentuje sześć petów z bannerów, gdy cooldown minie i jest dość XP. Przywraca wybrany banner.",
  available: g => g.layerActive("pet") && Boolean(window.player.pet?.banners),
  run(ctx) {
    const pet = window.player.pet;
    const previous = pet.bannerIndex;
    try {
      for (let i = 0; i < 6; i++) {
        if (!pet.banners[i]) continue;
        pet.bannerIndex = i;
        // canClick zależy od bannerIndex, więc tmp trzeba przeliczyć po zmianie.
        if (ctx.click("pet", 100, { refresh: true })) ctx.did();
      }
    } finally {
      pet.bannerIndex = previous;
      window.updateClickableTemp("pet");
    }
  },
};

const SP_PETS = [
  { name: "Kres", key: "kres", base: 10 },
  { name: "Nav", key: "nav", base: 20 },
  { name: "Sel", key: "sel", base: 30 },
  { name: "Eclipse", key: "eclipse", base: 40 },
];
// Pet jest „dostępny”, gdy jego zakładka jest widoczna w grze — nie kupujemy niczego w ukrytych sekcjach.
const spUnlocked = pet => {
  const tab = window.layers.sp.microtabs?.stuff?.[pet.name];
  if (!tab) return false;
  return tab.unlocked === undefined ? true : Boolean(window.run(tab.unlocked, tab));
};

export const singularityPets = {
  id: "singularity-pets",
  name: "Singularity Pets",
  group: "Check Back",
  every: 4,
  description:
    "Gdy punkty Kres/Nav/Sel/Eclipse są pełne: kupuje Stats, potem pozostałe buyables tańsze niż ułamek pojemności " +
    "(od najtańszych), a jeśli nic nie kupiło — Capacity.",
  params: [
    { key: "cheapFraction", label: "Próg „tanie” (ułamek pojemności)", type: "number", default: 0.2, min: 0, max: 1, step: 0.05 },
    { key: "maxPerPet", label: "Maks. zakupów na peta na raz", type: "number", default: 6, min: 1, step: 1 },
  ],
  available: g => g.layerActive("sp") && Boolean(window.layers.sp?.buyables),
  onEnable() {
    // Sprawdzenie, czy układ buyables się nie zmienił (x1 = Capacity, x2 = Stats).
    for (const pet of SP_PETS) {
      if (!spUnlocked(pet)) continue;
      const b = window.layers.sp.buyables;
      const t = id => String(typeof b[id]?.title === "function" ? b[id].title() : b[id]?.title ?? "");
      if (!/capacity/i.test(t(pet.base + 1)) || !/stats/i.test(t(pet.base + 2))) {
        throw new Error(`Układ buyables ${pet.name} się zmienił — sprawdź ID w makrze.`);
      }
    }
  },
  run(ctx) {
    const sp = window.player.sp;
    const report = [];
    for (const pet of SP_PETS) {
      if (!spUnlocked(pet)) continue;
      const result = spendWhenFull(ctx, {
        layer: "sp",
        points: () => sp[pet.key + "Points"],
        max: () => sp[pet.key + "PointsMax"],
        first: [pet.base + 2],
        others: [3, 4, 5].map(n => pet.base + n),
        capacity: pet.base + 1,
        cheapFraction: ctx.p.cheapFraction,
        maxBuys: ctx.p.maxPerPet,
      });
      if (result) report.push(`${pet.name}: ${result}`);
    }
    if (report.length) ctx.status(report.join(", "));
  },
};
