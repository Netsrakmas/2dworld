// Atmosphere layer (graphics polish pass 1): drifting cloud shadows / sun
// patches, biome-tinted vignette + grade wash, and ONE global wind system
// that everything sways to. Bake-once rule: every soft element is rendered
// to an offscreen canvas at load/resize — runtime is drawImage/pattern fills
// only, no per-frame gradients or blurs.
const ATMOS = Object.freeze({
  CLOUD_TILE: 512,
  CLOUD_BLOBS: 7, CLOUD_R_MIN: 90, CLOUD_R_MAX: 230,   // sparse: gaps between shadows are the point
  SUN_BLOBS: 6, SUN_R_MIN: 160, SUN_R_MAX: 300,
  CLOUD_ALPHA: 0.09,               // forest dapple
  SUN_ALPHA: 0.12,                 // desert sun patches
  CLOUD_SPEED: 16,                 // px/s, layer 1
  CLOUD_DIR: 1.25,                 // drift heading, ~20° off the wind axis
  LAYER2_SCALE: 1.7, LAYER2_SPEED: 0.6,
  WASH_ALPHA: 0.10,                // per-biome overlay grade
  VIGNETTE_ALPHA: 0.30, VIGNETTE_BREATHE: 0.05, VIGNETTE_PERIOD: 8,
  BLEND_EASE: 0.8,                 // 1/s, crossfade speed at the biome border
  // the wind: 3 superposed traveling sines + gust envelope + gust events
  WIND_DIR: 0.9,                   // radians; gust fronts TRAVEL along this
  WIND_WAVES: Object.freeze([      // [amplitude, ω rad/s, wavelength px]
    Object.freeze([0.45, 0.9, 420]),
    Object.freeze([0.35, 1.7, 260]),
    Object.freeze([0.20, 3.1, 640]),
  ]),
  GUST_MIN: 20, GUST_MAX: 60,      // s between gust events
  GUST_SPIKE: 2.4,                 // amplitude multiplier at a gust peak
  GUST_ATTACK: 1.0, GUST_DECAY: 3.5,
  SWAY_PROP: 0.045,                // canopy radians per wind unit
});

const Atmos = {
  shadowTile: null, sunTile: null,
  patShadow: null, patSun: null,
  vigWarm: null, vigCool: null, vigW: 0, vigH: 0,
  drift1: 0, drift2: 0,
  gust: 0, gustEvents: [], gustIdx: 0,
  blend: 1,                        // eased biome blend at the camera (0 desert, 1 forest)
};

function buildAtmos(seedInt) {
  Atmos.shadowTile = bakeCloudTile(seedInt ^ 0xC10D, ATMOS.CLOUD_BLOBS,
    ATMOS.CLOUD_R_MIN, ATMOS.CLOUD_R_MAX, PALETTE.forest.blobShadow);
  Atmos.sunTile = bakeCloudTile(seedInt ^ 0x50BB, ATMOS.SUN_BLOBS,
    ATMOS.SUN_R_MIN, ATMOS.SUN_R_MAX, PALETTE.desert.sandRim);
  Atmos.patShadow = null;          // created lazily against the live context
  Atmos.patSun = null;
  // deterministic gust schedule for the whole session
  const r = mulberry32(seedInt ^ 0x6057);
  Atmos.gustEvents.length = 0;
  let t = 6 + r() * 10;
  while (t < 7200) {
    Atmos.gustEvents.push(t);
    t += ATMOS.GUST_MIN + r() * (ATMOS.GUST_MAX - ATMOS.GUST_MIN);
  }
  Atmos.gustIdx = 0;
  Atmos.raySpots.clear();
  bakeAtmosLife(seedInt);
}

// sparse soft blob field, 9-way edge-wrapped so it tiles perfectly. Additive
// compositing fuses overlaps without patch seams, and the radial gradients
// are already soft — no blur pass, so no clamped hard frame at the borders
// (the old blur bake produced an 85%-opaque fog with a hard rectangular rim,
// which read as dark clouds popping in and out at straight edges).
function bakeCloudTile(seed, blobs, rMin, rMax, color) {
  const S = ATMOS.CLOUD_TILE;
  const c = makeCanvas(S, S);
  const ctx = c.getContext('2d');
  const r = mulberry32(seed >>> 0);
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < blobs; i++) {
    const x = r() * S, y = r() * S;
    const rad = rMin + r() * (rMax - rMin);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rad);
    g.addColorStop(0, withAlpha(color, 0.3 + r() * 0.12));
    g.addColorStop(0.6, withAlpha(color, 0.13 + r() * 0.06));
    g.addColorStop(1, withAlpha(color, 0));
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        ctx.save();
        ctx.translate(x + dx * S, y + dy * S);
        ctx.fillStyle = g;
        ctx.fillRect(-rad, -rad, rad * 2, rad * 2);
        ctx.restore();
      }
    }
  }
  return c;
}

