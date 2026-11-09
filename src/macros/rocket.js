// Rockets (U2): automatyczny wybór pasażerów. Startu nie wykonuje — tylko ustawia wybór.
//
// Pasażer resetuje poziom i XP swojego peta w Check Back i daje XP jego kosmicznemu odpowiednikowi:
//   (poziom × 2^tier)^(1,2 × 1,1^tier) × mnożniki   (rare: dodatkowo pierwiastek).
// Kosmiczny pet ma limit poziomu, XP ponad limit przepada. Wąskim gardłem są miejsca w rakiecie i liczba lotów
// (każdy start to reset na poziomie singularity), a nie PP na odbudowę — więc makro maksymalizuje kosmiczne
// poziomy na lot, a przy remisie wybiera peta z mniejszą stratą poziomu w Check Back.

const D = x => new window.Decimal(x);

/** XP kosmicznego peta za wysłanie peta z poziomem lvl i tierem tier — w tej samej kolejności zaokrągleń co gra. */
function spaceXp(lvl, tier, rare) {
  const g = window;
  let v = D(lvl).mul(D(2).pow(tier)).pow(D(1.2).mul(D(1.1).pow(tier))).floor();
  if (g.hasUpgrade("sma", 203)) v = v.mul(1.2).floor();
  v = v.mul(g.levelableEffect("pu", 306)[2]).floor();
  v = v.mul(g.buyableEffect("sme", 163)).floor();
  if (g.hasMilestone("dgj", 17)) v = v.mul(g.player.dgj.milestone7Effect).floor();
  if (g.hasMilestone("gwaTemple", 15)) v = v.mul(g.player.gwaTemple.gwark.pow(0.5).div(100).add(1)).floor();
  if (rare) v = v.pow(0.5).floor();
  return Number(v);
}

/** Wymagania XP kolejnych poziomów levelable od poziomu `from` do `to` (wyliczone funkcją gry). */
function reqs(layer, id, from, to) {
  const L = window.layers[layer].levelables[id];
  const d = window.player[layer].levelables[id];
  const keep = d[0];
  const out = [];
  try {
    for (let l = from; l < to; l++) { d[0] = D(l); out.push(Number(window.run(L.xpReq, L))); }
  } finally { d[0] = keep; }
  return out;
}

/** Ile kosmicznych poziomów da `xp` (bez przekraczania limitu) i ile XP brakuje do limitu. */
function spaceGain(id, xp) {
  const s = window.player.spet.levelables[id];
  const t = window.tmp.spet.levelables[id];
  if (!s || !t) return null;
  const lvl = Number(s[0]);
  const limit = Number(t.levelLimit ?? 0);
  const r = reqs("spet", id, lvl, limit);
  let have = Number(s[1]) + xp, gained = 0;
  for (const req of r) { if (have < req) break; have -= req; gained++; }
  const toCap = Math.max(0, r.reduce((a, b) => a + b, 0) - Number(s[1]));
  return { gained, toCap, capped: lvl >= limit };
}

const RARITIES = [
  { key: "Common", base: 101, count: 10, rare: false },
  { key: "Uncommon", base: 201, count: 9, rare: false },
];

function candidates(ctx, excluded) {
  const out = [];
  for (const [ri, r] of RARITIES.entries()) {
    for (let i = 0; i < r.count; i++) {
      const id = r.base + i;
      if (excluded.has(id)) continue;
      const d = window.player.pet.levelables[id];
      if (!d) continue;
      const lvl = Number(d[0]), tier = Number(d[2]);
      if (lvl < 1) continue;
      const xp = spaceXp(lvl, tier, r.rare);
      const sg = spaceGain(id, xp);
      if (!sg || sg.capped || sg.gained < ctx.p.minGain) continue;
      if (ctx.p.maxLevel > 0 && lvl > ctx.p.maxLevel) continue;
      // Koszt: XP potrzebne, żeby odbudować peta w Check Back do obecnego poziomu.
      const rebuild = reqs("pet", id, 0, lvl).reduce((a, b) => a + b, 0) || 1;
      out.push({ ri, idx: i, id, lvl, tier, xp, gained: sg.gained, caps: xp >= sg.toCap, rebuild });
    }
  }
  return out.sort((a, b) => b.gained - a.gained || a.rebuild - b.rebuild);
}

const passengerCost = n => [n * (7 + n), n * (2 + n)]; // [ES za n commonów, PS za n uncommonów]

