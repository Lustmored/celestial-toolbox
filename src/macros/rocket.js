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
  { key: "Rare", base: 301, count: 9, rare: true },
];

function candidates(ctx, excluded, rareAllowed) {
  const out = [];
  for (const [ri, r] of RARITIES.entries()) {
    for (let i = 0; i < r.count; i++) {
      const id = r.base + i;
      if (excluded.has(id)) continue;
      if (r.rare && !rareAllowed.has(id)) continue;
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
    "które dają najwięcej kosmicznych poziomów w tym locie (przy remisie: mniejsza strata poziomu w Check Back). Uncommony (kosztują Paragon Shardy: 3/8/15/24 PS za 1/2/3/4) " +
    "wybiera wg listy priorytetów, o ile zostaje rezerwa PS (opcjonalnie tylko te, które dobijają do limitu). Rare wysyła tylko z podanej listy " +
    "(Temporal Shardy: 2/6/12 za 1/2/3; zerują peta w Check Back, XP pierwiastkowane). Gdy makro jest włączone, nadpisuje ręczny wybór.",
  params: [
    { key: "maxUncommon", label: "Maks. uncommonów na lot (PS)", type: "number", default: 2, min: 0, max: 4, step: 1 },
    { key: "uncommonCapOnly", label: "Uncommony tylko gdy dobijają do limitu (stary tryb)", type: "bool", default: false },
    { key: "uncommonPrio", label: "Priorytet uncommonów (ID kosmicznych petów)", type: "text", default: "208 206 201 207 209 205 202 203 204" },
    { key: "psReserve", label: "Zostaw co najmniej Paragon Shardów", type: "number", default: 4, min: 0, step: 1 },
    { key: "minGain", label: "Min. kosmicznych poziomów z jednego peta", type: "number", default: 1, min: 1, step: 1 },
    { key: "maxLevel", label: "Nie wysyłaj petów powyżej poziomu (0 = bez limitu)", type: "number", default: 0, min: 0, step: 1 },
    { key: "exclude", label: "Nigdy nie wysyłaj (ID petów)", type: "text", default: "110" },
    { key: "rare", label: "Rare pety do wysyłania (ID 301–309, puste = żadne)", type: "text", default: "" },
    { key: "rareMin", label: "Rare: min. kosmicznych poziomów z jednego peta", type: "number", default: 1, min: 1, step: 1 },
    { key: "tsReserve", label: "Rare: zostaw co najmniej Temporal Shardów", type: "number", default: 0, min: 0, step: 1 },
  ],
  available: g => g.layerActive("ro") && Boolean(window.player.spet?.levelables),
  run(ctx) {
    const ro = window.player.ro;
    if (ro.starPause.gt(0)) return; // tuż po starcie gra resetuje stan — nie przeszkadzamy

    const excluded = new Set(ctx.parseIds(ctx.p.exclude));
    const all = candidates(ctx, excluded, new Set(ctx.parseIds(ctx.p.rare)));
    const max = Number(ro.maxSelectedPassengers);
    const es = Number(window.player.cb.evolutionShards);
    const ps = Number(window.player.cb.paragonShards);

    const pick = [];
    let nU = 0;
    // Rare (tylko z listy): kosztują Temporal Shardy n·(n+1), zerują peta w Check Back, a XP jest pierwiastkowane.
    const ts = Number(window.player.stagnantSynestia?.temporalShard ?? 0);
    let nR = 0;
    for (const c of all.filter(c => c.ri === 2 && c.gained >= ctx.p.rareMin)) {
      if (pick.length >= max) break;
      if ((nR + 1) * (nR + 2) > ts - ctx.p.tsReserve) break;
      pick.push(c); nR++;
    }
    // Uncommony: wg listy priorytetów (pety bez limitu na końcu listy), przy remisie więcej kosmicznych poziomów.
    // W starym trybie tylko te, które dobijają kosmicznego peta do limitu.
    const prio = ctx.parseIds(ctx.p.uncommonPrio);
    const rank = id => { const i = prio.indexOf(id); return i < 0 ? 99 : i; };
    const unc = all.filter(c => c.ri === 1 && (!ctx.p.uncommonCapOnly || c.caps))
      .sort((a, b) => rank(a.id) - rank(b.id) || b.gained - a.gained);
    for (const c of unc) {
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

    const want = [0, 1, 2].map(ri => pick.filter(p => p.ri === ri).map(p => p.idx).sort((a, b) => a - b));
    const have = [ro.selectedPassengersCommon, ro.selectedPassengersUncommon, ro.selectedPassengersRare].map(a => a.map(Number).sort((a, b) => a - b));
    const same = want.every((w, i) => w.length === have[i].length && w.every((v, j) => v === have[i][j]));

    const label = pick.map(p => `${p.id} (lvl ${p.lvl} → +${p.gained} kosm.${p.caps ? ", limit" : ""})`).join(", ") || "brak opłacalnych pasażerów";
    if (same) return ctx.status(label);

    ro.selectedPassengersCommon = want[0].map(D);
    ro.selectedPassengersUncommon = want[1].map(D);
    ro.selectedPassengersRare = want[2].map(D);
    ro.selectedPassengers = D(pick.length);
    ctx.did();
    ctx.status(label);
  },
};
