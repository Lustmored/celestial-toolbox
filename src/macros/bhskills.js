import { macroSettings } from "../core/settings.js";

// Black Heart: inteligentne klikanie umiejętności (zamiast Auto gry, które odpala skill dopiero po 2× cooldownie).

const getBHA = () => { try { return window.BHA ?? (0, eval)("typeof BHA !== 'undefined' ? BHA : undefined"); } catch { return undefined; } };
const num = x => { try { return Number(x); } catch { return NaN; } };

// Klasy umiejętności — wyznaczane z definicji gry (BHA), więc działa też dla nowych postaci.
function classify(def, flip) {
  if (!def) return "skip";
  if (def.passive && !def.instant) return "skip";
  const type = def.type;
  if (flip && type === "function") return "always";           // np. Celestial Wayfare: +1 combo
  if (def.stun && !flip) {
    try { const s = def.stun(); if (s?.length >= 3 && num(s[1]) > 0) return "selfstun"; } catch {}
  }
  if (def.instant) {
    if (type === "effect") return "perma";                     // np. Motivation (kumuluje się)
    if (type === "heal") return "heal";
    if (type === "shield") return "shield";
    if (type === "damage") return "attack";
    return "fight";                                            // cooldown / reset itp.
  }
  if (def.active) {
    const tgt = def.constantTarget ?? def.target;
    if (tgt === "celestialite") return "attack";               // DoT / turret
    return "buff";                                             // Battle Cry, Rebounding Aura
  }
  return "skip";
}

const mem = { autoOff: new Set(), hp: null, t: 0, dps: 0, fightStart: 0, fightAvg: 6, lastId: "none" };

function restoreAuto() {
  const chars = window.player?.bh?.characters;
  for (const key of mem.autoOff) {
    const [i, j] = key.split(":").map(Number);
    const s = chars?.[i]?.skills?.[j];
    if (s) s.auto = true;
  }
  mem.autoOff.clear();
}

