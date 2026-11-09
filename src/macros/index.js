// Lista makr. Kolejność = kolejność w panelu (grupowane po `group`).
// Nowe makro: plik w src/macros/, eksport obiektu, dopisanie tutaj.
import { cbClaimAll, dotKnight, fragmentation, singularityPets } from "./checkback.js";
import { moonstone, repliGrass } from "./grids.js";
import { hexVexes } from "./hex.js";
import { casinoKiller, smaAutoEnter } from "./darkness.js";
import { spaceDust } from "./space.js";

export default [
  cbClaimAll, dotKnight, fragmentation, singularityPets,
  moonstone, repliGrass,
  hexVexes,
  casinoKiller, smaAutoEnter,
  spaceDust,
];
