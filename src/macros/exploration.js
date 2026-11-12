// Space Exploration (se): gdy statek stoi, wysyła go do następnej gwiazdy — tym samym przyciskiem co gracz.
// Podróż można zacząć tylko do gwiazdy sąsiedniej, więc do dalszego celu idziemy najkrótszą (czasowo) trasą
// po gwiazdach już widocznych; każde przybycie po drodze też liczy się jako wizyta.

const STAR_IDS = [11, 12, 13, 14, 15, 16, 21, 22, 23, 31, 32];
const MAX_VISITS = 100;
const coord = id => [Math.floor(id / 10) - 1, (id % 10) - 1];

/** Sąsiedzi każdej widocznej gwiazdy: liczone z canClick() gry przy chwilowo podmienionej pozycji (bez efektów ubocznych). */
function neighbours(se, D) {
  const L = window.layers.se.clickables;
  const pos = se.currentPosition, cur = se.currentStar, trav = se.currentlyTravelling;
  const adj = {};
  try {
    se.currentlyTravelling = false;
    for (const from of STAR_IDS) {
      const [a, b] = coord(from);
      // canClick części gwiazd patrzy na currentStar zamiast currentPosition — podmieniamy oba
      se.currentPosition = [new D(a), new D(b)];
      se.currentStar = [new D(a), new D(b)];
      adj[from] = STAR_IDS.filter(to => to !== from && L[to]?.canClick?.call(L[to]));
    }
  } finally {
    se.currentPosition = pos; se.currentStar = cur; se.currentlyTravelling = trav;
  }
  return adj;
}

export const starExplore = {
  id: "star-explore",
  name: "Space Exploration: auto-podróże",
  group: "Iridite",
  every: 2,
  description:
    "Gdy statek dotrze do gwiazdy, od razu wysyła go dalej. Cel: gwiazda z listy priorytetów (pierwsza poniżej 100 wizyt), " +
    "a bez listy — najmniej odwiedzona widoczna gwiazda (przy remisie bliższa). Do dalekiego celu leci najkrótszą trasą przez " +
    "sąsiednie gwiazdy, a każde przybycie po drodze też daje wizytę. Nie przerywa trwającej podróży.",
  params: [
    { key: "priority", label: "Priorytet gwiazd (np. „A0 A2 B1”, puste = najmniej odwiedzone)", type: "text", default: "" },
  ],
  available: g => Boolean(window.player?.se && window.tmp?.se?.layerShown),
  run(ctx) {
    const se = window.player.se, D = window.Decimal;
    if (se.currentlyTravelling) {
      ctx.status(`w podróży: ${window.formatTime(se.explorationTime)} do ${se.starNames[+se.currentStar[0]][+se.currentStar[1]]}`);
      return;
    }
    const T = window.tmp.se.clickables;
    const visible = STAR_IDS.filter(id => T[id]?.unlocked);
    const name = id => { const [a, b] = coord(id); return se.starNames[a][b]; };
    const visits = id => { const [a, b] = coord(id); return +se.starsExploreCount[a][b]; };
    const time = id => { const [a, b] = coord(id); return +se.starExploreTimes[a][b]; };
    const here = (+se.currentPosition[0] + 1) * 10 + (+se.currentPosition[1] + 1);

    // Najkrótsze trasy (Dijkstra po czasie podróży) z bieżącej gwiazdy po widocznych gwiazdach.
    const adj = neighbours(se, D);
    const dist = { [here]: 0 }, first = {}, done = new Set();
    for (;;) {
      let u = null;
      for (const k in dist) if (!done.has(+k) && (u === null || dist[k] < dist[u])) u = +k;
      if (u === null) break;
      done.add(u);
      for (const v of adj[u] || []) {
        if (!visible.includes(v)) continue;
        const d = dist[u] + time(v);
        if (dist[v] === undefined || d < dist[v]) { dist[v] = d; first[v] = u === here ? v : first[u]; }
      }
    }
    const reachable = visible.filter(id => id !== here && dist[id] !== undefined);
    const open = reachable.filter(id => visits(id) < MAX_VISITS);
    if (!open.length) { ctx.status(reachable.length ? "wszystkie osiągalne gwiazdy mają 100 wizyt" : "brak osiągalnych gwiazd"); return; }

    const prio = String(ctx.p.priority || "").toUpperCase().split(/[\s,;]+/).filter(Boolean);
    let target = null, bounce = false;
    for (const n of prio) {
      if (name(here).toUpperCase() === n && visits(here) < MAX_VISITS) { target = here; bounce = true; break; } // stoimy na celu: odbij i wróć
      const id = open.find(i => name(i).toUpperCase() === n); if (id) { target = id; break; }
    }
    if (!target) target = open.slice().sort((a, b) => visits(a) - visits(b) || dist[a] - dist[b])[0];

    // Odbicie: najbliższy sąsiad, z którego da się wrócić.
    const hop = bounce ? (adj[here] || []).filter(v => visible.includes(v) && (adj[v] || []).includes(here)).sort((a, b) => time(a) - time(b))[0] : first[target];
    if (!hop) { ctx.status("brak trasy"); return; }
    if (ctx.click("se", hop, { refresh: true })) {
      ctx.did();
      ctx.log(`lot do ${name(hop)}` + (hop !== target ? ` (po drodze do ${name(target)})` : ""));
      ctx.status(`lot do ${name(hop)}${hop !== target ? ` → cel ${name(target)}` : ""} (${visits(target)}/100 wizyt)`);
    } else {
      ctx.status(`nie mogę wystartować do ${name(hop)}`);
    }
  },
};
