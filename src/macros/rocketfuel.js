// Rocket Fuel (U1): „XP Button” co cooldown. Każde użycie daje XP Check Back i szansę na Drippy UFO
// (szansa = ⌊log10(kwota)^0.75 / 2 + 4⌋ %, ponad 100% = pewne sztuki), a cooldown rośnie z log10(kwota)^0.8.
// Przy dużym zapasie paliwa 1% daje najwięcej Drippy UFO na godzinę przy jednym kliknięciu na cooldown.

const AMOUNTS = { "1": 3, "1%": 4, "10%": 5, "25%": 6, "100%": 7 };

export const rocketFuelXp = {
  id: "rocket-fuel-xp",
  name: "Rocket Fuel: XP Button co cooldown",
  group: "Overworld",
  every: 1,
  description:
    "Wybiera zdolność XP Button i używa jej, gdy tylko minie cooldown. Daje XP Check Back i Drippy UFO " +
    "(przy obecnym zapasie paliwa 1% to ~12 Drippy UFO na raz). Zmienia wybraną zdolność paliwa na XP Button.",
  params: [
    { key: "amount", label: "Ile paliwa zużywać (1, 1%, 10%, 25%, 100%)", type: "text", default: "1%" },
  ],
  available: () => Boolean(window.player?.rf && window.layers.rf && window.player.rf.abilitiesUnlocked?.[4]),
  run(ctx) {
    const P = window.player, rf = P.rf;
    const id = AMOUNTS[String(ctx.p.amount ?? "1%").trim()] ?? 4;
    const t = new window.Decimal(rf.abilityTimers[4]);
    if (t.gt(0)) return ctx.status(`cooldown ${window.formatTime(t)}`);
    if (rf.abilityIndex !== 4) { window.clickClickable("rf", 15); ctx.did(); }
    if (!window.layers.rf.clickables[id].canClick()) return ctx.status("za mało paliwa");
    const used = id === 3 ? new window.Decimal(1) : new window.Decimal(rf.rocketFuel).mul({ 4: 0.01, 5: 0.1, 6: 0.25, 7: 1 }[id]);
    const chance = used.log10().pow(0.75).div(2).add(4).floor().min(10000);
    window.clickClickable("rf", id);
    ctx.did();
    ctx.log(`XP Button (${ctx.p.amount}): +${window.format(rf.abilityEffects[4])} XP CB, Drippy UFO ~${window.format(chance.div(100))}`);
    ctx.status("użyto XP Button");
  },
};
