// Cienka warstwa nad globalnymi obiektami The Modding Tree (player, layers, tmp).
// Makra korzystają z tych helperów zamiast sięgać po DOM.

const g = window;

export const D = x => (x instanceof g.Decimal ? x : new g.Decimal(x ?? 0));

export function gameReady() {
  return (
    typeof g.player === "object" && g.player !== null &&
    typeof g.tmp === "object" && g.tmp !== null &&
    typeof g.layers === "object" &&
    typeof g.gameLoop === "function" &&
    typeof g.clickClickable === "function" &&
    typeof g.Decimal === "function" &&
    g.player.time !== undefined
  );
}

/** Czy warstwa istnieje, jest odblokowana i nie jest wyłączona. */
export function layerActive(layer) {
  return Boolean(g.layers[layer] && g.player[layer]?.unlocked && !g.tmp[layer]?.deactivated);
}

/** Czy przycisk da się teraz kliknąć (wg tych samych warunków, co clickClickable w grze). */
export function canClick(layer, id) {
  const t = g.tmp[layer]?.clickables?.[id];
  return Boolean(layerActive(layer) && t && t.unlocked && t.canClick);
}

/**
 * Klika przycisk gry. Zwraca true, jeśli kliknięcie się wykonało.
 * refresh: przelicz tmp przed sprawdzeniem — potrzebne, gdy makro zmieniło stan,
 * od którego zależy canClick (np. bannerIndex), bo tmp jest liczone raz na tick.
 */
export function click(layer, id, { refresh = false } = {}) {
  if (!g.layers[layer]?.clickables?.[id]) return false;
  if (refresh) g.updateClickableTemp(layer);
  if (!canClick(layer, id)) return false;
  g.clickClickable(layer, id);
  return true;
}

export const buyableLevel = (layer, id) => D(g.player[layer]?.buyables?.[id]);

/** Kupuje 1 poziom buyable. Zwraca true, jeśli poziom wzrósł dokładnie o 1. */
export function buyOne(layer, id) {
  const before = buyableLevel(layer, id);
  g.buyBuyable(layer, id);
  const after = buyableLevel(layer, id);
  if (after.eq(before)) return false;
  if (!after.eq(before.add(1))) {
    throw new Error(`Nieoczekiwany skok poziomu ${layer}/${id}: ${before} → ${after}`);
  }
  return true;
}

/** Zamienia tekst "13, 22 11" na [13, 22, 11]. */
export const parseIds = text =>
  String(text ?? "").split(/[^0-9]+/).filter(Boolean).map(Number);
