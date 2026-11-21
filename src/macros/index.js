// Lista makr. Kolejność = kolejność w panelu (grupowane po `group`).
// Nowe makro: plik w src/macros/, eksport obiektu, dopisanie tutaj.
import { cbClaimAll, dotKnight, fragmentation, singularityPets } from "./checkback.js";
import { moonstone } from "./grids.js";
import { hexVexes, dreamRealm } from "./hex.js";
import { casinoKiller, smaAutoEnter, hiveUnpause, spaceLoop } from "./darkness.js";
import { coreFragmentFarm } from "./corefrags.js";
import { spaceDust } from "./space.js";
import { petShop, fragmentShop } from "./shops.js";
import { rocketPassengers } from "./rocket.js";
import { bhSkillButtons, labAutoEnter } from "./tweaks.js";
import { shipHunter } from "./ship.js";
import { starExplore } from "./exploration.js";
import { pollenLoop, nectarLoop, flowerPicker, hiveResearch, twigCollector, flowerGilding } from "./hive.js";
import { numbnessLoop } from "./numbness.js";
import { coinFlipper } from "./zar.js";
import { stableSoftcaps } from "./tweaks.js";

export default [
  cbClaimAll, dotKnight, fragmentation, singularityPets, petShop, fragmentShop,
  moonstone,
  hexVexes, dreamRealm,
  casinoKiller, smaAutoEnter, hiveUnpause, spaceLoop, coreFragmentFarm,
  spaceDust,
  rocketPassengers,
  shipHunter, starExplore,
  flowerPicker, pollenLoop, nectarLoop, hiveResearch, twigCollector, flowerGilding,
  numbnessLoop,
  coinFlipper, stableSoftcaps,
  bhSkillButtons, labAutoEnter,
];
