// Main loop: fixed-timestep simulation (60 Hz) + interpolated rendering.
(function () {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const hudLetters = document.getElementById('letters');
  const hudSeed = document.getElementById('seed');
  const hudTrinkets = document.getElementById('trinkets');
  const dialogEl = document.getElementById('dialog');

  const params = new URLSearchParams(location.search);
  const seedStr = params.get('seed') || 'twoworlds';
  const seedInt = hashString(seedStr);

  const STEP = 1 / 60;
  const game = {
    state: 'title',
    time: 0,
    player: makePlayer(),
    entities: [],
    particles: makeParticlePool(80),
    floatTexts: [],
    birds: [],
    birdTimer: 8,
    cam: { x: 0, y: 0, px: 0, py: 0 },
    shakeT: 0, shakeAmp: 0, freezeT: 0,
    hitCooldown: 0,
    trinkets: 0,
    deathT: null,
    rings: [],
    collected: new Set(),
    dialogTimer: 0,
    fireflyTimer: 0,
    touch: { active: false, ox: 0, oy: 0, dx: 0, dy: 0, id: -1 },
    isTouchDevice: 'ontouchstart' in window || navigator.maxTouchPoints > 0,
  };

  game.shake = (dur, amp) => { game.shakeT = Math.max(game.shakeT, dur); game.shakeAmp = amp; };
  game.freeze = (dur) => { game.freezeT = Math.max(game.freezeT, dur); };
  game.burst = (x, y, n, color) => {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = 40 + Math.random() * 120;
      emitParticle(game.particles, x, y, Math.cos(a) * sp, Math.sin(a) * sp - 30,
        0.3 + Math.random() * 0.3, 2 + Math.random() * 3, color);
    }
  };
  game.floatText = (x, y, text) => {
    game.floatTexts.push({ x, y, text, t: 0 });
  };
  game.removeEntity = (e) => {
    const i = game.entities.indexOf(e);
    if (i >= 0) game.entities.splice(i, 1);
    if (e.chunk && e.chunk.live) {
      const j = e.chunk.live.indexOf(e);
      if (j >= 0) e.chunk.live.splice(j, 1);
    }
  };
  game.ring = (x, y) => {
    game.rings.push({ x, y, t: 0 });
    game.burst(x, y, 10, PALETTE.forest.groundSpeckle);
  };
  game.updateTrinketHud = () => {
    hudTrinkets.innerHTML = `&#10022; ${game.trinkets} trinkets`;
  };
  game.collectLetter = (e) => {
    if (game.collected.has(e.idx)) return;
    game.collected.add(e.idx);
    game.entities.splice(game.entities.indexOf(e), 1);
    game.burst(e.x, e.y - 10, 16, PALETTE.forest.letterStamp);
    game.burst(e.x, e.y - 10, 8, PALETTE.forest.cream);
    game.floatText(e.x, e.y - 30, '+1 letter');
    hudLetters.innerHTML = `&#9993; ${game.collected.size} / 5 letters`;
    showDialog(LETTER_TEXTS[e.idx] + (game.collected.size === 5
      ? '<span class="hint">All five letters found. The two worlds are yours to wander.</span>' : ''));
  };

  function showDialog(html) {
    dialogEl.innerHTML = html;
    dialogEl.classList.add('show');
    game.dialogTimer = 7;
  }

  /* ---------- init ---------- */
  worldInit(seedInt);
  buildSprites(seedInt);
  buildDungeon(seedInt);
  buildAtmos(seedInt);
  hudSeed.innerHTML = `<small>seed</small> ${seedStr.replace(/[<>&]/g, '')}`;

  game.bouldersOpened = new Set();
  World.onSpawnEntity = (spec, chunk) => {
    if (spec.kind === 'letter' && game.collected.has(spec.idx)) return;
    if (spec.kind === 'boulder' && game.bouldersOpened.has(spec.idx)) return;
    const e = spawnEntity(spec, chunk);
    game.entities.push(e);
    chunk.live = chunk.live || [];
    chunk.live.push(e);
  };

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(innerWidth * dpr);
    canvas.height = Math.round(innerHeight * dpr);
    canvas.style.width = innerWidth + 'px';
    canvas.style.height = innerHeight + 'px';
    game.dpr = dpr;
  }
  addEventListener('resize', resize);
  resize();

  /* ---------- input ---------- */
  const keys = {};
  addEventListener('keydown', (e) => {
    keys[e.code] = true;
    if (game.state === 'title' && (e.code === 'Enter' || e.code === 'Space' || e.code === 'KeyE')) startGame();
    else if (e.code === 'KeyE' || e.code === 'Enter') tryInteract();
    else if (e.code === 'Space' || e.code === 'KeyJ') queueAttack(game);
    else if (e.code === 'KeyK' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') throwBomb(game);
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  });
  addEventListener('keyup', (e) => { keys[e.code] = false; });

  canvas.addEventListener('pointerdown', (e) => {
    if (game.state === 'title') { startGame(); return; }
    if (e.clientX < innerWidth * 0.55) {
      game.touch.active = true;
      game.touch.id = e.pointerId;
      game.touch.ox = e.clientX; game.touch.oy = e.clientY;
      game.touch.dx = 0; game.touch.dy = 0;
    } else {
      // right-side tap: bloom button, else interact when something is near, else bonk
      if (bloomButtonHit(game, e.clientX, e.clientY)) throwBomb(game);
      else if (nearestInteractable()) tryInteract();
      else queueAttack(game);
    }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (game.touch.active && e.pointerId === game.touch.id) {
      const dx = e.clientX - game.touch.ox, dy = e.clientY - game.touch.oy;
      const d = Math.hypot(dx, dy);
      const max = 46;
      const k = d > max ? max / d : 1;
      game.touch.dx = dx * k / max; game.touch.dy = dy * k / max;
    }
  });
  const endTouch = (e) => {
    if (e.pointerId === game.touch.id) {
      game.touch.active = false; game.touch.dx = 0; game.touch.dy = 0;
    }
  };
  canvas.addEventListener('pointerup', endTouch);
  canvas.addEventListener('pointercancel', endTouch);

  function startGame() {
    game.state = 'play';
    showDialog('Find the <b>5 lost letters</b> scattered across the two worlds.<span class="hint">WASD / arrows to walk &middot; E to interact &middot; Space to bonk</span>');
  }

  function nearestInteractable() {
    const p = game.player;
    let best = null, bestD = (TILE * 1.6) ** 2;
    for (const e of game.entities) {
      if (!e.interact) continue;
      const d = dist2(p.x, p.y, e.x, e.y);
      if (d < bestD) { bestD = d; best = e; }
    }
    return best;
  }

  function tryInteract() {
    const e = nearestInteractable();
    if (!e) return;
    if (e.interact.action) { e.interact.action(e); return; }
    showDialog(e.interact.text);
    if (e.kind === 'slime') {
      e.hopDur = 0.3; e.hopT = 2; e.hopDX = 0; e.hopDY = 0;
      game.burst(e.x, e.y - 10, 8, PALETTE.forest.slime);
    }
  }

  /* ---------- simulation ---------- */
  // shared input vector (keyboard + virtual joystick); both modes read this
  function readInput() {
    const p = game.player;
    let ix = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
    let iy = (keys.KeyS || keys.ArrowDown ? 1 : 0) - (keys.KeyW || keys.ArrowUp ? 1 : 0);
    if (game.touch.active) { ix += game.touch.dx; iy += game.touch.dy; }
    if (game.deathT !== null || p.hurtLockT > 0) { ix = 0; iy = 0; }
    if (game.endingT && game.endingT < 3.5) { ix = 0; iy = 0; }   // hold still for the bow
    return { ix, iy };
  }

  function update(dt) {
    game.time += dt;
    if (game.dialogTimer > 0) {
      game.dialogTimer -= dt;
      if (game.dialogTimer <= 0) dialogEl.classList.remove('show');
    }

    // the Hollow Stump (and its enter/exit fades) runs its own update path
    if (Dungeon.fade || Dungeon.active) { updateDungeonMode(game, dt); return; }

    const p = game.player;
    p.px = p.x; p.py = p.y;
    game.cam.px = game.cam.x; game.cam.py = game.cam.y;

    // soft defeat: fade out, wake at the spawn clearing with everything kept
    if (game.deathT !== null) {
      game.deathT += dt;
      if (game.deathT >= COMBAT.DEATH_FADE && p.hp <= 0) {
        p.x = p.px = TILE * 0.5;
        p.y = p.py = TILE * 0.5;
        game.cam.x = game.cam.px = p.x;
        game.cam.y = game.cam.py = p.y;
        p.hp = p.maxHp;
        p.iFrameT = COMBAT.IFRAMES;
        p.knockX = p.knockY = 0;
        p.attackState = 'none';
        showDialog('You were carried back to safety. The world kept everything you found.');
      }
      if (game.deathT >= COMBAT.DEATH_FADE * 2) game.deathT = null;
    }

    let { ix, iy } = readInput();
    updatePlayerCombat(game, dt);
    if (p.attackState === 'windup' || p.attackState === 'active' || p.attackState === 'follow') {
      ix *= COMBAT.MOVE_DAMP; iy *= COMBAT.MOVE_DAMP;
    }
    const il = Math.hypot(ix, iy);
    if (il > 1) { ix /= il; iy /= il; }
    p.moving = il > 0.15;

    if (p.moving) {
      if (Math.abs(ix) > Math.abs(iy)) p.dir = ix > 0 ? 3 : 2;
      else p.dir = iy > 0 ? 0 : 1;
      p.walkT += dt * 8;
    }

    // squash-and-stretch on start/stop (150 ms back-out)
    if (p.moving !== p.wasMoving) { p.squashT = 0; p.wasMoving = p.moving; }
    p.squashT = Math.min(1, p.squashT + dt / 0.15);
    p.squash = 1 + (p.moving ? 0.12 : -0.12) * (1 - easeBackOut(p.squashT));

    // knockback decays
    p.knockX *= Math.pow(0.001, dt); p.knockY *= Math.pow(0.001, dt);

    const vx = ix * p.speed + p.knockX;
    const vy = iy * p.speed + p.knockY;

    // axis-separated collision so the player slides along obstacles
    const r = p.radius;
    let nx = p.x + vx * dt;
    if (!isSolidAt(nx - r, p.y - r) && !isSolidAt(nx + r, p.y - r) &&
        !isSolidAt(nx - r, p.y + r) && !isSolidAt(nx + r, p.y + r)) p.x = nx;
    let ny = p.y + vy * dt;
    if (!isSolidAt(p.x - r, ny - r) && !isSolidAt(p.x + r, ny - r) &&
        !isSolidAt(p.x - r, ny + r) && !isSolidAt(p.x + r, ny + r)) p.y = ny;

    // footstep dust every 0.25 s while moving
    if (p.moving) {
      p.stepAcc += dt;
      if (p.stepAcc > 0.25) {
        p.stepAcc = 0;
        const bl = blendAtTile(Math.floor(p.x / TILE), Math.floor(p.y / TILE));
        const col = bl < 0.5 ? PALETTE.desert.sandSpeckle : PALETTE.forest.groundSpeckle;
        for (let i = 0; i < 5; i++) {
          emitParticle(game.particles, p.x + (Math.random() - 0.5) * 10, p.y - 2,
            (Math.random() - 0.5) * 30, -10 - Math.random() * 20,
            0.3 + Math.random() * 0.2, 2 + Math.random() * 2, col);
        }
      }
    }

    // camera lerp
    game.cam.x += (p.x - game.cam.x) * 0.08;
    game.cam.y += (p.y - game.cam.y) * 0.08;
    if (game.shakeT > 0) game.shakeT -= dt;
    updateAtmos(game, dt);

    // creatures near the player only
    const activeR2 = (Math.max(innerWidth, innerHeight) * 0.9) ** 2;
    for (const e of game.entities) {
      e.px = e.x; e.py = e.y;
      if (dist2(e.x, e.y, p.x, p.y) > activeR2) continue;
      if (e.kind === 'ogre') updateOgre(e, game, dt);
      else if (e.kind === 'slime') updateSlime(e, game, dt);
      else if (e.kind === 'watcher') updateWatcher(e, game, dt);
      else if (e.kind === 'letter') updateLetter(e, game, dt);
      else if (e.kind === 'pickup') updatePickup(e, game, dt);
      else if (e.kind === 'stumpdoor') updateStumpDoor(e, game, dt);
      else if (e.kind === 'bomb') updateBomb(e, game, dt);
    }
    updateBombItem(game, dt);
    updateEndingCard(game, dt);
    for (let i = game.rings.length - 1; i >= 0; i--) {
      game.rings[i].t += dt;
      if (game.rings[i].t > 0.35) game.rings.splice(i, 1);
    }

    // particles
    for (const pt of game.particles) {
      if (!pt.alive) continue;
      pt.life -= dt;
      if (pt.life <= 0) { pt.alive = false; continue; }
      pt.x += pt.vx * dt; pt.y += pt.vy * dt;
      pt.vx *= 0.96; pt.vy *= 0.96;
    }
    for (let i = game.floatTexts.length - 1; i >= 0; i--) {
      const ft = game.floatTexts[i];
      ft.t += dt;
      if (ft.t > 1.1) game.floatTexts.splice(i, 1);
    }

    // ambient: fireflies in the forest at night, dust motes in the desert
    const night = nightFactor();
    const pbl = blendAtTile(Math.floor(p.x / TILE), Math.floor(p.y / TILE));
    game.fireflyTimer -= dt;
    if (game.fireflyTimer <= 0) {
      game.fireflyTimer = 0.35;
      if (night > 0.5 && pbl > 0.5) {
        emitParticle(game.particles, p.x + (Math.random() - 0.5) * innerWidth * 0.8,
          p.y + (Math.random() - 0.5) * innerHeight * 0.8,
          (Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20,
          2 + Math.random() * 2, 2, 'firefly');
      } else if (pbl < 0.4 && Math.random() < 0.5) {
        emitParticle(game.particles, p.x + (Math.random() - 0.5) * innerWidth * 0.8,
          p.y + (Math.random() - 0.5) * innerHeight * 0.6,
          14 + Math.random() * 12, -4 + Math.random() * 8,
          1.5 + Math.random(), 1.5, withAlpha(PALETTE.desert.bone, 0.5));
      }
    }

    // an occasional bird crosses the sky
    game.birdTimer -= dt;
    if (game.birdTimer <= 0) {
      game.birdTimer = 24 + Math.random() * 26;
      const fromLeft = Math.random() < 0.5;
      game.birds.push({
        x: p.x + (fromLeft ? -1 : 1) * innerWidth * 0.7,
        y: p.y - innerHeight * (0.1 + Math.random() * 0.3),
        vx: (fromLeft ? 1 : -1) * (70 + Math.random() * 40),
        t: 0,
      });
    }
    for (let i = game.birds.length - 1; i >= 0; i--) {
      const b = game.birds[i];
      b.x += b.vx * dt; b.t += dt;
      if (b.t > 22) game.birds.splice(i, 1);
    }

    // chunk upkeep
    const pcx = Math.floor(p.x / CHUNK_PX), pcy = Math.floor(p.y / CHUNK_PX);
    evictFarChunks(pcx, pcy, (ch) => {
      if (ch.live) for (const e of ch.live) {
        const i = game.entities.indexOf(e);
        if (i >= 0) game.entities.splice(i, 1);
      }
    });
  }

  // day/night: ~4 min cycle. returns 0 (day) .. 1 (deep night)
  function cyclePos() { return (game.time / 240 + 0.05) % 1; }
  function nightFactor() {
    const t = cyclePos();
    if (t < 0.45) return 0;
    if (t < 0.55) return (t - 0.45) / 0.1;
    if (t < 0.85) return 1;
    if (t < 0.95) return 1 - (t - 0.85) / 0.1;
    return 0;
  }
  function tintColor() {
    const t = cyclePos(), N = PALETTE.night;
    if (t < 0.4) return null;
    if (t < 0.45) return mixColor(N.noon, N.dusk, (t - 0.4) / 0.05);
    if (t < 0.55) return mixColor(N.dusk, N.night, (t - 0.45) / 0.1);
    if (t < 0.85) return N.night;
    if (t < 0.92) return mixColor(N.night, N.dawn, (t - 0.85) / 0.07);
    return mixColor(N.dawn, N.noon, (t - 0.92) / 0.08);
  }

  /* ---------- rendering ---------- */
  function render(alpha) {
    const dpr = game.dpr;
    const vw = innerWidth, vh = innerHeight;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    if (Dungeon.active) {
      renderDungeon(ctx, game, alpha, vw, vh);
      drawDungeonFade(ctx, vw, vh);
      return;
    }

    const camX = lerp(game.cam.px, game.cam.x, alpha);
    const camY = lerp(game.cam.py, game.cam.y, alpha);
    let sx = 0, sy = 0;
    if (game.shakeT > 0) {
      const a = game.shakeAmp * Math.min(vw, vh) * (game.shakeT * 5);
      sx = (Math.random() - 0.5) * 2 * a;
      sy = (Math.random() - 0.5) * 2 * a;
    }
    const ox = Math.round(camX - vw / 2 + sx);
    const oy = Math.round(camY - vh / 2 + sy);

    // terrain chunks (only visible ones)
    const c0x = Math.floor(ox / CHUNK_PX), c0y = Math.floor(oy / CHUNK_PX);
    const c1x = Math.floor((ox + vw) / CHUNK_PX), c1y = Math.floor((oy + vh) / CHUNK_PX);
    for (let cyi = c0y; cyi <= c1y; cyi++) {
      for (let cxi = c0x; cxi <= c1x; cxi++) {
        const ch = getChunk(cxi, cyi);
        ctx.drawImage(ch.canvas, cxi * CHUNK_PX - ox, cyi * CHUNK_PX - oy);
      }
    }

    drawGodRays(ctx, game, ox, oy, vw, vh);
    drawWaterLife(ctx, game, ox, oy, vw, vh);

    // gather visible drawables, y-sorted (props + entities + player)
    const drawables = [];
    const margin = 160;
    for (let cyi = c0y; cyi <= c1y; cyi++) {
      for (let cxi = c0x; cxi <= c1x; cxi++) {
        const ch = getChunk(cxi, cyi);
        for (const pr of ch.props) {
          if (pr.x < ox - margin || pr.x > ox + vw + margin ||
              pr.y < oy - margin || pr.y > oy + vh + margin * 1.6) continue;
          drawables.push(pr);
        }
      }
    }
    const p = game.player;
    for (const e of game.entities) {
      if (e.x < ox - margin || e.x > ox + vw + margin ||
          e.y < oy - margin || e.y > oy + vh + margin) continue;
      drawables.push(e);
    }
    drawables.push(p);
    drawables.sort((a, b) => a.y - b.y);

    const boil = ((game.time * 8) | 0) % 2;

    for (const d of drawables) {
      if (d === p) { drawPlayer(alpha, ox, oy, boil); continue; }
      if (d.kind) { drawEntity(d, alpha, ox, oy, boil); continue; }
      // static prop, swaying to the one global wind (gust fronts travel);
      // scale buckets + forest flip jitter come from the placement pass
      const px = d.x - ox, py = d.y - oy;
      const psc = d.s || 1;
      if (d.sway) {
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(windAt(d.x, d.y, game.time) * ATMOS.SWAY_PROP +
                   Math.sin(game.time * 1.3 + d.phase) * 0.008);
        if (psc !== 1 || d.flip) ctx.scale(d.flip ? -psc : psc, psc);
        ctx.drawImage(d.spr.c, -d.spr.ax, -d.spr.ay);
        ctx.restore();
      } else if (d.flip) {
        ctx.save();
        ctx.translate(Math.round(px), Math.round(py));
        ctx.scale(-psc, psc);
        ctx.drawImage(d.spr.c, -d.spr.ax, -d.spr.ay);
        ctx.restore();
      } else if (psc !== 1) {
        // scaled but unflipped: the 9-arg fast path, no transform stack
        ctx.drawImage(d.spr.c,
          Math.round(px - d.spr.ax * psc), Math.round(py - d.spr.ay * psc),
          d.spr.c.width * psc, d.spr.c.height * psc);
      } else {
        ctx.drawImage(d.spr.c, Math.round(px - d.spr.ax), Math.round(py - d.spr.ay));
      }
    }

    drawAtmosClouds(ctx, game, ox, oy, vw, vh);
    drawDrifters(ctx, game, ox, oy);
    drawParallax(ctx, game, camX, camY, vw, vh);

    drawParticles(ox, oy);
    drawRings(ox, oy);

    // birds
    ctx.strokeStyle = withAlpha(PALETTE.forest.ink, 0.6);
    ctx.lineWidth = 2;
    for (const b of game.birds) {
      const bx = b.x - ox, by = b.y - oy + Math.sin(b.t * 3) * 4;
      if (bx < -20 || bx > vw + 20) continue;
      const flap = Math.sin(b.t * 9) * 4;
      ctx.beginPath();
      ctx.moveTo(bx - 6, by - flap);
      ctx.quadraticCurveTo(bx, by + 2, bx + 0, by);
      ctx.quadraticCurveTo(bx, by + 2, bx + 6, by - flap);
      ctx.stroke();
    }

    drawPrompt(ox, oy);
    drawFloatTexts(ox, oy);

    // day/night tint
    const tint = tintColor();
    if (tint) {
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = tint;
      ctx.fillRect(0, 0, vw, vh);
      ctx.globalCompositeOperation = 'source-over';
    }

    drawMinimap(vw);
    if (game.state === 'play') { drawHearts(); drawBloomHud(ctx, game); drawBloomButton(ctx, game); }
    if (game.touch.active) drawJoystick();
    if (game.state === 'title') drawTitle(vw, vh);

    // soft defeat fade (cream, never black)
    if (game.deathT !== null) {
      const half = COMBAT.DEATH_FADE;
      const a = game.deathT < half ? game.deathT / half : 1 - (game.deathT - half) / half;
      ctx.fillStyle = withAlpha(PALETTE.forest.cream, clamp(a, 0, 1));
      ctx.fillRect(0, 0, vw, vh);
    }

    drawEndingCard(ctx, game, vw, vh);
    drawDungeonFade(ctx, vw, vh);
  }

  // shared drawing helpers — used by both the overworld render and renderDungeon
  function drawParticles(ox, oy) {
    for (const pt of game.particles) {
      if (!pt.alive) continue;
      const lifeT = pt.life / pt.maxLife;
      if (pt.color === 'firefly') {
        ctx.globalCompositeOperation = 'lighter';
        const tw = 0.4 + 0.6 * Math.abs(Math.sin(pt.life * 5));
        ctx.fillStyle = withAlpha(PALETTE.forest.firefly, 0.8 * tw * Math.min(1, lifeT * 3));
        ctx.beginPath();
        ctx.arc(pt.x - ox, pt.y - oy, pt.size + 1.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
      } else {
        ctx.globalAlpha = 0.6 * lifeT;
        ctx.fillStyle = pt.color;
        ctx.beginPath();
        ctx.arc(pt.x - ox, pt.y - oy, pt.size * (0.5 + 0.5 * lifeT), 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }
  }

  function drawRings(ox, oy) {
    for (const rg of game.rings) {
      const prog = rg.t / 0.35;
      ctx.globalAlpha = (1 - prog) * 0.8;
      ctx.strokeStyle = PALETTE.forest.groundSpeckle;
      ctx.lineWidth = 7 * (1 - prog) + 1;
      ctx.beginPath();
      ctx.ellipse(rg.x - ox, rg.y - oy, COMBAT.SLAM_RADIUS * (0.4 + 0.7 * prog),
        COMBAT.SLAM_RADIUS * 0.7 * (0.4 + 0.7 * prog), 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  function drawPrompt(ox, oy) {
    const near = game.state === 'play' ? nearestInteractable() : null;
    if (!near) return;
    const bx = near.x - ox, by = near.y - oy - 52 + Math.sin(game.time * 4) * 3;
    ctx.fillStyle = PALETTE.forest.cream;
    ctx.strokeStyle = PALETTE.forest.ink;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(bx - 12, by - 12, 24, 24, 7);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = PALETTE.forest.ink;
    ctx.font = 'bold 14px Georgia, serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(game.isTouchDevice ? '!' : 'E', bx, by + 1);
  }

  function drawFloatTexts(ox, oy) {
    ctx.font = 'bold 16px Georgia, serif';
    ctx.textAlign = 'center';
    for (const ft of game.floatTexts) {
      const k = easeBackOut(Math.min(1, ft.t / 0.3));
      ctx.globalAlpha = ft.t > 0.7 ? 1 - (ft.t - 0.7) / 0.4 : 1;
      ctx.fillStyle = PALETTE.forest.cream;
      ctx.strokeStyle = PALETTE.forest.ink;
      ctx.lineWidth = 3;
      const ty = ft.y - oy - k * 14 - (ft.t > 0.3 ? (ft.t - 0.3) * 24 : 0);
      ctx.strokeText(ft.text, ft.x - ox, ty);
      ctx.fillText(ft.text, ft.x - ox, ty);
      ctx.globalAlpha = 1;
    }
  }

  function drawHearts() {
    const p = game.player;
    const size = 26, spacing = 32, x0 = 30, y0 = 172;
    for (let i = 0; i < (p.maxHp || COMBAT.MAX_HP) / 2; i++) {
      const x = x0 + i * spacing;
      ctx.fillStyle = PALETTE.forest.cream;
      ctx.strokeStyle = PALETTE.forest.ink;
      ctx.lineWidth = 2.4;
      heartPath(ctx, x, y0, size);
      ctx.fill(); ctx.stroke();
      const halves = clamp(p.hp - i * 2, 0, 2);
      if (halves > 0) {
        ctx.save();
        heartPath(ctx, x, y0, size);
        ctx.clip();
        ctx.fillStyle = PALETTE.fx.heart;
        if (halves === 2) ctx.fillRect(x - size, y0 - size, size * 2, size * 2);
        else ctx.fillRect(x - size, y0 - size, size, size * 2);
        ctx.restore();
        ctx.strokeStyle = PALETTE.forest.ink;
        ctx.lineWidth = 2.4;
        heartPath(ctx, x, y0, size);
        ctx.stroke();
      }
    }
  }

  // tapered crescent smear: arc strips with stepped alpha, thick at the
  // leading edge, knife-thin at the tail. Trail geometry only spans backward.
  function drawCrescent(px, py, aHead, signedSpan, radius, style, fade) {
    const strips = 6;
    const dir = Math.sign(signedSpan) || 1;
    const span = Math.abs(signedSpan);
    if (span < 0.05 || fade <= 0) return;
    ctx.save();
    ctx.fillStyle = PALETTE.fx.flash;
    for (let i = 0; i < strips; i++) {
      const t0 = i / strips, t1 = Math.min(1, (i + 1) / strips + 0.05);
      const a0 = aHead - dir * span * t0;
      const a1 = aHead - dir * span * t1;
      const rIn0 = lerp(radius * 0.4, radius * 0.92, t0);
      const rIn1 = lerp(radius * 0.4, radius * 0.92, t1);
      ctx.globalAlpha = 0.8 * Math.pow(1 - t0, 1.5) * fade;
      ctx.beginPath();
      ctx.arc(px, py, radius, a0, a1, dir > 0);
      ctx.lineTo(px + Math.cos(a1) * rIn1, py + Math.sin(a1) * rIn1);
      ctx.arc(px, py, (rIn0 + rIn1) / 2, a1, a0, dir < 0);
      ctx.closePath();
      ctx.fill();
    }
    if (style === 'forest') {
      ctx.globalAlpha = 0.35 * fade;
      ctx.strokeStyle = PALETTE.forest.ink;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(px, py, radius + 2, aHead - dir * span, aHead, dir < 0);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawStaff(px, py, ang, style, stretch, alphaMul) {
    const spr = SPRITES.staff[style];
    ctx.save();
    if (alphaMul !== undefined) ctx.globalAlpha = alphaMul;
    ctx.translate(px, py);
    ctx.rotate(ang);
    if (stretch && stretch > 1) ctx.scale(1, stretch); // tangential smear stretch
    ctx.drawImage(spr.c, -spr.ax, -spr.ay);
    ctx.restore();
  }

  function drawPlayer(alpha, ox, oy, boil) {
    const p = game.player;
    // mercy-invincibility flicker
    if (p.iFrameT > 0 && ((game.time * 10) | 0) % 2 === 0 && game.deathT === null) return;
    const x = lerp(p.px, p.x, alpha) - ox;
    const y = lerp(p.py, p.y, alpha) - oy;
    const bl = blendAtTile(Math.floor(p.x / TILE), Math.floor(p.y / TILE));
    const style = Dungeon.active ? 'forest' : bl < 0.5 ? 'desert' : 'forest';
    const frame = p.moving ? ((p.walkT | 0) % 2) : 0;
    const spr = SPRITES.player[style][p.dir][frame][boil];
    const side = p.dir === 2 ? -1 : 1;
    const attacking = p.attackState !== 'none' && p.swing;
    const pivotY = y - 20;

    let pose = null, bodyLean = 0;
    if (attacking) {
      pose = staffPose(p);
      const sw = p.swing;
      const rel = angleDiff(pose.ang, p.attackAngle);
      // body coils against the wind-up, leans into the swing
      if (p.attackState === 'windup') bodyLean = -Math.sign(sw.end - sw.cock) * 0.16 * side;
      else bodyLean = clamp(rel * 0.08, -0.2, 0.2) * side;

      // crescent smear behind everything — strike only, fading through follow
      const dirSign = Math.sign(sw.end - sw.cock) || 1;
      if (p.attackState === 'active' && pose.swept > 0.05) {
        const span = Math.min(pose.swept, 1.7 * sw.trail) * dirSign;
        drawCrescent(x, pivotY, pose.ang, span, sw.radius, style, 1);
        // afterimage multiples just behind the staff
        for (let i = 1; i <= 3; i++) {
          const trailAng = pose.ang - dirSign * Math.min(pose.swept, 0.9) * (i * 0.22);
          drawStaff(x, pivotY, trailAng, style, 1, 0.3 - i * 0.08);
        }
      } else if (p.attackState === 'follow') {
        const fade = 1 - clamp((p.swing.follow - p.attackT) / COMBAT.TRAIL_FADE, 0, 1);
        const span = Math.min(Math.abs(sw.end - sw.cock), 1.7 * sw.trail) * dirSign;
        drawCrescent(x, pivotY, p.attackAngle + sw.end, span, sw.radius, style, fade * 0.7);
      }
    }

    // body
    ctx.save();
    ctx.translate(Math.round(x), Math.round(y));
    if (bodyLean) ctx.rotate(bodyLean);
    ctx.scale(2 - p.squash, p.squash);
    ctx.drawImage(spr.c, -spr.ax, -spr.ay);
    ctx.restore();

    // the staff, always visible, always the leading edge
    if (attacking) {
      const stretch = 1 + Math.min(Math.abs(pose.vel) / 60, 0.5);
      drawStaff(x, pivotY, pose.ang, style, stretch);
    } else {
      const bob = p.moving && frame ? 1.5 : 0;
      const sway = Math.sin(game.time * 1.6) * 0.03;
      drawStaff(x + 12 * side, y - 24 + bob, COMBAT.STAFF_IDLE_ANGLE + sway, style, 1);
    }
  }

  // blit a creature sprite with combat feedback: hit flash swaps in the white
  // silhouette, squash eases back, dazed/telegraph decorations on top
  function drawCreature(e, spr, x, y, leanRot) {
    const k = e.squashT > 0 ? clamp(e.squashT / COMBAT.SQUASH_TIME, 0, 1) : 0;
    const img = e.flashT > 0 ? flashOf(spr) : spr.c;
    ctx.save();
    ctx.translate(x, y);
    if (leanRot) ctx.rotate(leanRot);
    if (k) ctx.scale(1 + 0.25 * k, 1 - 0.25 * k);
    ctx.drawImage(img, -spr.ax, -spr.ay);
    ctx.restore();
  }

  function drawAlertBubble(x, y) {
    ctx.fillStyle = PALETTE.forest.cream;
    ctx.strokeStyle = PALETTE.forest.ink;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, 10, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = PALETTE.forest.ink;
    ctx.font = 'bold 14px Georgia, serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('!', x, y + 1);
  }

  function drawEntity(e, alpha, ox, oy, boil) {
    const x = Math.round(lerp(e.px, e.x, alpha) - ox);
    const y = Math.round(lerp(e.py, e.y, alpha) - oy);
    if (e.kind === 'ogre') {
      const spr = SPRITES.ogre[e.frame][boil];
      // slam target zone, shown on the ground during the windup telegraph
      if (e.atkState === 'windup') {
        ctx.fillStyle = withAlpha(PALETTE.forest.ink, 0.14 + 0.08 * Math.sin(game.time * 12));
        ctx.beginPath();
        ctx.ellipse(e.slamX - ox, e.slamY - oy, COMBAT.SLAM_RADIUS, COMBAT.SLAM_RADIUS * 0.7, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      let lean = 0;
      if (e.atkState === 'windup') lean = -0.14;
      else if (e.atkState === 'slam') lean = 0.18;
      else if (e.atkState === 'recover') lean = 0.06;
      drawCreature(e, spr, x, y, lean);
      if (e.alertT > 0 || e.atkState === 'windup') drawAlertBubble(x, y - spr.ay - 6);
      if (e.dazedT > 0) {
        for (let i = 0; i < 3; i++) {
          const a = game.time * 6 + (i * Math.PI * 2) / 3;
          ctx.fillStyle = PALETTE.fx.trinket;
          ctx.strokeStyle = PALETTE.forest.ink;
          ctx.lineWidth = 1.2;
          starPath(ctx, x + Math.cos(a) * 20, y - spr.ay + 4 + Math.sin(a) * 6, 5, 4);
          ctx.fill(); ctx.stroke();
        }
      }
    } else if (e.kind === 'slime') {
      const spr = SPRITES.slime[e.frame][boil];
      drawCreature(e, spr, x, y, 0);
    } else if (e.kind === 'watcher') {
      const spr = SPRITES.watcher[boil];
      const spin = e.spinT > 0 ? (1 - e.spinT / 0.45) * Math.PI * 2 : 0;
      drawCreature(e, spr, x, y, spin);
      if (!spin) {
        // pupil tracks the player
        ctx.fillStyle = PALETTE.forest.ink;
        ctx.beginPath();
        ctx.ellipse(x + e.lookX * 3, y - 19 + e.lookY * 2.5, 2.6, 4, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (e.kind === 'pickup') {
      const spr = e.ptype === 'heart' ? SPRITES.heart : e.ptype === 'bloom' ? Dungeon.spr.bloom : SPRITES.trinket;
      const bob = Math.sin(e.bobT * 3) * 2.5;
      ctx.drawImage(spr.c, x - spr.ax, y - spr.ay + bob);
    } else if (e.kind === 'bomb') {
      drawBombEntity(ctx, e, x, y);
    } else if (e.kind === 'boulder') {
      drawBoulderEntity(ctx, e, x, y);
    } else if (e.kind === 'sign') {
      const spr = SPRITES.sign;
      ctx.drawImage(spr.c, x - spr.ax, y - spr.ay);
    } else if (e.kind === 'letter') {
      const spr = SPRITES.letter;
      const bob = Math.sin(e.bobT * 2.4) * 3;
      ctx.drawImage(spr.c, x - spr.ax, y - spr.ay + bob);
    }
  }

  function drawMinimap(vw) {
    const size = 132, pad = 12;
    const mx = vw - size - pad, my = pad;
    const p = game.player;
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(mx, my, size, size, 10);
    ctx.fillStyle = PALETTE.forest.cream;
    ctx.fill();
    ctx.clip();
    // 1 mini px = 2 tiles; scale so the map spans ~3 chunks
    const scale = size / (3 * CHUNK / CELL);
    const pcx = Math.floor(p.x / CHUNK_PX), pcy = Math.floor(p.y / CHUNK_PX);
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const ch = World.chunks.get(chunkKey(pcx + dx, pcy + dy));
        if (!ch || !ch.mini) continue;
        const px = mx + size / 2 + ((pcx + dx) * CHUNK_PX - p.x) / (TILE * CELL) * scale;
        const py = my + size / 2 + ((pcy + dy) * CHUNK_PX - p.y) / (TILE * CELL) * scale;
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(ch.mini, px, py, (CHUNK / CELL) * scale, (CHUNK / CELL) * scale);
      }
    }
    ctx.imageSmoothingEnabled = true;
    // letters not yet found
    for (const spot of World.letterSpots) {
      if (game.collected.has(spot.idx)) continue;
      const lx = mx + size / 2 + (spot.tx * TILE - p.x) / (TILE * CELL) * scale;
      const ly = my + size / 2 + (spot.ty * TILE - p.y) / (TILE * CELL) * scale;
      if (lx < mx + 4 || lx > mx + size - 4 || ly < my + 4 || ly > my + size - 4) continue;
      ctx.fillStyle = PALETTE.forest.letterStamp;
      ctx.beginPath(); ctx.arc(lx, ly, 2.5, 0, Math.PI * 2); ctx.fill();
    }
    // the Great Stump (dungeon entrance)
    if (World.stumpSpot) {
      const s = World.stumpSpot;
      const lx = mx + size / 2 + (s.tx * TILE - p.x) / (TILE * CELL) * scale;
      const ly = my + size / 2 + (s.ty * TILE - p.y) / (TILE * CELL) * scale;
      if (lx >= mx + 5 && lx <= mx + size - 5 && ly >= my + 5 && ly <= my + size - 5) {
        ctx.fillStyle = PALETTE.forest.trunk;
        ctx.strokeStyle = PALETTE.forest.ink;
        ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.arc(lx, ly, 3.6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = PALETTE.dungeon.dark;
        ctx.beginPath(); ctx.arc(lx, ly + 0.8, 1.4, 0, Math.PI * 2); ctx.fill();
      }
    }
    // player
    ctx.fillStyle = PALETTE.forest.ink;
    ctx.beginPath(); ctx.arc(mx + size / 2, my + size / 2, 3.5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.strokeStyle = PALETTE.forest.ink;
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.roundRect(mx, my, size, size, 10); ctx.stroke();
  }

  function drawJoystick() {
    const t = game.touch;
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = PALETTE.forest.ink;
    ctx.fillStyle = PALETTE.forest.cream;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(t.ox, t.oy, 46, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(t.ox + t.dx * 46, t.oy + t.dy * 46, 20, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    ctx.globalAlpha = 1;
  }

  function drawTitle(vw, vh) {
    ctx.fillStyle = withAlpha(PALETTE.forest.ink, 0.25);
    ctx.fillRect(0, 0, vw, vh);
    const cw = Math.min(460, vw - 40), chh = 210;
    const cx = vw / 2, cy = vh / 2;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-0.01);
    ctx.fillStyle = PALETTE.forest.cream;
    ctx.strokeStyle = PALETTE.forest.ink;
    ctx.lineWidth = 3.5;
    ctx.beginPath(); ctx.roundRect(-cw / 2, -chh / 2, cw, chh, 16);
    ctx.fill(); ctx.stroke();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    // hand-lettered title: each glyph gets its own tiny tilt
    const title = 'TWO WORLDS';
    ctx.font = `bold ${Math.min(52, cw / 9)}px Georgia, serif`;
    ctx.fillStyle = PALETTE.forest.ink;
    let tw = ctx.measureText(title).width;
    let x = -tw / 2;
    const jr = mulberry32(seedInt ^ 0x717);
    for (const chGlyph of title) {
      const w = ctx.measureText(chGlyph).width;
      ctx.save();
      ctx.translate(x + w / 2, -34 + (jr() - 0.5) * 5);
      ctx.rotate((jr() - 0.5) * 0.09);
      ctx.fillText(chGlyph, 0, 0);
      ctx.restore();
      x += w;
    }
    ctx.font = 'italic 17px Georgia, serif';
    ctx.fillStyle = withAlpha(PALETTE.forest.ink, 0.75);
    ctx.fillText('a wanderer’s tale in flat sand and wobbly ink', 0, 14);
    ctx.font = 'bold 16px Georgia, serif';
    ctx.fillStyle = PALETTE.forest.ink;
    const blink = Math.sin(game.time * 3) > -0.3;
    if (blink) ctx.fillText(game.isTouchDevice ? 'tap to begin' : 'press Enter to begin', 0, 62);
    ctx.restore();
  }

  /* ---------- main loop ---------- */
  let last = performance.now();
  let acc = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.1) dt = 0.1;
    if (game.freezeT > 0) { game.freezeT -= dt; render(1); return; }
    acc += dt;
    let steps = 0;
    while (acc >= STEP && steps < 4) {
      if (game.state === 'play') update(STEP);
      else game.time += STEP;
      acc -= STEP;
      steps++;
    }
    render(game.state === 'play' ? clamp(acc / STEP, 0, 1) : 1);
  }

  // the dungeon mode borrows these to stay visually identical to the overworld
  game.draw = {
    player: drawPlayer, entity: drawEntity, hearts: drawHearts,
    particles: drawParticles, floatTexts: drawFloatTexts, rings: drawRings,
    prompt: drawPrompt, joystick: drawJoystick,
  };
  game.showDialog = showDialog;
  game.readInput = readInput;

  // warm the spawn area, then go
  getChunk(0, 0); getChunk(-1, 0); getChunk(0, -1); getChunk(-1, -1);
  requestAnimationFrame(frame);

  window.__game = game; // debug/testing hook
})();
