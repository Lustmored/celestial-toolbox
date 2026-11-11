// Iridite: bot walki statkami — poluje na wrogów i omija zagrożenia, sterując wyłącznie wirtualnymi klawiszami WASD.
// Strzela autoshoot gry (player.ir.autoShoot); bot niczego nie dodaje ani nie zmienia w stanie gry poza wciśniętymi klawiszami.

const Hunter = (() => {
  const CFG = { horizon: 40, margin: 14, turnFrames: 12, standoffMax: 260, scan: 700, allowMouse: false, aimNear: 1500, aimFar: 400 };
  const KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD'];
  const KIND = { 0: 'rot', 1: 'rot', 2: 'rot', 4: 'rot', 6: 'rot', 9: 'rot', 10: 'rot', 5: 'omni', 8: 'omni', 11: 'omni', 3: 'mouse', 7: 'mouse' };
  let enabled = false, watchdog = null, target = null;
  const getArena = () => (typeof window.arena !== 'undefined' && window.arena) ? window.arena : (typeof arena !== 'undefined' && arena ? arena : null);
  const wrapD = (d, size) => { d %= size; return d > size / 2 ? d - size : d < -size / 2 ? d + size : d; };
  const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
  const alive = e => { try { return e.health.gt ? e.health.gt(0) : e.health > 0; } catch (_) { return true; } };
  const hpFrac = e => { try { return Math.min(1, e.health.div(e.maxHealth).toNumber()); } catch (_) { return 1; } };
  const release = a => { if (a && a.keys) for (const k of KEYS) a.keys[k] = false; };
  const grid9 = []; for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) grid9.push([i, j]);
  const ring16 = Array.from({ length: 16 }, (_, i) => i * Math.PI / 8);
  // emulate a mouse move through the game's own window 'pointermove' listener (arena.js 1565)
  const mouseTo = (a, dx, dy) => { const rc = a.canvas.getBoundingClientRect();
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: rc.left + a.canvasWidth / 2 + dx, clientY: rc.top + a.canvasHeight / 2 + dy })); };

  // ---- per-ship-class controllers: cands = action set, init/step = the game's own movement formulas, apply = inputs
  const CTRL = {
    rot: { // c = [turn A(-1)/D(+1), thrust S(-1)/W(+1)]  (arena.js 2267-2311)
      cands: () => grid9,
      init: s => ({ x: 0, y: 0, ang: s.angle || 0, vel: s.velocity || 0 }),
      step(q, [turn, thr], t, c) {
        const s = c.s;
        if (thr) q.vel += thr * (s.acceleration + c.ms * 0.1);
        else q.vel = q.vel > 0 ? Math.max(0, q.vel - s.deceleration) : Math.min(0, q.vel + s.deceleration);
        if (turn && t <= CFG.turnFrames) { // stop turning once the gun is on target
          const d = angDiff(c.aimAng, q.ang);
          if (!(c.target && Math.sign(d) == turn && Math.abs(d) < s.rotationSpeed)) q.ang += turn * s.rotationSpeed;
        }
        const mv = s.maxVelocity + c.ms; q.vel = Math.max(-mv, Math.min(mv, q.vel));
        q.x += Math.cos(q.ang) * q.vel; q.y += Math.sin(q.ang) * q.vel;
      },
      aimCost(q, [turn, thr], bearing, d, c) {
        let w = d < c.range * 1.2 ? CFG.aimNear : CFG.aimFar;
        if (c.st == 10 && c.a.awaitingShotCharge) w *= 3;  // railgun fires 21 frames after charging starts: hold aim
        let aim = Math.abs(angDiff(bearing, q.ang)) * w;
        // sniper (4) auto-aims and auto-turns only while NO movement key is held (arena.js 1761, 2282)
        if (c.st == 4) { if (!turn && !thr && c.tDist < 600) aim = 0; else aim += 60; }
        return aim;
      },
      apply(a, [turn, thr]) { a.keys.KeyA = turn < 0; a.keys.KeyD = turn > 0; a.keys.KeyW = thr > 0; a.keys.KeyS = thr < 0; },
    },
    omni: { // c = [A(-1)/D(+1), W(-1)/S(+1)]; lerp 0.16 toward maxSpeed, x0.995 (arena.js 2481-2542)
      cands: () => grid9,
      init: s => ({ x: 0, y: 0, vx: s.vx || 0, vy: s.vy || 0 }),
      step(q, [ix, iy], t, c) {
        const mx = (c.s.maxVelocity || 3.5) + c.ms, len = Math.hypot(ix, iy) || 1;
        q.vx += ((ix ? ix / len * mx : 0) - q.vx) * 0.16; q.vy += ((iy ? iy / len * mx : 0) - q.vy) * 0.16;
        q.vx *= 0.995; q.vy *= 0.995; q.x += q.vx; q.y += q.vy;
      },
      aimCost: () => 0, // gun/laser/knife follow the mouse, independent of movement
      apply(a, [ix, iy], c) {
        a.keys.KeyA = ix < 0; a.keys.KeyD = ix > 0; a.keys.KeyW = iy < 0; a.keys.KeyS = iy > 0;
        if (CFG.allowMouse && c.target) { const k = Math.min(1, 300 / (c.tDist || 1)); mouseTo(a, Math.cos(c.aimAng) * c.tDist * k, Math.sin(c.aimAng) * c.tDist * k); }
      },
    },
    mouse: { // rammers 3 (roll) / 7 (dash): no key input exists; c = heading for the cursor (arena.js 2203-2263)
      cands: () => ring16,
      init: s => ({ x: 0, y: 0, vx: s.vx || 0, vy: s.vy || 0 }),
      step(q, h, t, c) {
        if (c.st == 3) { q.vx += Math.cos(h) * c.ms / 5; q.vy += Math.sin(h) * c.ms / 5; }
        else if (t == 1) { q.vx = Math.cos(h) * 12; q.vy = Math.sin(h) * 12; }
        q.x += q.vx; q.y += q.vy; q.vx *= c.s.deceleration; q.vy *= c.s.deceleration;
      },
      aimCost: () => 0,
      apply(a, h) { release(a); mouseTo(a, Math.cos(h) * 300, Math.sin(h) * 300); },
    },
  };

  function hunterTick() {
    const a = getArena();
    if (!a || !a.ship || !a.running) return;
    const st = window.player.ir.shipType, s = a.ship, kind = KIND[st] || 'rot', ctl = CTRL[kind], ram = kind == 'mouse';
    // not driven: menus (upgrade choice/pause), mobile controls (game ignores keys), mouse-only ships unless allowed
    if (!enabled || window.player.ir.menu != 0 || window.player.ir.mobileControls > 0 || (ram && !CFG.allowMouse)) return release(a);
    const W = a.width, H = a.height, ms = a.shipStats.moveSpeed || 0, shipR = ram ? s.radius : 12; // hitbox: arena.js 2921/2972
    const rel = o => [wrapD(o.x - s.x, W), wrapD(o.y - s.y, H)];

    // ---- common core 1: threats in ship-relative wrapped coords
    const T = [];
    const add = (o, r, w, vx, vy) => {
      const [x, y] = rel(o);
      if (Math.hypot(x, y) - r < CFG.scan) T.push({ x, y, vx: vx || 0, vy: vy || 0, r: r + shipR + CFG.margin, w });
    };
    if (!ram) { // rammers WANT body contact (they take 1/50 body damage)
      for (const e of a.enemies) if (!e.attached && !e._pausedBoss) add(e, e.radius || 20, 1, e.vx, e.vy);
      for (const e of a.asteroids) if (!e._pausedBoss) add(e, e.radius || e.size || 20, 1, e.vx, e.vy);
    }
    for (const b of a.bullets) {
      if (!(b.fromEnemy || b.vampireSpear) || b._hitPlayer) continue;
      let vx = b.vx || 0, vy = b.vy || 0;
      if (b.homing) { // pursuit assumption: homing bullets keep their speed but head straight at us
        const [x, y] = rel(b), d = Math.hypot(x, y) || 1, sp = Math.hypot(vx, vy);
        vx = -x / d * sp; vy = -y / d * sp;
      }
      add(b, typeof b.radius === 'number' ? b.radius : (b.homing ? 10 : 6), 1, vx, vy);
    }
    for (const g of a.gammaTrails || []) if (g.timer > 0) add(g, g.radius || 20, 0.6);
    for (const w of a.warnings || []) { // telegraphed line attacks: ray from (x,y) along ang
      if (typeof w.ang !== 'number' || !w.length) continue;
      for (let d = 0; d <= w.length; d += 30) add({ x: w.x + Math.cos(w.ang) * d, y: w.y + Math.sin(w.ang) * d }, (w.width || 2) / 2 + 4, 0.4);
    }

    // ---- common core 2: target = nearest/weakest enemy (with hysteresis); asteroids as fallback
    let pool = a.enemies.filter(e => alive(e) && !e.invulnerable && !e._pausedBoss);
    if (!pool.length) pool = a.asteroids.filter(alive);
    const tScore = e => { const [x, y] = rel(e); return Math.hypot(x, y) * (0.6 + 0.4 * hpFrac(e)); };
    let best = null, bestS = Infinity;
    for (const e of pool) { const sc = tScore(e); if (sc < bestS) { bestS = sc; best = e; } }
    if (!(target && pool.includes(target) && tScore(target) < bestS * 1.25)) target = best;

    const bSpeed = st == 8 ? 1e9 : st == 5 ? 14 + ms : st == 11 ? 16 + ms : ({ 4: 25, 6: 20, 9: 12, 10: 20 }[st] || 10) * (ms || 1);
    const range = st == 8 ? 750 : st == 4 ? 600 : Math.min(bSpeed * 60, 900); // bullets live 60 frames
    const c = { a, s, st, ms, target, range, tDist: 0, aimAng: s.angle || 0 };
    let tx = 0, ty = 0, standoff = 0;
    if (target) {
      [tx, ty] = rel(target); c.tDist = Math.hypot(tx, ty);
      const lead = Math.min(60, c.tDist / bSpeed); // lead the shot by bullet travel time
      c.aimAng = Math.atan2(ty + (target.vy || 0) * lead, tx + (target.vx || 0) * lead);
      standoff = ram ? 0 : (target.radius || target.size || 20) + Math.min(range * 0.5, CFG.standoffMax);
    }

    // ---- common core 3: simulate every candidate action, score danger + standoff + aim, apply the cheapest
    const N = CFG.horizon;
    let bestC = null, bestCost = Infinity;
    for (const cand of ctl.cands()) {
      const q = ctl.init(s); let cost = 0;
      for (let t = 1; t <= N; t++) {
        ctl.step(q, cand, t, c);
        for (const th of T) {
          const d = Math.hypot(th.x + th.vx * t - q.x, th.y + th.vy * t - q.y) - th.r;
          cost += d < 0 ? th.w * 1e5 / (1 + t * 0.1) : th.w * 400 * Math.exp(-d / 25) / (1 + t * 0.05);
        }
      }
      if (target) {
        const ex = tx + (target.vx || 0) * N - q.x, ey = ty + (target.vy || 0) * N - q.y, d = Math.hypot(ex, ey);
        cost += Math.abs(d - standoff) + ctl.aimCost(q, cand, Math.atan2(ey, ex), d, c);
      }
      if (cost < bestCost) { bestCost = cost; bestC = cand; }
    }
    ctl.apply(a, bestC, c);
  }

  // Game loop = setInterval(() => this.update(), 1000/60) (arena.js 1420): `update` is looked up on the instance each
  // frame, so an own-property wrapper runs in sync. `arena` is re-created by SB_enterRun and nulled by SB_exitRun,
  // so a watchdog re-installs the wrapper on whatever instance is current.
  function hook() {
    const a = getArena();
    if (!a || a.__hunterHooked) return;
    const orig = Object.getPrototypeOf(a).update;
    a.update = function () {
      try { hunterTick(); } catch (e) { release(this); console.warn('[hunter]', e); }
      return orig.call(this);
    };
    a.__hunterHooked = true;
  }
  function start() { enabled = true; hook(); if (!watchdog) watchdog = setInterval(hook, 250); }
  function stop() {
    enabled = false; target = null;
    if (watchdog) { clearInterval(watchdog); watchdog = null; }
    const a = getArena();
    if (a) { release(a); if (a.__hunterHooked) { delete a.update; delete a.__hunterHooked; } }
  }
  return { start, stop, hunterTick, CFG, get enabled() { return enabled; } };
})();

