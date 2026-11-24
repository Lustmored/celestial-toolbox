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

// Summon: wybiera legendarnego peta (Eclipse/Geroa/Vespasian), któremu najmniej brakuje do awansu, klika Summon
// i awansuje legendarne pety, które mają dość XP.
function summonLegendary(ctx) {
  const P = window.player.pet, D = window.Decimal;
  window.updateClickableTemp("pet");
  const t = window.tmp.pet.clickables?.[210];
  if (t?.canClick) {
    let pick = null;
    for (let i = 0; i < 3; i++) {
      const sel = window.tmp.pet.clickables?.[301 + i], id = 501 + i, lt = window.tmp.pet.levelables?.[id];
      if (!sel?.unlocked || !lt?.unlocked) continue;
      if (lt.levelLimit !== undefined && window.getLevelableAmount("pet", id).gte(lt.levelLimit)) continue;
      const need = new D(lt.xpReq).sub(P.levelables[id][1]).max(0);
      if (!pick || need.lt(pick.need)) pick = { i, id, need };
    }
    if (pick) {
      const prev = P.summonIndex;
      P.summonIndex = new D(pick.i);
      window.updateClickableTemp("pet");
      if (ctx.click("pet", 210, { refresh: true })) { ctx.did(); ctx.log(`Summon → pet ${pick.id} (brakowało ${window.format(pick.need)} XP)`); }
      else P.summonIndex = prev;
    }
  }
  let n = 0;
  for (const id of [501, 502, 503]) {
    for (let k = 0; k < 50; k++) {
      const lt = window.tmp.pet.levelables?.[id];
      if (!lt?.unlocked || !lt.canBuy) break;
      const before = String(window.getLevelableAmount("pet", id));
      window.buyLevelable("pet", id);
      window.updateLevelableTemp("pet");
      if (String(window.getLevelableAmount("pet", id)) === before) break;
      n++;
    }
  }
  if (n) { ctx.did(n); ctx.log(`Legendarne pety: +${n} poziomów`); }
}

export const cbClaimAll = {
  id: "cb-claim-all",
  name: "CB Claim All",
  group: "Check Back",
  every: 1,
  description:
    "Klika trzy przyciski Claim All w Check Back (XP, skrzynki, Pet Points), dwa Claim All u Marcela (Evo i Paragon Shards) " +
    "oraz gotowe przyciski Dragona (tylko te, które gra Ci pokazuje) i Daily Orbs. Opcjonalnie awansuje pety za zebrane XP " +
    "i robi Ascend petów, które doszły do limitu poziomu (potem znów awansuje za resztę XP). " +
    "Opcjonalnie: odbiera XP Boost (z gotowych przycisków ten z największym zyskiem), potem Legendary Gems, " +
    "a Summon kieruje do legendarnego peta, któremu najmniej brakuje do awansu, i go awansuje.",
  params: [
    { key: "levelPets", label: "Awansuj pety za zebrane XP", type: "bool", default: true },
    { key: "ascendPets", label: "Ascend petów na limicie poziomu", type: "bool", default: true },
    { key: "xpBoost", label: "Odbieraj XP Boost (resetuje poziom CB)", type: "bool", default: false },
    { key: "legGems", label: "Odbieraj Legendary Gems (resetuje poziom i XP Boost)", type: "bool", default: false },
    { key: "summon", label: "Summon legendarnego peta (najbliżej awansu) + awans", type: "bool", default: false },
    { key: "dailyOrbs", label: "Odbieraj Daily Orbs (gotowe przyciski, od największego)", type: "bool", default: true },
  ],
  available: g => g.layerActive("cb"),
  run(ctx) {
    for (const id of [99, 199, 299]) if (ctx.click("cb", id)) ctx.did();
    // Marcel (ev8): Claim All dla Evo Shardów i Paragon Shardów.
    for (const id of [99, 199]) if (ctx.click("ev8", id)) ctx.did();
    // Dragon: przyciski 1–3 (złoto) i 4–6; ctx.click pomija ukryte i nieodblokowane.
    for (let id = 1; id <= 6; id++) if (ctx.click("ep1", id)) ctx.did();
    // Daily Orbs: od największego przycisku, żeby ewentualny Shard Boost (zużywany przy pierwszym odbiorze) trafił w największy.
    if (ctx.p.dailyOrbs && window.player.ev2 && !window.tmp.ev2?.deactivated) {
      for (const id of [14, 13, 12, 11]) {
        const before = new window.Decimal(window.player.ev2.orbs);
        if (ctx.click("ev2", id, { refresh: true })) { ctx.did(); ctx.log(`Daily Orbs: +${window.format(new window.Decimal(window.player.ev2.orbs).sub(before))} (dzień ${window.formatWhole(window.player.ev2.day)})`); }
      }
    }

    // XP Boost: każdy przycisk resetuje poziom CB, więc z gotowych bierzemy ten z największym zyskiem;
    // pozostałe poczekają, aż poziom znów dobije do ich progu.
    if (ctx.p.xpBoost && !window.tmp.cb.deactivated) {
      const bt = window.player.cb.boostTimers ?? [];
      window.updateClickableTemp("cb");
      let best = -1;
      for (let i = 0; i < 3; i++) {
        const t = window.tmp.cb.clickables?.[301 + i];
        if (!t?.unlocked || !t.canClick) continue;
        if (best < 0 || window.Decimal.gt(bt[i].base, bt[best].base)) best = i;
      }
      if (best >= 0 && ctx.click("cb", 301 + best)) { ctx.did(); ctx.log(`XP Boost +${window.format(bt[best].base)}`); }
    }
    // Legendary Gems po XP Boost (zysk zależy od XP Boost, a odbiór go zeruje).
    if (ctx.p.legGems && !window.tmp.pet.deactivated && ctx.click("pet", 201, { refresh: true })) { ctx.did(); ctx.log("Odebrano Legendary Gems"); }
    if (ctx.p.summon && !window.tmp.pet.deactivated && window.layers.pet?.clickables?.[210]) summonLegendary(ctx);

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
    "Najpierw kupuje ulepszenia Singularity Pets, gdy tylko się pojawią (i oszczędza na nie punkty). Gdy punkty Kres/Nav/Sel/Eclipse są pełne: kupuje Stats, potem pozostałe buyables tańsze niż ułamek pojemności " +
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
    // Ulepszenia (np. Regenerative Anger) mają pierwszeństwo: kup od razu, a jeśli nie stać — oszczędzaj punkty tego peta
    // (gdy pojemność za mała, kupuj tylko Capacity).
    const waiting = {};
    for (const id of Object.keys(window.layers.sp.upgrades ?? {}).filter(k => !isNaN(k))) {
      const U = window.layers.sp.upgrades[id];
      if (window.hasUpgrade("sp", id) || !window.tmp.sp.upgrades?.[id]?.unlocked) continue;
      if (window.canAffordUpgrade("sp", id)) {
        window.buyUpgrade("sp", id);
        if (window.hasUpgrade("sp", id)) { ctx.did(); ctx.log(`Singularity Pets: kupiono ulepszenie „${window.run(U.title, U)}”`); continue; }
      }
      const key = String(U.currencyInternalName ?? "").replace(/Points$/, "");
      if (key) waiting[key] = new window.Decimal(window.tmp.sp.upgrades[id].cost);
    }
    for (const pet of SP_PETS) {
      if (!spUnlocked(pet)) continue;
      const need = waiting[pet.key];
      if (need && new window.Decimal(sp[pet.key + "PointsMax"]).gte(need)) { report.push(`${pet.name}: zbieram na ulepszenie (${window.formatWhole(need)})`); continue; }
      const result = spendWhenFull(ctx, {
        layer: "sp",
        points: () => sp[pet.key + "Points"],
        max: () => sp[pet.key + "PointsMax"],
        first: need ? [] : [pet.base + 2],
        others: need ? [] : [3, 4, 5].map(n => pet.base + n),
        capacity: pet.base + 1,
        cheapFraction: ctx.p.cheapFraction,
        maxBuys: ctx.p.maxPerPet,
      });
      if (result) report.push(`${pet.name}: ${result}`);
    }
    if (report.length) ctx.status(report.join(", "));
  },
};

