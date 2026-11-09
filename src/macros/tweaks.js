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
  every: 10,
  description:
    "W Black Heart wyróżnia na zielono aktywne przyciski „Increase Level Cap” oraz zwiększania/zmniejszania poziomu " +
    "umiejętności, a nieaktywne przyciemnia. Tylko wygląd, bez wpływu na grę.",
  available: () => Boolean(window.layers.bh?.clickables),
  onEnable() { patch(); },
  onDisable() { unpatch(); },
  run() { patch(); },
};
