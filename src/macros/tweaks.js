// Poprawki wyglądu gry (bez wpływu na rozgrywkę).

const BH_SKILL_BUTTONS = ["Skill-Buy-Level", "Skill-Level-Increase", "Skill-Level-Decrease"];
const ACTIVE = { backgroundColor: "#1f8a3c", border: "3px solid #8af5a8", color: "#ffffff", fontWeight: "bold" };

function patch() {
  const cl = window.layers.bh?.clickables;
  if (!cl) return false;
  for (const id of BH_SKILL_BUTTONS) {
    const b = cl[id];
    if (!b || b.__ctbOrigStyle) continue;
    const orig = b.style;
    b.__ctbOrigStyle = orig;
    b.style = function () {
      const look = { ...(typeof orig === "function" ? orig.call(this) : orig) };
      let can = false;
      try { can = typeof this.canClick === "function" ? this.canClick() : Boolean(this.canClick); } catch {}
      return can ? { ...look, ...ACTIVE } : { ...look, opacity: "0.6" };
    };
  }
  return true;
}

function unpatch() {
  const cl = window.layers.bh?.clickables;
  if (!cl) return;
  for (const id of BH_SKILL_BUTTONS) {
    const b = cl[id];
    if (b?.__ctbOrigStyle) { b.style = b.__ctbOrigStyle; delete b.__ctbOrigStyle; }
  }
}

export const bhSkillButtons = {
  id: "tweak-bh-skill-buttons",
  name: "BH: wyraźne przyciski skilli",
  group: "Wygląd",
  toggle: true, // bez pętli: tylko włącz/wyłącz
  description:
    "W Black Heart wyróżnia na zielono aktywne przyciski „Increase Level Cap” oraz zwiększania/zmniejszania poziomu " +
    "umiejętności, a nieaktywne przyciemnia. Tylko wygląd, bez wpływu na grę.",
  available: () => Boolean(window.layers.bh?.clickables),
  onEnable() { patch(); },
  onDisable() { unpatch(); },
};

// Laboratory: wchodzi do laboratorium (przycisk „Enter the Laboratory”), gdy minie cooldown.
// Domyślnie tylko w przerwie między walkami (Auto Enter gry czeka 30 s po walce), żeby nie przerywać farmy.
export const labAutoEnter = {
  id: "lab-auto-enter",
  name: "Laboratory: wejście po cooldownie",
  group: "Black Heart",
  every: 0.5,
  description:
    "Klika „Enter the Laboratory”, gdy cooldown laboratorium dobiegnie końca. Domyślnie czeka, aż skończy się bieżąca walka " +
    "w BH (Auto Enter gry wznawia farmę 30 s po walce, więc laboratorium wskoczy w tę przerwę). Opcjonalnie przerywa trwającą walkę.",
  params: [
    { key: "interrupt", label: "Przerywaj trwającą walkę w BH", type: "bool", default: false },
  ],
  available: g => g.layerActive("laboratory") && Boolean(window.layers.laboratory?.clickables?.enter),
  run(ctx) {
    const L = window.player.laboratory, stage = window.player.bh.currentStage;
    if (new window.Decimal(L.cooldown).gt(0)) { ctx.status(`cooldown: ${window.formatTime(L.cooldown)}`); return; }
    if (stage === "laboratory") { ctx.status("w laboratorium"); return; }
    if (stage && stage !== "none" && !ctx.p.interrupt) { ctx.status(`gotowe — czekam na koniec walki (${stage})`); return; }
    const C = window.layers.laboratory.clickables.enter;
    if (C.canClick.call(C)) { C.onClick.call(C); ctx.did(); ctx.log("Wejście do laboratorium"); ctx.status("wszedłem do laboratorium"); }
  },
};