export const rocketPassengers = {
  id: "rocket-passengers",
  name: "Rocket Passengers",
  group: "Rockets (U2)",
  every: 3,
  description:
    "Ustawia pasażerów rakiety (startu nie robi). Pomija pety, których kosmiczny odpowiednik ma już limit poziomu, i wybiera te, " +
    "które dają najwięcej kosmicznych poziomów w tym locie (przy remisie: mniejsza strata poziomu w Check Back). Uncommony (kosztują Paragon Shardy) tylko gdy dobijają " +
    "kosmicznego peta do limitu i zostaje rezerwa PS. Gdy makro jest włączone, nadpisuje ręczny wybór.",
  params: [
    { key: "maxUncommon", label: "Maks. uncommonów na lot (PS)", type: "number", default: 1, min: 0, max: 4, step: 1 },
    { key: "psReserve", label: "Zostaw co najmniej Paragon Shardów", type: "number", default: 4, min: 0, step: 1 },
    { key: "minGain", label: "Min. kosmicznych poziomów z jednego peta", type: "number", default: 1, min: 1, step: 1 },
    { key: "maxLevel", label: "Nie wysyłaj petów powyżej poziomu (0 = bez limitu)", type: "number", default: 0, min: 0, step: 1 },
    { key: "exclude", label: "Nigdy nie wysyłaj (ID petów)", type: "text", default: "110" },
  ],
  available: g => g.layerActive("ro") && Boolean(window.player.spet?.levelables),
  run(ctx) {
    const ro = window.player.ro;
    if (ro.starPause.gt(0)) return; // tuż po starcie gra resetuje stan — nie przeszkadzamy

    const excluded = new Set(ctx.parseIds(ctx.p.exclude));
    const all = candidates(ctx, excluded);
    const max = Number(ro.maxSelectedPassengers);
    const es = Number(window.player.cb.evolutionShards);
    const ps = Number(window.player.cb.paragonShards);

    const pick = [];
    let nU = 0;
    // Uncommony tylko gdy dobijają do limitu i stać nas na PS z rezerwą.
    for (const c of all.filter(c => c.ri === 1 && c.caps)) {
      if (nU >= ctx.p.maxUncommon || pick.length >= max) break;
      if (ps - passengerCost(nU + 1)[1] < ctx.p.psReserve) break;
      pick.push(c); nU++;
    }
    for (const c of all.filter(c => c.ri === 0)) {
      if (pick.length >= max) break;
      const nC = pick.filter(p => p.ri === 0).length + 1;
      if (passengerCost(nC)[0] + Number(ro.evoShardsReq) > es) break;
      pick.push(c);
    }

    const want = [0, 1].map(ri => pick.filter(p => p.ri === ri).map(p => p.idx).sort((a, b) => a - b));
    const have = [ro.selectedPassengersCommon, ro.selectedPassengersUncommon].map(a => a.map(Number).sort((a, b) => a - b));
    const same = want.every((w, i) => w.length === have[i].length && w.every((v, j) => v === have[i][j])) && ro.selectedPassengersRare.length === 0;

    const label = pick.map(p => `${p.id} (lvl ${p.lvl} → +${p.gained} kosm.${p.caps ? ", limit" : ""})`).join(", ") || "brak opłacalnych pasażerów";
    if (same) return ctx.status(label);

    ro.selectedPassengersCommon = want[0].map(D);
    ro.selectedPassengersUncommon = want[1].map(D);
    ro.selectedPassengersRare = [];
    ro.selectedPassengers = D(pick.length);
    ctx.did();
    ctx.status(label);
  },
};

export const rocketMaker = {
  id: "rocket-maker",
  name: "Fuel & Parts",
  group: "Rockets (U2)",
  every: 0,
  description:
    "Na zmianę klika „Make Activated Fuel” i „Make Rocket Parts” (jedno kliknięcie na tick gry, jak trzymanie Entera), " +
    "dopóki go nie wyłączysz. Każde kliknięcie robi singularity, tak jak ręcznie. Bez upgrade'u gwiazd " +
    "„SMA i Moonstone niepotrzebne do części” nie klika części, bo zerowałoby to SMA.",
  params: [
    { key: "partsWithout203", label: "Klikaj części także bez upgrade'u za 333k (zeruje SMA)", type: "bool", default: false },
  ],
  available: g => g.layerActive("ro"),
  run(ctx) {
    const st = ctx.state;
    const partsOk = ctx.p.partsWithout203 || window.player.st.buyables[203].gte(1);
    // Na zmianę, żeby drugie kliknięcie w tym samym ticku nie korzystało z wartości sprzed resetu.
    const order = st.next === "parts" && partsOk ? [12, 11] : partsOk ? [11, 12] : [11];
    for (const id of order) {
      if (ctx.click("ro", id, { refresh: true })) {
        ctx.did();
        st.next = id === 11 ? "parts" : "fuel";
        break;
      }
    }
    const ro = window.player.ro;
    ctx.status(`paliwo ${window.format(ro.activatedFuel)} · części ${window.format(ro.rocketParts)} · gwiazdy za start ${window.format(window.player.au2.starsToGet)}` +
      (partsOk ? "" : " · części wyłączone (brak upgrade'u 333k)"));
  },
};
