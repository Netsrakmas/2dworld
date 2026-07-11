// Cozy "bonk" combat. Every tunable lives in COMBAT — zero magic numbers in
// the logic. The swing is a 3-phase state machine (windup/active/recovery);
// the hitbox is an arc sector owned by the state machine, never the sprite.
const COMBAT = Object.freeze({
  // player swing (seconds)
  WINDUP: 0.07,
  ACTIVE: 0.12,
  RECOVERY: 0.16,
  COOLDOWN: 0.06,
  BUFFER: 0.13,            // attack input buffer window
  COMBO_RESET: 0.6,
  ARC_RADIUS: 58,
  ARC_HALF_ANGLE: 1.05,    // ~120° sector
  LUNGE_SPEED: 130,        // px/s forward during windup+active (~12 px total)
  MOVE_DAMP: 0.3,          // movement factor while swinging
  DMG: 1,
  DMG_FINISHER: 2,
  // impact feedback
  HITSTOP: 0.06,
  HITSTOP_KILL: 0.13,
  FLASH_TIME: 0.1,
  SQUASH_TIME: 0.12,
  STAGGER: 0.2,
  STAGGER_FINISHER: 0.4,
  KB_ENEMY: 300,           // px/s impulse
  KB_FINISHER_MULT: 2,
  KB_DECAY: 0.85,          // per 60Hz tick
  // enemies
  SLIME_HP: 1,
  OGRE_HP: 5,
  OGRE_ALERT: 0.35,
  SLAM_RANGE: 78,          // ogre starts slam within this distance
  SLAM_RADIUS: 55,         // impact zone radius
  SLAM_WINDUP: 0.5,
  SLAM_ACTIVE: 0.15,
  SLAM_RECOVER: 0.7,
  DAZED_TIME: 0.8,
  // player health (half-hearts)
  MAX_HP: 6,
  CONTACT_DAMAGE: 1,       // ogre contact: half a heart
  SLAM_DAMAGE: 2,          // slam: a full heart
  IFRAMES: 1.0,
  HURT_LOCK: 0.15,         // control locked after damage
  PLAYER_KB: 340,
  // drops
  HEART_HEAL: 2,
  HEART_DROP_SLIME: 0.2,
  TRINKETS_OGRE: 3,
  TRINKETS_WATCHER: 2,
  PICKUP_SCATTER: 140,     // px/s initial impulse
  MAGNET_DELAY: 0.3,
  MAGNET_RADIUS: 70,
  MAGNET_SPEED: 300,
  DEATH_FADE: 0.7,         // each side of the respawn fade
});

const DIR_ANGLE = [Math.PI / 2, -Math.PI / 2, Math.PI, 0]; // down, up, left, right

function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function queueAttack(game) {
  const p = game.player;
  if (game.deathT !== null) return;
  p.attackBuffer = COMBAT.BUFFER;
}

function startSwing(game) {
  const p = game.player;
  p.attackState = 'windup';
  p.attackT = COMBAT.WINDUP;
  p.attackAngle = DIR_ANGLE[p.dir];
  p.attackHit = new Set();
  p.attackBuffer = 0;
  p.comboIdleT = 0;
}

