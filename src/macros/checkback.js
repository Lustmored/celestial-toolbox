// Check Back: Claim All, Dot Knight, Fragmentation, Singularity Pets.

export const cbClaimAll = {
  id: "cb-claim-all",
  name: "CB Claim All",
  group: "Check Back",
  every: 1,
  description: "Klika trzy przyciski Claim All w Check Back (XP, pety, przyciski 2xx), gdy któryś jest gotowy.",
  available: g => g.layerActive("cb"),
  run(ctx) {
    for (const id of [99, 199, 299]) if (ctx.click("cb", id)) ctx.did();
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
];

export const singularityPets = {
  id: "singularity-pets",
  name: "Singularity Pets",
  group: "Check Back",
  every: 4,
  description:
    "Gdy punkty Kres/Nav/Sel są pełne: kupuje Stats, potem pozostałe buyables tańsze niż ułamek pojemności " +
    "(od najtańszych), a jeśli nic nie kupiło — Capacity.",
  params: [
    { key: "cheapFraction", label: "Próg „tanie” (ułamek pojemności)", type: "number", default: 0.2, min: 0, max: 1, step: 0.05 },
    { key: "maxPerPet", label: "Maks. zakupów na peta na raz", type: "number", default: 6, min: 1, step: 1 },
  ],
  available: g => g.layerActive("sp") && Boolean(window.layers.sp?.buyables),
  onEnable() {
    // Sprawdzenie, czy układ buyables się nie zmienił (x1 = Capacity, x2 = Stats).
    for (const pet of SP_PETS) {
      const b = window.layers.sp.buyables;
      const t = id => String(typeof b[id]?.title === "function" ? b[id].title() : b[id]?.title ?? "");
      if (!/capacity/i.test(t(pet.base + 1)) || !/stats/i.test(t(pet.base + 2))) {
        throw new Error(`Układ buyables ${pet.name} się zmienił — sprawdź ID w makrze.`);
      }
    }
  },
  run(ctx) {
    const sp = window.player.sp;
    const cost = id => ctx.D(window.tmp.sp.buyables[id]?.cost);
    const buy = (pet, id) => {
      const price = cost(id);
      if (!price.gt(0) || ctx.D(sp[pet.key + "Points"]).lt(price)) return false;
      if (!ctx.buyOne("sp", id)) return false;
      ctx.did();
      return true;
    };
    const report = [];
    for (const pet of SP_PETS) {
      const pts = ctx.D(sp[pet.key + "Points"]);
      const max = ctx.D(sp[pet.key + "PointsMax"]);
      if (!max.gt(0) || pts.lt(max)) continue;

      const capacity = pet.base + 1;
      const stats = pet.base + 2;
      let bought = 0;
      if (buy(pet, stats)) bought++;

      const others = [3, 4, 5].map(n => pet.base + n).sort((a, b) => cost(a).cmp(cost(b)));
      for (const id of others) {
        if (bought >= ctx.p.maxPerPet) break;
        const limit = ctx.D(sp[pet.key + "PointsMax"]).mul(ctx.p.cheapFraction);
        if (cost(id).lt(limit) && buy(pet, id)) bought++;
      }
      if (bought === 0 && buy(pet, capacity)) report.push(pet.name + ": Capacity");
      else if (bought) report.push(`${pet.name}: ${bought} zakup(y)`);
    }
    if (report.length) ctx.status(report.join(", "));
  },
};