export const bhSkills = {
  id: "bh-skills",
  name: "Black Heart: klikanie umiejętności",
  group: "Black Heart",
  every: 0.1,
  description:
    "Klika umiejętności w walce Black Heart zamiast Auto gry (Auto odpala dopiero po 2× cooldownie i marnuje ataki w przerwach). " +
    "Buffy kumulujące (Motivation) — zawsze po cooldownie. Ataki — tylko przy celestialicie, gdy mają krótki cooldown albo cel nie padnie za chwilę od reszty obrażeń. " +
    "Buffy czasowe (Battle Cry, Rebounding Aura) — pod koniec przerwy przed walką albo na twardym przeciwniku; zawsze gotowe na bossa (co 25). " +
    "Ataki z samo-stunem (Decapitate, Orbital Cannon) — w przerwie tak, by trafiły na start walki; trzymane na bossa. Leczenie/tarcze — w walce, gdy potrzeba. " +
    "Na czas działania wyłącza Auto tych umiejętności (po wyłączeniu makra przywraca).",
  params: [
    { key: "fastCd", label: "Atak: zawsze klikaj, gdy cooldown krótszy niż (s)", type: "number", default: 5, min: 0, step: 0.5 },
    { key: "killWindow", label: "Atak: wstrzymaj dłuższy atak, gdy cel i tak padnie w (s)", type: "number", default: 0.5, min: 0, step: 0.1 },
    { key: "buffTtk", label: "Buff czasowy w trakcie walki: gdy cel przeżyje dłużej niż (s)", type: "number", default: 2, min: 0, step: 0.5 },
    { key: "buffLead", label: "Buff czasowy przed walką: odpal, gdy do spawnu zostało (s)", type: "number", default: 0.3, min: 0, step: 0.1 },
    { key: "stunMargin", label: "Samo-stun: trafienie po spawnie z zapasem (s)", type: "number", default: 0.3, min: 0, step: 0.1 },
    { key: "healPct", label: "Leczenie: gdy ktoś ma mniej HP niż (%)", type: "number", default: 75, min: 0, max: 100, step: 5 },
    { key: "bossReserve", label: "Trzymaj buffy i samo-stuny na bossa (co 25)", type: "bool", default: true },
    { key: "disableAuto", label: "Wyłączaj Auto gry dla umiejętności (przywraca po wyłączeniu makra)", type: "bool", default: true },
  ],
  available: () => Boolean(window.layers.bh?.clickables?.["C0-Skill-0"] && getBHA()),
  onDisable() { restoreAuto(); },
  run(ctx) {
    const P = window.player, bh = P.bh, BHA = getBHA();
    if (!bh || !bh.currentStage || bh.currentStage === "none") { mem.hp = null; mem.lastId = "none"; return ctx.status("poza walką"); }
    const flip = Boolean(bh.flipside);
    const cel = bh.celestialite;
    const present = cel && cel.id !== "none" && num(cel.health) > 0;
    const respawn = !present ? Math.max(0, num(bh.respawnTimer)) : 0;
    const combo = Math.abs(num(bh.combo));
    const now = performance.now() / 1000;

    // Tempo obrażeń (HP celestialita na sekundę realną) → szacowany czas do zabicia.
    if (present) {
      const hp = num(cel.health);
      if (mem.lastId !== cel.id || mem.hp === null || hp > mem.hp) { mem.fightStart = now; mem.dps = 0; }
      else if (now > mem.t) {
        const inst = (mem.hp - hp) / (now - mem.t);
        mem.dps = mem.dps ? mem.dps * 0.8 + inst * 0.2 : inst;
      }
      mem.hp = hp; mem.t = now; mem.lastId = cel.id;
    } else if (mem.lastId !== "none") {
      const len = now - mem.fightStart;
      if (len > 0 && len < 600) mem.fightAvg = mem.fightAvg * 0.7 + len * 0.3;
      mem.lastId = "none"; mem.hp = null; mem.dps = 0;
    }
    const ttk = present ? (mem.dps > 0 ? num(cel.health) / mem.dps : Infinity) : 0;

    // Boss: celestialit pojawiający się przy combo ≡ 24 (mod 25).
    const bossFight = present && combo % 25 === 24;
    const nextIsBoss = !present && combo % 25 === 24;
    // Ile czasu (s gry, w przybliżeniu) do końca przerwy przed najbliższym bossem.
    const respawnMax = num(bh.respawnMax) || 5;
    let toBoss;
    if (bossFight) toBoss = Infinity;
    else if (nextIsBoss) toBoss = respawn;
    else {
      const kills = (24 - (combo % 25) + 25) % 25 - (present ? 0 : 1); // walki przed przerwą bossa
      const cur = present ? Math.max(0, mem.fightAvg - (now - mem.fightStart)) + respawnMax : respawn;
      toBoss = cur + Math.max(0, kills - (present ? 1 : 0)) * (mem.fightAvg + respawnMax);
      toBoss *= 0.8; // ostrożnie
    }
    const bossSafe = cd => !ctx.p.bossReserve || bossFight || nextIsBoss || cd <= toBoss;

    const minHpRatio = (() => {
      let m = 1;
      for (let i = 0; i < 3; i++) { const c = bh.characters[i]; if (!c || c.id === "none" || num(c.health) <= 0) continue; m = Math.min(m, num(c.health) / Math.max(1, num(c.maxHealth))); }
      return m;
    })();

    const clicked = [];
    for (let i = 0; i < 3; i++) {
      const ch = bh.characters[i];
      if (!ch || ch.id === "none" || num(ch.health) <= 0) continue;
      for (let j = 0; j < 4; j++) {
        const sk = ch.skills?.[j];
        if (!sk || sk.id === "none") continue;
        const def = BHA[sk.id];
        const cls = classify(def, flip);
        if (cls === "skip") continue;
        if (ctx.p.disableAuto && sk.auto) { sk.auto = false; mem.autoOff.add(`${i}:${j}`); }
        const cdMax = num(sk.cooldownMax);
        if (num(sk.cooldown) < cdMax) continue; // nie gotowa
        const C = window.layers.bh.clickables[`C${i}-Skill-${j}`];
        if (!C) continue;
        let go = false;
        switch (cls) {
          case "always": case "perma": go = true; break;
          case "fight": go = present; break;
          case "shield": go = present; break;
          case "heal": go = present && minHpRatio * 100 < ctx.p.healPct; break;
          case "attack": go = present && (cdMax < ctx.p.fastCd || ttk > ctx.p.killWindow); break;
          case "buff":
            if (num(sk.duration) > 0) break;
            if (!present) go = respawn <= ctx.p.buffLead && bossSafe(cdMax) || (nextIsBoss && respawn <= ctx.p.buffLead);
            else go = (bossFight || ttk > ctx.p.buffTtk) && bossSafe(cdMax);
            break;
          case "selfstun": {
            let st = 5; try { st = num(def.stun()[1]); } catch {}
            if (!present) go = respawn <= Math.max(0, st - ctx.p.stunMargin) && (nextIsBoss || bossSafe(cdMax));
            else go = ttk > st + 1 && bossSafe(cdMax);
            break;
          }
        }
        if (!go) continue;
        let ok = false;
        try { ok = Boolean(C.unlocked.call(C)) && Boolean(C.canClick.call(C)); } catch {}
        if (!ok) continue;
        C.onClick.call(C);
        clicked.push(typeof def?.name === "string" ? def.name : sk.id);
        ctx.did();
      }
    }
    const phase = present ? (bossFight ? "BOSS" : `walka, TTK ${isFinite(ttk) ? ttk.toFixed(1) + " s" : "?"}`) : `przerwa ${respawn.toFixed(1)} s${nextIsBoss ? " → BOSS" : ""}`;
    ctx.status(`${phase} · combo ${num(bh.combo)}${clicked.length ? " · " + clicked.join(", ") : ""}`);
  },
};

