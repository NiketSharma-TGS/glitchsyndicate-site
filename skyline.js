// Pixel-art scene on the hero divider line.
//
// What lives on the line:
//   - a blinking beacon: teal when idle, red while something is going on
//   - every 10-24s one event: either a dogfight (a dark hunter ship chases a
//     grey one, locks on, fires a 3-round burst; the victim crashes on the
//     line) or a turret that pops
//     out of the ground, looks around, and retracts
//   - click the turret while it is out and it shoots down the next ship
//
// All art is drawn from the small text grids below (one character = one
// pixel), so you can edit sprites by hand. Colors come from PAL.
// The canvas is decorative (aria-hidden), pauses when off-screen or when the
// tab is hidden, and is a static picture for people who prefer reduced motion.

(function () {
  'use strict';

  var hero = document.querySelector('.hero');
  if (!hero) return;

  // ---- settings ----------------------------------------------------------
  var HL = 36;                // canvas height in logical pixels
  var TICK = 1000 / 12;       // one animation step, in ms (12 fps pixel feel)
  var reduceMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var debug = /[?&]sky=debug/.test(location.search);

  var PAL = {
    G: '#c9ced8',   // light grey
    g: '#8a909c',   // mid grey
    d: '#4a4f5b',   // dark grey
    T: '#5eead4',   // teal (site accent)
    t: '#2a9d8f',   // dark teal
    O: '#ff9f5a',   // warm orange: used only for flames, flashes, explosions
    Y: '#ffd9a8',   // pale orange highlight
    R: '#e0505a',   // alert red: the beacon, only while ships/turret are out
    r: '#5a2328',   // dark red (beacon between blinks)
    P: '#f4a3a8',   // pale red highlight
    K: '#3a3f4b',   // charcoal (the hunter's hull)
    k: '#5a606d',   // charcoal highlight
    N: '#23262e'    // near-black (the hunter's engine)
  };

  // ---- sprites (one character = one pixel, '.' = transparent) ------------
  // Ship faces right. Thruster flame is drawn separately behind it.
  var SHIP = [
    '......GG.........',
    '......GGG........',
    '.....ggGGGg......',
    '.dggGGGGGGGGGTTg.',
    '.dggGGGGGGGGGGgg.',
    '.....ggGGGGg.....',
    '....ggGGg........',
    '...gg............'
  ];

  // The hunter: dark charcoal, swept-back fins at the rear, twin guns, and a
  // long needle nose with a red tip. 'R' marks the red parts (cockpit slit and
  // nose tip); HUNTER_AIM is the same ship with those glowing.
  var HUNTER = [
    '..kk...............',
    '..kKk..............',
    '...kKKkkkkk........',
    'NNKKKKKKKKKKkkkk...',
    'NKKKKKKKKRRKKKKKkRR',
    'NNKKKKKKKKKKkkkk...',
    '...kKKkkkkk........',
    '..kKk..............',
    '..kk...............'
  ];
  var HUNTER_AIM = HUNTER.map(function (r, i) { return i === 4 ? r.replace(/RR/g, 'PP') : r; });

  // Turret body (13 wide). The barrel and the teal "eye" are drawn on top.
  var TURRET = [
    '....ggGgg....',
    '...gGGGGGg...',
    '..gGGGGGGGg..',
    '..gGGGGGGGg..',
    '...gdddddg...',
    '..dd.....dd..',
    '.dd.......dd.',
    'dd.........dd',
    'gg.........gg'
  ];
  var TURRET_W = 13, TURRET_H = 9, PIVOT_X = 6, PIVOT_Y = 1, BARREL = 7;

  var WRECK = [
    '...d.g...',
    '..dggdg..',
    '.dgdddgd.',
    'dddgdddgd'
  ];

  function buildSprite(rows) {
    var w = rows[0].length, h = rows.length;
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    var x = c.getContext('2d');
    for (var y = 0; y < h; y++) {
      for (var i = 0; i < w; i++) {
        var k = rows[y].charAt(i);
        if (PAL[k]) { x.fillStyle = PAL[k]; x.fillRect(i, y, 1, 1); }
      }
    }
    return c;
  }

  // Rotate a sprite and snap edges back to hard pixels.
  function rotated(src, deg) {
    var s = Math.ceil(Math.hypot(src.width, src.height)) + 2;
    var c = document.createElement('canvas');
    c.width = c.height = s;
    var x = c.getContext('2d');
    x.imageSmoothingEnabled = false;
    x.translate(s / 2, s / 2);
    x.rotate(deg * Math.PI / 180);
    x.drawImage(src, -src.width / 2, -src.height / 2);
    var d = x.getImageData(0, 0, s, s);
    for (var i = 3; i < d.data.length; i += 4) d.data[i] = d.data[i] > 110 ? 255 : 0;
    x.putImageData(d, 0, 0);
    return c;
  }

  var shipImg = buildSprite(SHIP);
  var SHIP_ROT = [shipImg, rotated(shipImg, 38), rotated(shipImg, 72)];   // level, diving, steep dive
  var hunterImg = buildSprite(HUNTER), hunterAimImg = buildSprite(HUNTER_AIM);
  var turretImg = buildSprite(TURRET);
  var wreckImg = buildSprite(WRECK);

  // ---- canvas ------------------------------------------------------------
  var canvas = document.createElement('canvas');
  canvas.className = 'skyline';
  canvas.setAttribute('aria-hidden', 'true');
  hero.appendChild(canvas);
  var ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  var Wl = 200, S = 3;        // logical width, css pixels per logical pixel

  // ---- scene state -------------------------------------------------------
  var ships = [], shots = [], parts = [], wrecks = [], flashes = [];
  var turret = null;          // {x, oy, state, t, ang, tgtAng, plan, planI, armed, ship, fired}
  var ev = null;              // current event: {update, done}
  var cooldown = 30;          // ticks until next event (first one after ~2.5s)
  var beaconX = 0, beaconT = 0;
  var tick = 0;

  function rand(a, b) { return a + Math.random() * (b - a); }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  function resetScene() {
    ships.length = shots.length = parts.length = wrecks.length = flashes.length = 0;
    turret = null; ev = null;
    cooldown = 24;
  }

  function layout() {
    var w = hero.clientWidth;
    var nextS = w < 520 ? 2 : 3;
    var nextW = Math.max(100, Math.floor(w / nextS));
    if (nextW !== Wl || nextS !== S || canvas.width !== nextW) {
      S = nextS; Wl = nextW;
      canvas.width = Wl; canvas.height = HL;
      canvas.style.width = (Wl * S) + 'px';
      canvas.style.height = (HL * S) + 'px';
      ctx.imageSmoothingEnabled = false;
      beaconX = Wl - Math.round(Wl * 0.08);
      resetScene();
      draw();
    }
  }

  // ---- drawing helpers ---------------------------------------------------
  function px(x, y, color, w, h) {
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x), Math.round(y), w || 1, h || 1);
  }

  function drawImg(img, cx, cy, flip) {
    ctx.save();
    ctx.translate(Math.round(cx), Math.round(cy));
    if (flip) ctx.scale(-1, 1);
    ctx.drawImage(img, -Math.floor(img.width / 2), -Math.floor(img.height / 2));
    ctx.restore();
  }

  function drawBlob(cx, cy, r, color) {
    for (var y = -r; y <= r; y++) {
      for (var x = -r; x <= r; x++) {
        if (x * x + y * y <= r * r + 1) px(cx + x, cy + y, color);
      }
    }
  }

  // ---- effects -----------------------------------------------------------
  function spawnPart(x, y, vx, vy, life, color, g) {
    parts.push({ x: x, y: y, vx: vx, vy: vy, life: life, max: life, c: color, g: g || 0 });
  }

  function burst(x, y, n, speed, colors, life) {
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2, s = rand(0.4, speed);
      spawnPart(x, y, Math.cos(a) * s, Math.sin(a) * s - 0.3, Math.round(rand(life * 0.6, life)),
        colors[Math.floor(Math.random() * colors.length)], 0.12);
    }
  }

  function explode(x, y) {
    burst(x, y, 20, 2.6, [PAL.Y, PAL.O, PAL.O, PAL.G, PAL.g, PAL.T], 16);
    flashes.push({ x: x, y: y, t: 0, kind: 'boom' });
    wrecks.push({ x: Math.round(x), life: 64 });
  }

  function hitShip(s) {
    s.mode = 'fall'; s.vy = -0.6;
    burst(s.x, s.y, 8, 1.8, [PAL.Y, PAL.O, PAL.T], 8);
  }

  // opts: {red: red tracer (the hunter's) instead of teal, lethal: false = just damages}
  function fireShot(fx, fy, target, opts) {
    opts = opts || {};
    shots.push({ x: fx, y: fy, tgt: target, life: 40, dx: 1, dy: 0,
      red: !!opts.red, lethal: opts.lethal !== false, speed: opts.red ? 5.8 : 6.5 });
    flashes.push({ x: fx, y: fy, t: 0, kind: 'muzzle', red: !!opts.red });
  }

  // A non-lethal hit: sparks, and the ship starts trailing smoke.
  function damageShip(s) {
    s.smoking = true;
    burst(s.x, s.y, 6, 1.5, [PAL.P, PAL.R, PAL.Y], 7);
    flashes.push({ x: s.x, y: s.y, t: 0, kind: 'muzzle', red: true });
  }

  // ---- ships -------------------------------------------------------------
  function makeShip(x, dir, y, amp, speed) {
    return { x: x, y: y, base: y, amp: amp, vx: dir * speed, vy: 0, dir: dir, mode: 'fly', phase: Math.random() * 6,
      kind: 'prey', smoking: false, aim: false };
  }

  function updateShips() {
    for (var i = ships.length - 1; i >= 0; i--) {
      var s = ships[i];
      if (s.mode === 'fall') {
        s.vy += 0.45;
        s.y += s.vy;
        s.x += s.vx * 0.55;
        if (tick % 2 === 0) spawnPart(s.x - s.dir * 5, s.y, rand(-0.2, 0.2), rand(-0.5, 0), 9, tick % 4 ? PAL.d : PAL.g, 0);
        if (s.y + 4 >= HL - 1) {
          explode(s.x, HL - 3);
          ships.splice(i, 1);
        }
        continue;
      }
      s.x += s.vx;
      s.phase += 0.45;
      if (s.smoking && tick % 2 === 0) spawnPart(s.x - s.dir * 8, s.y, rand(-0.1, 0.1), rand(-0.45, -0.1), 11, tick % 4 ? PAL.d : PAL.g, 0);
      if (s.mode === 'exit') s.base -= 0.16;
      s.y = clamp(s.base + Math.sin(s.phase) * s.amp, 5, HL - 14);
      if (s.x < -24 || s.x > Wl + 24) ships.splice(i, 1);
    }
  }

  function updateShots() {
    for (var i = shots.length - 1; i >= 0; i--) {
      var sh = shots[i], t = sh.tgt;
      if (!t || t.mode === 'fall' || ships.indexOf(t) < 0 || --sh.life <= 0) { shots.splice(i, 1); continue; }
      var dx = t.x - sh.x, dy = t.y - sh.y, d = Math.sqrt(dx * dx + dy * dy) || 1;
      if (d < 6) { if (sh.lethal) hitShip(t); else damageShip(t); shots.splice(i, 1); continue; }
      sh.dx = dx / d; sh.dy = dy / d;
      sh.x += sh.dx * sh.speed;
      sh.y += sh.dy * sh.speed;
    }
  }

  function updateParts() {
    for (var i = parts.length - 1; i >= 0; i--) {
      var p = parts[i];
      p.x += p.vx; p.y += p.vy; p.vy += p.g;
      if (--p.life <= 0 || p.y > HL) parts.splice(i, 1);
    }
    for (var j = flashes.length - 1; j >= 0; j--) {
      if (++flashes[j].t > (flashes[j].kind === 'boom' ? 6 : 2)) flashes.splice(j, 1);
    }
    for (var k = wrecks.length - 1; k >= 0; k--) {
      var w = wrecks[k];
      w.life--;
      if (w.life > 24 && w.life % 3 === 0) spawnPart(w.x + rand(-2, 2), HL - 5, rand(-0.15, 0.15), rand(-0.55, -0.25), 12, w.life % 6 ? PAL.d : PAL.g, 0);
      if (w.life <= 0) wrecks.splice(k, 1);
    }
  }

  // ---- event: dogfight ---------------------------------------------------
  function startChase() {
    var dir = Math.random() < 0.5 ? 1 : -1;
    var xs = dir > 0 ? -12 : Wl + 12;
    var baseY = rand(11, 19);
    var victim = makeShip(xs + dir * 44, dir, baseY, 2.6, 3.1);
    var hunter = makeShip(xs, dir, baseY + rand(-2, 2), 1.2, 3.4);
    hunter.kind = 'hunter';
    ships.push(victim, hunter);
    // where the hunter opens fire: a bit into the canvas, measured from the entry side
    var frac = rand(0.2, 0.42);
    var fireX = dir > 0 ? Wl * frac : Wl * (1 - frac);
    var phase = 'cruise', timer = 0, fired = 0;
    ev = {
      update: function () {
        if (phase === 'cruise') {
          if (dir * (hunter.x - fireX) >= 0) {
            phase = 'aim'; timer = 0;
            hunter.vx = victim.vx;            // hold the gap steady while aiming
            hunter.aim = true;
          }
        } else if (phase === 'aim') {
          if (++timer >= 6) { phase = 'burst'; timer = 0; }
        } else if (phase === 'burst') {
          if (timer % 3 === 0 && fired < 3) {
            // twin guns: alternate barrels, the third round is the kill shot
            fireShot(hunter.x + dir * 8, hunter.y + (fired % 2 ? 1 : -1), victim, { red: true, lethal: fired === 2 });
            fired++;
          }
          if (++timer > 9 && victim.mode === 'fall') {
            phase = 'exit'; hunter.aim = false; hunter.mode = 'exit'; hunter.vx = dir * 3.4;
          }
          if (timer > 40) { phase = 'exit'; hunter.aim = false; hunter.mode = 'exit'; hunter.vx = dir * 3.4; }
        }
      },
      done: function () { return !ships.length && !shots.length && !wrecks.length && !parts.length; }
    };
  }

  // ---- event: turret -----------------------------------------------------
  function pickTurretX() {
    for (var i = 0; i < 12; i++) {
      var x = Math.round(Wl * rand(0.15, 0.82));
      if (Math.abs(x - beaconX) > 22) return x;
    }
    return Math.round(Wl * 0.3);
  }

  function turretTip() {
    var a = turret.ang * Math.PI / 180;
    return {
      x: turret.x + Math.cos(a) * (BARREL + 1),
      y: HL - TURRET_H + turret.oy + PIVOT_Y - Math.sin(a) * (BARREL + 1)
    };
  }

  function startTurret() {
    turret = {
      x: pickTurretX(), oy: TURRET_H + 1, state: 'rise', t: 0,
      ang: 90, tgtAng: 90, plan: [90, 150, 150, 100, 35, 35, 90, 160, 90], planI: 0,
      armed: false, ship: null, fired: 0, hold: 0
    };
    ev = { update: updateTurret, done: function () { return !turret && !parts.length; } };
  }

  function armTurret() {
    if (!turret || turret.armed) return;
    if (turret.state !== 'look' && turret.state !== 'rise') return;
    turret.armed = true;
    turret.state = 'armed';
    var dir = turret.x < Wl / 2 ? -1 : 1;                     // ship crosses toward the turret
    var xs = dir > 0 ? -12 : Wl + 12;
    turret.ship = makeShip(xs, dir, rand(10, 17), 1.6, 3.0);
    ships.push(turret.ship);
  }

  function updateTurret() {
    var t = turret;
    if (!t) return;
    // ease barrel toward target angle
    var da = t.tgtAng - t.ang;
    t.ang += clamp(da, -14, 14);

    if (t.state === 'rise') {
      t.oy -= 1;
      if (t.oy <= 0) { t.oy = 0; t.state = 'look'; t.t = 0; }
    } else if (t.state === 'look') {
      t.t++;
      if (t.t % 6 === 0) {
        if (t.planI >= t.plan.length) { t.state = 'retract'; return; }
        t.tgtAng = t.plan[t.planI++];
      }
    } else if (t.state === 'armed') {
      var s = t.ship;
      if (s && ships.indexOf(s) >= 0 && s.mode !== 'fall') {
        var dx = s.x - t.x, dy = (HL - TURRET_H) - s.y;
        t.tgtAng = clamp(Math.atan2(dy, dx) * 180 / Math.PI, 20, 160);
        if (t.fired < 3 && Math.abs(dx) < 80 && (tick % 8 === 0)) {
          var tip = turretTip();
          fireShot(tip.x, tip.y, s);
          t.fired++;
        }
      } else if (!shots.length && ships.indexOf(s) < 0) {
        if (++t.hold > 26) t.state = 'retract';
      }
    } else if (t.state === 'retract') {
      t.oy += 1;
      if (t.oy > TURRET_H + 1) turret = null;
    }
  }

  // ---- main step & draw --------------------------------------------------
  function step() {
    tick++;
    if (ev) {
      ev.update();
      if (ev.done()) { ev = null; cooldown = Math.round(rand(120, 288)); }
    } else if (--cooldown <= 0) {
      if (Math.random() < 0.55) startChase(); else startTurret();
    }
    updateShips();
    updateShots();
    updateParts();
    beaconT = (beaconT + 1) % 30;
  }

  function drawBeacon() {
    var x = beaconX, lit = beaconT < 6 || reduceMotion;
    px(x, HL - 9, PAL.g, 1, 9);                    // mast
    px(x - 1, HL - 1, PAL.d, 3, 1);                // foot
    var alert = !!ev;                              // red while an event is running
    if (lit) {
      ctx.globalAlpha = alert ? 0.34 : 0.28; px(x - 2, HL - 14, alert ? PAL.R : PAL.T, 5, 5); ctx.globalAlpha = 1;
      px(x - 1, HL - 13, alert ? PAL.R : PAL.T, 3, 2);
      px(x, HL - 12, alert ? PAL.P : PAL.Y, 1, 1);
    } else {
      px(x - 1, HL - 13, alert ? PAL.r : PAL.d, 3, 2);
    }
  }

  function drawTurret() {
    var t = turret;
    var ty = HL - TURRET_H + t.oy;
    var a = t.ang * Math.PI / 180;
    // barrel behind the body's top edge
    for (var k = 1; k <= BARREL; k++) {
      px(t.x + Math.round(Math.cos(a) * k), ty + PIVOT_Y - Math.round(Math.sin(a) * k), k >= BARREL - 1 ? PAL.g : PAL.G);
    }
    ctx.drawImage(turretImg, t.x - PIVOT_X, ty);
    // teal eye follows where the barrel points
    px(t.x + Math.round(Math.cos(a) * 2), ty + 3, PAL.T);
  }

  function draw() {
    ctx.clearRect(0, 0, Wl, HL);

    drawBeacon();

    wrecks.forEach(function (w) {
      ctx.globalAlpha = w.life < 14 ? w.life / 14 : 1;
      ctx.drawImage(wreckImg, w.x - 4, HL - 4);
      if (w.life > 20 && tick % 3 === 0) px(w.x + Math.round(rand(-3, 3)), HL - 4, PAL.T);
      ctx.globalAlpha = 1;
    });

    if (turret) drawTurret();

    parts.forEach(function (p) {
      ctx.globalAlpha = p.life < 4 ? p.life / 4 : 1;
      px(p.x, p.y, p.c);
    });
    ctx.globalAlpha = 1;

    ships.forEach(function (s) {
      var len = 2 + (tick % 2), i;
      if (s.kind === 'hunter') {
        drawImg(s.aim && tick % 2 ? hunterAimImg : hunterImg, s.x, s.y, s.dir < 0);
        for (i = 0; i < len; i++) px(s.x - s.dir * (10 + i), s.y, i === 0 ? PAL.P : PAL.R);
        if (s.aim) {   // red glow at the gun muzzles: the "about to fire" warning
          var mx = s.x + s.dir * 8;
          px(mx, s.y - 1, tick % 2 ? PAL.P : PAL.R); px(mx, s.y + 1, tick % 2 ? PAL.R : PAL.P);
          px(s.x + s.dir * 11, s.y, tick % 2 ? PAL.R : PAL.P);   // glow past the nose tip
        }
        return;
      }
      var rot = s.mode === 'fall' ? (s.vy < 1.4 ? 0 : (s.vy < 3 ? 1 : 2)) : 0;
      // diving sprites tilt toward the ground in their flight direction
      drawImg(SHIP_ROT[rot], s.x, s.y, s.dir < 0);
      if (s.mode !== 'fall') {
        for (i = 0; i < len; i++) px(s.x - s.dir * (9 + i), s.y, i === 0 ? PAL.Y : PAL.O);
      }
    });

    shots.forEach(function (sh) {
      if (sh.red) {
        var cols = [PAL.P, PAL.R, PAL.R, PAL.r];
        for (var i = 0; i < 4; i++) px(sh.x - sh.dx * i * 1.3, sh.y - sh.dy * i * 1.3, cols[i]);
      } else {
        for (var j = 0; j < 3; j++) px(sh.x - sh.dx * j * 1.4, sh.y - sh.dy * j * 1.4, j === 0 ? PAL.Y : PAL.T);
      }
    });

    flashes.forEach(function (f) {
      if (f.kind === 'boom') {
        var r = [4, 5, 4, 3, 2, 1][f.t] || 1;
        drawBlob(f.x, f.y, r, f.t < 3 ? PAL.O : PAL.g);
        if (f.t < 3) drawBlob(f.x, f.y, Math.max(1, r - 2), PAL.Y);
      } else {
        var c1 = f.red ? PAL.R : PAL.O, c2 = f.red ? PAL.P : PAL.Y;
        px(f.x - 2, f.y, c1, 5, 1);
        px(f.x, f.y - 2, c2, 1, 5);
        px(f.x - 1, f.y - 1, c1, 3, 3);
      }
    });
  }

  // ---- loop control ------------------------------------------------------
  var running = false, rafId = 0, last = 0, acc = 0;
  var inView = true, tabVisible = !document.hidden;

  function frame(ts) {
    rafId = requestAnimationFrame(frame);
    if (!last) last = ts;
    acc += Math.min(ts - last, 250);
    last = ts;
    var stepped = false;
    while (acc >= TICK) { step(); acc -= TICK; stepped = true; }
    if (stepped) draw();
  }

  function updateRunState() {
    var shouldRun = inView && tabVisible && !reduceMotion;
    if (shouldRun && !running) { running = true; last = 0; rafId = requestAnimationFrame(frame); }
    else if (!shouldRun && running) { running = false; cancelAnimationFrame(rafId); }
  }

  document.addEventListener('visibilitychange', function () { tabVisible = !document.hidden; updateRunState(); });
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      inView = entries[entries.length - 1].isIntersecting; updateRunState();
    }).observe(hero);
  }
  if ('ResizeObserver' in window) new ResizeObserver(layout).observe(hero);
  else window.addEventListener('resize', layout);

  // ---- click the turret --------------------------------------------------
  function turretHit(e) {
    if (!turret || (turret.state !== 'look' && turret.state !== 'rise')) return false;
    var r = canvas.getBoundingClientRect();
    var x = (e.clientX - r.left) / S, y = (e.clientY - r.top) / S;
    return Math.abs(x - turret.x) <= 8 && y >= HL - TURRET_H - BARREL + turret.oy - 1 && y <= HL;
  }

  if (!reduceMotion) {
    hero.addEventListener('click', function (e) { if (turretHit(e)) armTurret(); });
    hero.addEventListener('mousemove', function (e) { hero.style.cursor = turretHit(e) ? 'pointer' : ''; });
    hero.addEventListener('mouseleave', function () { hero.style.cursor = ''; });
  }

  // ---- go ----------------------------------------------------------------
  layout();
  draw();
  updateRunState();

  if (debug) {
    window.__sky = {
      chase: startChase,
      turret: startTurret,
      arm: armTurret,
      state: function () {
        return {
          ev: !!ev, turret: turret && { state: turret.state, oy: turret.oy, x: turret.x },
          ships: ships.length, shots: shots.length, wrecks: wrecks.length, parts: parts.length, S: S, Wl: Wl
        };
      },
      turretBox: function () {
        if (!turret) return null;
        var r = canvas.getBoundingClientRect();
        // screen-space center of the turret body (handy for synthetic clicks)
        return { cx: r.left + turret.x * S, cy: r.top + (HL - TURRET_H / 2 + turret.oy) * S };
      },
      hold: function () { cooldown = 1e9; }
    };
  }
})();
