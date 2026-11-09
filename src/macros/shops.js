// Pet Shop i sklep we Fragmentation: kupuje dokładnie tyle sztuk, ile brakuje do następnego poziomu
// peta (koszt za sztukę rośnie z bulkiem, więc małe zakupy co cooldown są najtańsze), i od razu go awansuje.

const pet = () => window.player.pet;
const run = (f, t) => window.run(f, t);

/** Mapa: wartość indeksu ustawianego przez przycisk wyboru -> id tego przycisku. */
function selectors(field) {
  const out = {};
  const cl = window.layers.pet.clickables;
  const re = new RegExp(`${field} = (\\d+)`);
  for (const id in cl) {
    const c = cl[id];
    if (!c || typeof c !== "object" || typeof c.onClick !== "function") continue;
    const m = String(c.onClick).match(re);
    if (m) out[Number(m[1])] = id;
  }
  return out;
}
let shopSel, fragSel, fragBuy;

/** Id przycisku, którego onClick zawiera dany fragment kodu (np. przycisk „Buy”). */
function buttonWith(snippet) {
  const cl = window.layers.pet.clickables;
  for (const id in cl) if (typeof cl[id]?.onClick === "function" && String(cl[id].onClick).includes(snippet)) return id;
  return null;
}

const tabVisible = (group, name) => {
  const t = window.layers.pet.microtabs?.[group]?.[name];
  return Boolean(t) && (t.unlocked === undefined || Boolean(run(t.unlocked, t)));
};
const clickVisible = id => Boolean(id && window.tmp.pet.clickables[id]?.unlocked);

function nextLevelNeed(pid) {
  const d = pet().levelables[pid];
  const t = window.tmp.pet.levelables[pid];
  if (!d || !t?.unlocked) return null;
  if (window.Decimal.gte(d[0], t.levelLimit)) return null; // max poziom dla tego tieru
  return Math.max(0, Math.ceil(Number(window.Decimal.sub(t.xpReq, d[1]))));
}

function levelUp(pid) {
  window.updateLevelableTemp("pet");
  if (!window.tmp.pet.levelables[pid]?.canBuy) return false;
  window.buyLevelable("pet", pid);
  window.updateLevelableTemp("pet");
  return true;
}

/** Ustawia bulk (pole wpisywane przez gracza) i przelicza koszty sklepu kodem gry. */
function setBulk(inputKey, n) {
  pet()[inputKey] = new window.Decimal(n);
  // Dwa razy: Pet Shop liczy ceny przed przepisaniem bulku z pola wejściowego.
  window.layers.pet.update(0);
  window.layers.pet.update(0);
}

function withRestore(keys, fn) {
  const p = pet();
  const saved = keys.map(k => [k, p[k]]);
  try {
    return fn();
  } finally {
    for (const [k, v] of saved) p[k] = v;
    window.layers.pet.update(0);
    window.updateClickableTemp("pet");
  }
}

const GROUPS = {
  common: { tab: "Common", first: 101 },
  uncommon: { tab: "Uncommon", first: 201 },
  rare: { tab: "Rare", first: 301 },
};

export const petShop = {
  id: "pet-shop",
  name: "Pet Shop",
  group: "Check Back",
  every: 5,
  description:
    "Gdy pozycja w Pet Shopie jest gotowa, kupuje dokładnie tyle petów, ile brakuje do ich następnego poziomu, i od razu go awansuje. " +
    "Opcjonalnie kupuje Paragon Shardy z ustalonym bulkiem. Twój bulk i wybrana pozycja są przywracane.",
  params: [
    { key: "order", label: "Kolejność grup", type: "text", default: "rare uncommon common" },
    { key: "paragonBulk", label: "Paragon Shardy: bulk (0 = nie kupuj)", type: "number", default: 10, min: 0, step: 1 },
    { key: "reserve", label: "Zostaw co najmniej PP", type: "number", default: 0, min: 0, step: 1000 },
    { key: "maxCost", label: "Maks. koszt jednego zakupu peta (PP)", type: "number", default: 100000, min: 0, step: 1000 },
  ],
  available: g => g.layerActive("pet") && tabVisible("content", "Pet Shop"),
  run(ctx) {
    shopSel ??= selectors("player.pet.shopIndex");
    const p = pet();
    const pp = () => window.player.cb.petPoints;
    const afford = (cost, limit = ctx.p.maxCost) => pp().sub(cost).gte(ctx.p.reserve) && cost.lte(limit);
    const bought = [];
    withRestore(["shopIndex", "shopInput"], () => {
      // Paragon Shardy (Misc.)
      if (ctx.p.paragonBulk > 0 && tabVisible("shopTabs", "Misc.") && clickVisible(shopSel[2]) && p.shop.shard[1].current.lt(0)) {
        p.shopIndex = 2;
        setBulk("shopInput", ctx.p.paragonBulk);
        const cost = p.shop.shard[1].cost;
        if (afford(cost, Infinity) && ctx.click("pet", 1003, { refresh: true })) { ctx.did(); bought.push(`${ctx.p.paragonBulk} PS`); }
      }
      for (const name of String(ctx.p.order).split(/\s+/).filter(Boolean)) {
        const g = GROUPS[name];
        if (!g || !tabVisible("shopTabs", g.tab)) continue;
        for (let j = 0; j < 9; j++) {
          const idx = g.first + j;
          const item = p.shop[name]?.[j];
          if (!item || !clickVisible(shopSel[idx]) || item.current.gte(0)) continue;
          const need = nextLevelNeed(idx);
          if (need === null) continue;
          if (need === 0) { if (levelUp(idx)) { ctx.did(); bought.push(`${idx}↑`); } continue; }
          p.shopIndex = idx;
          setBulk("shopInput", need);
          if (!afford(item.cost)) continue;
          if (ctx.click("pet", 1002, { refresh: true })) {
            ctx.did();
            levelUp(idx);
            bought.push(`${idx}×${need}`);
          }
        }
      }
    });
    if (bought.length) ctx.status("kupiono: " + bought.join(", "));
  },
};

