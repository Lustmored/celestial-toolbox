// Iridite: bot walki statkami — poluje na wrogów i omija zagrożenia, sterując wyłącznie wirtualnymi klawiszami WASD.
// Strzela autoshoot gry (player.ir.autoShoot); bot niczego nie dodaje ani nie zmienia w stanie gry poza wciśniętymi klawiszami.

const Hunter = (() => {
  const CFG = { horizon: 40, margin: 14, turnFrames: 12, standoffMax: 260, scan: 700, allowMouse: false, aimNear: 1500, aimFar: 400, softW: 80, softR: 8, orbW: 3000, autoUpgrade: true };
  const KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD'];
  const KIND = { 0: 'rot', 1: 'rot', 2: 'rot', 4: 'rot', 6: 'rot', 9: 'rot', 10: 'rot', 5: 'omni', 8: 'omni', 11: 'omni', 3: 'mouse', 7: 'mouse' };
  let enabled = false, watchdog = null, target = null, lastPlan = null;
  const getArena = () => (typeof window.arena !== 'undefined' && window.arena) ? window.arena : (typeof arena !== 'undefined' && arena ? arena : null);
  const wrapD = (d, size) => { d %= size; return d > size / 2 ? d - size : d < -size / 2 ? d + size : d; };
  const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
  const alive = e => { try { return e.health.gt ? e.health.gt(0) : e.health > 0; } catch (_) { return true; } };
  const hpFrac = e => { try { return Math.min(1, e.health.div(e.maxHealth).toNumber()); } catch (_) { return 1; } };
  const release = a => { if (a && a.keys) for (const k of KEYS) a.keys[k] = false; };
  const grid9 = []; for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) grid9.push([i, j]);
  const ROT_CANDS = [];
  for (const t2 of [-1, 0, 1]) ROT_CANDS.push([0, 0, 0, t2]);
  for (const dur of [8, 18, 32]) for (const tu of [-1, 0, 1]) for (const th of [-1, 0, 1]) for (const t2 of [-1, 0, 1]) ROT_CANDS.push([tu, th, dur, t2]);
  const ring16 = Array.from({ length: 16 }, (_, i) => i * Math.PI / 8);
  // emulate a mouse move through the game's own window 'pointermove' listener (arena.js 1565)
  const mouseTo = (a, dx, dy) => { const rc = a.canvas.getBoundingClientRect();
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: rc.left + a.canvasWidth / 2 + dx, clientY: rc.top + a.canvasHeight / 2 + dy })); };

  // ---- per-ship-class controllers: cands = action set, init/step = the game's own movement formulas, apply = inputs
  const CTRL = {
    rot: { // c = [turn, thrust, dur, thrust2]: przez `dur` klatek manewr (dowolny skręt + ciąg), potem powrót do celu
      // (skręt w stronę celu + ciąg thrust2). Dzięki temu bot może odbić w bok/tył i wrócić, zamiast cofać się po linii pocisku.
      cands: () => ROT_CANDS,
      init: s => ({ x: 0, y: 0, ang: s.angle || 0, vel: s.velocity || 0 }),
      step(q, [turn, thr, dur, thr2], t, c) {
        const s = c.s;
        let tr = turn, th = thr;
        if (t > dur) { // faza powrotu: obracaj się do (przewidywanej) pozycji celu
          th = thr2; tr = 0;
          if (c.target) {
            const bx = c.tx + (c.target.vx || 0) * t - q.x, by = c.ty + (c.target.vy || 0) * t - q.y;
            const d = angDiff(Math.atan2(by, bx), q.ang);
            tr = Math.abs(d) < s.rotationSpeed ? 0 : Math.sign(d);
          }
        }
        if (th) q.vel += th * (s.acceleration + c.ms * 0.1);
        else q.vel = q.vel > 0 ? Math.max(0, q.vel - s.deceleration) : Math.min(0, q.vel + s.deceleration);
        q.ang += tr * s.rotationSpeed;
        const mv = s.maxVelocity + c.ms; q.vel = Math.max(-mv, Math.min(mv, q.vel));
        q.x += Math.cos(q.ang) * q.vel; q.y += Math.sin(q.ang) * q.vel;
      },
      aimCost(q, [turn, thr, dur, thr2], bearing, d, c) {
        let w = d < c.range * 1.2 ? CFG.aimNear : CFG.aimFar;
        if (c.st == 10 && c.a.awaitingShotCharge) w *= 3;  // railgun fires 21 frames after charging starts: hold aim
        let aim = Math.abs(angDiff(bearing, q.ang)) * w;
        // sniper (4) auto-aims and auto-turns only while NO movement key is held (arena.js 1761, 2282)
        if (c.st == 4) { if (dur == 0 && !thr2 && c.tDist < 600) aim = 0; else aim += 60; }
        return aim;
      },
      apply(a, [turn, thr, dur, thr2], c) {
        let tr = turn, th = thr;
        if (dur == 0) {
          th = thr2; tr = 0;
          if (c.target) { const d = angDiff(c.aimAng, c.s.angle || 0); tr = Math.abs(d) < c.s.rotationSpeed ? 0 : Math.sign(d); }
          if (c.st == 4 && !thr2) tr = 0; // sniper: niech gra sama celuje
        }
        a.keys.KeyA = tr < 0; a.keys.KeyD = tr > 0; a.keys.KeyW = th > 0; a.keys.KeyS = th < 0;
      },
      horizon: 55,
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
    if (!enabled || window.player.ir.menu != 0 || window.player.ir.mobileControls > 0) return release(a);
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

    // ---- XP orby: lecą do statku 2 px/klatkę i znikają po 600 klatkach (arena.js 2939-2958, 3086-3092).
    // Gdy bot ucieka, orby nie nadążają i przepadają — więc w ocenie manewru karzemy utratę orbów.
    const O = [];
    for (const o of a.xpOrbs || []) {
      if (o.picked) continue;
      const [x, y] = rel(o);
      O.push({ x, y, timer: o.timer, d: Math.hypot(x, y) });
    }
    O.sort((p, q) => p.d - q.d); O.length = Math.min(O.length, 20);

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
      [tx, ty] = rel(target); c.tx = tx; c.ty = ty; c.tDist = Math.hypot(tx, ty);
      const lead = Math.min(60, c.tDist / bSpeed); // lead the shot by bullet travel time
      c.aimAng = Math.atan2(ty + (target.vy || 0) * lead, tx + (target.vx || 0) * lead);
      standoff = ram ? 0 : (target.radius || target.size || 20) + Math.min(range * 0.5, CFG.standoffMax);
    }

    // ---- common core 3: simulate every candidate action, score danger + standoff + aim, apply the cheapest
    const N = ctl.horizon || CFG.horizon;
    let bestC = null, bestCost = Infinity;
    // Kontynuacja poprzedniego planu (MPC z pamięcią): bez tego bot co klatkę zmienia zdanie i „drga” na A/D.
    let cands = ctl.cands();
    if (kind == 'rot' && lastPlan && lastPlan[2] > 1) cands = cands.concat([[lastPlan[0], lastPlan[1], lastPlan[2] - 1, lastPlan[3]]]);
    for (const cand of cands) {
      const q = ctl.init(s); let cost = 0, aimSum = 0;
      const orbs = O.map(o => ({ x: o.x, y: o.y, timer: o.timer, got: false }));
      for (let t = 1; t <= N; t++) {
        ctl.step(q, cand, t, c);
        for (const o of orbs) {
          if (o.got) continue;
          const dx = q.x - o.x, dy = q.y - o.y, d = Math.hypot(dx, dy);
          if (d < 30) { o.got = true; continue; }
          if (d > 5) { o.x += dx / d * 2; o.y += dy / d * 2; }
        }
        for (const th of T) {
          const d = Math.hypot(th.x + th.vx * t - q.x, th.y + th.vy * t - q.y) - th.r;
          cost += d < 0 ? th.w * 1e5 / (1 + t * 0.1) : th.w * CFG.softW * Math.exp(-d / CFG.softR) / (1 + t * 0.05);
        }
        if (target && ctl.aimCost) {
          const ex = tx + (target.vx || 0) * t - q.x, ey = ty + (target.vy || 0) * t - q.y;
          aimSum += ctl.aimCost(q, cand, Math.atan2(ey, ex), Math.hypot(ex, ey), c);
        }
      }
      if (target) {
        const ex = tx + (target.vx || 0) * N - q.x, ey = ty + (target.vy || 0) * N - q.y, d = Math.hypot(ex, ey);
        cost += (O.length ? 0.3 : 1) * Math.abs(d - standoff) + aimSum / N; // celowanie liczone średnio po całym horyzoncie
      }
      // XP to priorytet: każdy niezebrany orb ciągnie statek do siebie (liniowo z odległością, mocniej gdy orb zaraz zniknie),
      // a zebrany w horyzoncie daje premię. Waga dominuje nad celowaniem i dystansem do wroga.
      for (const o of orbs) {
        const urg = 1 + Math.max(0, 600 - o.timer) / 200;
        if (o.got) { cost -= CFG.orbW * urg; continue; }
        const d = Math.max(0, Math.hypot(q.x - o.x, q.y - o.y) - 30);
        cost += CFG.orbW * urg * (d / 250);
        if (d > 2 * (o.timer - N)) cost += CFG.orbW * urg; // nie zdąży dolecieć — przepadnie
      }
      if (cand === cands[cands.length - 1] && cands.length > ctl.cands().length) cost *= 0.9; // premia za trzymanie się planu
      if (cost < bestCost) { bestCost = cost; bestC = cand; }
    }
    lastPlan = kind == 'rot' ? bestC : null;
    ctl.apply(a, bestC, c);
  }

  // ---- Automatyczny wybór ulepszenia po level upie (klikalne ir: levelUpUpgrade_*):
  // 1) najwyższa rzadkość, 2) przy remisie XP, 3) potem: prędkość ruchu > atak > rozmiar pocisku > zasoby > obrona > regen.
  const upgPrio = id => {
    const k = id.toLowerCase();
    if (k.includes('xp') || k.startsWith('dropgain')) return 0;
    if (k.includes('movespeed') || k.includes('mobility') || k.includes('speedparagon')) return 1;
    if (k.startsWith('attack')) return 2;
    if (k.includes('bulletsize')) return 3;
    if (k.includes('gain') || k.includes('loot')) return 4;
    if (k.includes('defense') || k.includes('damagereduction')) return 5;
    if (k.includes('healthregen')) return 6;
    return 7;
  };
  let lastPickNote = '';
  function autoPick() {
    const a = getArena();
    if (!enabled || !CFG.autoUpgrade || !a || window.player.ir.menu != 1 || !a.upgradeChoices || !a.upgradeChoices.length) return;
    const R = window.UPGRADE_RARITIES || (typeof UPGRADE_RARITIES !== 'undefined' ? UPGRADE_RARITIES : null);
    const P = window.UPGRADE_POOL || (typeof UPGRADE_POOL !== 'undefined' ? UPGRADE_POOL : null);
    if (!R || !P) return;
    let bi = -1, bk = null;
    a.upgradeChoices.forEach((id, i) => {
      const u = P[id]; if (!u) return;
      const key = [-(R[u.rarity] ? R[u.rarity].score : 0), upgPrio(id)];
      if (!bk || key[0] < bk[0] || (key[0] == bk[0] && key[1] < bk[1])) { bk = key; bi = i; }
    });
    if (bi < 0) return;
    a.selectedUpgradeIndex = bi;
    lastPickNote = a.upgradeChoices[bi];
    if (typeof window.clickClickable === 'function') { window.updateClickableTemp?.('ir'); window.clickClickable('ir', 'levelUpUpgrade_confirm'); }
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
  function start() { enabled = true; hook(); if (!watchdog) watchdog = setInterval(() => { hook(); try { autoPick(); } catch (e) { console.warn('[hunter] upgrade', e); } }, 250); }
  function stop() {
    enabled = false; target = null;
    if (watchdog) { clearInterval(watchdog); watchdog = null; }
    const a = getArena();
    if (a) { release(a); if (a.__hunterHooked) { delete a.update; delete a.__hunterHooked; } }
  }
  return { start, stop, hunterTick, CFG, get lastPick() { return lastPickNote; }, get enabled() { return enabled; } };
})();

