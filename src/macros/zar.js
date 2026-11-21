// Universe Epsilon — Coin Flip + Wheel of Fortune.

const W = () => window;
const D = x => new (W().Decimal)(x);

function parseWeights(str) {
  const out = {};
  for (const tok of String(str || "").split(/[\s,;]+/)) {
    const m = tok.match(/^(\d+):([\d.]+)$/);
    if (m && +m[2] > 0) out[+m[1]] = +m[2];
  }
  return out;
}

const CP_BUY = [11, 12, 13, 14];
const HEADS = [21, 22, 23, 24];
const TAILS = [31, 32, 33, 34];
const WHEEL = [11, 12, 13, 14, 15, 16];

/** Kupuje w grupie buyable o najniższym koszt/waga; czeka, jeśli na niego nie stać. */
function buyGroup(layer, ids, weights, limit = 50) {
  const tmp = W().tmp[layer]?.buyables;
  if (!tmp) return 0;
  let n = 0;
  for (let i = 0; i < limit; i++) {
    let best = null, bestScore = Infinity;
    for (const id of ids) {
      const w = weights[id];
      if (!w || !tmp[id]?.unlocked) continue;
      const score = D(tmp[id].cost).log10() - Math.log10(w);
      if (score < bestScore) { bestScore = score; best = id; }
    }
    if (best == null) break;
    const B = W().layers[layer].buyables[best];
    if (!B.canAfford.call(B)) break;
    W().buyBuyable(layer, best);
    W().updateBuyableTemp?.(layer);
    n++;
  }
  return n;
}

/** Czas (s) dojścia chance points od obecnej wartości do `target`, z uwzględnieniem softcapu CP. */
function cpEta(target) {
  const g = W(), za = g.player.za;
  const S = D(za.chancePointsSoftcapStart).toNumber();
  let cp = D(za.chancePoints).toNumber();
  const T = D(target).toNumber();
  if (!(T > cp)) return 0;
  let E = D(g.buyableEffect("wof", 15)).mul(g.buyableEffect("sm", 102)).mul(g.levelableEffect("car", 203)[0]);
  if (g.hasUpgrade("cbs", 14)) E = E.mul(g.upgradeEffect("cbs", 14));
  if (g.hasAchievement("achievements", 1008)) E = E.mul(0.95);
  E = E.toNumber();
  const eff = c => (c >= S ? Math.pow(Math.pow(c - S, 0.75) + 1, E) : 1);
  let R = D(za.chancePointsPerSecond).toNumber();
  if (cp >= S) R *= eff(cp);
  if (!(R > 0)) return Infinity;
  let t = 0;
  if (cp < S) { const lin = Math.min(S, T) - cp; t += lin / R; cp += lin; }
  if (T > cp) {
    const n = 64, h = (T - cp) / n;
    for (let i = 0; i < n; i++) t += eff(cp + (i + 0.5) * h) * h / R;
  }
  return t;
}

/** Przed obrotem: całe heads w wheel point gain (24), całe tails w wymaganie obrotu (34) — i tak przepadną przy obrocie. */
function spinDump() {
  return buyGroup("cf", [24], { 24: 1 }, 500) + buyGroup("cf", [34], { 34: 1 }, 500);
}

/** Koszt obrotu po wydaniu wszystkich obecnych tails na 34 (÷ wymaganie obrotu): 50k·1.5^n, efekt 1 + 0.25·n^1.25. */
function projectedSpinCost() {
  const g = W(), cost = D(g.player.wof.spinCost);
  if (!g.tmp.cf?.buyables?.[34]?.unlocked) return cost;
  const n = D(g.getBuyableAmount("cf", 34)).toNumber();
  const tails = D(g.player.cf.tails).toNumber();
  let k = 0, spent = 0;
  while (n + k < 250) { const c = 50000 * Math.pow(1.5, n + k); if (spent + c > tails) break; spent += c; k++; }
  const eff = x => 1 + 0.25 * Math.pow(x, 1.25);
  return k ? cost.mul(eff(n) / eff(n + k)) : cost;
}

