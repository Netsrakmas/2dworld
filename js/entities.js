// Dynamic entities: player, creatures, interactables, particles.
const SIGN_TEXTS = [
  '"KEEP OUT. Ogres only. Especially you, tiny hood person." — signed with a claw print',
  '"Trespassers will be sat on." The paint is still wet.',
  '"Private swamp. The purple water is NOT soup."',
  '"Lost letters? Haven\'t seen any. Stop asking." Something has scribbled a skull below.',
];
const LETTER_TEXTS = [
  '"Dear wanderer — if you find this, the desert bones are older than the forest. Much older. — M."',
  '"Second letter. The ogres are loud but harmless if you keep your hood up. — M."',
  '"Third letter. The one-eyed watchers only stare. Stare back. It\'s polite. — M."',
  '"Fourth letter. Where sand turns to grass, the world changes its handwriting. — M."',
  '"Last letter. You walked between two worlds and read them both. Thank you. — M."',
];

function makePlayer() {
  return {
    kind: 'player',
    x: TILE * 0.5, y: TILE * 0.5,
    px: TILE * 0.5, py: TILE * 0.5,
    vx: 0, vy: 0,
    dir: 0, walkT: 0, moving: false,
    radius: 9,
    speed: TILE * 4,           // 4 tiles/s
    squash: 1, squashT: 1,     // squash-and-stretch on start/stop
    wasMoving: false,
    knockX: 0, knockY: 0,
    stepAcc: 0,
    // combat
    hp: COMBAT.MAX_HP,
    maxHp: COMBAT.MAX_HP,      // heart containers raise this
    iFrameT: 0, hurtLockT: 0,
    attackState: 'none', attackT: 0, attackAngle: 0,
    attackCooldownT: 0, attackBuffer: 0,
    combo: 0, comboIdleT: 0, attackHit: null, swing: null,
  };
}

function spawnEntity(spec, chunk) {
  const e = {
    kind: spec.kind,
    x: (spec.tx + 0.5) * TILE,
    y: (spec.ty + 0.5) * TILE,
    chunk,
  };
  e.px = e.x; e.py = e.y;
  e.flashT = 0; e.squashT = 0; e.staggerT = 0; e.dazedT = 0;
  e.kbx = 0; e.kby = 0;
  switch (spec.kind) {
    case 'ogre':
      e.hittable = true;
      e.homeX = e.x; e.homeY = e.y;
      e.state = 'patrol';
      e.targetX = e.x; e.targetY = e.y;
      e.speed = TILE * 1.2;
      e.chaseSpeed = TILE * 2.6;
      e.frame = 0; e.animT = 0;
      e.radius = 22;
      e.repathT = 0;
      e.hp = COMBAT.OGRE_HP;
      e.atkState = 'none'; e.atkT = 0;
      e.slamX = 0; e.slamY = 0;
      e.alertT = 0;
      break;
    case 'slime':
      e.hittable = true;
      e.homeX = e.x; e.homeY = e.y;
      e.hopT = Math.random() * 2;
      e.hopDX = 0; e.hopDY = 0;
      e.frame = 0;
      e.radius = 12;
      e.hp = COMBAT.SLIME_HP;
      e.interact = { text: 'You poke the slime. It wobbles approvingly.', label: 'poke' };
      break;
    case 'watcher':
      e.hittable = true;
      e.radius = 12;
      e.lookX = 0; e.lookY = 1;
      e.spinT = 0; e.bonked = false;
      e.interact = { text: 'The watcher watches. You watch back. A draw.', label: 'stare' };
      break;
    case 'sign': {
      const r = rng2(spec.tx, spec.ty, World.seedInt ^ 0x516);
      e.interact = { text: SIGN_TEXTS[(r() * SIGN_TEXTS.length) | 0], label: 'read' };
      break;
    }
    case 'letter':
      e.idx = spec.idx;
      e.bobT = Math.random() * 6;
      break;
  }
  return e;
}

// combat timers + knockback shared by all creatures; returns true while the
// entity is staggered/dazed (AI suspended)
function updateHurtState(e, dt) {
  if (e.flashT > 0) e.flashT -= dt;
  if (e.squashT > 0) e.squashT -= dt;
  if (e.staggerT > 0) e.staggerT -= dt;
  const kb = Math.hypot(e.kbx, e.kby);
  if (kb > 2) {
    const nx = e.x + e.kbx * dt, ny = e.y + e.kby * dt;
    if (!isSolidAt(nx, e.y)) e.x = nx;
    if (!isSolidAt(e.x, ny)) e.y = ny;
    const decay = Math.pow(COMBAT.KB_DECAY, dt * 60);
    e.kbx *= decay; e.kby *= decay;
  }
  return e.staggerT > 0;
}

