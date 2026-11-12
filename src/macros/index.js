// Lista makr. Kolejność = kolejność w panelu (grupowane po `group`).
// Nowe makro: plik w src/macros/, eksport obiektu, dopisanie tutaj.
import { cbClaimAll, dotKnight, fragmentation, singularityPets } from "./checkback.js";
import { moonstone, repliGrass } from "./grids.js";
import { hexVexes, dreamRealm } from "./hex.js";
import { casinoKiller, smaAutoEnter, darkGrass } from "./darkness.js";
import { coreFragmentFarm } from "./corefrags.js";
import { spaceDust } from "./space.js";
import { petShop, fragmentShop } from "./shops.js";
import { rocketPassengers, rocketMaker } from "./rocket.js";
import { bhSkillButtons } from "./tweaks.js";
import { shipHunter } from "./ship.js";
import { starExplore } from "./exploration.js";

export default [
  cbClaimAll, dotKnight, fragmentation, singularityPets, petShop, fragmentShop,
  moonstone, repliGrass,
  hexVexes, dreamRealm,
  casinoKiller, smaAutoEnter, darkGrass, coreFragmentFarm,
  spaceDust,
  rocketPassengers, rocketMaker,
  shipHunter, starExplore,
  bhSkillButtons,
];