export const coinFlipper = {
  id: "coin-flipper",
  name: "Coin Flip + Koło: pełna automatyzacja",
  group: "Universe Epsilon",
  every: 0.1,
  description:
    "Rzuca monetą (po odblokowaniu włącza wbudowany Autoflip), klika „Reduce coins flipped”, kupuje buyable za chance points, " +
    "heads i tails oraz buyable koła za wheel points. W każdej grupie kupuje to, co ma najniższy koszt ÷ waga (waga 0 = nie kupuj). " +
    "Koło: gdy chance points dojdą do kosztu obrotu w zadanym czasie, przestaje wydawać chance points (rzuty i buyable), " +
    "zbiera do kosztu i kręci — obrót resetuje cały Coin Flip, więc potem wszystko od nowa. W trakcie obrotu nic nie kupuje.",
  params: [
    { key: "flip", label: "Rzucaj monetą", type: "bool", default: true },
    { key: "reduce", label: "Klikaj „Reduce coins flipped” po cooldownie", type: "bool", default: true },
    { key: "buy", label: "Kupuj buyable za heads/tails", type: "bool", default: true },
    { key: "weights", label: "Wagi heads/tails (id:waga)", type: "text",
      default: "22:20 21:3 23:1 24:0.3 32:20 31:3 33:1 34:0.3" },
    { key: "buyCP", label: "Kupuj buyable za chance points", type: "bool", default: true },
    { key: "cpWeights", label: "Wagi chance points (11 heads/tails, 12 CP, 13 softcap CP, 14 ^efekty)", type: "text",
      default: "12:10 11:5 14:5 13:2" },
    { key: "spin", label: "Kręć kołem", type: "bool", default: true },
    { key: "saveSec", label: "Oszczędzaj CP na obrót, gdy brakuje ≤ tylu sekund produkcji", type: "number", default: 60, min: 0, step: 10 },
    { key: "reduceWheel", label: "Klikaj „Reduce wheels spun” po cooldownie (tańsze obroty, nieco mniej wheel points)", type: "bool", default: true },
    { key: "spinDump", label: "Przed obrotem: wszystkie heads → wheel point gain (24), tails → wymaganie obrotu (34)", type: "bool", default: true },
    { key: "runFrac", label: "…albo gdy brakujący czas ≤ tej części czasu od ostatniego obrotu", type: "number", default: 0.5, min: 0, step: 0.1 },
    { key: "buyWheel", label: "Kupuj buyable koła za wheel points", type: "bool", default: true },
    { key: "wheelWeights", label: "Wagi koła (11 heads/tails, 12 długość rzutu, 13 wheel points, 14 softcap h/t, 15 softcap CP, 16 cooldown Reduce)", type: "text",
      default: "13:10 12:6 11:5 15:3 14:2 16:1" },
  ],
  available: () => Boolean(W().player?.za?.zarUnlocked && W().hasUpgrade("za", 12) && W().layers.cf),
  run(ctx) {
    const P = W().player, cf = P.cf, wof = P.wof;
    const parts = [];
    const wheelOn = Boolean(wof && W().layers.wof && W().tmp.wof?.layerShown !== false && wof.spinCost);

    // Koło: obrót w toku resetuje Coin Flip co klatkę — nic nie ruszamy.
    if (wheelOn && wof.spinActive) {
      if (ctx.p.buyWheel && buyGroup("wof", WHEEL, parseWeights(ctx.p.wheelWeights))) ctx.did();
      ctx.status(`koło się kręci · obrotów ${W().formatWhole(wof.wheelsSpinned)}`);
      return;
    }

    let saving = false;
    const dumpOn = ctx.p.spinDump !== false && !(P.sm?.buyables?.[103] && D(P.sm.buyables[103]).gte(1));
    if (wheelOn && ctx.p.spin) {
      if (dumpOn && ctx.state.saving && spinDump()) { ctx.did(); W().updateTemp?.(); }
      const cp = D(P.za.chancePoints), cost = D(wof.spinCost);
      if (cp.gte(cost)) {
        if (dumpOn && spinDump()) { ctx.did(); W().updateTemp?.(); }
        W().clickClickable("wof", 201);
        if (wof.spinActive) {
          ctx.state.runStart = Date.now(); ctx.state.saving = false;
          ctx.log(`Obrót koła (${W().formatWhole(wof.wheelsSpinned)}), koszt ${W().format(cost)} CP`);
          ctx.did();
          ctx.status("obrót koła");
          return;
        }
      }
      // Liczymy czas już z efektem tails wydanych na 34, które i tak kupimy przed obrotem.
      const eta = cpEta(dumpOn ? projectedSpinCost() : cost);
      // Próg rośnie z czasem od ostatniego obrotu (gdy inwestowanie w rzuty przestaje przyspieszać, i tak dojdziemy do obrotu).
      ctx.state.runStart ??= Date.now();
      const runSec = (Date.now() - ctx.state.runStart) / 1000;
      const limit = Math.max(ctx.p.saveSec, runSec * (ctx.p.runFrac ?? 0.5));
      // Histereza: raz zaczęte oszczędzanie trwa aż do obrotu, chyba że czas urósł ponad 3× próg.
      if (eta <= limit || (ctx.state.saving && eta <= 3 * limit)) {
        saving = true;
        parts.push(`oszczędzam na obrót: ${W().format(cp)}/${W().format(cost)} CP (~${W().formatTime(eta)})`);
      }
      ctx.state.saving = saving;
    }

    if (ctx.p.flip) {
      if (W().hasUpgrade("za", 14)) {
        // Wbudowany Autoflip wydaje CP — przy oszczędzaniu go wyłączamy.
        if (cf.autoFlip === saving) { cf.autoFlip = !saving; ctx.did(); }
        if (!saving) parts.push("Autoflip gry");
      } else if (!saving && !cf.flipping && D(P.za.chancePoints).gte(cf.flipCost)) {
        W().clickClickable("cf", 11);
        ctx.did();
        parts.push("rzut");
      }
    }

    if (ctx.p.reduce && D(cf.reductionCooldown).lte(0) && D(cf.coinsFlipped).gte(6)) {
      W().clickClickable("cf", 13);
      ctx.did();
    }

    if (wheelOn && ctx.p.reduceWheel && D(wof.reductionCooldown).lte(0) && D(wof.wheelsSpinned).gte(7)) {
      const before = D(wof.wheelsSpinned);
      W().clickClickable("wof", 12);
      ctx.log(`Reduce wheels: ${W().formatWhole(before)} → ${W().formatWhole(wof.wheelsSpinned)} obrotów`);
      ctx.did();
    }

    const smAuto = P.sm?.buyables?.[103] && D(P.sm.buyables[103]).gte(1);
    let n = 0;
    if (ctx.p.buy && !smAuto) {
      const w = parseWeights(ctx.p.weights);
      if (dumpOn && wheelOn && ctx.p.spin) { delete w[24]; delete w[34]; } // te kupujemy hurtem tuż przed obrotem
      if (!saving) n += buyGroup("cf", HEADS, w) + buyGroup("cf", TAILS, w);
    }
    if (ctx.p.buyCP && !saving && !smAuto) n += buyGroup("cf", CP_BUY, parseWeights(ctx.p.cpWeights));
    if (wheelOn && ctx.p.buyWheel) n += buyGroup("wof", WHEEL, parseWeights(ctx.p.wheelWeights));
    if (n) { ctx.did(); parts.push(`kupiono ${n}`); }
    if (smAuto) parts.push("buyable Coin Flipa kupuje gra");

    parts.push(`rzutów ${W().formatWhole(cf.coinsFlipped)}`);
    if (wheelOn) parts.push(`obrót za ${W().format(wof.spinCost)} CP`);
    ctx.status(parts.join(" · "));
  },
};