function updateOgre(e, game, dt) {
  const p = game.player;
  const dToPlayer = Math.hypot(p.x - e.x, p.y - e.y);
  const seeR = TILE * 6, giveUpR = TILE * 10;

  // defeated: sit dazed with stars, then poof into leaves + drops
  if (e.dazedT > 0) {
    e.dazedT -= dt;
    updateHurtState(e, dt);
    if (e.dazedT <= 0) defeatEnemy(game, e);
    return;
  }
  if (updateHurtState(e, dt)) return;
  if (e.alertT > 0) { e.alertT -= dt; return; }

  // telegraphed slam: windup (zone shown) -> active (dust ring, damage) -> vulnerable recovery
  if (e.atkState !== 'none') {
    e.atkT -= dt;
    if (e.atkT <= 0) {
      if (e.atkState === 'windup') {
        e.atkState = 'slam';
        e.atkT = COMBAT.SLAM_ACTIVE;
        game.ring(e.slamX, e.slamY);
        game.shake(0.14, 0.012);
        const dSlam = Math.hypot(p.x - e.slamX, p.y - e.slamY);
        if (dSlam < COMBAT.SLAM_RADIUS + p.radius) {
          damagePlayer(game, COMBAT.SLAM_DAMAGE, e.x, e.y);
        }
      } else if (e.atkState === 'slam') {
        e.atkState = 'recover';
        e.atkT = COMBAT.SLAM_RECOVER;
      } else {
        e.atkState = 'none';
      }
    }
    return;
  }

  if (e.state === 'patrol') {
    if (dToPlayer < seeR) {
      e.state = 'chase';
      e.alertT = COMBAT.OGRE_ALERT;   // "!" pause before charging
      return;
    }
    e.repathT -= dt;
    if (e.repathT <= 0) {
      e.repathT = 2 + Math.random() * 3;
      const a = Math.random() * Math.PI * 2;
      e.targetX = e.homeX + Math.cos(a) * TILE * 3;
      e.targetY = e.homeY + Math.sin(a) * TILE * 3;
    }
  } else {
    e.targetX = p.x; e.targetY = p.y;
    if (dToPlayer < COMBAT.SLAM_RANGE && game.deathT === null) {
      e.atkState = 'windup';
      e.atkT = COMBAT.SLAM_WINDUP;
      e.slamX = p.x; e.slamY = p.y;   // zone locks where the player stood
      return;
    }
    if (dToPlayer > giveUpR || Math.hypot(e.homeX - e.x, e.homeY - e.y) > TILE * 14) {
      e.state = 'patrol';
      e.targetX = e.homeX; e.targetY = e.homeY;
    }
  }

  const dx = e.targetX - e.x, dy = e.targetY - e.y;
  const d = Math.hypot(dx, dy);
  const sp = e.state === 'chase' ? e.chaseSpeed : e.speed;
  if (d > 4) {
    const nx = e.x + (dx / d) * sp * dt;
    const ny = e.y + (dy / d) * sp * dt;
    if (!isSolidAt(nx, e.y)) e.x = nx;
    if (!isSolidAt(e.x, ny)) e.y = ny;
    e.animT += dt * (e.state === 'chase' ? 7 : 4);
    e.frame = (e.animT | 0) % 2;
  }

  // bumping into a chasing ogre costs half a heart
  if (dToPlayer < e.radius + p.radius + 4) {
    damagePlayer(game, COMBAT.CONTACT_DAMAGE, e.x, e.y);
  }
}

function updateSlime(e, game, dt) {
  if (updateHurtState(e, dt)) return;
  e.hopT -= dt;
  if (e.hopT <= 0) {
    e.hopT = 1.4 + Math.random() * 1.8;
    const a = Math.random() * Math.PI * 2;
    e.hopDX = Math.cos(a); e.hopDY = Math.sin(a);
    e.hopDur = 0.35;
  }
  if (e.hopDur > 0) {
    e.hopDur -= dt;
    e.frame = 1;
    const sp = TILE * 1.6;
    // stay near home
    const hx = e.homeX - e.x, hy = e.homeY - e.y;
    const hd = Math.hypot(hx, hy);
    let mx = e.hopDX, my = e.hopDY;
    if (hd > TILE * 3) { mx = hx / hd; my = hy / hd; }
    const nx = e.x + mx * sp * dt, ny = e.y + my * sp * dt;
    if (!isSolidAt(nx, e.y)) e.x = nx;
    if (!isSolidAt(e.x, ny)) e.y = ny;
  } else {
    e.frame = 0;
  }
}

function updateWatcher(e, game, dt) {
  if (e.spinT > 0) e.spinT -= dt;
  const p = game.player;
  const dx = p.x - e.x, dy = p.y - e.y;
  const d = Math.hypot(dx, dy) || 1;
  e.lookX = dx / d; e.lookY = dy / d;
}

function updateLetter(e, game, dt) {
  e.bobT += dt;
  const p = game.player;
  if (dist2(p.x, p.y, e.x, e.y) < (TILE * 0.9) ** 2) {
    game.collectLetter(e);
  }
}

/* particles */
function makeParticlePool(n) {
  const pool = [];
  for (let i = 0; i < n; i++) pool.push({ alive: false });
  return pool;
}

function emitParticle(pool, x, y, vx, vy, life, size, color) {
  for (const p of pool) {
    if (!p.alive) {
      p.alive = true;
      p.x = x; p.y = y; p.vx = vx; p.vy = vy;
      p.life = life; p.maxLife = life;
      p.size = size; p.color = color;
      return p;
    }
  }
  return null;
}