// Minigierki bullet hell w BH (głównie Stagnant Synestia): pomijanie.
// Tryb "game" = zasada gry dla gracza spoza zakładki BH (minigra się nie odpala, cała drużyna dostaje obrażenia
// = obrażenia celestialita × czas trwania / 3). Tryb "none" = pominięcie bez obrażeń.
let bhOrig = null;
export const skipBulletHell = {
  id: "bh-skip-minigames",
  name: "BH: pomijanie minigierek (bullet hell)",
  group: "Black Heart",
  toggle: true,
  description:
    "Nie odpala minigierek bullet hell w walkach BH. „Jak gra poza zakładką”: zasada gry dla gracza, który nie patrzy na BH — " +
    "drużyna dostaje obrażenia = obrażenia celestialita × czas minigry / 3 (poza SS dodatkowo stun). „Bez obrażeń”: minigra po prostu przepada.",
  params: [
    { key: "mode", label: "Tryb", type: "select", options: [["none", "bez obrażeń"], ["game", "jak gra poza zakładką BH"]], default: "none" },
    { key: "where", label: "Gdzie", type: "select", options: [["ss", "tylko Stagnant Synestia"], ["all", "wszystkie walki BH"]], default: "ss" },
  ],
  available: () => typeof window.bulletHell === "function",
  onEnable() {
    if (bhOrig) return;
    bhOrig = window.bulletHell;
    window.bulletHell = function (...args) {
      const P = window.player, p = macroSettings(skipBulletHell).params;
      const stage = P?.bh?.currentStage;
      const applies = stage && stage !== "none" && (p.where === "all" || stage === "stagnantSynestia");
      if (!applies) return bhOrig.apply(this, args);
      if (p.mode === "game") {
        const tab = P.tab;
        P.tab = "cb";
        try { return bhOrig.apply(this, args); } finally { P.tab = tab; }
      }
      return undefined; // bez obrażeń
    };
  },
  onDisable() {
    if (bhOrig) { window.bulletHell = bhOrig; bhOrig = null; }
  },
};