/* ---------------- the wind ---------------- */

// gust envelope: slow breathing + discrete traveling gust events
function updateGust(t) {
  const ev = Atmos.gustEvents;
  while (Atmos.gustIdx < ev.length - 1 && ev[Atmos.gustIdx + 1] <= t) Atmos.gustIdx++;
  let spike = 0;
  const e = ev[Atmos.gustIdx];
  if (e !== undefined && t >= e) {
    const k = t - e;
    if (k < ATMOS.GUST_ATTACK) spike = k / ATMOS.GUST_ATTACK;
    else spike = Math.max(0, 1 - (k - ATMOS.GUST_ATTACK) / ATMOS.GUST_DECAY);
  }
  const base = 0.5 + 0.5 * Math.sin(t * 0.13);
  Atmos.gust = base + spike * (ATMOS.GUST_SPIKE - 1);
}

// one weather system: every sway/particle/cloud reads from here. The phase
// term dot(windDir, worldPos)/λ makes gust fronts visibly TRAVEL.
function windAt(wx, wy, t) {
  const dx = Math.cos(ATMOS.WIND_DIR), dy = Math.sin(ATMOS.WIND_DIR);
  const ph = wx * dx + wy * dy;
  let w = 0;
  for (const wave of ATMOS.WIND_WAVES) {
    w += wave[0] * Math.sin(t * wave[1] + (ph / wave[2]) * Math.PI * 2);
  }
  return w * (0.45 + 0.65 * Atmos.gust);
}

function updateAtmos(game, dt) {
  updateGust(game.time);
  const speed = 1 + 0.5 * (Atmos.gust - 0.5);
  Atmos.drift1 += dt * ATMOS.CLOUD_SPEED * speed;
  Atmos.drift2 += dt * ATMOS.CLOUD_SPEED * ATMOS.LAYER2_SPEED * speed;
  const p = game.player;
  const target = blendAtTile(Math.floor(p.x / TILE), Math.floor(p.y / TILE));
  Atmos.blend += (target - Atmos.blend) * Math.min(1, dt * ATMOS.BLEND_EASE);
  updateDrifters(game, dt);
}

/* ---------------- rendering ---------------- */

// The whole atmosphere — cloud shadows / sun patches, biome grade wash, and
// the breathing vignette — is composited into ONE 1/3-resolution overlay
// canvas and blitted in a single full-screen draw. The elements are all
// ultra-soft, so the downsample is invisible, and one blended pass is the
// difference between free and frame-eating on weak rasterizers.
const ATMOS_LOWRES = 3;

