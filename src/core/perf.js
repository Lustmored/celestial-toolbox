// Pomiar płynności: FPS przeglądarki (requestAnimationFrame), TPS gry (wywołania gameLoop),
// najdłuższa przerwa między tickami i czas zużyty przez grę oraz toolbox.
const W = 5; // okno uśredniania (s)
const st = { frames: [], ticks: [], game: 0, tb: 0, samples: [] };

export function perfTick(tStart, tGameEnd, tEnd) {
  st.ticks.push(tStart);
  st.game += tGameEnd - tStart;
  st.tb += tEnd - tGameEnd;
}

let gen = 0;
function frame(t) {
  if (frame.gen !== gen) return;
  st.frames.push(t);
  requestAnimationFrame(frame);
}

export function startPerf() {
  // Po aktualizacji toolboxa bez odświeżania strony: zatrzymaj poprzedni licznik.
  if (window.__ctbPerfStop) window.__ctbPerfStop();
  frame.gen = ++gen;
  requestAnimationFrame(frame);
  const timer = setInterval(() => {
    const now = performance.now(), from = now - W * 1000;
    st.frames = st.frames.filter(t => t >= from);
    st.ticks = st.ticks.filter(t => t >= from);
    let maxGap = 0;
    for (let i = 1; i < st.ticks.length; i++) maxGap = Math.max(maxGap, st.ticks[i] - st.ticks[i - 1]);
    if (st.ticks.length) maxGap = Math.max(maxGap, now - st.ticks[st.ticks.length - 1]);
    st.samples.push({ game: st.game, tb: st.tb });
    st.game = 0; st.tb = 0;
    if (st.samples.length > W) st.samples.shift();
    const busy = st.samples.reduce((a, s) => ({ game: a.game + s.game, tb: a.tb + s.tb }), { game: 0, tb: 0 });
    const span = st.samples.length * 1000;
    perf.fps = st.frames.length / W;
    perf.tps = st.ticks.length / W;
    perf.maxGap = maxGap;
    perf.gamePct = 100 * busy.game / span;
    perf.tbPct = 100 * busy.tb / span;
    perf.hidden = document.hidden;
    for (const fn of listeners) try { fn(perf); } catch {}
  }, 1000);
  window.__ctbPerfStop = () => { clearInterval(timer); gen++; };
}

const listeners = [];
export const onPerf = fn => listeners.push(fn);
export const perf = { fps: 0, tps: 0, maxGap: 0, gamePct: 0, tbPct: 0, hidden: false };
