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
/** Buyable slotów pogrupowane wg waluty (czerwone/niebieskie/żółte żetony) — każda grupa wydaje osobno. */
function chipGroups() {
  const g = W(), out = [[], [], []];
  for (const id of Object.keys(g.layers.sm.buyables)) {
    if (isNaN(+id) || +id < 100) continue;
    const cur = g.layers.sm.buyables[id].currency?.();
    const i = g.player.sm.chips.indexOf(cur);
    if (i >= 0) out[i].push(+id);
  }
  return out;
}

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
      if (tmp[id].purchaseLimit !== undefined && D(W().getBuyableAmount(layer, id)).gte(tmp[id].purchaseLimit)) continue;
      const score = D(tmp[id].cost).log10() - Math.log10(w);
      if (score < bestScore) { bestScore = score; best = id; }
    }
    if (best == null) break;
    const B = W().layers[layer].buyables[best];
    if (!B.canAfford.call(B)) break;
    const before = D(W().getBuyableAmount(layer, best));
    W().buyBuyable(layer, best);
    W().updateBuyableTemp?.(layer);
    if (D(W().getBuyableAmount(layer, best)).eq(before)) break;
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

/** Obrót (koła/slotów) i tak wyzeruje CP — resztę wydajemy na Check Back Factors (najtańsze najpierw). */
const FACTORS = [11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 23];
// Factory: CP 11–13, heads 14, tails 15, wheel points 16, żetony 17–19. Przed resetem, który i tak wyzeruje walutę, wydajemy ją.
const RESET_FACTORS = { wheel: [11, 12, 13, 14, 15], slot: [11, 12, 13, 14, 15, 16], card: [11, 12, 13, 14, 15, 16, 17, 18, 19] };
function factorDump(ctx, kind, cpReserve) {
  const g = W(), T = g.tmp.cbs?.buyables;
  if (!ctx.p.factors || !T) return 0;
  let n = 0;
  for (const id of RESET_FACTORS[kind]) {
    if (!T[id]?.unlocked) continue;
    const B = g.layers.cbs.buyables[id];
    const isCP = B.currency?.() === g.player.za.chancePoints;
    for (let i = 0; i < 500; i++) {
      g.updateBuyableTemp?.("cbs");
      const lim = T[id].purchaseLimit; if (lim !== undefined && D(g.getBuyableAmount("cbs", id)).gte(lim)) break;
      if (!B.canAfford.call(B)) break;
      if (isCP && D(g.player.za.chancePoints).sub(T[id].cost).lt(cpReserve)) break;
      const before = D(g.getBuyableAmount("cbs", id));
      g.buyBuyable("cbs", id);
      if (D(g.getBuyableAmount("cbs", id)).eq(before)) break;
      n++;
    }
  }
  if (n) ctx.log(`Check Back Factors: +${n} poz. z walut, które ${kind === "wheel" ? "obrót koła" : kind === "slot" ? "obrót slotów" : "card reset"} i tak wyzeruje`);
  return n;
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
    { key: "upgSave", label: "Oszczędzaj CP na następne ulepszenie Zar, gdy osiągalne w…", type: "bool", default: true },
    { key: "upgSec", label: "…tylu sekundach (z softcapem)", type: "number", default: 300, min: 0, step: 30 },
    { key: "upgBuy", label: "Kupuj to ulepszenie od razu, gdy stać", type: "bool", default: true },
    { key: "slots", label: "Sloty: kręć, oszczędzając na nie CP (wstrzymuje koło)", type: "bool", default: true },
    { key: "slotSec", label: "Sloty: oszczędzaj, gdy brakuje ≤ tylu sekund…", type: "number", default: 120, min: 0, step: 30 },
    { key: "slotFrac", label: "…albo ≤ tej części czasu od ostatniego obrotu slotów", type: "number", default: 0.5, min: 0, step: 0.1 },
    { key: "reduceSlots", label: "Klikaj „Reduce slots spun” po cooldownie", type: "bool", default: true },
    { key: "buyChips", label: "Kupuj buyable za żetony", type: "bool", default: true },
    { key: "chipWeights", label: "Wagi żetonów (103 auto-Coin Flip, 115 ^CP, 116 ^softcapy, 117 ^żetony, 102 softcap CP, 108 ×żetony, 106 evo shardy z koła, 101 heads/tails, 104/105 koło, 107 autospin)", type: "text",
      default: "103:100 115:20 116:20 117:20 102:10 108:8 106:6 101:5 104:4 105:3 107:1" },
    { key: "blessings", label: "Blessings (Check Back Shrine) traktuj jak ulepszenia Zar: oszczędzaj i kupuj", type: "bool", default: true },
    { key: "factors", label: "Przed obrotem koła/slotów i card resetem: waluty, które przepadną (CP ponad koszt, heads, tails, wheel points, żetony) na Check Back Factors", type: "bool", default: true },
    { key: "cardReset", label: "Card generators: reset Dice Space, gdy zysk ≥ K × posiadane", type: "bool", default: true },
    { key: "drawBeforeReset", label: "Dobieraj karty tuż przed card resetem (najwięcej kart na dobranie)", type: "bool", default: true },
    { key: "cardMode", label: "Moment card resetu", type: "select", default: "rate",
      options: [["rate", "przyrost spada poniżej średniego tempa"], ["ratio", "zysk ≥ K × posiadane"]] },
    { key: "cardTol", label: "Reset, gdy bieżący przyrost < średnie tempo runu o ≥ tyle %…", type: "number", default: 3, min: 0, step: 1 },
    { key: "cardPatience", label: "…i nie wraca przez tyle sekund (maksymalnie)…", type: "number", default: 20, min: 0, step: 5 },
    { key: "cardPatFrac", label: "…ale najwyżej przez taką część długości runu", type: "number", default: 0.1, min: 0, step: 0.05 },
    { key: "cardK", label: "Tryb K: K (1 = podwojenie generatorów)", type: "number", default: 1, min: 0.1, step: 0.1 },
    { key: "cardMin", label: "Minimalny zysk generatorów", type: "number", default: 1, min: 1, step: 1 },
    { key: "spin", label: "Kręć kołem", type: "bool", default: true },
    { key: "passiveNoSpin", label: "Nie kręć kołem, gdy masz pasywne wheel points (ulepszenie kart 12)", type: "bool", default: true },
    { key: "passiveNoSlot", label: "Nie kręć slotami, gdy masz pasywne żetony (ulepszenie kart 16)", type: "bool", default: true },
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
      if (ctx.p.buyWheel && !W().hasUpgrade("car", 17) && buyGroup("wof", WHEEL, parseWeights(ctx.p.wheelWeights))) ctx.did();
      ctx.status(`koło się kręci · obrotów ${W().formatWhole(wof.wheelsSpinned)}`);
      return;
    }

    // Card generators: reset całego Dice Space, gdy zysk ≥ K × posiadane (domyślnie podwojenie).
    const car = P.car;
    let cardHold = false;
    if (ctx.p.cardReset && car && W().layers.car && W().tmp.car?.layerShown !== false) {
      const get = D(car.cardGeneratorsToGet), have = D(car.cardGenerators);
      const now = Date.now();
      ctx.state.cardStart ??= now;
      let doReset = false, why = "";
      const elapsed = now - ctx.state.cardStart;
      // Obroty slotów zerują CP, więc zysk z card resetu skacze w dół — liczymy tempo z najlepszego zysku w tym runie.
      if (get.gt(ctx.state.cardMaxGet ?? 0)) ctx.state.cardMaxGet = get.toNumber();
      const maxGet = ctx.state.cardMaxGet ?? 0;
      if (ctx.p.cardMode === "ratio") doReset = get.gte(Math.max(1, ctx.p.cardMin)) && get.gte(have.mul(ctx.p.cardK));
      else if (maxGet >= Math.max(1, ctx.p.cardMin) && elapsed >= 10000) {
        // Twierdzenie o wartości krańcowej: resetujemy, gdy bieżący przyrost zysku (z ostatnich ~20% runu)
        // spadnie poniżej średniego tempa całego runu — dalsze czekanie obniżałoby średnią.
        const hist = (ctx.state.cardHist ??= []);
        hist.push([now, maxGet]);
        const w = Math.max(4000, 0.2 * elapsed);
        while (hist.length > 2 && hist[1][0] <= now - w) hist.shift();
        const [t0, g0] = hist[0];
        const marginal = (maxGet - g0) / Math.max(1, (now - t0) / 1000);
        const avg = maxGet / (elapsed / 1000);
        if (now - t0 >= w * 0.9 && marginal < avg * (1 - ctx.p.cardTol / 100)) {
          ctx.state.cardBelow ??= now;
          const pat = Math.min(ctx.p.cardPatience * 1000, (ctx.p.cardPatFrac ?? 0.1) * elapsed);
          if (now - ctx.state.cardBelow >= pat) {
            if (get.gte(maxGet * 0.98)) doReset = true;
            else { cardHold = true; why += ` · czekam, aż zysk wróci do ${maxGet}`; }
          }
        } else ctx.state.cardBelow = null;
        why = ` · przyrost ${(marginal * 60).toFixed(1)}/min vs średnio ${(avg * 60).toFixed(1)}/min` + why;
      } else if (ctx.p.cardMode !== "ratio") why = " · mierzę tempo";
      if (doReset && (P.sm?.spinActive || wof?.spinActive)) {
        // Obrót w toku — czekamy na jego koniec, ale nie pozwalamy kolejnym obrotom zjeść CP.
        cardHold = true; parts.push("card reset po końcu obrotu");
      } else if (doReset) {
        factorDump(ctx, "card", get.gt(0) ? D(P.za.chancePoints) : D(0)); // CP zostawiamy — od nich zależą generatory
        if (ctx.p.drawBeforeReset) { // karty na dobranie są teraz najliczniejsze (buyable x4 na maksimum runu)
          let d = 0;
          for (let i = 0; i < 200 && D(car.cardShreds).gte(car.cardShredReq); i++) {
            const before = D(car.cardDrawAmount);
            W().clickClickable("car", 12);
            if (D(car.cardDrawAmount).eq(before)) break;
            d++; W().layers.car.update?.(0);
          }
          if (d) ctx.log(`Dobrano karty ${d}× tuż przed card resetem`);
        }
        W().clickClickable("car", 11);
        ctx.state.cardStart = now; ctx.state.cardBest = 0; ctx.state.cardBelow = null; ctx.state.cardMaxGet = 0; ctx.state.cardHist = [];
        ctx.state.slotStart = ctx.state.runStart = now; ctx.state.saving = ctx.state.slotSaving = false;
        ctx.log(`Card reset: +${W().formatWhole(get)} generatorów (było ${W().formatWhole(have)})`);
        ctx.did(); ctx.status("card reset"); return;
      }
      if (have.gt(0) || get.gt(0)) parts.push(`generatory ${W().formatWhole(have)} (+${W().formatWhole(get)})${why}`);
    }

    let saving = cardHold;
    const dumpOn = ctx.p.spinDump !== false && !(P.sm?.buyables?.[103] && D(P.sm.buyables[103]).gte(1));

    // Główne ulepszenia Zar (za chance points): gdy następne jest w zasięgu, nie wydajemy CP i nie kręcimy (obrót zeruje CP).
    let upgHold = cardHold;
    if (ctx.p.upgSave) {
      const cands = [];
      for (const L of ["za", ...(ctx.p.blessings ? ["cbs"] : [])]) {
        const T = W().tmp[L]?.upgrades ?? {};
        for (const id of Object.keys(W().layers[L]?.upgrades ?? {})) {
          if (isNaN(+id) || !T[id]?.unlocked || W().hasUpgrade(L, id)) continue;
          const u = W().layers[L].upgrades[id];
          if (L !== "za" && u.currencyInternalName !== "chancePoints") continue;
          cands.push({ L, id, cost: D(T[id].cost) });
        }
      }
      cands.sort((a, b) => a.cost.cmp(b.cost));
      const nx = cands[0];
      const next = nx && `${nx.L === "za" ? "Zar" : "Blessing"} ${nx.id}`;
      if (nx) {
        const cost = nx.cost;
        if (D(P.za.chancePoints).gte(cost) && ctx.p.upgBuy) {
          W().buyUpgrade(nx.L, nx.id);
          if (W().hasUpgrade(nx.L, nx.id)) { ctx.log(`Kupiono ${next} (${W().format(cost)} CP)`); ctx.did(); }
        } else {
          const eta = cpEta(cost);
          if (eta <= ctx.p.upgSec) {
            upgHold = saving = true;
            parts.push(`oszczędzam na ${next}: ${W().format(P.za.chancePoints)}/${W().format(cost)} CP (~${W().formatTime(eta)})`);
          }
        }
      }
    }

    // Sloty: najdroższy reset (zeruje CP, Coin Flip i całe koło). Gdy obrót slotów w zasięgu — oszczędzamy na niego.
    let slotHold = false;
    const sm = P.sm;
    // Z pasywnymi żetonami (ulepszenie kart 16) obrót slotów tylko kasuje Coin Flip i koło — wtedy nie kręcimy.
    const slotPassive = ctx.p.passiveNoSlot && W().hasUpgrade("car", 16);
    const smOn = Boolean(ctx.p.slots && !slotPassive && sm && W().layers.sm && W().tmp.sm?.layerShown !== false);
    if (slotPassive) parts.push("sloty: pasywne żetony, bez obrotów");
    if (smOn && sm.spinActive) parts.push("sloty się kręcą");
    if (smOn && !upgHold && !sm.spinActive) {
      const cost = D(sm.spinCost), cp = D(P.za.chancePoints);
      if (cp.gte(cost)) {
        factorDump(ctx, "slot", cost);
        W().clickClickable("sm", 21);
        if (sm.spinActive) {
          ctx.state.slotStart = ctx.state.runStart = Date.now(); ctx.state.saving = ctx.state.slotSaving = false;
          ctx.log(`Sloty: obrót ${W().formatWhole(sm.spinAmount)}, koszt ${W().format(cost)} CP`);
          ctx.did(); ctx.status("obrót slotów"); return;
        }
      }
      ctx.state.slotStart ??= Date.now();
      const eta = cpEta(cost);
      const limit = Math.max(ctx.p.slotSec, (Date.now() - ctx.state.slotStart) / 1000 * ctx.p.slotFrac);
      if (eta <= limit || (ctx.state.slotSaving && eta <= 3 * limit)) {
        slotHold = saving = true;
        parts.push(`oszczędzam na sloty: ${W().format(cp)}/${W().format(cost)} CP (~${W().formatTime(eta)})`);
      }
      ctx.state.slotSaving = slotHold;
    }
    if (sm && W().layers.sm) {
      if (smOn && ctx.p.reduceSlots && D(sm.reductionCooldown).lte(0) && D(sm.spinAmount).gte(2) && !sm.spinActive) {
        W().clickClickable("sm", 12); ctx.log("Reduce slots spun"); ctx.did();
      }
      if (ctx.p.buyChips && !W().hasUpgrade("car", 17)) { // od ulepszenia kart 17 gra kupuje je sama (za darmo)
        const w = parseWeights(ctx.p.chipWeights);
        let k = 0; for (const g of chipGroups()) k += buyGroup("sm", g, w);
        if (k) { ctx.did(); parts.push(`żetony: kupiono ${k}`); }
      }
    }
    // Wbudowany autospin koła nie wie o oszczędzaniu — wyłączamy go na ten czas.
    if (wof && (upgHold || slotHold) && wof.autoSpin) { wof.autoSpin = false; ctx.state.autoSpinWas = true; }
    else if (wof && !upgHold && !slotHold && ctx.state.autoSpinWas) { wof.autoSpin = true; ctx.state.autoSpinWas = false; }

    // Z pasywnymi wheel points (ulepszenie kart 12) obrót koła głównie kasuje Coin Flip i CP — wtedy nie kręcimy.
    const wheelPassive = ctx.p.passiveNoSpin && W().hasUpgrade("car", 12);
    if (wheelPassive) {
      parts.push("koło: pasywne wheel points, bez obrotów");
      if (wof?.autoSpin) { wof.autoSpin = false; ctx.log("Wyłączono wbudowany autospin koła (pasywne wheel points)"); }
    }
    if (wheelOn && ctx.p.spin && !upgHold && !slotHold && !wheelPassive) {
      if (dumpOn && ctx.state.saving && spinDump()) { ctx.did(); W().updateTemp?.(); }
      const cp = D(P.za.chancePoints), cost = D(wof.spinCost);
      if (cp.gte(cost)) {
        if (dumpOn && spinDump()) { ctx.did(); W().updateTemp?.(); }
        factorDump(ctx, "wheel", D(wof.spinCost));
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
        // Od ulepszenia Zar 18 rzut nic nie kosztuje — wtedy Autoflip zawsze włączony.
        const freeFlip = W().hasUpgrade("za", 18);
        const want = freeFlip || !saving;
        if (Boolean(cf.autoFlip) !== want) { cf.autoFlip = want; ctx.did(); }
        if (want) parts.push("Autoflip gry");
      } else if ((!saving || W().hasUpgrade("za", 18)) && !cf.flipping && D(P.za.chancePoints).gte(cf.flipCost)) {
        W().clickClickable("cf", 11);
        ctx.did();
        parts.push("rzut");
      }
    }

    if (ctx.p.reduce && D(cf.reductionCooldown).lte(0) && D(cf.coinsFlipped).gte(6)) {
      W().clickClickable("cf", 13);
      ctx.did();
    }

    if (wheelOn && ctx.p.reduceWheel && !(ctx.p.passiveNoSpin && W().hasUpgrade("car", 12)) && D(wof.reductionCooldown).lte(0) && D(wof.wheelsSpinned).gte(7)) {
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
      if (!saving || upgHold) n += buyGroup("cf", HEADS, w) + buyGroup("cf", TAILS, w);
    }
    if (ctx.p.buyCP && !saving && !smAuto) n += buyGroup("cf", CP_BUY, parseWeights(ctx.p.cpWeights));
    if (wheelOn && ctx.p.buyWheel && !W().hasUpgrade("car", 17)) n += buyGroup("wof", WHEEL, parseWeights(ctx.p.wheelWeights));
    if (n) { ctx.did(); parts.push(`kupiono ${n}`); }
    if (smAuto) parts.push("buyable Coin Flipa kupuje gra");

    parts.push(`rzutów ${W().formatWhole(cf.coinsFlipped)}`);
    if (wheelOn) parts.push(`obrót za ${W().format(wof.spinCost)} CP`);
    ctx.status(parts.join(" · "));
  },
};