const applyParams = p => {
  Hunter.CFG.margin = Number(p.margin) || 0;
  Hunter.CFG.aimNear = (Number(p.aggression) || 0) * 15;
  Hunter.CFG.aimFar = (Number(p.aggression) || 0) * 4;
  Hunter.CFG.allowMouse = Boolean(p.allowMouse);
  Hunter.CFG.orbW = (p.orbPriority ?? 100) * 30;
  Hunter.CFG.autoUpgrade = p.autoUpgrade ?? true;
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
    "Pilnuje XP: nie ucieka tak daleko, żeby orby XP zdążyły zniknąć. Po level upie sam wybiera ulepszenie: najwyższa rzadkość, " +
    "przy remisie XP, potem prędkość ruchu > atak > rozmiar pocisku > zasoby > obrona > regeneracja. " +
    "Statki bez sterowania WASD (lecą/toczą się w stronę kursora) bot prowadzi wirtualnym kursorem — nie ruszaj wtedy myszką nad grą. " +
    "Nie działa przy sterowaniu mobilnym.",
  params: [
    { key: "aggression", label: "Agresja celowania (0–200, więcej = mocniej trzyma cel na muszce)", type: "number", default: 100, min: 0, step: 10 },
    { key: "margin", label: "Margines bezpieczeństwa (px)", type: "number", default: 14, min: 0, step: 2 },
    { key: "orbPriority", label: "Priorytet zbierania XP (0–200)", type: "number", default: 100, min: 0, step: 10 },
    { key: "autoUpgrade", label: "Sam wybieraj ulepszenia po level upie", type: "bool", default: true },
    { key: "allowMouse", label: "Celuj kursorem w statkach, które strzelają w stronę myszki", type: "bool", default: true },
  ],
  available: () => Boolean(window.player?.ir),
  onEnable(ctx) { applyParams(ctx.p); this._p = ctx.p; this._t = setInterval(() => applyParams(this._p), 1000); Hunter.start(); },
  onDisable() { clearInterval(this._t); Hunter.stop(); },
};
export { Hunter };