// Indeks w sklepie Fragmentation -> pet, któremu przybywa XP (3 = Singularity Fragments dla Kres/Nav/Sel).
const FRAG_ITEMS = { 0: 401, 1: 402, 2: 403, 3: "sing", 4: 110, 5: 210, 6: 310 };
const SING_PETS = [404, 405, 406];

export const fragmentShop = {
  id: "fragment-shop",
  name: "Fragment Shop",
  group: "Check Back",
  every: 5,
  description:
    "Sklep we Fragmentation: gdy pozycja jest gotowa, kupuje tyle fragmentów, ile brakuje do następnego poziomu peta, i go awansuje. " +
    "Singularity Fragment idzie w najtańszy następny poziom Kres/Nav/Sel. Przy ścisłej kolejności nie kupuje niższych pozycji, " +
    "gdy wyższa jest gotowa, ale za droga.",
  params: [
    { key: "order", label: "Kolejność (0 Dotknight, 1 Dragon, 2 Cookie, 3 Singularity, 4 Coin, 5 Refined, 6 Evolution)", type: "text", default: "1 0 2 3 4 5 6" },
    { key: "strict", label: "Ścisła kolejność (oszczędzaj na wyższe pozycje)", type: "bool", default: true },
  ],
  available: g => g.layerActive("pet") && tabVisible("content", "Fragmentation") && tabVisible("frags", "Shop"),
  run(ctx) {
    fragSel ??= selectors("player.pet.fragShopIndex");
    fragBuy ??= buttonWith("fragShopCost1");
    const p = pet();
    const bought = [];
    withRestore(["fragShopIndex", "fragShopInput"], () => {
      for (const idx of ctx.parseIds(ctx.p.order)) {
        const target = FRAG_ITEMS[idx];
        const slot = p.fragShop?.[idx];
        if (target === undefined || !slot || !clickVisible(fragSel[idx]) || slot.current.gte(0)) continue;

        let pid = target, need;
        if (target === "sing") {
          const opts = SING_PETS.map(id => {
            const d = p.levelables[id], t = window.tmp.pet.levelables[id];
            if (!t?.unlocked || window.Decimal.gte(d[0], t.levelLimit)) return null;
            return { id, need: Math.max(0, Math.ceil(Number(window.Decimal.sub(t.xpReq, p.singularityFragments)))) };
          }).filter(Boolean).sort((a, b) => a.need - b.need);
          if (!opts.length) continue;
          ({ id: pid, need } = opts[0]);
        } else {
          need = nextLevelNeed(pid);
          if (need === null) continue;
        }
        if (need === 0) { if (levelUp(pid)) { ctx.did(); bought.push(`${pid}↑`); } continue; }

        p.fragShopIndex = idx;
        setBulk("fragShopInput", need);
        if (ctx.click("pet", fragBuy, { refresh: true })) {
          ctx.did();
          levelUp(pid);
          bought.push(`${idx}×${need}`);
        } else if (ctx.p.strict) {
          break; // gotowa, ale za droga — nie wydawaj na niższe pozycje
        }
      }
    });
    if (bought.length) ctx.status("kupiono: " + bought.join(", "));
  },
};