// Softcapy w nagłówkach: linia „SOFTCAP…” zwraca "" poniżej progu, więc znika i cała zakładka skacze
// przy każdym szybkim resecie. Podmieniamy pusty wynik na niełamliwą spację — linia trzyma wysokość.
const SC_RE = /oftcap|hardcap/i;
let scPatched = [];

function scWalk(node, fnode) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node) && node[0] === "raw-html" && typeof node[1] === "function" && !node[1].__ctbOrig && SC_RE.test(String(node[1]))) {
    const orig = node[1];
    const wrapped = function (...a) { const r = orig.apply(this, a); return r === "" || r == null ? "&nbsp;" : r; };
    wrapped.__ctbOrig = orig;
    node[1] = wrapped;
    if (fnode && typeof fnode[1] === "function") fnode[1] = wrapped;
    scPatched.push([node, fnode, orig]);
    return;
  }
  for (const k of Object.keys(node)) {
    const v = node[k];
    if (v && typeof v === "object" && !(v instanceof window.Decimal)) scWalk(v, fnode && typeof fnode === "object" ? fnode[k] : undefined);
  }
}

export const stableSoftcaps = {
  id: "tweak-stable-softcaps",
  name: "Nieruchome linie softcapów",
  group: "Wygląd",
  toggle: true,
  description:
    "Linie „SOFTCAP…/HARDCAP…” w nagłówkach zakładek nie znikają poniżej progu, tylko zostają jako pusta linia. " +
    "Dzięki temu przy szybkich resetach (np. Space w SMA) przyciski nie skaczą góra-dół. Tylko wygląd.",
  available: () => Boolean(window.layers && window.funcs),
  onEnable() {
    for (const L of Object.keys(window.layers)) {
      const l = window.layers[L], f = window.funcs?.[L];
      if (Array.isArray(l.tabFormat)) scWalk(l.tabFormat, f?.tabFormat);
      if (l.microtabs) scWalk(l.microtabs, f?.microtabs);
    }
  },
  onDisable() {
    for (const [node, fnode, orig] of scPatched) {
      node[1] = orig;
      if (fnode && typeof fnode[1] === "function") fnode[1] = orig;
    }
    scPatched = [];
  },
};

// Które osiągnięcia leżą w zakładkach, które gracz faktycznie widzi (zakładka ma przycisk i jest odblokowana).
let visCache = null, visAt = 0;
function visibleAch() {
  if (visCache && Date.now() - visAt < 10000) return visCache;
  const L = window.layers.achievements, out = new Set();
  const buttons = new Set();
  const findBtns = n => { if (!Array.isArray(n)) return; if (n[0] === "category-button" && Array.isArray(n[1])) buttons.add(String(n[1][2])); n.forEach(findBtns); };
  findBtns(L.tabFormat);
  for (const [k, tab] of Object.entries(L.microtabs?.stars ?? {})) {
    if (!buttons.has(String(k)) || !window.tmp.achievements?.microtabs?.stars?.[k]?.unlocked) continue;
    const walk = n => { if (!Array.isArray(n)) return; if (n[0] === "achievement") out.add(+n[1]); n.forEach(walk); };
    walk(tab.content);
  }
  visCache = out; visAt = Date.now();
  return out;
}

// Osiągnięcia z complete() trzeba w tej grze kliknąć w zakładce, żeby dały nagrodę — robimy to za gracza.
export const claimAchievements = {
  id: "claim-achievements",
  name: "Odbieraj spełnione osiągnięcia",
  group: "Inne",
  every: 2,
  description:
    "Część osiągnięć gra przyznaje dopiero po kliknięciu ich w zakładce Achievements (świecą się, ale nagroda nie działa). " +
    "Makro odbiera je automatycznie, gdy tylko warunek jest spełniony — tak jak kliknięcie, nic ponad to. " +
    "Tylko z zakładek osiągnięć, które już widzisz.",
  available: () => Boolean(window.layers?.achievements?.achievements),
  run(ctx) {
    const A = window.layers.achievements.achievements;
    for (const id of Object.keys(A)) {
      if (isNaN(+id) || window.hasAchievement("achievements", id)) continue;
      if (!visibleAch().has(+id)) continue;
      let ok = false;
      try { ok = A[id].complete && window.run(A[id].complete, A[id]); } catch {}
      if (ok) { window.completeAchievement("achievements", id); ctx.log(`Odebrano: ${A[id].name}`); ctx.did(); }
    }
  },
};