function drawAtmosClouds(ctx, game, ox, oy, vw, vh) {
  const fA = Atmos.blend;            // forest weight
  const dA = 1 - Atmos.blend;        // desert weight
  const lw = Math.max(2, Math.ceil(vw / ATMOS_LOWRES)), lh = Math.max(2, Math.ceil(vh / ATMOS_LOWRES));
  if (!Atmos.low || Atmos.low.width !== lw || Atmos.low.height !== lh) {
    Atmos.low = makeCanvas(lw, lh);
    Atmos.lowCtx = Atmos.low.getContext('2d');
    Atmos.patShadow = Atmos.lowCtx.createPattern(Atmos.shadowTile, 'repeat');
    Atmos.patSun = Atmos.lowCtx.createPattern(Atmos.sunTile, 'repeat');
    Atmos.lowVigWarm = bakeVignette(lw, lh, PALETTE.desert.sandShadow);
    Atmos.lowVigCool = bakeVignette(lw, lh, PALETTE.forest.canopyDark);
  }
  const lctx = Atmos.lowCtx;
  lctx.clearRect(0, 0, lw, lh);
  const ddx = Math.cos(ATMOS.CLOUD_DIR), ddy = Math.sin(ATMOS.CLOUD_DIR);
  const fill = (pat, scale, drift, alpha) => {
    if (alpha < 0.015) return;
    const m = new DOMMatrix();
    m.scaleSelf(1 / ATMOS_LOWRES, 1 / ATMOS_LOWRES);
    m.translateSelf(-(ox + drift * ddx), -(oy + drift * ddy));
    m.scaleSelf(scale, scale);
    pat.setTransform(m);
    lctx.globalAlpha = alpha;
    lctx.fillStyle = pat;
    lctx.fillRect(0, 0, lw, lh);
  };
  // forest: dark dapple, two drift layers so the tiling never reads.
  // Desert: inverted — fewer, larger warm sun-bleached patches.
  fill(Atmos.patShadow, 1, Atmos.drift1, ATMOS.CLOUD_ALPHA * 1.6 * fA * 0.6);
  fill(Atmos.patShadow, ATMOS.LAYER2_SCALE, Atmos.drift2, ATMOS.CLOUD_ALPHA * 1.6 * fA * 0.4);
  fill(Atmos.patSun, ATMOS.LAYER2_SCALE * 0.9, Atmos.drift1, ATMOS.SUN_ALPHA * 1.5 * dA);
  // biome grade wash
  lctx.globalAlpha = ATMOS.WASH_ALPHA * 0.8;
  lctx.fillStyle = mixColor(PALETTE.desert.sandRim, PALETTE.forest.canopyDark, Atmos.blend);
  lctx.fillRect(0, 0, lw, lh);
  // breathing biome-tinted vignette
  const breathe = 1 + Math.sin(game.time * Math.PI * 2 / ATMOS.VIGNETTE_PERIOD) * (ATMOS.VIGNETTE_BREATHE / ATMOS.VIGNETTE_ALPHA);
  if (dA * breathe > 0.02) { lctx.globalAlpha = clamp(dA * breathe, 0, 1); lctx.drawImage(Atmos.lowVigWarm, 0, 0); }
  if (fA * breathe > 0.02) { lctx.globalAlpha = clamp(fA * breathe, 0, 1); lctx.drawImage(Atmos.lowVigCool, 0, 0); }
  lctx.globalAlpha = 1;
  // the one full-screen pass
  ctx.drawImage(Atmos.low, 0, 0, vw, vh);
}

/* ---------------- living details (polish pass 4) ---------------- */

const ATMOS_LIFE = Object.freeze({
  GLINT_CYCLE: 3.2,                // s per glint fade cycle
  GLINT_FRAC: 3,                   // 1-in-N water cells carry a glint
  RIPPLE_MIN: 4, RIPPLE_MAX: 10,   // s between rings per screenful
  RIPPLE_R: 20, RIPPLE_T: 1.5,
  RAY_ALPHA: 0.15, RAY_PULSE_MIN: 6, RAY_PULSE_MAX: 12,
  POLLEN_MAX: 6, POLLEN_LIFE: 18,
  BUTTERFLY_MAX: 2, BUTTERFLY_SPEED: 34, FLAP_HZ: 8,
  DUST_MAX: 5, DUST_SPEED: 300, DUST_LIFE: 0.55,
  PARA_ALPHA: 0.2, PARA_SCROLL: 1.22, PARA_GRID: 620, PARA_SWAY: 6,
});

Atmos.life = { ripples: [], rippleT: 5, pollen: [], flies: [], dust: [], dustT: 0 };
Atmos.raySpots = new Map();        // per landmark-region god-ray anchors