// Cookie (ep2): klikanie złotych (i opcjonalnie gniewnych) ciasteczek — to cząsteczki z onClick, gra sama je usuwa po kliknięciu.
// Spawn liczy się tylko w zakładce Cookie albo (3× wolniej) przy włączonym w grze „external golden cookie spawns”.
export const goldenCookies = {
  id: "golden-cookies",
  name: "Cookie: klikaj złote ciasteczka",
  group: "Check Back",
  every: 0.5,
  description:
    "Klika pojawiające się złote ciasteczka (Chocolate Shards, Paragon Shards, ciasteczka, odnowienie shardów w Pet Shopie). " +
    "Opcjonalnie włącza wbudowany przełącznik gry „external golden cookie spawns”, żeby pojawiały się też poza zakładką Cookie (3× rzadziej).",
  params: [
    { key: "external", label: "Włącz spawn poza zakładką Cookie (przełącznik gry)", type: "bool", default: true },
    { key: "wrath", label: "Klikaj też gniewne ciasteczka (mogą zabrać część ciasteczek)", type: "bool", default: true },
  ],
  available: () => Boolean(window.player?.ep2 && window.tmp.ep2?.layerShown),
  run(ctx) {
    const ep2 = window.player.ep2;
    if (ctx.p.external && !ep2.externalGolden) { ep2.externalGolden = true; ctx.log("Włączono spawn złotych ciasteczek poza zakładką Cookie"); }
    let n = 0;
    for (const id of Object.keys(window.particles ?? {})) {
      const p = window.particles[id];
      if (!p || typeof p.onClick !== "function") continue;
      const img = String(p.image ?? "");
      const gold = img.includes("gold_cookie"), wrath = img.includes("wrath_cookie");
      if (!gold && !(wrath && ctx.p.wrath)) continue;
      const choco = Number(ep2.chocoShards);
      window.run(p.onClick, p);
      n++;
      if (Number(ep2.chocoShards) > choco) ctx.log(`Złote ciasteczko: +${window.formatWhole(Number(ep2.chocoShards) - choco)} Chocolate Shard`);
    }
    if (n) ctx.did(n);
    ctx.status(`następne za ~${window.formatTime(ep2.goldenTimer)}${window.player.tab === "ep2" ? "" : " (poza zakładką: 3× wolniej)"} · klików: ${window.formatWhole(ep2.goldenClicks)}`);
  },
};
