// Core Fragments: wydawanie na fabryki (fa 301–307), pylon factors (i / n / in / cbs / s — Radioactive) i buyables CF (cof).
// Polityka: dla każdego typu kupuj najtańszą rzecz, jeśli kosztuje ≤ X% posiadanych fragmentów tego typu.
// Pasywki zależą od posiadanej ilości: dla Ancient/Tech/Paradox (wykładnik log/20) wydawanie prawie nic nie zmienia,
// Radioactive (×SP) jest wrażliwy — niższy limit. Tech do depozytu w Light Rift idzie tylko na Factory 303.

const NAMES = ["Ancient", "Natural", "Tech", "Paradox", "Radioactive", "Cosmic", "Temporal"];
const SOURCES = [["fa", [301, 302, 303, 304, 305, 306, 307]], ["i", [11, 12, 13]], ["n", [1, 2, 3]], ["in", [11, 12, 13]], ["cbs", [101, 102, 103]], ["s", [1, 2, 3, 4, 5, 6]], ["cof", null]];

/** Mapuje każdy buyable na typ fragmentu, porównując obiekt waluty z player.cof.coreFragments[k]. */
function discover() {
  const P = window.player, frags = P.cof.coreFragments, out = [];
  for (const [layer, ids] of SOURCES) {
    const L = window.layers[layer];
    if (!L?.buyables) continue;
    for (const id of ids ?? Object.keys(L.buyables).filter(k => !isNaN(k)).map(Number)) {
      const b = L.buyables[id];
      if (!b?.currency) continue;
      let cur; try { cur = b.currency.call(b); } catch { continue; }
      const k = frags.findIndex(f => f === cur);
      if (k >= 0) out.push({ layer, id, type: k, group: layer === "cof" ? 2 : layer === "fa" ? 1 : 0 });
    }
  }
  return out;
}

/** ln(efekt po kupnie / efekt teraz) — liczone na chwilę podbitym poziomie. Gdy efekt nie jest liczbą: 1. */
function factorGain(it) {
  const B = window.layers[it.layer]?.buyables?.[it.id];
  if (!B?.effect) return 1;
  const n = window.getBuyableAmount(it.layer, it.id);
  try {
    const cur = Number(B.effect.call(B));
    window.setBuyableAmount(it.layer, it.id, n.add(1));
    const next = Number(B.effect.call(B));
    return cur > 0 && next > cur ? Math.log(next / cur) : 1e-9;
  } catch { return 1; } finally { window.setBuyableAmount(it.layer, it.id, n); }
}