function bakeAtmosLife(seedInt) {
  // god-ray shaft: skewed bright quad + ground light pool, blurred at bake
  {
    const c = makeCanvas(240, 300);
    const ctx = c.getContext('2d');
    ctx.filter = 'blur(13px)';
    ctx.fillStyle = withAlpha(PALETTE.forest.cream, 0.55);
    ctx.beginPath();
    ctx.moveTo(120, 20); ctx.lineTo(180, 20);
    ctx.lineTo(120, 250); ctx.lineTo(40, 250);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = withAlpha(PALETTE.forest.firefly, 0.35);
    ctx.beginPath(); ctx.ellipse(80, 252, 74, 26, 0, 0, Math.PI * 2); ctx.fill();
    ctx.filter = 'none';
    Atmos.raySprite = c;
  }
  // foreground canopy silhouette, soft dark frond cluster
  {
    const c = makeCanvas(420, 220);
    const ctx = c.getContext('2d');
    const r = mulberry32(seedInt ^ 0xFA5);
    ctx.filter = 'blur(7px)';
    ctx.fillStyle = withAlpha(shade(PALETTE.forest.canopyDark, 0.65), 0.9);
    for (let i = 0; i < 12; i++) {
      ctx.beginPath();
      ctx.arc(40 + r() * 340, 40 + r() * 120, 42 + r() * 52, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.filter = 'none';
    Atmos.paraSprite = c;
  }
}

// deterministic god-ray anchors: forest clearings within a landmark region
function raySpotsFor(lrx, lry) {
  const key = lrx + ',' + lry;
  let spots = Atmos.raySpots.get(key);
  if (spots !== undefined) return spots;
  spots = [];
  const rr = rng2(lrx, lry, World.seedInt ^ 0x60DE);
  for (let i = 0; i < 3; i++) {
    const tx = lrx * LREGION + ((rr() * LREGION) | 0);
    const ty = lry * LREGION + ((rr() * LREGION) | 0);
    const phase = rr() * 6.28, period = ATMOS_LIFE.RAY_PULSE_MIN + rr() * (ATMOS_LIFE.RAY_PULSE_MAX - ATMOS_LIFE.RAY_PULSE_MIN);
    if (blendAtTile(tx, ty) < 0.75) continue;
    if (World.noiseTree.fbm(tx / 8, ty / 8, 3) > 0.45) continue;   // clearings only
    if (isWaterTile(tx, ty)) continue;
    spots.push({ x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE, phase, period });
  }
  Atmos.raySpots.set(key, spots);
  return spots;
}

// baked shafts stamped at fixed world positions — drawn over terrain, under
// props, so the light lands on the ground between the trees
function drawGodRays(ctx, game, ox, oy, vw, vh) {
  if (Atmos.blend < 0.4) return;
  const lr0x = Math.floor(ox / (LREGION * TILE)), lr1x = Math.floor((ox + vw) / (LREGION * TILE));
  const lr0y = Math.floor(oy / (LREGION * TILE)), lr1y = Math.floor((oy + vh) / (LREGION * TILE));
  ctx.globalCompositeOperation = 'lighter';
  for (let lry = lr0y; lry <= lr1y; lry++) {
    for (let lrx = lr0x; lrx <= lr1x; lrx++) {
      for (const s of raySpotsFor(lrx, lry)) {
        const sx = s.x - ox, sy = s.y - oy;
        if (sx < -260 || sx > vw + 260 || sy < -320 || sy > vh + 120) continue;
        const pulse = 0.6 + 0.4 * Math.sin(game.time * Math.PI * 2 / s.period + s.phase);
        ctx.globalAlpha = ATMOS_LIFE.RAY_ALPHA * pulse * Atmos.blend;
        ctx.drawImage(Atmos.raySprite, sx - 80, sy - 252);
      }
    }
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

// water life: cell-hashed glints + occasional expanding ripple rings.
// Overlay only — the baked water is never touched.
function drawWaterLife(ctx, game, ox, oy, vw, vh) {
  const c0x = Math.floor(ox / CELL_PX), c1x = Math.floor((ox + vw) / CELL_PX);
  const c0y = Math.floor(oy / CELL_PX), c1y = Math.floor((oy + vh) / CELL_PX);
  const t = game.time;
  ctx.lineCap = 'round';
  let anyWater = false;
  for (let cy = c0y; cy <= c1y; cy++) {
    for (let cx = c0x; cx <= c1x; cx++) {
      if (!isWaterCell(cx, cy)) continue;
      anyWater = true;
      const h = hash2i(cx, cy, 0x611);
      if (h % ATMOS_LIFE.GLINT_FRAC !== 0) continue;
      const phase = (h % 1024) / 1024;
      const u = (t / ATMOS_LIFE.GLINT_CYCLE + phase) % 1;
      const a = Math.sin(Math.PI * u) * 0.5;
      if (a < 0.04) continue;
      const bl = blendAtTile(cx * CELL + 1, cy * CELL + 1);
      const gx = cx * CELL_PX + 14 + (h % 47), gy = cy * CELL_PX + 14 + ((h >> 5) % 43);
      ctx.globalAlpha = a;
      ctx.strokeStyle = bl < 0.5 ? PALETTE.desert.waterDash : PALETTE.forest.cream;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(gx - ox, gy - oy);
      ctx.lineTo(gx - ox + 7 + (h % 9), gy - oy);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
  // ripple rings, a few per screenful of water
  const L = Atmos.life;
  if (anyWater) {
    L.rippleT -= 1 / 60;
    if (L.rippleT <= 0) {
      L.rippleT = ATMOS_LIFE.RIPPLE_MIN + Math.random() * (ATMOS_LIFE.RIPPLE_MAX - ATMOS_LIFE.RIPPLE_MIN);
      for (let tries = 0; tries < 12; tries++) {
        const cx = c0x + ((Math.random() * (c1x - c0x + 1)) | 0);
        const cy = c0y + ((Math.random() * (c1y - c0y + 1)) | 0);
        if (isWaterCell(cx, cy)) {
          L.ripples.push({ x: cx * CELL_PX + 14 + Math.random() * (CELL_PX - 28), y: cy * CELL_PX + 14 + Math.random() * (CELL_PX - 28), t: 0, bl: blendAtTile(cx * CELL + 1, cy * CELL + 1) });
          break;
        }
      }
    }
  }
  for (let i = L.ripples.length - 1; i >= 0; i--) {
    const rp = L.ripples[i];
    rp.t += 1 / 60;
    const u = rp.t / ATMOS_LIFE.RIPPLE_T;
    if (u >= 1) { L.ripples.splice(i, 1); continue; }
    ctx.globalAlpha = 0.35 * (1 - u);
    ctx.strokeStyle = rp.bl < 0.5 ? PALETTE.desert.waterDash : PALETTE.forest.cream;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(rp.x - ox, rp.y - oy, 2 + ATMOS_LIFE.RIPPLE_R * u, (2 + ATMOS_LIFE.RIPPLE_R * u) * 0.7, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

// pollen, butterflies, gust-borne dust — updated in the fixed step
function updateDrifters(game, dt) {
  const L = Atmos.life;
  const p = game.player;
  const forest = Atmos.blend > 0.5;
  // pollen motes drift on the wind
  if (forest && L.pollen.length < ATMOS_LIFE.POLLEN_MAX && Math.random() < dt * 0.6) {
    L.pollen.push({
      x: p.x + (Math.random() - 0.5) * innerWidth,
      y: p.y + (Math.random() - 0.5) * innerHeight,
      t: 0, life: ATMOS_LIFE.POLLEN_LIFE * (0.6 + Math.random() * 0.8), phase: Math.random() * 6.28,
    });
  }
  for (let i = L.pollen.length - 1; i >= 0; i--) {
    const m = L.pollen[i];
    m.t += dt;
    const w = windAt(m.x, m.y, game.time);
    m.x += (10 + w * 26) * dt;
    m.y += Math.sin(game.time * 1.1 + m.phase) * 14 * dt + 4 * dt;
    if (m.t > m.life || Math.abs(m.x - p.x) > innerWidth) L.pollen.splice(i, 1);
  }
  // butterflies wander near the player
  if (forest && L.flies.length < ATMOS_LIFE.BUTTERFLY_MAX && Math.random() < dt * 0.25) {
    L.flies.push({
      x: p.x + (Math.random() - 0.5) * innerWidth * 0.7,
      y: p.y + (Math.random() - 0.5) * innerHeight * 0.7,
      h: Math.random() * 6.28, t: 0,
      tint: Math.random() < 0.5,
    });
  }
  for (let i = L.flies.length - 1; i >= 0; i--) {
    const b = L.flies[i];
    b.t += dt;
    b.h += (Math.random() - 0.5) * 3.4 * dt;
    // gently steer back toward the player's neighborhood
    const dx = p.x - b.x, dy = p.y - b.y;
    if (Math.hypot(dx, dy) > 460) b.h = Math.atan2(dy, dx) + (Math.random() - 0.5);
    b.x += Math.cos(b.h) * ATMOS_LIFE.BUTTERFLY_SPEED * dt;
    b.y += Math.sin(b.h) * ATMOS_LIFE.BUTTERFLY_SPEED * dt;
    if (!forest && b.t > 4 || b.t > 60) L.flies.splice(i, 1);
  }
  // desert dust streaks ride the gusts
  if (!forest && Atmos.gust > 1.15 && L.dust.length < ATMOS_LIFE.DUST_MAX) {
    L.dust.push({
      x: p.x + (Math.random() - 0.5) * innerWidth,
      y: p.y + (Math.random() - 0.5) * innerHeight,
      t: 0,
    });
  }
  for (let i = L.dust.length - 1; i >= 0; i--) {
    const d = L.dust[i];
    d.t += dt;
    d.x += Math.cos(ATMOS.WIND_DIR) * ATMOS_LIFE.DUST_SPEED * dt;
    d.y += Math.sin(ATMOS.WIND_DIR) * ATMOS_LIFE.DUST_SPEED * dt;
    if (d.t > ATMOS_LIFE.DUST_LIFE) L.dust.splice(i, 1);
  }
}

function drawDrifters(ctx, game, ox, oy) {
  const L = Atmos.life;
  for (const m of L.pollen) {
    const a = Math.min(1, m.t * 2, (m.life - m.t)) * 0.5;
    ctx.globalAlpha = Math.max(0, a);
    ctx.fillStyle = PALETTE.forest.firefly;
    ctx.beginPath();
    ctx.arc(m.x - ox, m.y - oy, 1.8, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  for (const b of L.flies) {
    const flap = Math.sin(b.t * Math.PI * 2 * ATMOS_LIFE.FLAP_HZ) * 0.9;
    const bx = b.x - ox, by = b.y - oy + Math.sin(b.t * 2.2) * 3;
    ctx.fillStyle = b.tint ? PALETTE.desert.blossom : PALETTE.forest.cream;
    ctx.strokeStyle = withAlpha(PALETTE.forest.ink, 0.7);
    ctx.lineWidth = 1;
    for (const side of [-1, 1]) {
      ctx.save();
      ctx.translate(bx, by);
      ctx.rotate(b.h + Math.PI / 2);
      ctx.scale(1, 1);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(side * 6, -4 * (0.4 + Math.abs(flap)));
      ctx.lineTo(side * 6, 3 * (0.4 + Math.abs(flap)));
      ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.restore();
    }
    ctx.fillStyle = PALETTE.forest.ink;
    ctx.beginPath(); ctx.arc(bx, by, 1.4, 0, Math.PI * 2); ctx.fill();
  }
  ctx.strokeStyle = withAlpha(PALETTE.desert.bone, 0.14);
  ctx.lineWidth = 2;
  for (const d of L.dust) {
    const a = Math.sin(Math.PI * d.t / ATMOS_LIFE.DUST_LIFE);
    ctx.globalAlpha = a * 0.9;
    ctx.beginPath();
    ctx.moveTo(d.x - ox, d.y - oy);
    ctx.lineTo(d.x - ox + Math.cos(ATMOS.WIND_DIR) * 34, d.y - oy + Math.sin(ATMOS.WIND_DIR) * 34);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

// foreground parallax: soft dark canopy clusters anchored to a coarse world
// grid, scroll factor >1 — the one true depth cue in top-down. Forest only.
function drawParallax(ctx, game, camX, camY, vw, vh) {
  if (Atmos.blend < 0.55) return;
  const f = ATMOS_LIFE.PARA_SCROLL;
  const G = ATMOS_LIFE.PARA_GRID;
  const g0x = Math.floor((camX - vw) / G), g1x = Math.floor((camX + vw) / G);
  const g0y = Math.floor((camY - vh) / G), g1y = Math.floor((camY + vh) / G);
  ctx.globalAlpha = ATMOS_LIFE.PARA_ALPHA * clamp((Atmos.blend - 0.55) / 0.3, 0, 1);
  for (let gy = g0y; gy <= g1y; gy++) {
    for (let gx = g0x; gx <= g1x; gx++) {
      const h = hash2i(gx, gy, 0xFA6);
      if (h % 3 === 0) continue;                 // sparse
      const axw = gx * G + (h % 600), ayw = gy * G + ((h >> 4) % 600);
      // apparent position: anchor plus extra motion against the camera
      const px = axw + (axw - camX) * (f - 1) - (camX - vw / 2);
      const py = ayw + (ayw - camY) * (f - 1) - (camY - vh / 2);
      if (px < -520 || px > vw + 520 || py < -320 || py > vh + 320) continue;
      // edges only — a frond cluster hovering mid-screen reads as a smudge
      if (px > vw * 0.2 && px < vw * 0.62 && py > vh * 0.2 && py < vh * 0.62) continue;
      const sway = Math.sin(game.time * 0.5 + h) * ATMOS_LIFE.PARA_SWAY;
      ctx.drawImage(Atmos.paraSprite, px + sway, py);
    }
  }
  ctx.globalAlpha = 1;
}

function bakeVignette(vw, vh, rim) {
  const c = makeCanvas(Math.max(2, vw), Math.max(2, vh));
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(vw / 2, vh / 2, Math.hypot(vw, vh) * 0.275,
    vw / 2, vh / 2, Math.hypot(vw, vh) * 0.62);
  g.addColorStop(0, withAlpha(rim, 0));
  g.addColorStop(1, withAlpha(rim, ATMOS.VIGNETTE_ALPHA));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, vw, vh);
  return c;
}
