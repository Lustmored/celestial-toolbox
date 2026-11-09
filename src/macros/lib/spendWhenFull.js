// Wspólna reguła „zapełniło się → wydaj”, używana przez Singularity Pets i Space Dust.
//  1. Kup po 1 poziomie z listy `first` (np. Stats).
//  2. Pozostałe (`others`) od najtańszych, jeśli kosztują mniej niż cheapFraction pojemności,
//     łącznie do maxBuys zakupów.
//  3. Jeśli nic nie kupiło — 1 poziom `capacity`.
// Zwraca opis zakupu do statusu albo "" gdy nie było pełne / nic nie kupiło.
export function spendWhenFull(ctx, { layer, points, max, first = [], others, capacity, cheapFraction, maxBuys }) {
  const cap = ctx.D(max());
  if (!cap.gt(0) || ctx.D(points()).lt(cap)) return "";

  const cost = id => ctx.D(window.tmp[layer].buyables[id]?.cost);
  const buy = id => {
    const price = cost(id);
    if (!price.gt(0) || ctx.D(points()).lt(price)) return false;
    if (!ctx.buyOne(layer, id)) return false;
    ctx.did();
    return true;
  };

  let bought = 0;
  for (const id of first) if (bought < maxBuys && buy(id)) bought++;
  for (const id of [...others].sort((a, b) => cost(a).cmp(cost(b)))) {
    if (bought >= maxBuys) break;
    if (cost(id).lt(ctx.D(max()).mul(cheapFraction)) && buy(id)) bought++;
  }
  if (bought) return `${bought} zakup(y)`;
  return buy(capacity) ? "Capacity" : "";
}
