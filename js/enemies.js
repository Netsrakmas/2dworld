// The enemy update: four overworld species (RESEARCH.md §13). Design rules:
// LA density (~2 per combat screen, never a crowd), ALttP damage discipline
// (overworld = ½ heart, HP 1-2), and the anticipation tax — every surprise
// is visible and harmless for ≥0.4s before it can touch you.
const ENEMIES = Object.freeze({
  WIGGLER: Object.freeze({
    HP: 2, CONTACT: 1, RADIUS: 13,
    BURIED_MIN: 1.5, BURIED_MAX: 2.5, HOME_SPEED: 70,
    MOUND_T: 0.65, EMERGE_T: 0.2, SUBMERGE_T: 0.25,
    UP_MIN: 2.5, UP_MAX: 4, CHASE: 80,
    RING_MIN: 160, RING_MAX: 360,      // spawn ring (px from player)
    SPAWN_MIN: 6, SPAWN_MAX: 10,       // s between spawn rolls
    MAX: 2, PEACE: 400,                // px peace radius around landmarks
    DESPAWN: 900,                      // px: dissolve beyond this
  }),
  PUFFBILL: Object.freeze({
    HP: 2, CONTACT: 1, RADIUS: 14,
    WANDER: 60, RANGE: 240, LANE: 40, DEAGGRO: 320,
    AIM_T: 0.4, SPIT_T: 0.25, RECOVER_T: 0.9,
    PELLET_SPEED: 260, PELLET_RANGE: 260,
  }),
  MIMIC: Object.freeze({
    HP: 2, RADIUS: 12,
    TRIGGER: 110, REVEAL_T: 0.45,
    NUT_CD: 2.2, NUT_SPEED: 240,
    HOP_SPEED: 90, HOP_T: 0.3, HOP_CD_MIN: 0.7, HOP_CD_MAX: 1.3,
    LEAVE: 280, LEAVE_T: 2, SETTLE_T: 0.7,
    SHIVER_MIN: 3, SHIVER_MAX: 4,
  }),
  WISP: Object.freeze({
    HP: 2, CONTACT: 1, RADIUS: 12,
    SPEED: 110, TURN: Math.PI / 2,     // rad/s heading cap — circling escapes it
    SPAWN_MIN: 20, SPAWN_MAX: 30,
    RING_MIN: 280, RING_MAX: 400,
    MAX: 2, FADE_T: 0.8, PEACE: 240, DESPAWN: 1000, DAWN_T: 1.0,
  }),
  // the cycling drop deck (ALttP prize packs): fixed order, no drought streaks
  DECK: Object.freeze(['trinket', null, 'heart', 'trinket', 'trinket', null, 'heart', 'trinket']),
});

const ENEMY_SPR = {};

/* ---------------- sprite bakes ---------------- */