export const coreFragmentSpend = {
  id: "core-fragment-spend",
  name: "Core Fragments: wydawanie",
  group: "Singularity",
  every: 2,
  description:
    "Dla każdego typu Core Fragments kupuje w kolejności grup: pylon factors → fabryka (Assembler) → buyables CF; rzecz kupuje, gdy kosztuje ≤ X% "
      + "(pylon factors: najpierw ten, który daje największy przyrost mnożnika na fragment; pozostałe tylko drobiazgi względem niego) " +
    "posiadanych fragmentów tego typu (pasywki zależą od posiadanej ilości); niższa grupa kupuje tylko drobiazgi względem tego, na co odkłada wyższa. " +
    "Tech do depozytu w Light Rift: tylko Factory 303 (do poziomu 45 zawsze, gdy stać). " +
    "Radioactive ma niższy limit (pasywka ×SP).",
  params: [
    { key: "pct", label: "Limit: koszt ≤ % posiadanych (typy zwykłe) — zapas zostaje ≥ ~100/X × koszt następnej rzeczy", type: "number", default: 10, min: 1, max: 100, step: 5 },
    { key: "radPct", label: "Limit dla Radioactive (pasywka ×SP)", type: "number", default: 5, min: 0, max: 100, step: 5 },
    { key: "techPct", label: "Limit dla Tech", type: "number", default: 10, min: 0, max: 100, step: 5 },
    { key: "techFa", label: "Factory 303 (Tech Assembler): kupuj zawsze, gdy stać, do poziomu (0 = wg limitu)", type: "number", default: 45, min: 0, step: 1 },
    { key: "techLR", label: "Tech: do depozytu w Light Rift tylko Factory 303", type: "bool", default: true },
    { key: "groupRatio", label: "Kolejność grup: pylon factors → fabryka → buyables CF. Niższa grupa kupuje tylko rzeczy ≤ % najtańszej odkładanej z wyższej", type: "number", default: 5, min: 0, max: 100, step: 5 },
    { key: "skip", label: "Pomijaj typy (numery: 0 Ancient, 1 Natural, 2 Tech, 3 Paradox, 4 Radioactive, 5 Cosmic, 6 Temporal)", type: "text", default: "" },
    { key: "exclude", label: "Pomijaj buyables (np. fa305 cof24)", type: "text", default: "" },
  ],
  available: () => Boolean(window.player?.cof?.coreFragments && window.layers.cof),
  run(ctx) {
    const P = window.player;
    const items = discover();
    const skip = new Set(ctx.parseIds(ctx.p.skip));
    const excl = new Set(String(ctx.p.exclude ?? "").toLowerCase().split(/[\s,;]+/).filter(Boolean));
    const lrTechDone = Boolean(P.lightRift?.interspaceConditions?.[3]);
    const bought = [];
    for (let k = 0; k < 7; k++) {
      if (skip.has(k)) continue;
      const pct = k === 4 ? ctx.p.radPct : k === 2 ? ctx.p.techPct : ctx.p.pct;
      if (!(pct > 0)) continue;
      let mine = items.filter(it => it.type === k && !excl.has(`${it.layer}${it.id}`.toLowerCase()));
      if (k === 2 && ctx.p.techLR && !lrTechDone) mine = mine.filter(it => it.layer === "fa");
      for (let guard = 0; guard < 50; guard++) {
        const held = Number(P.cof.coreFragments[k]);
        let best = null, cap = Infinity; // cap: limit kosztu dla niższych grup (odkładanie na wyższą)
        for (const g of [0, 1, 2]) {
          let cheapest = Infinity;
          const avail = [];
          for (const it of mine) {
            if (it.group !== g) continue;
            const t = window.tmp[it.layer]?.buyables?.[it.id];
            if (!t || t.unlocked === false) continue;
            const lim = Number(t.purchaseLimit ?? Infinity);
            if (Number(window.getBuyableAmount(it.layer, it.id)) >= lim) continue;
            const cost = Number(t.cost);
            if (!(cost > 0)) continue;
            avail.push({ ...it, cost, canBuy: t.canBuy });
          }
          // Pylon factors (grupa 0): cel = najlepszy przyrost mnożnika na fragment (ln(efekt po/przed) / koszt),
          // a nie najtańszy — inaczej drobne poziomy Factor I zjadają fragmenty odkładane na Factor III.
          let target = null;
          if (g === 0) for (const it of avail) {
            it.eff = factorGain(it) / it.cost;
            if (!target || it.eff > target.eff) target = it;
          }
          for (const it of avail) {
            cheapest = Math.min(cheapest, it.cost);
            if (!it.canBuy || it.cost > cap) continue;
            if (target && it !== target && it.cost > target.cost * ctx.p.groupRatio / 100) continue;
            // Factory 303 przyspiesza Tech do Light Rift — zwraca się szybko, kupujemy do progu niezależnie od limitu.
            const faTech = it.layer === "fa" && it.id === 303 && Number(window.getBuyableAmount("fa", 303)) < ctx.p.techFa;
            if (!faTech && !(it.cost <= held * pct / 100)) continue;
            if (!best || (target ? it === target || (best !== target && it.cost < best.cost) : it.cost < best.cost)) best = it;
          }
          if (best) break;
          const ref = target ? target.cost : cheapest;
          if (isFinite(ref)) cap = Math.min(cap, ref * ctx.p.groupRatio / 100);
        }
        if (!best || !ctx.buyOne(best.layer, best.id)) break;
        bought.push(`${NAMES[k]}: ${best.layer} ${best.id}`);
        ctx.did();
      }
    }
    ctx.status(bought.length ? bought.slice(-6).join(", ") + (bought.length > 6 ? ` (+${bought.length - 6})` : "") : "nic poniżej limitów");
  },
};