function updatePlayerCombat(game, dt) {
  const p = game.player;
  if (p.attackBuffer > 0) p.attackBuffer -= dt;
  if (p.iFrameT > 0) p.iFrameT -= dt;
  if (p.hurtLockT > 0) p.hurtLockT -= dt;

  // combo memory decays while idle
  if (p.attackState === 'none') {
    p.comboIdleT += dt;
    if (p.comboIdleT > COMBAT.COMBO_RESET) p.combo = 0;
    if (p.attackBuffer > 0 && p.attackCooldownT <= 0) startSwing(game);
    if (p.attackCooldownT > 0) p.attackCooldownT -= dt;
    return;
  }

  p.attackT -= dt;

  if (p.attackState === 'windup' || p.attackState === 'active') {
    // committed forward lunge
    const nx = p.x + Math.cos(p.attackAngle) * COMBAT.LUNGE_SPEED * dt;
    const ny = p.y + Math.sin(p.attackAngle) * COMBAT.LUNGE_SPEED * dt;
    const r = p.radius;
    if (!isSolidAt(nx - r, p.y - r) && !isSolidAt(nx + r, p.y - r) &&
        !isSolidAt(nx - r, p.y + r) && !isSolidAt(nx + r, p.y + r)) p.x = nx;
    if (!isSolidAt(p.x - r, ny - r) && !isSolidAt(p.x + r, ny - r) &&
        !isSolidAt(p.x - r, ny + r) && !isSolidAt(p.x + r, ny + r)) p.y = ny;
  }

  if (p.attackState === 'active') {
    // circle-vs-arc-sector test, dedup via per-swing hit set
    for (const e of game.entities) {
      if (p.attackHit.has(e)) continue;
      if (e.kind !== 'ogre' && e.kind !== 'slime' && e.kind !== 'watcher') continue;
      if (e.dazedT > 0) continue;
      const dx = e.x - p.x, dy = e.y - p.y;
      const d = Math.hypot(dx, dy);
      if (d > COMBAT.ARC_RADIUS + e.radius) continue;
      if (Math.abs(angleDiff(Math.atan2(dy, dx), p.attackAngle)) > COMBAT.ARC_HALF_ANGLE) continue;
      p.attackHit.add(e);
      hitEnemy(game, e, p.combo === 2);
    }
  }

  if (p.attackT <= 0) {
    if (p.attackState === 'windup') {
      p.attackState = 'active';
      p.attackT = COMBAT.ACTIVE;
    } else if (p.attackState === 'active') {
      p.attackState = 'recovery';
      p.attackT = COMBAT.RECOVERY;
    } else {
      p.attackState = 'none';
      p.combo = (p.combo + 1) % 3;
      p.comboIdleT = 0;
      p.attackCooldownT = COMBAT.COOLDOWN;
      // buffered swing chains the combo the frame recovery ends
      if (p.attackBuffer > 0) {
        p.attackCooldownT = 0;
        startSwing(game);
      }
    }
  }
}

// A landed hit fires ALL feedback simultaneously: hitstop, flash, knockback,
// squash, particles, stagger. A whiff fires none of it.
function hitEnemy(game, e, finisher) {
  const p = game.player;
  const ang = Math.atan2(e.y - p.y, e.x - p.x);
  const F = PALETTE.forest;

  if (e.kind === 'watcher') {
    // unkillable, but reactive: spin + first-bonk trinkets
    e.spinT = 0.45;
    game.freeze(COMBAT.HITSTOP);
    game.burst(e.x, e.y - 14, 8, PALETTE.fx.trinket);
    if (!e.bonked) {
      e.bonked = true;
      for (let i = 0; i < COMBAT.TRINKETS_WATCHER; i++) spawnPickup(game, e.x, e.y - 8, 'trinket');
      game.floatText(e.x, e.y - 36, '!');
    }
    return;
  }

  const dmg = finisher ? COMBAT.DMG_FINISHER : COMBAT.DMG;
  const kb = COMBAT.KB_ENEMY * (finisher ? COMBAT.KB_FINISHER_MULT : 1);
  e.hp -= dmg;
  e.flashT = COMBAT.FLASH_TIME;
  e.squashT = COMBAT.SQUASH_TIME;
  e.staggerT = finisher ? COMBAT.STAGGER_FINISHER : COMBAT.STAGGER;
  e.kbx = (e.kbx || 0) + Math.cos(ang) * kb;
  e.kby = (e.kby || 0) + Math.sin(ang) * kb;
  const hitX = p.x + Math.cos(p.attackAngle) * (COMBAT.ARC_RADIUS * 0.7);
  const hitY = p.y + Math.sin(p.attackAngle) * (COMBAT.ARC_RADIUS * 0.7);
  game.burst(hitX, hitY - 10, finisher ? 12 : 8, PALETTE.fx.flash);

  if (e.hp <= 0) {
    game.freeze(COMBAT.HITSTOP_KILL);
    game.shake(0.18, 0.012);
    if (e.kind === 'ogre') {
      e.dazedT = COMBAT.DAZED_TIME;   // sits down with stars, then poofs
      e.atkState = 'none';
    } else {
      defeatEnemy(game, e);
    }
  } else {
    game.freeze(finisher ? COMBAT.HITSTOP_KILL : COMBAT.HITSTOP);
    if (e.kind === 'ogre' && e.atkState === 'windup') e.atkState = 'none'; // bonk interrupts
  }
}

