// Black Heart: gdy przeciwnik odpala bullet hell, a gracz NIE jest w zakładce Black Heart, gra pomija minigierkę
// i zamiast tego zadaje drużynie obrażenia (wbudowany mechanizm gry). To makro wykorzystuje to do farmienia w tle:
// po zakończeniu runu (śmierć drużyny) wchodzi ponownie na wybrany etap z tą samą drużyną.

export const bhAutoRestart = {
  id: "bh-auto-restart",
  name: "BH: wznawianie etapu",
  group: "Black Heart",
  every: 1,
  description:
    "Gdy run w Black Heart się skończy, wchodzi ponownie na wybrany etap z obecną drużyną. Działa tylko, gdy NIE jesteś " +
    "w zakładce Black Heart — wtedy gra zamiast minigierek zadaje drużynie obrażenia, więc walka toczy się w tle.",
  params: [
    { key: "stage", label: "Etap (id warstwy, np. stagnantSynestia)", type: "text", default: "stagnantSynestia" },
    { key: "delay", label: "Odczekaj po końcu runu (s)", type: "number", default: 3, min: 0, step: 1 },
  ],
  available: () => Boolean(window.player.bh && typeof window.BHStageEnter === "function"),
  run(ctx) {
    const p = window.player;
    const st = ctx.state;
    const stage = String(ctx.p.stage).trim();
    if (!window.BHS?.[stage]) return ctx.status(`nieznany etap: ${stage}`);
    if (!window.tmp[stage]?.layerShown) return ctx.status(`etap ${stage} jest niedostępny`);
    if (p.tab === "bh") { st.endedAt = null; return ctx.status("jesteś w zakładce Black Heart — nie wznawiam"); }
    if (p.bh.currentStage && p.bh.currentStage !== "none") {
      st.endedAt = null;
      return ctx.status(`walka: ${p.bh.currentStage}, combo ${window.formatWhole(p.bh.combo)}`);
    }
    const now = Date.now();
    st.endedAt ??= now;
    if ((now - st.endedAt) / 1000 < ctx.p.delay) return ctx.status("run zakończony, za chwilę wznawiam");
    window.BHStageEnter(stage);
    st.endedAt = null;
    st.runs = (st.runs ?? 0) + 1;
    ctx.did();
    ctx.status(`wznowiono ${stage} (łącznie ${st.runs}×)`);
  },
};