// Wyskakujące obrazki kart przy dobieraniu (cząsteczki nad dowolną zakładką) — przy wielu dobraniach naraz zasłaniają grę.
// Wspólny filtr wyskakujących efektów (makeParticles / makeShinies) — kilka przełączników, jedno opakowanie.
const fxFilters = new Map();
const fxOrig = {};
function fxSync() {
  for (const fn of ["makeParticles", "makeShinies"]) {
    if (fxFilters.size && !fxOrig[fn] && typeof window[fn] === "function") {
      const orig = fxOrig[fn] = window[fn];
      window[fn] = function (...a) {
        const text = a[3]?.text ?? a[2]?.text;
        if (typeof text === "string") for (const f of fxFilters.values()) if (f(fn, text)) return;
        return orig.apply(this, a);
      };
    } else if (!fxFilters.size && fxOrig[fn]) {
      window[fn] = fxOrig[fn]; delete fxOrig[fn];
    }
  }
}
export const hideCardParticles = {
  id: "tweak-hide-card-particles",
  name: "Ukryj wyskakujące karty przy dobieraniu",
  group: "Wygląd",
  toggle: true,
  description: "Dobieranie kart (ręczne i makrem) nie pokazuje wylatujących obrazków kart. Tylko wygląd.",
  available: () => typeof window.makeParticles === "function",
  onEnable() { fxFilters.set("cards", (fn, t) => fn === "makeParticles" && t.includes("resources/cards/")); fxSync(); },
  onDisable() { fxFilters.delete("cards"); fxSync(); },
};
export const hideSlotParticles = {
  id: "tweak-hide-slot-particles",
  name: "Ukryj wyskakujące teksty nagród ze slotów",
  group: "Wygląd",
  toggle: true,
  description: "Obrót slotów nie pokazuje latających napisów „+X chips / shards” ani „Lucky!/Jackpot!”. Nagrody bez zmian.",
  available: () => typeof window.makeParticles === "function",
  onEnable() {
    fxFilters.set("slots", (fn, t) => /^\+\S+ (red chips|blue chips|yellow chips|evolution shards|paragon shards)\.$/.test(t) || /^(Lucky|Jackpot)!/.test(t));
    fxSync();
  },
  onDisable() { fxFilters.delete("slots"); fxSync(); },
};