function defeatEnemy(game, e) {
  const F = PALETTE.forest;
  game.burst(e.x, e.y - 12, 12, F.canopyMid);
  game.burst(e.x, e.y - 12, 8, PALETTE.fx.flash);
  if (e.kind === 'ogre') {
    spawnPickup(game, e.x, e.y, 'heart');
    for (let i = 0; i < COMBAT.TRINKETS_OGRE; i++) spawnPickup(game, e.x, e.y, 'trinket');
  } else if (e.kind === 'slime') {
    const r = Math.random();
    if (r < COMBAT.HEART_DROP_SLIME) spawnPickup(game, e.x, e.y, 'heart');
    spawnPickup(game, e.x, e.y, 'trinket');
  }
  game.removeEntity(e);
}

function damagePlayer(game, amount, fromX, fromY) {
  const p = game.player;
  if (p.iFrameT > 0 || game.deathT !== null) return;
  p.hp -= amount;
  p.iFrameT = COMBAT.IFRAMES;
  p.hurtLockT = COMBAT.HURT_LOCK;
  p.attackBuffer = 0;          // buffered inputs clear on hitstun
  const d = Math.hypot(p.x - fromX, p.y - fromY) || 1;
  p.knockX = ((p.x - fromX) / d) * COMBAT.PLAYER_KB;
  p.knockY = ((p.y - fromY) / d) * COMBAT.PLAYER_KB;
  game.shake(0.2, 0.02);
  game.freeze(0.06);
  game.burst(p.x, p.y - 12, 12, PALETTE.forest.ogreRed);
  game.floatText(p.x, p.y - 40, 'oof!');
  if (p.hp <= 0) {
    game.deathT = 0;           // soft fade, respawn with everything kept
  }
}

function spawnPickup(game, x, y, ptype) {
  const a = Math.random() * Math.PI * 2;
  const sp = COMBAT.PICKUP_SCATTER * (0.6 + Math.random() * 0.8);
  game.entities.push({
    kind: 'pickup', ptype,
    x, y, px: x, py: y,
    vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40,
    age: 0, bobT: Math.random() * 6,
  });
}

function updatePickup(e, game, dt) {
  e.age += dt;
  e.bobT += dt;
  const p = game.player;
  const d = Math.hypot(p.x - e.x, p.y - e.y);
  if (e.age > COMBAT.MAGNET_DELAY && d < COMBAT.MAGNET_RADIUS) {
    e.vx = ((p.x - e.x) / (d || 1)) * COMBAT.MAGNET_SPEED;
    e.vy = ((p.y - e.y) / (d || 1)) * COMBAT.MAGNET_SPEED;
  } else {
    e.vx *= Math.pow(0.02, dt);
    e.vy *= Math.pow(0.02, dt);
  }
  e.x += e.vx * dt;
  e.y += e.vy * dt;
  if (d < 15 && e.age > 0.15) {
    if (e.ptype === 'heart') {
      p.hp = Math.min(COMBAT.MAX_HP, p.hp + COMBAT.HEART_HEAL);
      game.floatText(p.x, p.y - 40, '+1 heart');
    } else {
      game.trinkets++;
      game.updateTrinketHud();
      game.floatText(e.x, e.y - 24, '+1');
    }
    game.burst(e.x, e.y - 6, 6, e.ptype === 'heart' ? PALETTE.fx.heart : PALETTE.fx.trinket);
    game.removeEntity(e);
  }
}

// storybook heart used by both the HUD and pickups
function heartPath(ctx, x, y, s) {
  ctx.beginPath();
  ctx.moveTo(x, y + s * 0.32);
  ctx.bezierCurveTo(x - s * 0.5, y - s * 0.22, x - s * 0.5, y - s * 0.7, x, y - s * 0.3);
  ctx.bezierCurveTo(x + s * 0.5, y - s * 0.7, x + s * 0.5, y - s * 0.22, x, y + s * 0.32);
  ctx.closePath();
}

function starPath(ctx, x, y, r, points) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const a = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
    const rad = i % 2 ? r * 0.45 : r;
    const px = x + Math.cos(a) * rad, py = y + Math.sin(a) * rad;
    i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
  }
  ctx.closePath();
}
