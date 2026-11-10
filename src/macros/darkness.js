// Punchcards (DU1) i wejście do Starmetal Alloy.

const hasCard = id => window.getLevelableTier("pu", id, true) === true;

export const casinoKiller = {
  id: "casino-killer",
  name: "Casino Killer",
  group: "Darkness / SMA",
  every: 0.05,
  description:
    "Dopóki są zapisane wybory punchcardów, aktywuje kolejne brakujące karty z listy priorytetów dla bieżącego trybu " +
    "(Eclipse / SMA / zwykłe Darkness) zamiast wylosowanych — kilka naraz, jeśli wyborów starczy. " +
    "Obsługuje karty o koszcie 1 wyboru (ID < 400). Gdy karty nie da się aktywować, przywraca wylosowany wybór.",
  params: [
    { key: "sma", label: "Priorytet w SMA", type: "text", default: "301 201 302 300" },
    { key: "eclipse", label: "Priorytet w Eclipse", type: "text", default: "201" },
    { key: "darkness", label: "Priorytet w Darkness", type: "text", default: "301 201" },
    { key: "maxPerRun", label: "Maks. kart na jedno uruchomienie", type: "number", default: 10, min: 1, step: 1 },
  ],
  available: g => g.layerActive("pu") && Boolean(window.layers.pu?.clickables?.[10]),
  run(ctx) {
    const pu = window.player.pu;
    const inEclipse = Boolean(window.player.pet?.legPetTimers?.[0]?.active);
    const inSMA = Boolean(window.player.sma?.inStarmetalChallenge) && !inEclipse;
    const mode = inEclipse ? "eclipse" : inSMA ? "sma" : "darkness";
    const wanted = ctx.parseIds(ctx.p[mode]).filter(id => id < 400 && window.player.pu.levelables[id]);

    const activated = [];
    let note = "";
    while (activated.length < ctx.p.maxPerRun) {
      const missing = wanted.filter(id => !hasCard(id));
      if (!missing.length) { note = "wszystkie karty z listy są aktywne"; break; }
      if (pu.storedSelections.lt(1)) { note = `czekam na wybór (${window.player.universe})`; break; }
      const next = missing.find(id => {
        const card = window.layers.pu.levelables[id];
        return card && window.run(card.canSelect, card);
      });
      if (next === undefined) { note = `karty ${missing.join(", ")} niedostępne`; break; }

      const prev = { card: pu.selectedPunchcards[0], index: pu.selectionIndex, cost: pu.selectionCost };
      pu.selectedPunchcards[0] = next;
      pu.selectionIndex = 0;
      pu.selectionCost = new window.Decimal(1);
      if (!ctx.click("pu", 10, { refresh: true }) || !hasCard(next)) {
        // Nie udało się — nie zostawiamy podmienionej karty w wyborze.
        pu.selectedPunchcards[0] = prev.card;
        pu.selectionIndex = prev.index;
        pu.selectionCost = prev.cost;
        window.updateClickableTemp("pu");
        note = `przycisk nieaktywny dla ${next}`;
        break;
      }
      activated.push(next);
      ctx.did();
    }
    if (activated.length) ctx.status(`${mode}: aktywowano ${activated.join(", ")}` + (note ? ` · ${note}` : ""));
    else ctx.status(`${mode}: ${note}`);
  },
};

export const smaAutoEnter = {
  id: "sma-auto-enter",
  name: "SMA Auto-enter",
  group: "Darkness / SMA",
  every: 0.25,
  description:
    "Gdy jesteś w U3, poza SMA i poza Eclipse, klika ten sam przycisk, którym ręcznie wchodzisz do SMA. " +
    "Po włączeniu wyłącza wbudowane (zbugowane) Auto Enter gry. Wbudowane Auto Reset i Auto Leave zostaw włączone.",
  available: g => g.layerActive("sma"),
  onEnable(ctx) {
    if (window.player.sme?.autoEnterToggle) {
      window.player.sme.autoEnterToggle = false;
      ctx.log("Wyłączono wbudowane Auto Enter.");
    }
  },
  run(ctx) {
    const p = window.player;
    if (p.universe === "U3" && !p.sma.inStarmetalChallenge && !p.pet?.legPetTimers?.[0]?.active) {
      if (ctx.click("sma", 11)) { ctx.did(); ctx.status("weszło do SMA"); }
    }
  },
};

// Dark Grass: siatka 5×5, ID komórki = kolumna*100 + wiersz. Komórki rosną do limitu
// (Max Grass) i dalej stoją, więc zbieranie wszystkiego, co > 0, niczego nie traci.
export const darkGrass = {
  id: "dark-grass",
  name: "Dark Grass",
  group: "Darkness / SMA",
  every: 1,
  description: "Zbiera trawę ze wszystkich pól siatki Dark Grass (to samo, co klikanie pól).",
  available: () => Boolean(window.player?.dgr && window.layers?.dgr?.grid?.onClick && window.tmp?.dgr?.layerShown === true),
  run(ctx) {
    let n = 0;
    for (let col = 1; col <= 5; col++) {
      for (let row = 1; row <= 5; row++) {
        const id = col * 100 + row;
        const v = window.getGridData("dgr", id);
        if (v?.gt?.(0)) { window.layers.dgr.grid.onClick(v, id); n++; }
      }
    }
    if (n) { ctx.did(n); ctx.status(`ostatnio ${n} pól`); }
  },
};