const SUITS = [[11, 12, 13, 14], [21, 22, 23, 24], [31, 32, 33, 34], [41, 42, 43, 44]];

export const cardsHelper = {
  id: "cards-helper",
  name: "Cards: buyable kolorów (opcjonalnie dobieranie i poziomy)",
  group: "Universe Epsilon",
  every: 0.2,
  description:
    "Po każdym card resecie odbudowuje Cards: dobiera karty, gdy starcza shredów, klika „Level All” i kupuje buyable za punkty kolorów " +
    "(pik/kier/karo/trefl — każdy kolor ma własną walutę). Wagi: x1 = mnożnik punktów koloru, x2 = bonus koloru " +
    "(CP / heads-tails / wheel points / żetony), x3 = shredy, x4 = +karty na dobranie (limit 10). Ulepszenia i buyable za generatory zostają Tobie.",
  params: [
    { key: "draw", label: "Dobieraj karty, gdy starcza shredów", type: "bool", default: false },
    { key: "level", label: "Klikaj „Level All”", type: "bool", default: false },
    { key: "buy", label: "Kupuj buyable kolorów", type: "bool", default: true },
    { key: "weights", label: "Wagi w każdym kolorze (x1..x4 → 1..4)", type: "text", default: "4:10 1:5 3:4 2:3" },
  ],
  available: () => Boolean(W().player?.car && W().layers.car && W().tmp.car?.layerShown !== false),
  run(ctx) {
    const g = W(), car = g.player.car, parts = [];
    let n = 0;
    if (ctx.p.draw) {
      for (let i = 0; i < 20 && D(car.cardShreds).gte(car.cardShredReq); i++) {
        const before = D(car.cardDrawAmount);
        g.clickClickable("car", 12);
        if (D(car.cardDrawAmount).eq(before)) break;
        n++; g.layers.car.update?.(0); // przelicz koszt następnego dobrania
      }
      if (n) parts.push(`dobrano ${n}×`);
    }
    if (ctx.p.level) {
      g.updateClickableTemp?.("car");
      if (g.tmp.car.clickables?.[2]?.canClick) { g.clickClickable("car", 2); parts.push("Level All"); n++; }
    }
    if (ctx.p.buy) {
      const base = parseWeights(ctx.p.weights);
      let k = 0;
      for (const ids of SUITS) {
        const w = {}; ids.forEach((id, j) => { if (base[j + 1]) w[id] = base[j + 1]; });
        k += buyGroup("car", ids, w);
      }
      if (k) { parts.push(`kupiono ${k}`); n += k; }
    }
    if (n) ctx.did();
    parts.push(`shredy ${g.format(car.cardShreds)}/${g.format(car.cardShredReq)}`);
    ctx.status(parts.join(" · "));
  },
};