function buildEnemies(seedInt) {
  const D = PALETTE.desert, F = PALETTE.forest;

  // Dune Wiggler: a striped sand worm with a blossom on its brow
  ENEMY_SPR.wiggler = [0, 1].map((v) => sprite(34, 46, 17, 44, (ctx) => {
    const r = mulberry32(seedInt ^ (0x3160 + v));
    const w = () => (r() - 0.5) * 1.6;
    ctx.strokeStyle = F.ink; ctx.lineWidth = 2;
    ctx.fillStyle = D.bone;
    ctx.beginPath();
    ctx.moveTo(6, 44);
    ctx.quadraticCurveTo(3 + w(), 26, 9, 14);
    ctx.quadraticCurveTo(13, 5 + w(), 20, 6);
    ctx.quadraticCurveTo(28, 8, 28, 18);
    ctx.quadraticCurveTo(28 + w(), 30, 28, 44);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = D.boneShade;   // segment stripes
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.ellipse(17, 36 - i * 9 + w() * 0.5, 10 - i * 0.8, 2.6, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = F.ink;   // sleepy eyes
    ctx.beginPath(); ctx.arc(13, 14, 1.6, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(22, 13, 1.6, 0, Math.PI * 2); ctx.fill();
    // the blossom brow (ties it to the bomb flower family)
    ctx.fillStyle = D.blossom;
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + v;
      ctx.beginPath();
      ctx.ellipse(18 + Math.cos(a) * 3.4, 4 + Math.sin(a) * 2.6, 2.6, 1.9, a, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = D.blossomLight;
    ctx.beginPath(); ctx.arc(18, 4, 1.7, 0, Math.PI * 2); ctx.fill();
  }));
  // the mound telegraph: a dark-sand hump with cracked strokes
  ENEMY_SPR.mound = sprite(36, 18, 18, 15, (ctx) => {
    ctx.fillStyle = D.sandShadow;
    ctx.beginPath();
    ctx.moveTo(2, 15);
    ctx.quadraticCurveTo(8, 4, 18, 5);
    ctx.quadraticCurveTo(28, 4, 34, 15);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = withAlpha(PALETTE.forest.ink, 0.4); ctx.lineWidth = 1.4;
    for (let i = 0; i < 4; i++) {
      const a = -Math.PI * (0.25 + 0.17 * i);
      ctx.beginPath();
      ctx.moveTo(18, 12);
      ctx.lineTo(18 + Math.cos(a) * 12, 12 + Math.sin(a) * 8);
      ctx.stroke();
    }
  });

  // Puffbill: a round puffing bird — rockLight body, bone belly, stub beak
  ENEMY_SPR.puffbill = [0, 1].map((v) => sprite(40, 40, 20, 37, (ctx) => {
    const r = mulberry32(seedInt ^ (0x9BB + v));
    const w = () => (r() - 0.5) * 1.4;
    ctx.strokeStyle = F.ink; ctx.lineWidth = 2;
    ctx.fillStyle = D.rockLight;
    ctx.beginPath(); ctx.ellipse(20, 22 + w() * 0.5, 15, 14, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = D.bone;
    ctx.beginPath(); ctx.ellipse(20, 27, 9.5, 8 + w() * 0.4, 0, 0, Math.PI * 2); ctx.fill();
    // wing nubs
    ctx.fillStyle = D.rockDark;
    ctx.beginPath(); ctx.ellipse(6.5, 22, 3.4, 6, 0.35, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(33.5, 22, 3.4, 6, -0.35, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    // beak: a puckered O (it spits, after all)
    ctx.fillStyle = D.blossomYellow;
    ctx.beginPath(); ctx.arc(20, 17, 3.4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = F.ink;
    ctx.beginPath(); ctx.arc(20, 17, 1.3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(13, 13, 1.8, 0, Math.PI * 2); ctx.fill();   // eyes
    ctx.beginPath(); ctx.arc(27, 13, 1.8, 0, Math.PI * 2); ctx.fill();
    // topknot feathers
    ctx.strokeStyle = D.rockDark; ctx.lineWidth = 2.2;
    for (const dx of [-3, 0, 3]) {
      ctx.beginPath(); ctx.moveTo(20 + dx, 8); ctx.quadraticCurveTo(20 + dx * 2, 3 + w(), 20 + dx * 2.4, 1); ctx.stroke();
    }
  }));

  // Mimic bodies: the prop, awake — eyes, feet, indignation
  ENEMY_SPR.mimicCactus = [0, 1].map((v) => sprite(44, 50, 22, 47, (ctx) => {
    const r = mulberry32(seedInt ^ (0x3113C + v));
    drawCactus(ctx, 44, 44, r, false);
    ctx.strokeStyle = F.ink; ctx.lineWidth = 2;
    ctx.fillStyle = F.cream;   // wide-awake eyes on the trunk
    ctx.beginPath(); ctx.ellipse(16, 24, 4, 4.6, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(28, 24, 4, 4.6, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = F.ink;
    ctx.beginPath(); ctx.arc(16 + (v ? 1 : -1), 25, 1.8, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(28 + (v ? 1 : -1), 25, 1.8, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(22, 33, 2.4, 3.2, 0, 0, Math.PI * 2); ctx.fill();   // o-mouth
    // rooty little feet
    ctx.fillStyle = D.cactusRib;
    ctx.beginPath(); ctx.ellipse(15, 47, 4.4, 2.6, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(29, 47, 4.4, 2.6, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }));
  ENEMY_SPR.mimicShroom = [0, 1].map((v) => sprite(30, 34, 15, 31, (ctx) => {
    const r = mulberry32(seedInt ^ (0x5480 + v));
    ctx.save(); ctx.translate(5, 8); ctx.scale(1, 1);
    drawMushroom(ctx, 20, 22, r);
    ctx.restore();
    ctx.strokeStyle = F.ink; ctx.lineWidth = 1.8;
    ctx.fillStyle = F.cream;
    ctx.beginPath(); ctx.ellipse(11, 22, 3, 3.4, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(19, 22, 3, 3.4, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = F.ink;
    ctx.beginPath(); ctx.arc(11 + (v ? 0.8 : -0.8), 23, 1.4, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(19 + (v ? 0.8 : -0.8), 23, 1.4, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(15, 28, 1.8, 2.2, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = F.trunk;
    ctx.beginPath(); ctx.ellipse(10, 31, 3.4, 2, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(20, 31, 3.4, 2, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }));
  // disguise tints: the +4%-warmer copies of the real props (the honest tell)
  const warmCopy = (src) => {
    const c = makeCanvas(src.c.width, src.c.height);
    const cx2 = c.getContext('2d');
    cx2.drawImage(src.c, 0, 0);
    cx2.globalCompositeOperation = 'source-atop';
    cx2.fillStyle = withAlpha(D.sandRim, 0.14);
    cx2.fillRect(0, 0, c.width, c.height);
    return { c, ax: src.ax, ay: src.ay, sh: src.sh };
  };
  ENEMY_SPR.disguiseCactus = warmCopy(SPRITES.cactus[0]);
  ENEMY_SPR.disguiseShroom = warmCopy(SPRITES.mushroom[0]);

  // Dusk Wisp: a sheet ghost in moth lavender
  ENEMY_SPR.wisp = [0, 1].map((v) => sprite(34, 38, 17, 34, (ctx) => {
    const r = mulberry32(seedInt ^ (0x3157 + v));
    const w = () => (r() - 0.5) * 1.6;
    ctx.strokeStyle = withAlpha(F.ink, 0.85); ctx.lineWidth = 2;
    ctx.fillStyle = PALETTE.dungeon.moth;
    ctx.beginPath();
    ctx.arc(17, 15, 12, Math.PI, 0);
    ctx.lineTo(29, 26 + w());
    // scalloped sheet tail
    for (let i = 0; i < 3; i++) {
      const x0 = 29 - (i + 0.5) * 8;
      ctx.quadraticCurveTo(x0 + 4, 34 + (i === 1 ? 3 : 0) + w(), x0, 27 + (i % 2) * 3);
    }
    ctx.lineTo(5, 26);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = shade(PALETTE.dungeon.moth, 1.25);
    ctx.beginPath(); ctx.ellipse(13, 12, 3.2, 4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = F.ink;
    ctx.beginPath(); ctx.ellipse(13, 15, 2, 2.8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(22, 15, 2, 2.8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(17.5, 21, 1.6, 2.2, 0, 0, Math.PI * 2); ctx.fill();
  }));
  {
    const g = makeCanvas(90, 90);
    const gctx = g.getContext('2d');
    const grad = gctx.createRadialGradient(45, 45, 4, 45, 45, 44);
    grad.addColorStop(0, withAlpha(PALETTE.dungeon.moth, 0.3));
    grad.addColorStop(1, withAlpha(PALETTE.dungeon.moth, 0));
    gctx.fillStyle = grad;
    gctx.fillRect(0, 0, 90, 90);
    ENEMY_SPR.wispGlow = g;
  }

  // projectiles: a sand pellet and a mimic nut
  ENEMY_SPR.pellet = sprite(12, 12, 6, 6, (ctx) => {
    ctx.fillStyle = D.rockDark; ctx.strokeStyle = F.ink; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(6, 6, 4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = D.rockLight;
    ctx.beginPath(); ctx.arc(4.6, 4.6, 1.5, 0, Math.PI * 2); ctx.fill();
  });
  ENEMY_SPR.nut = sprite(12, 14, 6, 7, (ctx) => {
    ctx.fillStyle = F.trunk; ctx.strokeStyle = F.ink; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.ellipse(6, 8, 4, 4.6, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = F.woodLight;
    ctx.beginPath(); ctx.ellipse(6, 4.4, 3, 2, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  });
}

/* ---------------- spawning ---------------- */

function initEnemy(e, spec) {
  const C = ENEMIES;
  if (spec.kind === 'wiggler') {
    e.hittable = false;                 // only while surfaced
    e.hp = C.WIGGLER.HP;
    e.radius = C.WIGGLER.RADIUS;
    e.st = 'buried';
    e.t = C.WIGGLER.BURIED_MIN + Math.random() * (C.WIGGLER.BURIED_MAX - C.WIGGLER.BURIED_MIN);
    e.onDefeat = (game, en) => { deckDrop(game, en); };
  } else if (spec.kind === 'puffbill') {
    e.hittable = true;
    e.hp = C.PUFFBILL.HP;
    e.radius = C.PUFFBILL.RADIUS;
    e.homeX = e.x; e.homeY = e.y;
    e.st = 'wander'; e.t = 0;
    e.wanderT = Math.random() * 2;
    e.dirX = 0; e.dirY = 1; e.flip = false;
    e.onDefeat = (game, en) => { deckDrop(game, en); };
  } else if (spec.kind === 'mimic') {
    e.skin = spec.skin || 'cactus';
    e.hittable = true;                  // pokeable even in disguise (the tell)
    e.hp = C.MIMIC.HP;
    e.radius = C.MIMIC.RADIUS;
    e.st = 'hidden';
    e.t = 0; e.z = 0;
    e.shiverT = C.MIMIC.SHIVER_MIN + Math.random() * 1;
    e.nutT = 1; e.hopT = 0; e.hopDX = 0; e.hopDY = 0; e.leaveT = 0;
    e.bobPhase = Math.random() * 6.28;
    e.onStaffHit = (game, en, finisher) => mimicStaffHit(game, en, finisher);
    e.onDefeat = (game, en) => {
      for (let i = 0; i < 2; i++) spawnPickup(game, en.x, en.y, 'trinket');
      if (Math.random() < 0.2) spawnPickup(game, en.x, en.y, 'heart');
    };
  } else if (spec.kind === 'wisp') {
    e.hittable = false;                 // not until it finishes materializing
    e.hp = C.WISP.HP;
    e.radius = C.WISP.RADIUS;
    e.st = 'fade';
    e.t = 0;
    e.alpha = 0;
    e.heading = Math.random() * Math.PI * 2;
    e.phase = Math.random() * 6.28;
    e.dawnDelay = 0;
    e.onDefeat = (game, en) => { deckDrop(game, en); };
  } else if (spec.kind === 'pellet') {
    e.vx = spec.vx; e.vy = spec.vy;
    e.owner = spec.owner || null;
    e.nut = !!spec.nut;
    e.range = spec.range || ENEMIES.PUFFBILL.PELLET_RANGE;
    e.traveled = 0;
    e.reflected = false;
    e.hittable = true;                  // the staff can bat it back
    e.radius = 9;
    e.onStaffHit = (game, en) => {
      en.vx = -en.vx * 1.15; en.vy = -en.vy * 1.15;
      en.reflected = true;
      en.traveled = 0;
      game.freeze(0.03);
      sfx('tink');
      game.burst(en.x, en.y - 4, 5, PALETTE.fx.flash);
    };
  }
}

// the cycling deck: fixed order, persisted, no drought streaks
function deckDrop(game, e) {
  game.dropDeck = game.dropDeck | 0;
  const item = ENEMIES.DECK[game.dropDeck % ENEMIES.DECK.length];
  game.dropDeck++;
  if (item) spawnPickup(game, e.x, e.y, item);
  spawnPickup(game, e.x, e.y, 'trinket');
}

// shared feedback for custom-hit enemies (mirrors hitEnemy's landed stack)
function enemyHit(game, e, finisher, dmg) {
  const p = game.player;
  const ang = Math.atan2(e.y - p.y, e.x - p.x);
  const kb = COMBAT.KB_ENEMY * (finisher ? COMBAT.KB_FINISHER_MULT : 1);
  sfx(finisher ? 'finisher' : 'hit');
  e.hp -= dmg;
  e.flashT = COMBAT.FLASH_TIME;
  e.squashT = COMBAT.SQUASH_TIME;
  e.staggerT = finisher ? COMBAT.STAGGER_FINISHER : COMBAT.STAGGER;
  e.kbx = (e.kbx || 0) + Math.cos(ang) * kb;
  e.kby = (e.kby || 0) + Math.sin(ang) * kb;
  game.burst(e.x, e.y - 10, finisher ? 12 : 8, PALETTE.fx.flash);
  if (e.hp <= 0) {
    game.freeze(COMBAT.HITSTOP_KILL);
    game.shake(0.18, 0.012);
    defeatEnemy(game, e);
  } else {
    game.freeze(finisher ? COMBAT.HITSTOP_KILL : COMBAT.HITSTOP);
  }
}

function mimicStaffHit(game, e, finisher) {
  if (e.st === 'hidden' || e.st === 'settle') {
    mimicReveal(game, e);               // the poke-tell: no damage, just outrage
    sfx('tink');
    game.freeze(0.03);
    return;
  }
  if (e.st === 'reveal') return;        // anticipation beat is sacred
  enemyHit(game, e, finisher, finisher ? 2 : 1);
}

function mimicReveal(game, e) {
  if (e.st === 'reveal' || e.st === 'active') return;
  e.st = 'reveal';
  e.t = 0;
  sfx('alert');
  game.burst(e.x, e.y - 6, 8, e.skin === 'cactus' ? PALETTE.desert.sandSpeckle : PALETTE.forest.groundSpeckle);
  game.floatText(e.x, e.y - 34, '!');
}

/* ---------------- per-tick updates ---------------- */

function updateWiggler(e, game, dt) {
  const C = ENEMIES.WIGGLER;
  const p = game.player;
  if (updateHurtState(e, dt) && e.st === 'up') return;
  e.t -= dt;
  if (e.st === 'buried') {
    // homes underground, sand only, harmless and unseen
    const d = Math.hypot(p.x - e.x, p.y - e.y) || 1;
    const nx = e.x + ((p.x - e.x) / d) * C.HOME_SPEED * dt;
    const ny = e.y + ((p.y - e.y) / d) * C.HOME_SPEED * dt;
    const tx = Math.floor(nx / TILE), ty = Math.floor(ny / TILE);
    if (blendAtTile(tx, ty) < 0.5 && !isWaterTile(tx, ty)) { e.x = nx; e.y = ny; }
    if (e.t <= 0 && d > TILE * 1.2) {
      if (isSolidAt(e.x, e.y)) { e.t = 0.5; return; }   // never surface inside a prop
      e.st = 'mound'; e.t = C.MOUND_T; sfx('rumble');
    }
  } else if (e.st === 'mound') {
    if (e.t <= 0) {
      e.st = 'emerge'; e.t = C.EMERGE_T;
      game.burst(e.x, e.y - 4, 6, PALETTE.desert.sandSpeckle);
    }
  } else if (e.st === 'emerge') {
    if (e.t <= 0) {
      e.st = 'up';
      e.t = C.UP_MIN + Math.random() * (C.UP_MAX - C.UP_MIN);
      e.hittable = true;
    }
  } else if (e.st === 'up') {
    const d = Math.hypot(p.x - e.x, p.y - e.y) || 1;
    const nx = e.x + ((p.x - e.x) / d) * C.CHASE * dt;
    const ny = e.y + ((p.y - e.y) / d) * C.CHASE * dt;
    if (!isSolidAt(nx, e.y)) e.x = nx;
    if (!isSolidAt(e.x, ny)) e.y = ny;
    if (d < e.radius + p.radius + 2) damagePlayer(game, C.CONTACT, e.x, e.y);
    if (e.t <= 0) { e.st = 'submerge'; e.t = C.SUBMERGE_T; }
  } else if (e.st === 'submerge') {
    if (e.t < C.SUBMERGE_T - 0.1) e.hittable = false;
    if (e.t <= 0) {
      e.st = 'buried';
      e.t = C.BURIED_MIN + Math.random() * (C.BURIED_MAX - C.BURIED_MIN);
      if (e.dieUnder) { game.removeEntity(e); return; }
    }
  }
}

function updatePuffbill(e, game, dt) {
  const C = ENEMIES.PUFFBILL;
  const p = game.player;
  if (updateHurtState(e, dt)) return;
  const dx = p.x - e.x, dy = p.y - e.y;
  const d = Math.hypot(dx, dy);
  e.flip = dx < 0;
  if (e.st === 'wander') {
    e.wanderT -= dt;
    if (e.wanderT <= 0) {
      e.wanderT = 1.2 + Math.random() * 2;
      const a = Math.random() * Math.PI * 2;
      e.dirX = Math.cos(a); e.dirY = Math.sin(a);
      // stays near home
      if (Math.hypot(e.homeX - e.x, e.homeY - e.y) > TILE * 4) {
        const hd = Math.hypot(e.homeX - e.x, e.homeY - e.y);
        e.dirX = (e.homeX - e.x) / hd; e.dirY = (e.homeY - e.y) / hd;
      }
    }
    const nx = e.x + e.dirX * C.WANDER * dt, ny = e.y + e.dirY * C.WANDER * dt;
    if (!isSolidAt(nx, e.y)) e.x = nx;
    if (!isSolidAt(e.x, ny)) e.y = ny;
    // the lane rule: fires only when the player lines up a cardinal
    if (d < C.RANGE && (Math.abs(dx) < C.LANE || Math.abs(dy) < C.LANE)) {
      e.st = 'aim'; e.t = C.AIM_T;
    }
  } else if (e.st === 'aim') {
    e.t -= dt;
    if (e.t <= 0) {
      e.st = 'spit'; e.t = C.SPIT_T;
      // locked to the cardinal lane, not homing
      const ax = Math.abs(dx) >= Math.abs(dy) ? Math.sign(dx) : 0;
      const ay = ax === 0 ? Math.sign(dy) : 0;
      sfx('spit');
      game.entities.push(Object.assign(spawnEntity({
        kind: 'pellet', tx: 0, ty: 0,
        vx: ax * C.PELLET_SPEED, vy: ay * C.PELLET_SPEED, owner: e,
      }, e.chunk), { x: e.x + ax * 14, y: e.y - 14 + ay * 14, px: e.x, py: e.y }));
    }
  } else if (e.st === 'spit') {
    e.t -= dt;
    if (e.t <= 0) { e.st = 'recover'; e.t = C.RECOVER_T; }
  } else if (e.st === 'recover') {
    e.t -= dt;
    if (e.t <= 0) e.st = 'wander';
  }
  if (d > C.DEAGGRO && e.st !== 'wander') { e.st = 'wander'; }
  if (d < e.radius + p.radius + 2) damagePlayer(game, C.CONTACT, e.x, e.y);
}

function updateMimic(e, game, dt) {
  const C = ENEMIES.MIMIC;
  const p = game.player;
  const d = Math.hypot(p.x - e.x, p.y - e.y);
  if (e.st === 'hidden') {
    e.shiverT -= dt;
    if (e.shiverT <= 0) e.shiverT = C.SHIVER_MIN + Math.random() * (C.SHIVER_MAX - C.SHIVER_MIN);
    if (d < C.TRIGGER) mimicReveal(game, e);
    return;
  }
  if (e.st === 'reveal') {
    e.t += dt;
    e.z = 40 * (e.t / C.REVEAL_T) * (1 - e.t / C.REVEAL_T);   // the pop hop
    if (e.t >= C.REVEAL_T) { e.st = 'active'; e.z = 0; e.nutT = 0.8; e.leaveT = 0; }
    return;
  }
  if (e.st === 'settle') {
    e.t += dt;
    if (d < C.TRIGGER) { mimicReveal(game, e); return; }
    if (e.t >= C.SETTLE_T) e.st = 'hidden';
    return;
  }
  // active
  if (updateHurtState(e, dt)) return;
  e.leaveT = d > C.LEAVE ? e.leaveT + dt : 0;
  if (e.leaveT > C.LEAVE_T) { e.st = 'settle'; e.t = 0; return; }
  e.hopT -= dt;
  if (e.hopT <= 0) {
    e.hopT = C.HOP_CD_MIN + Math.random() * (C.HOP_CD_MAX - C.HOP_CD_MIN);
    const dd = d || 1;
    e.hopDX = (p.x - e.x) / dd; e.hopDY = (p.y - e.y) / dd;
    e.hopDur = C.HOP_T;
  }
  if (e.hopDur > 0) {
    e.hopDur -= dt;
    const nx = e.x + e.hopDX * C.HOP_SPEED * dt, ny = e.y + e.hopDY * C.HOP_SPEED * dt;
    if (!isSolidAt(nx, e.y)) e.x = nx;
    if (!isSolidAt(e.x, ny)) e.y = ny;
  }
  e.nutT -= dt;
  if (e.nutT <= 0 && d < ENEMIES.PUFFBILL.RANGE * 1.2) {
    e.nutT = C.NUT_CD;
    const dd = d || 1;
    sfx('spit');
    game.entities.push(Object.assign(spawnEntity({
      kind: 'pellet', tx: 0, ty: 0, nut: true,
      vx: ((p.x - e.x) / dd) * C.NUT_SPEED, vy: ((p.y - e.y) / dd) * C.NUT_SPEED, owner: e,
    }, e.chunk), { x: e.x, y: e.y - 16, px: e.x, py: e.y }));
  }
}

function updateWisp(e, game, dt) {
  const C = ENEMIES.WISP;
  const p = game.player;
  e.t += dt;
  if (e.st === 'fade') {
    e.alpha = Math.min(0.7, e.t / C.FADE_T * 0.7);
    if (e.alpha > 0.5) e.hittable = true;
    if (e.t >= C.FADE_T) e.st = 'drift';
    return;
  }
  if (e.st === 'dissolve') {
    if (e.t < e.dawnDelay) return;
    const u = (e.t - e.dawnDelay) / C.DAWN_T;
    e.alpha = 0.7 * (1 - u);
    e.hittable = false;
    e.y -= 20 * dt;
    if (u >= 1) {
      // the dawn harvest: a guaranteed sparkle payout
      sfx('chime');
      game.burst(e.x, e.y - 10, 12, PALETTE.fx.flash);
      spawnPickup(game, e.x, e.y, 'trinket');
      spawnPickup(game, e.x, e.y, 'trinket');
      game.removeEntity(e);
    }
    return;
  }
  if (updateHurtState(e, dt)) return;
  // capped-turn homing + sine weave: it drifts, it does not hunt
  const want = Math.atan2(p.y - e.y, p.x - e.x);
  const diff = angleDiff(want, e.heading);
  e.heading += clamp(diff, -C.TURN * dt, C.TURN * dt);
  const weave = Math.sin(game.time * Math.PI + e.phase) * 0.5;
  e.x += Math.cos(e.heading + weave) * C.SPEED * dt;   // no solids: it's a ghost
  e.y += Math.sin(e.heading + weave) * C.SPEED * dt;
  const d = Math.hypot(p.x - e.x, p.y - e.y);
  if (d < e.radius + p.radius + 2) damagePlayer(game, C.CONTACT, e.x, e.y);
}

function updatePellet(e, game, dt) {
  const p = game.player;
  e.x += e.vx * dt; e.y += e.vy * dt;
  e.traveled += Math.hypot(e.vx, e.vy) * dt;
  if (e.reflected) {
    const o = e.owner;
    if (o && game.entities.includes(o) && Math.hypot(o.x - e.x, o.y - e.y) < o.radius + 8) {
      enemyHit(game, o, true, 2);       // a returned pellet settles the matter
      spawnPickup(game, o.x, o.y, 'trinket');
      game.removeEntity(e);
      return;
    }
  } else if (Math.hypot(p.x - e.x, p.y - e.y) < 9 + p.radius) {
    damagePlayer(game, 1, e.x - e.vx, e.y - e.vy);
    game.removeEntity(e);
    return;
  }
  if (e.traveled > e.range || isSolidAt(e.x, e.y)) {
    game.burst(e.x, e.y, 4, e.nut ? PALETTE.forest.trunk : PALETTE.desert.rockLight);
    game.removeEntity(e);
  }
}

/* ---------------- the field spawners (runtime pools, never chunk state) ---------------- */

function peaceful(x, y) {
  if (Math.hypot(x, y) < ENEMIES.WIGGLER.PEACE) return true;   // spawn clearing
  for (const s of [World.campSpot, World.stumpSpot, World.skullSpot]) {
    if (s && Math.hypot(x - s.tx * TILE, y - s.ty * TILE) < ENEMIES.WIGGLER.PEACE) return true;
  }
  return false;
}

function updateEnemySpawners(game, dt) {
  const p = game.player;
  const S = game.spawners || (game.spawners = { wigglerT: 4, wispT: 8 });

  // Dune Wigglers: only while the player wanders deep sand
  const bl = blendAtTile(Math.floor(p.x / TILE), Math.floor(p.y / TILE));
  const wigglers = game.entities.filter((e) => e.kind === 'wiggler');
  if (bl < 0.35) {
    S.wigglerT -= dt;
    if (S.wigglerT <= 0 && wigglers.length < ENEMIES.WIGGLER.MAX) {
      S.wigglerT = ENEMIES.WIGGLER.SPAWN_MIN + Math.random() * (ENEMIES.WIGGLER.SPAWN_MAX - ENEMIES.WIGGLER.SPAWN_MIN);
      // ring spawn, 60% biased toward the player's heading
      const { ix, iy } = game.readInput ? game.readInput() : { ix: 0, iy: 0 };
      let a = Math.random() * Math.PI * 2;
      if ((ix || iy) && Math.random() < 0.6) a = Math.atan2(iy, ix) + (Math.random() - 0.5) * 1.2;
      const r = ENEMIES.WIGGLER.RING_MIN + Math.random() * (ENEMIES.WIGGLER.RING_MAX - ENEMIES.WIGGLER.RING_MIN);
      const x = p.x + Math.cos(a) * r, y = p.y + Math.sin(a) * r;
      const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
      if (blendAtTile(tx, ty) < 0.35 && !isWaterTile(tx, ty) && !peaceful(x, y)) {
        const e = spawnEntity({ kind: 'wiggler', tx, ty }, null);
        e.x = e.px = x; e.y = e.py = y;
        game.entities.push(e);
      }
    }
  }
  for (const e of wigglers) {
    // leave the desert (or the county) and they lose interest
    if (Math.hypot(e.x - p.x, e.y - p.y) > ENEMIES.WIGGLER.DESPAWN || bl > 0.5) {
      if (e.st === 'buried') game.removeEntity(e);
      else e.dieUnder = true;   // finishes its dive, then leaves
    }
  }

  // Dusk Wisps: night only, dissolving into a harvest at dawn
  const night = game.nightFactor ? game.nightFactor() : 0;
  const wisps = game.entities.filter((e) => e.kind === 'wisp');
  if (night > 0.5) {
    S.wispT -= dt;
    if (S.wispT <= 0 && wisps.length < ENEMIES.WISP.MAX) {
      S.wispT = ENEMIES.WISP.SPAWN_MIN + Math.random() * (ENEMIES.WISP.SPAWN_MAX - ENEMIES.WISP.SPAWN_MIN);
      const a = Math.random() * Math.PI * 2;
      const r = ENEMIES.WISP.RING_MIN + Math.random() * (ENEMIES.WISP.RING_MAX - ENEMIES.WISP.RING_MIN);
      const x = p.x + Math.cos(a) * r, y = p.y + Math.sin(a) * r;
      if (!peaceful(x, y)) {
        const e = spawnEntity({ kind: 'wisp', tx: 0, ty: 0 }, null);
        e.x = e.px = x; e.y = e.py = y;
        game.entities.push(e);
      }
    }
  } else {
    let stagger = 0;
    for (const e of wisps) {
      if (e.st !== 'dissolve') {
        e.st = 'dissolve'; e.t = 0;
        e.dawnDelay = stagger; stagger += 0.4;
      }
    }
  }
  for (const e of wisps) {
    if (Math.hypot(e.x - p.x, e.y - p.y) > ENEMIES.WISP.DESPAWN) game.removeEntity(e);
  }
}

/* ---------------- drawing ---------------- */

function drawEnemyEntity(ctx, game, e, x, y, boil) {
  const F = PALETTE.forest;
  if (e.kind === 'wiggler') {
    if (e.st === 'buried') return;      // unseen, unheard, mostly harmless
    if (e.st === 'mound') {
      const u = 1 - e.t / ENEMIES.WIGGLER.MOUND_T;
      const s = 1 + 0.3 * u;
      const tremble = e.t < 0.2 ? (Math.random() - 0.5) * 4 : 0;
      const m = ENEMY_SPR.mound;
      ctx.save();
      ctx.translate(x + tremble, y);
      ctx.scale(s, s);
      ctx.drawImage(m.c, -m.ax, -m.ay);
      ctx.restore();
      return;
    }
    // emerging / up / submerging: the body rises out of an ellipse clip
    let rise = 1;
    if (e.st === 'emerge') rise = 1 - e.t / ENEMIES.WIGGLER.EMERGE_T;
    if (e.st === 'submerge') rise = e.t / ENEMIES.WIGGLER.SUBMERGE_T;
    const spr = ENEMY_SPR.wiggler[boil];
    ctx.fillStyle = withAlpha(F.blobShadow, 0.25 * rise);
    ctx.beginPath(); ctx.ellipse(x, y + 2, 14, 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(x, y + 2, 17, 7, 0, 0, Math.PI * 2);
    ctx.rect(x - 20, y - 60, 40, 60);
    ctx.clip();
    const img = e.flashT > 0 ? flashOf(spr) : spr.c;
    const k = e.squashT > 0 ? clamp(e.squashT / COMBAT.SQUASH_TIME, 0, 1) : 0;
    ctx.translate(x, y + (1 - rise) * 46);
    if (k) ctx.scale(1 + 0.25 * k, 1 - 0.25 * k);
    const wig = e.st === 'up' ? Math.sin(game.time * 7 + x) * 0.06 : 0;
    ctx.rotate(wig);
    ctx.drawImage(img, -spr.ax, -spr.ay);
    ctx.restore();
  } else if (e.kind === 'puffbill') {
    const spr = ENEMY_SPR.puffbill[boil];
    let s = 1;
    if (e.st === 'aim') s = 1 + 0.25 * (1 - e.t / ENEMIES.PUFFBILL.AIM_T);
    else if (e.st === 'spit') s = 0.9;
    else if (e.st === 'recover') s = 1 - 0.08 * (e.t / ENEMIES.PUFFBILL.RECOVER_T);
    ctx.fillStyle = withAlpha(F.blobShadow, 0.25);
    ctx.beginPath(); ctx.ellipse(x, y + 2, 13, 4.5, 0, 0, Math.PI * 2); ctx.fill();
    const img = e.flashT > 0 ? flashOf(spr) : spr.c;
    const k = e.squashT > 0 ? clamp(e.squashT / COMBAT.SQUASH_TIME, 0, 1) : 0;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale((e.flip ? -1 : 1) * s * (1 + 0.25 * k), s * (1 - 0.25 * k) *
      (1 + (e.st === 'wander' ? Math.sin(game.time * 5 + x) * 0.03 : 0)));
    ctx.drawImage(img, -spr.ax, -spr.ay);
    ctx.restore();
    if (e.st === 'aim') drawAlertGlyph(ctx, x, y - 46, game);
  } else if (e.kind === 'mimic') {
    if (e.st === 'hidden' || e.st === 'settle') {
      const spr = e.skin === 'cactus' ? ENEMY_SPR.disguiseCactus : ENEMY_SPR.disguiseShroom;
      const shiver = e.st === 'hidden' && e.shiverT < 0.15 ? (Math.random() - 0.5) * 3 : 0;
      const bob = Math.sin(game.time * Math.PI + e.bobPhase) * 0.75;
      if (spr.sh) ctx.drawImage(spr.sh, Math.round(x - spr.ax + shiver), Math.round(y - spr.ay + bob));
      ctx.drawImage(spr.c, Math.round(x - spr.ax + shiver), Math.round(y - spr.ay + bob));
      return;
    }
    const spr = (e.skin === 'cactus' ? ENEMY_SPR.mimicCactus : ENEMY_SPR.mimicShroom)[boil];
    ctx.fillStyle = withAlpha(F.blobShadow, 0.25);
    ctx.beginPath(); ctx.ellipse(x, y + 2, 12, 4.2, 0, 0, Math.PI * 2); ctx.fill();
    const img = e.flashT > 0 ? flashOf(spr) : spr.c;
    const k = e.squashT > 0 ? clamp(e.squashT / COMBAT.SQUASH_TIME, 0, 1) : 0;
    const hop = e.hopDur > 0 ? Math.sin((1 - e.hopDur / ENEMIES.MIMIC.HOP_T) * Math.PI) * 7 : 0;
    ctx.save();
    ctx.translate(x, y - (e.z || 0) - hop);
    if (k) ctx.scale(1 + 0.25 * k, 1 - 0.25 * k);
    ctx.drawImage(img, -spr.ax, -spr.ay);
    ctx.restore();
  } else if (e.kind === 'wisp') {
    const spr = ENEMY_SPR.wisp[boil];
    const breathe = 0.55 + 0.15 * Math.sin(game.time * Math.PI * 2 * 0.35 + e.phase);
    const a = Math.min(e.alpha == null ? 0.7 : e.alpha, 0.7) * (breathe / 0.7 + 0.3);
    const bob = Math.sin(game.time * Math.PI * 2 * 0.7 + e.phase) * 3;
    ctx.fillStyle = withAlpha(F.blobShadow, 0.15 * (a / 0.7));
    ctx.beginPath(); ctx.ellipse(x, y + 2, 10, 3.6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = a * 0.7;
    ctx.drawImage(ENEMY_SPR.wispGlow, x - 45, y - 26 - bob - 45);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = clamp(a, 0, 1);
    const img = e.flashT > 0 ? flashOf(spr) : spr.c;
    ctx.drawImage(img, x - spr.ax, y - 8 - bob - spr.ay + spr.c.height * 0.15);
    ctx.globalAlpha = 1;
  } else if (e.kind === 'pellet') {
    const spr = e.nut ? ENEMY_SPR.nut : ENEMY_SPR.pellet;
    ctx.save();
    ctx.translate(x, y - 10);
    ctx.rotate(game.time * (e.reflected ? 22 : 9));
    ctx.drawImage(spr.c, -spr.ax, -spr.ay);
    ctx.restore();
  }
}

function drawAlertGlyph(ctx, x, y, game) {
  ctx.fillStyle = PALETTE.forest.cream;
  ctx.strokeStyle = PALETTE.forest.ink;
  ctx.lineWidth = 1.8;
  ctx.beginPath(); ctx.arc(x, y + Math.sin(game.time * 6) * 1.5, 8, 0, Math.PI * 2);
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = PALETTE.forest.letterStamp;
  ctx.font = 'bold 11px Georgia, serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('!', x, y + 1 + Math.sin(game.time * 6) * 1.5);
}
