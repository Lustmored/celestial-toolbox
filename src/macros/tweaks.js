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

// Osiągnięcia z complete() trzeba w tej grze kliknąć w zakładce, żeby dały nagrodę — robimy to za gracza.
export const claimAchievements = {
  id: "claim-achievements",
  name: "Odbieraj spełnione osiągnięcia",
  group: "Inne",
  every: 2,
  description:
    "Część osiągnięć gra przyznaje dopiero po kliknięciu ich w zakładce Achievements (świecą się, ale nagroda nie działa). " +
    "Makro odbiera je automatycznie, gdy tylko warunek jest spełniony — tak jak kliknięcie, nic ponad to.",
  available: () => Boolean(window.layers?.achievements?.achievements),
  run(ctx) {
    const A = window.layers.achievements.achievements;
    for (const id of Object.keys(A)) {
      if (isNaN(+id) || window.hasAchievement("achievements", id)) continue;
      let ok = false;
      try { ok = A[id].complete && window.run(A[id].complete, A[id]); } catch {}
      if (ok) { window.completeAchievement("achievements", id); ctx.log(`Odebrano: ${A[id].name}`); ctx.did(); }
    }
  },
};