const applyParams = p => {
  Hunter.CFG.margin = Number(p.margin) || 0;
  Hunter.CFG.aimNear = (Number(p.aggression) || 0) * 15;
  Hunter.CFG.aimFar = (Number(p.aggression) || 0) * 4;
  Hunter.CFG.allowMouse = Boolean(p.allowMouse);
};

export const shipHunter = {
  id: "ship-hunter",
  name: "Walka statkami: bot (polowanie + uniki)",
  group: "Iridite",
  toggle: true,
  description:
    "Podczas walki statkiem sam steruje WASD: wybiera najbliższego/najsłabszego wroga, ustawia się przodem do niego " +
    "w zasięgu strzału (cofa się na S, nie odwracając się od celu) i omija pociski, asteroidy oraz kontakt z wrogami, " +
    "przewidując ich ruch ~40 klatek naprzód. Strzela autoshoot gry — musi być włączony. Gdy coś wciśniesz sam, " +
    "bot i tak nadpisze klawisze w następnej klatce, więc do ręcznego latania wyłącz przełącznik. " +
    "Nie działa w menu wyboru ulepszeń ani przy sterowaniu mobilnym.",
  params: [
    { key: "aggression", label: "Agresja celowania (0–200, więcej = mocniej trzyma cel na muszce)", type: "number", default: 100, min: 0, step: 10 },
    { key: "margin", label: "Margines bezpieczeństwa (px)", type: "number", default: 14, min: 0, step: 2 },
    { key: "allowMouse", label: "Steruj kursorem dla statków, które celują/latają za myszką", type: "bool", default: false },
  ],
  available: () => Boolean(window.player?.ir),
  onEnable(ctx) { applyParams(ctx.p); this._p = ctx.p; this._t = setInterval(() => applyParams(this._p), 1000); Hunter.start(); },
  onDisable() { clearInterval(this._t); Hunter.stop(); },
};
