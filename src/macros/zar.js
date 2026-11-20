// Universe Epsilon — Coin Flip.

const W = () => window;

function parseWeights(str) {
  const out = {};
  for (const tok of String(str || "").split(/[\s,;]+/)) {
    const m = tok.match(/^(\d+):([\d.]+)$/);
    if (m) out[+m[1]] = Math.max(0.0001, +m[2]);
  }
  return out;
}

const HEADS = [21, 22, 23, 24];
const TAILS = [31, 32, 33, 34];

/** Kupuje w grupie buyable o najniższym koszt/waga; czeka, jeśli na niego nie stać. */
function buyGroup(ids, weights, limit = 50) {
  const tmp = W().tmp.cf.buyables;
  let n = 0;
  for (let i = 0; i < limit; i++) {
    let best = null, bestScore = Infinity;
    for (const id of ids) {
      const w = weights[id];
      if (!w || !tmp[id]?.unlocked) continue;
      const cost = new (W().Decimal)(tmp[id].cost);
      const score = cost.log10() - Math.log10(w);
      if (score < bestScore) { bestScore = score; best = id; }
    }
    if (best == null) break;
    const B = W().layers.cf.buyables[best];
    if (!B.canAfford.call(B)) break;
    W().buyBuyable("cf", best);
    W().updateBuyableTemp?.("cf");
    n++;
  }
  return n;
}

export const coinFlipper = {
  id: "coin-flipper",
  name: "Coin Flip: rzucanie + ulepszenia",
  group: "Universe Epsilon",
  every: 0.1,
  description:
    "Rzuca monetą, gdy tylko można (po odblokowaniu włącza wbudowany Autoflip i przestaje klikać), " +
    "używa „Reduce coins flipped by /1.2” po każdym cooldownie i kupuje ulepszenia za heads/tails. " +
    "W każdej walucie kupuje to, co ma najniższy koszt ÷ waga — przy wadze 10 vs 1 droższe ulepszenie jest kupowane, " +
    "dopóki nie kosztuje 10× więcej niż tańsze. Ulepszeń za chance points nie rusza.",
  params: [
    { key: "flip", label: "Rzucaj monetą", type: "bool", default: true },
    { key: "reduce", label: "Klikaj „Reduce coins flipped” po cooldownie", type: "bool", default: true },
    { key: "buy", label: "Kupuj ulepszenia za heads/tails", type: "bool", default: true },
    { key: "weights", label: "Wagi (id:waga; 0 = nie kupuj)", type: "text",
      default: "22:20 21:3 23:1 24:0.3 32:20 31:3 33:1 34:0.3" },
  ],
  available: () => Boolean(W().player?.za?.zarUnlocked && W().hasUpgrade("za", 12) && W().layers.cf),
  run(ctx) {
    const P = W().player.cf, D = W().Decimal;
    const parts = [];

    if (ctx.p.flip) {
      if (W().hasUpgrade("za", 14)) {
        if (!P.autoFlip) { P.autoFlip = true; ctx.log("Włączono wbudowany Autoflip"); ctx.did(); }
        parts.push("Autoflip gry");
      } else if (!P.flipping && new D(W().player.za.chancePoints).gte(P.flipCost)) {
        W().clickClickable("cf", 11);
        ctx.did();
        parts.push("rzut");
      } else parts.push(P.flipping ? "moneta w locie" : "brak CP na rzut");
    }

    if (ctx.p.reduce && new D(P.reductionCooldown).lte(0) && new D(P.coinsFlipped).gte(6)) {
      const before = new D(P.coinsFlipped);
      W().clickClickable("cf", 13);
      ctx.log(`Reduce: ${W().formatWhole(before)} → ${W().formatWhole(P.coinsFlipped)} rzutów`);
      ctx.did();
    }

    if (ctx.p.buy) {
      if (W().player.sm?.buyables?.[103] && new D(W().player.sm.buyables[103]).gte(1)) {
        parts.push("ulepszenia kupuje gra");
      } else {
        const w = parseWeights(ctx.p.weights);
        const n = buyGroup(HEADS, w) + buyGroup(TAILS, w);
        if (n) { ctx.did(); parts.push(`kupiono ${n}`); }
      }
    }

    parts.push(`rzutów ${W().formatWhole(P.coinsFlipped)}, koszt ${W().format(P.flipCost)} CP`);
    ctx.status(parts.join(" · "));
  },
};
