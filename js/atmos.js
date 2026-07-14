// Atmosphere layer (graphics polish pass 1): drifting cloud shadows / sun
// patches, biome-tinted vignette + grade wash, and ONE global wind system
// that everything sways to. Bake-once rule: every soft element is rendered
// to an offscreen canvas at load/resize — runtime is drawImage/pattern fills
// only, no per-frame gradients or blurs.
const ATMOS = Object.freeze({
  CLOUD_TILE: 512,
  CLOUD_BLOBS: 26, CLOUD_R_MIN: 80, CLOUD_R_MAX: 250,
  SUN_BLOBS: 10, SUN_R_MIN: 150, SUN_R_MAX: 300,
  CLOUD_BLUR: 16,                  // one bake-time blur pass, never at runtime
  CLOUD_ALPHA: 0.11,               // forest dapple (multiply)
  SUN_ALPHA: 0.13,                 // desert sun patches (overlay)
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
}

// soft blob field, edge-wrapped so it tiles, fused with one bake-time blur
function bakeCloudTile(seed, blobs, rMin, rMax, color) {
  const S = ATMOS.CLOUD_TILE;
  const raw = makeCanvas(S, S);
  const ctx = raw.getContext('2d');
  const r = mulberry32(seed >>> 0);
  for (let i = 0; i < blobs; i++) {
    const x = r() * S, y = r() * S;
    const rad = rMin + r() * (rMax - rMin);
    const g = ctx.createRadialGradient(0, 0, rad * 0.12, 0, 0, rad);
    g.addColorStop(0, withAlpha(color, 0.5 + r() * 0.25));
    g.addColorStop(1, withAlpha(color, 0));
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        ctx.save();
        ctx.translate(x + dx * S, y + dy * S);
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(0, 0, rad, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
    }
  }
  const fused = makeCanvas(S, S);
  const fctx = fused.getContext('2d');
  fctx.filter = `blur(${ATMOS.CLOUD_BLUR}px)`;
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) fctx.drawImage(raw, dx * S, dy * S);
  }
  fctx.filter = 'none';
  return fused;
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
  fill(Atmos.patShadow, 1, Atmos.drift1, ATMOS.CLOUD_ALPHA * 2.4 * fA * 0.6);
  fill(Atmos.patShadow, ATMOS.LAYER2_SCALE, Atmos.drift2, ATMOS.CLOUD_ALPHA * 2.4 * fA * 0.4);
  fill(Atmos.patSun, ATMOS.LAYER2_SCALE * 0.9, Atmos.drift1, ATMOS.SUN_ALPHA * 1.6 * dA);
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