// Błąd gry: część celestialitów (M-26, ⇑Ι – strzały; M-A2, ⇑Δ – trucizna) trzyma licznik w actions[0].variables.bullets,
// a pętla efektów BH traktuje każdą zmienną jako statystykę (bhTemp[...].bullets.mul) → wyjątek w każdej klatce, walka staje.
// Dodatkowo gra przypisuje `variables` przez referencję do definicji BHC, więc zabłąkane `bullets` przechodzi na kolejne
// celestiality (np. F-00 w laboratorium) i przetrwa zapis. Poprawka: licznik trzymany poza `variables` i zerowany przy spawnie.
let bulletsOrig = null;
let bulletsTimer = null;
const ARROW_IDS = ["m26", "majorEnas"];
const POISON_IDS = ["ma2", "majorDeka"];
const getBHC = () => { try { return window.BHC ?? (0, eval)("typeof BHC !== 'undefined' ? BHC : undefined"); } catch { return undefined; } };
function bulletsClean() {
  const c = window.player?.bh?.celestialite;
  for (const a of Object.values(c?.actions ?? {})) if (a?.variables && "bullets" in a.variables) {
    if ([...ARROW_IDS, ...POISON_IDS].includes(c.id) && c.__ctbBullets == null) c.__ctbBullets = Number(a.variables.bullets) || undefined;
    delete a.variables.bullets;
  }
  for (const def of Object.values(getBHC() ?? {})) {
    if (!def || typeof def !== "object" || !def.actions) continue;
    for (const a of Object.values(def.actions)) if (a?.variables && typeof a.variables === "object" && "bullets" in a.variables) delete a.variables.bullets;
  }
}
export const fixM26 = {
  id: "fix-m26",
  name: "Poprawka błędu: liczniki celestialitów zawieszają walkę",
  group: "Inne",
  toggle: true,
  description:
    "Naprawia błąd gry, przez który walka z M-26 / ⇑Ι (Arrow Resupply) albo M-A2 / ⇑Δ (Increased Toxicity) wywala się " +
    "w każdej klatce („bhTemp[…] is undefined”), a zabłąkany licznik potrafi przejść na kolejne walki (np. F-00). " +
    "Licznik jest trzymany poza zmiennymi efektów i zerowany przy pojawieniu się nowego celestialita – mechanika bez zmian.",
  available: () => Boolean(getBHC()?.m26?.actions),
  onEnable() {
    const B = getBHC();
    if (bulletsOrig) return;
    bulletsOrig = { defs: {}, spawn: null };
    const cel = () => window.player.bh.celestialite;
    const log = (txt) => { const c = cel(); window.bhLog?.("<span style='color: #8b0e7a'>" + window.run(B[c.id].name, B[c.id]) + txt); };
    for (const id of ARROW_IDS) {
      const A = B[id]?.actions; if (!A?.[0]?.properties?.["multi-hit"] || !A[1]?.onTrigger) continue;
      bulletsOrig.defs[id] = { a: A[0].properties["multi-hit"], t: A[1].onTrigger };
      A[0].properties["multi-hit"] = function () { const c = cel(); c.__ctbBullets ??= 3; return [c.__ctbBullets, 200]; };
      A[1].onTrigger = function () { const c = cel(); c.__ctbBullets = (c.__ctbBullets ?? 3) + 1; log(" increases its arrow count."); };
    }
    for (const id of POISON_IDS) {
      const A = B[id]?.actions; if (!A?.[0]?.effects?.regenAdd || !A[1]?.onTrigger) continue;
      bulletsOrig.defs[id] = { a: A[0].effects.regenAdd, t: A[1].onTrigger };
      const base = () => { const c = cel(); c.__ctbBullets ??= c.luck.toNumber(); return c.__ctbBullets; };
      A[0].effects.regenAdd = function () { return window.Decimal.mul(-1, base()); };
      A[1].onTrigger = function () { const c = cel(); c.__ctbBullets = base() * 1.3; log(" increases its poison slash's toxicity."); };
    }
    if (typeof window.celestialiteSpawn === "function") {
      bulletsOrig.spawn = window.celestialiteSpawn;
      const orig = bulletsOrig.spawn;
      window.celestialiteSpawn = function (...args) {
        const c = window.player?.bh?.celestialite; if (c) delete c.__ctbBullets;
        const r = orig.apply(this, args);
        bulletsClean();
        return r;
      };
    }
    bulletsClean();
    bulletsTimer = setInterval(bulletsClean, 1000);
  },
  onDisable() {
    if (!bulletsOrig) return;
    const B = getBHC();
    for (const [id, o] of Object.entries(bulletsOrig.defs)) {
      const A = B[id].actions;
      if (A[0].properties?.["multi-hit"]) A[0].properties["multi-hit"] = o.a; else A[0].effects.regenAdd = o.a;
      A[1].onTrigger = o.t;
    }
    if (bulletsOrig.spawn) window.celestialiteSpawn = bulletsOrig.spawn;
    clearInterval(bulletsTimer); bulletsTimer = null;
    bulletsOrig = null;
  },
};
