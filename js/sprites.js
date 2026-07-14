// Pre-rendered procedural sprites. Everything is drawn once at load time into
// offscreen canvases (with seeded wobble for the forest style) and blitted at
// runtime. A sprite = { c: canvas, ax, ay } with (ax, ay) the world anchor
// (bottom-center of the object's footprint).
const SPRITES = {};
const SHADOW_DX = 7, SHADOW_DY = 10; // one global light direction for the desert

function sprite(w, h, ax, ay, draw) {
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  draw(ctx);
  return { c, ax, ay };
}

// Desert objects: draw the object via drawFn, then compose silhouette shadow
// (offset, sandShadow hue, crisp) underneath — never blur.
function flatSprite(w, h, ax, ay, drawFn, noShadow) {
  const tmp = makeCanvas(w, h);
  const tctx = tmp.getContext('2d');
  tctx.lineJoin = 'round'; tctx.lineCap = 'round';
  drawFn(tctx);
  return sprite(w + SHADOW_DX, h + SHADOW_DY, ax, ay, (ctx) => {
    if (!noShadow) {
      const sh = makeCanvas(w, h);
      const sctx = sh.getContext('2d');
      sctx.drawImage(tmp, 0, 0);
      sctx.globalCompositeOperation = 'source-in';
      sctx.fillStyle = PALETTE.desert.sandShadow;
      sctx.fillRect(0, 0, w, h);
      ctx.drawImage(sh, SHADOW_DX, SHADOW_DY);
    }
    ctx.drawImage(tmp, 0, 0);
  });
}

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

// lazily cached white-silhouette copy for the 100ms hit flash — pre-rendered
// via source-in, never a per-frame filter
function flashOf(spr) {
  if (!spr.flash) {
    const c = makeCanvas(spr.c.width, spr.c.height);
    const ctx = c.getContext('2d');
    ctx.drawImage(spr.c, 0, 0);
    ctx.globalCompositeOperation = 'source-in';
    ctx.fillStyle = PALETTE.fx.flash;
    ctx.fillRect(0, 0, c.width, c.height);
    spr.flash = c;
  }
  return spr.flash;
}

/* ---------------- desert props ---------------- */

function drawCactus(ctx, w, h, rng, withArm) {
  const D = PALETTE.desert;
  const bx = w * 0.5, bw = w * 0.72, bh = h * 0.62, by = h - bh;
  if (withArm) {
    rr(ctx, bx - bw * 0.72, by + bh * 0.3, bw * 0.42, bh * 0.55, bw * 0.21);
    ctx.fillStyle = D.cactusBody; ctx.fill();
  }
  rr(ctx, bx - bw / 2, by, bw, bh, bw * 0.32);
  ctx.fillStyle = D.cactusBody; ctx.fill();
  ctx.fillStyle = D.cactusRib;
  const ribs = 3 + ((rng() * 2) | 0);
  for (let i = 0; i < ribs; i++) {
    const t = (i + 1) / (ribs + 1);
    const rx = bx - bw / 2 + bw * t;
    rr(ctx, rx - bw * 0.045, by + bh * 0.12, bw * 0.09, bh * 0.74, bw * 0.05);
    ctx.fill();
  }
  // blossom: ring of petals + small center
  const fx = bx, fy = by + bh * 0.02;
  const fr = bw * 0.26;
  const petalColor = rng() < 0.25 ? D.blossomYellow : D.blossom;
  ctx.fillStyle = petalColor;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    ctx.beginPath();
    ctx.ellipse(fx + Math.cos(a) * fr * 0.7, fy + Math.sin(a) * fr * 0.55, fr * 0.5, fr * 0.4, a, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = petalColor === D.blossom ? D.blossomLight : D.bone;
  ctx.beginPath(); ctx.arc(fx, fy, fr * 0.34, 0, Math.PI * 2); ctx.fill();
}

function drawRock(ctx, w, h, rng) {
  const D = PALETTE.desert;
  // irregular polygon with a light top facet and dark base
  const cx = w / 2, cy = h * 0.55;
  const n = 6 + ((rng() * 2) | 0);
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    const rx = (w / 2) * (0.75 + rng() * 0.25);
    const ry = (h / 2) * (0.75 + rng() * 0.25);
    pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry * 0.9]);
  }
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
  ctx.closePath();
  ctx.fillStyle = D.rockDark; ctx.fill();
  // light facets on the upper-left (toward the light)
  ctx.fillStyle = D.rockLight;
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  ctx.lineTo(pts[1][0], pts[1][1]);
  ctx.lineTo(cx + (rng() - 0.5) * w * 0.15, cy + (rng() - 0.3) * h * 0.2);
  ctx.lineTo(pts[n - 1][0], pts[n - 1][1]);
  ctx.closePath(); ctx.fill();
}

function drawSkull(ctx, w, h) {
  const D = PALETTE.desert;
  const cx = w / 2;
  // sweeping horns, drawn first so the cranium overlaps their base
  ctx.fillStyle = D.bone;
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(cx + s * w * 0.14, h * 0.3);
    ctx.quadraticCurveTo(cx + s * w * 0.42, h * 0.3, cx + s * w * 0.47, h * 0.13);
    ctx.quadraticCurveTo(cx + s * w * 0.485, h * 0.075, cx + s * w * 0.43, h * 0.055);
    ctx.quadraticCurveTo(cx + s * w * 0.4, h * 0.12, cx + s * w * 0.3, h * 0.165);
    ctx.quadraticCurveTo(cx + s * w * 0.2, h * 0.2, cx + s * w * 0.12, h * 0.2);
    ctx.closePath(); ctx.fill();
  }
  ctx.fillStyle = D.boneShade;
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(cx + s * w * 0.44, h * 0.095, w * 0.032, h * 0.035, s * 0.5, 0, Math.PI * 2);
    ctx.fill();
  }
  // cranium
  ctx.fillStyle = D.bone;
  ctx.beginPath();
  ctx.ellipse(cx, h * 0.3, w * 0.3, h * 0.21, 0, 0, Math.PI * 2);
  ctx.fill();
  // snout, long and rounded at the tip
  rr(ctx, cx - w * 0.17, h * 0.34, w * 0.34, h * 0.54, w * 0.16);
  ctx.fill();
  // crack line + snout bridge shade
  ctx.fillStyle = D.boneShade;
  rr(ctx, cx - w * 0.025, h * 0.14, w * 0.05, h * 0.14, w * 0.025);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx, h * 0.52, w * 0.13, h * 0.04, 0, 0, Math.PI * 2);
  ctx.fill();
  // eye sockets: dark angled ovals on the cranium sides
  ctx.fillStyle = PALETTE.desert.rockDark;
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(cx + s * w * 0.2, h * 0.37, w * 0.05, h * 0.048, s * 0.35, 0, Math.PI * 2);
    ctx.fill();
  }
  // nostrils
  ctx.fillStyle = D.boneShade;
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(cx + s * w * 0.06, h * 0.78, w * 0.028, h * 0.04, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawRib(ctx, w, h, rng) {
  const D = PALETTE.desert;
  const flip = rng() < 0.5 ? -1 : 1;
  ctx.save();
  if (flip < 0) { ctx.translate(w, 0); ctx.scale(-1, 1); }
  ctx.fillStyle = D.bone;
  ctx.beginPath();
  ctx.moveTo(w * 0.2, h * 0.95);
  ctx.quadraticCurveTo(w * 0.05, h * 0.4, w * 0.5, h * 0.08);
  ctx.quadraticCurveTo(w * 0.68, h * 0.0, w * 0.8, h * 0.1);
  ctx.quadraticCurveTo(w * 0.6, h * 0.18, w * 0.52, h * 0.42);
  ctx.quadraticCurveTo(w * 0.46, h * 0.7, w * 0.52, h * 0.98);
  ctx.quadraticCurveTo(w * 0.34, h * 1.02, w * 0.2, h * 0.95);
  ctx.closePath(); ctx.fill();
  ctx.restore();
}

function drawKnuckle(ctx, w, h, rng) {
  const D = PALETTE.desert;
  ctx.fillStyle = D.bone;
  const r = w * 0.26;
  rr(ctx, w * 0.14, h * 0.2, w * 0.72, h * 0.62, r);
  ctx.fill();
  ctx.beginPath(); ctx.arc(w * 0.28, h * 0.28, r * 0.9, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(w * 0.7, h * 0.24, r * 0.8, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = D.boneShade;
  ctx.beginPath();
  ctx.ellipse(w * 0.5, h * 0.66, w * 0.24, h * 0.12, 0.1 * (rng() - 0.5), 0, Math.PI * 2);
  ctx.fill();
}

/* ---------------- forest props ---------------- */

function blobShadow(ctx, cx, cy, rx, ry) {
  ctx.fillStyle = withAlpha(PALETTE.forest.blobShadow, 0.25);
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawTreeRound(ctx, w, h, rng) {
  const F = PALETTE.forest;
  const cx = w / 2, cy = h * 0.42, rx = w * 0.42, ry = h * 0.34;
  blobShadow(ctx, cx, h * 0.9, rx * 0.85, ry * 0.32);
  // trunk peeking out
  ctx.strokeStyle = F.ink; ctx.lineWidth = 2.4;
  ctx.fillStyle = F.trunk;
  rr(ctx, cx - w * 0.05, h * 0.62, w * 0.1, h * 0.28, w * 0.04);
  ctx.fill(); ctx.stroke();
  // canopy: dark base cloud, mid cloud, light top clump
  Sketch.cloud(ctx, cx, cy + ry * 0.12, rx, ry, 9, rng, { fill: F.canopyDark, stroke: F.ink, lineWidth: 2.6, rough: 2.2 });
  Sketch.cloud(ctx, cx - rx * 0.1, cy - ry * 0.12, rx * 0.72, ry * 0.66, 8, rng, { fill: F.canopyMid, rough: 2 });
  Sketch.cloud(ctx, cx - rx * 0.18, cy - ry * 0.32, rx * 0.4, ry * 0.34, 7, rng, { fill: F.canopyLight, rough: 1.6 });
  // interior leaf squiggles
  ctx.strokeStyle = withAlpha(F.ink, 0.45); ctx.lineWidth = 1.4;
  for (let i = 0; i < 6; i++) {
    Sketch.squiggle(ctx, cx + (rng() - 0.5) * rx * 1.3, cy + (rng() - 0.5) * ry * 1.2, 3 + rng() * 4, rng);
  }
}

function drawTreeConifer(ctx, w, h, rng) {
  const F = PALETTE.forest;
  const cx = w / 2;
  blobShadow(ctx, cx, h * 0.93, w * 0.3, h * 0.05);
  ctx.strokeStyle = F.ink; ctx.lineWidth = 2.2;
  ctx.fillStyle = F.trunk;
  rr(ctx, cx - w * 0.045, h * 0.78, w * 0.09, h * 0.16, w * 0.03);
  ctx.fill(); ctx.stroke();
  const tiers = 3;
  for (let i = tiers - 1; i >= 0; i--) {
    const t = i / (tiers - 1);
    const ty = h * (0.28 + 0.42 * t);
    const trx = w * (0.2 + 0.26 * t);
    Sketch.cloud(ctx, cx, ty, trx, h * 0.14, 7, rng, {
      fill: i === 0 ? F.canopyMid : F.canopyDark,
      stroke: F.ink, lineWidth: 2.4, rough: 1.8,
    });
  }
  ctx.strokeStyle = withAlpha(F.ink, 0.4); ctx.lineWidth = 1.3;
  for (let i = 0; i < 4; i++) {
    Sketch.squiggle(ctx, cx + (rng() - 0.5) * w * 0.4, h * (0.35 + rng() * 0.35), 2.5 + rng() * 3, rng);
  }
}

function drawBarrel(ctx, w, h, rng) {
  const F = PALETTE.forest;
  blobShadow(ctx, w / 2, h * 0.92, w * 0.42, h * 0.09);
  ctx.fillStyle = F.woodLight;
  ctx.strokeStyle = F.ink; ctx.lineWidth = 2.2;
  rr(ctx, w * 0.12, h * 0.08, w * 0.76, h * 0.82, w * 0.16);
  ctx.fill();
  // plank seams + hoops
  ctx.strokeStyle = withAlpha(F.ink, 0.5); ctx.lineWidth = 1.4;
  Sketch.line(ctx, w * 0.38, h * 0.12, w * 0.36, h * 0.86, rng, { rough: 1 });
  Sketch.line(ctx, w * 0.62, h * 0.12, w * 0.64, h * 0.86, rng, { rough: 1 });
  ctx.strokeStyle = F.ink; ctx.lineWidth = 2.6;
  Sketch.line(ctx, w * 0.12, h * 0.3, w * 0.88, h * 0.3, rng, { rough: 1.2 });
  Sketch.line(ctx, w * 0.12, h * 0.66, w * 0.88, h * 0.66, rng, { rough: 1.2 });
  ctx.lineWidth = 2.2;
  ctx.beginPath(); ctx.roundRect(w * 0.12, h * 0.08, w * 0.76, h * 0.82, w * 0.16); ctx.stroke();
}

function drawPalisade(ctx, w, h, rng) {
  const F = PALETTE.forest;
  const planks = 6;
  const pw = w / planks;
  blobShadow(ctx, w / 2, h * 0.93, w * 0.46, h * 0.05);
  for (let i = 0; i < planks; i++) {
    const x = i * pw + pw * 0.08;
    const ph = h * (0.72 + (rng() - 0.5) * 0.12);
    const top = h * 0.9 - ph;
    ctx.fillStyle = i % 2 ? F.woodLight : shade(F.woodLight, 0.92);
    ctx.beginPath();
    ctx.moveTo(x, top + pw * 0.5);
    ctx.lineTo(x + pw * 0.42, top);
    ctx.lineTo(x + pw * 0.84, top + pw * 0.5);
    ctx.lineTo(x + pw * 0.84, h * 0.9);
    ctx.lineTo(x, h * 0.9);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = F.ink; ctx.lineWidth = 2;
    ctx.stroke();
    ctx.strokeStyle = withAlpha(F.ink, 0.35); ctx.lineWidth = 1.2;
    Sketch.line(ctx, x + pw * 0.42, top + pw * 0.6, x + pw * 0.42, h * 0.86, rng, { rough: 1, passes: 1 });
  }
  // cross beam
  ctx.fillStyle = shade(F.woodLight, 0.85);
  rr(ctx, 0, h * 0.5, w, h * 0.09, 4);
  ctx.fill();
  ctx.strokeStyle = F.ink; ctx.lineWidth = 2;
  ctx.stroke();
}

function drawSign(ctx, w, h, rng) {
  const F = PALETTE.forest;
  blobShadow(ctx, w / 2, h * 0.94, w * 0.34, h * 0.05);
  ctx.strokeStyle = F.ink; ctx.lineWidth = 2.2;
  ctx.fillStyle = shade(F.woodLight, 0.9);
  // legs
  rr(ctx, w * 0.2, h * 0.5, w * 0.08, h * 0.44, 3); ctx.fill(); ctx.stroke();
  rr(ctx, w * 0.72, h * 0.5, w * 0.08, h * 0.44, 3); ctx.fill(); ctx.stroke();
  // board
  ctx.fillStyle = F.cream;
  rr(ctx, w * 0.08, h * 0.06, w * 0.84, h * 0.52, 6);
  ctx.fill(); ctx.stroke();
  ctx.strokeStyle = withAlpha(F.ink, 0.4); ctx.lineWidth = 1.2;
  Sketch.line(ctx, w * 0.12, h * 0.32, w * 0.88, h * 0.32, rng, { rough: 0.8, passes: 1 });
  // purple skull mark
  const P = PALETTE.forest.pond;
  const cx = w / 2, cy = h * 0.3;
  ctx.fillStyle = P;
  ctx.beginPath(); ctx.arc(cx, cy - h * 0.03, w * 0.13, 0, Math.PI * 2); ctx.fill();
  rr(ctx, cx - w * 0.08, cy + h * 0.03, w * 0.16, h * 0.09, 3); ctx.fill();
  ctx.fillStyle = F.cream;
  ctx.beginPath(); ctx.arc(cx - w * 0.05, cy - h * 0.04, w * 0.035, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(cx + w * 0.05, cy - h * 0.04, w * 0.035, 0, Math.PI * 2); ctx.fill();
}

function drawStone(ctx, w, h, rng) {
  const F = PALETTE.forest;
  blobShadow(ctx, w / 2, h * 0.82, w * 0.4, h * 0.14);
  Sketch.blob(ctx, Sketch.ellipsePts(w / 2, h * 0.5, w * 0.4, h * 0.34, 8, rng, 0.15), rng, {
    fill: F.stone, stroke: F.ink, lineWidth: 1.8, rough: 1.2,
  });
  ctx.strokeStyle = withAlpha(F.ink, 0.35); ctx.lineWidth = 1;
  Sketch.line(ctx, w * 0.35, h * 0.55, w * 0.55, h * 0.6, rng, { rough: 0.8, passes: 1 });
}

function drawMushroom(ctx, w, h, rng) {
  const F = PALETTE.forest;
  ctx.strokeStyle = F.ink; ctx.lineWidth = 1.6;
  ctx.fillStyle = F.cream;
  rr(ctx, w * 0.38, h * 0.45, w * 0.24, h * 0.45, w * 0.1);
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = PALETTE.forest.letterStamp;
  ctx.beginPath();
  ctx.ellipse(w / 2, h * 0.4, w * 0.34, h * 0.28, 0, Math.PI, 0);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = F.cream;
  ctx.beginPath(); ctx.arc(w * 0.42, h * 0.3, w * 0.05, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(w * 0.6, h * 0.33, w * 0.04, 0, Math.PI * 2); ctx.fill();
}

function drawGrassTuft(ctx, w, h, rng) {
  const F = PALETTE.forest;
  ctx.strokeStyle = F.grass; ctx.lineWidth = 1.8;
  const n = 3 + ((rng() * 3) | 0);
  for (let i = 0; i < n; i++) {
    const x = w * (0.2 + 0.6 * (i / (n - 1 || 1)));
    const lean = (rng() - 0.5) * w * 0.4;
    ctx.beginPath();
    ctx.moveTo(x, h);
    ctx.quadraticCurveTo(x + lean * 0.3, h * 0.5, x + lean, h * (0.1 + rng() * 0.2));
    ctx.stroke();
  }
}

function drawLeaf(ctx, w, h, rng) {
  const F = PALETTE.forest;
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.rotate(rng() * Math.PI * 2);
  ctx.fillStyle = withAlpha(F.canopyMid, 0.9);
  ctx.strokeStyle = withAlpha(F.ink, 0.6); ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(0, 0, w * 0.32, h * 0.16, 0, 0, Math.PI * 2);
  ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-w * 0.3, 0); ctx.lineTo(w * 0.3, 0); ctx.stroke();
  ctx.restore();
}

function drawLetter(ctx, w, h, rng) {
  const F = PALETTE.forest;
  blobShadow(ctx, w / 2, h * 0.85, w * 0.4, h * 0.12);
  ctx.save();
  ctx.translate(w / 2, h * 0.48);
  ctx.rotate(-0.12);
  ctx.fillStyle = F.cream;
  ctx.strokeStyle = F.ink; ctx.lineWidth = 2;
  rr(ctx, -w * 0.36, -h * 0.26, w * 0.72, h * 0.52, 3);
  ctx.fill(); ctx.stroke();
  ctx.strokeStyle = withAlpha(F.ink, 0.55); ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(-w * 0.36, -h * 0.26);
  ctx.lineTo(0, h * 0.06);
  ctx.lineTo(w * 0.36, -h * 0.26);
  ctx.stroke();
  ctx.fillStyle = PALETTE.forest.letterStamp;
  ctx.beginPath(); ctx.arc(0, -h * 0.02, w * 0.09, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

/* ---------------- characters ---------------- */

// The hooded adventurer. dir: 0 down, 1 up, 2 left, 3 right. frame: 0/1.
// style: 'forest' (ink outline + blob shadow) or 'desert' (no outline + flat offset shadow)
function drawPlayerBody(ctx, w, h, rng, dir, frame, outline) {
  const F = PALETTE.forest;
  const cx = w / 2;
  const bob = frame ? 1.5 : 0;
  const stepL = frame ? 2.5 : 0, stepR = frame ? -2.5 : 0;
  ctx.strokeStyle = F.ink;
  ctx.lineWidth = 2.2;
  const flip = dir === 2 ? -1 : 1;
  ctx.save();
  if (dir === 2) { ctx.translate(w, 0); ctx.scale(-1, 1); }

  // (staff is a separate animated layer — see SPRITES.staff)
  const side = dir === 2 || dir === 3;
  const staffX = side ? cx + 13 : cx + 15;

  // feet
  ctx.fillStyle = F.ink;
  ctx.beginPath(); ctx.ellipse(cx - 6, h * 0.92 + stepL * 0.4, 4.5, 3, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(cx + 6, h * 0.92 + stepR * 0.4, 4.5, 3, 0, 0, Math.PI * 2); ctx.fill();

  // cloak body (rounded triangle)
  ctx.fillStyle = F.hood;
  ctx.strokeStyle = F.ink; ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(cx, h * 0.28 + bob);
  ctx.quadraticCurveTo(cx - 17, h * 0.5 + bob, cx - 13, h * 0.88);
  ctx.quadraticCurveTo(cx, h * 0.94, cx + 13, h * 0.88);
  ctx.quadraticCurveTo(cx + 17, h * 0.5 + bob, cx, h * 0.28 + bob);
  ctx.closePath();
  ctx.fill();
  if (outline) ctx.stroke();
  // cloak shade panel
  ctx.fillStyle = F.hoodDark;
  ctx.beginPath();
  ctx.moveTo(cx + 2, h * 0.34 + bob);
  ctx.quadraticCurveTo(cx + 14, h * 0.55 + bob, cx + 10, h * 0.86);
  ctx.quadraticCurveTo(cx + 13, h * 0.6 + bob, cx + 2, h * 0.34 + bob);
  ctx.closePath(); ctx.fill();

  // hand + staff grip
  ctx.fillStyle = F.hood;
  ctx.beginPath(); ctx.arc(staffX - 1, h * 0.55 + bob, 4, 0, Math.PI * 2); ctx.fill();
  if (outline) { ctx.strokeStyle = F.ink; ctx.lineWidth = 1.6; ctx.stroke(); }

  // pointed hood (big, covers eyes)
  ctx.fillStyle = F.hood;
  ctx.strokeStyle = F.ink; ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(cx - 12, h * 0.34 + bob);
  ctx.quadraticCurveTo(cx - 14, h * 0.16 + bob, cx - 2, h * 0.06 + bob);
  ctx.quadraticCurveTo(cx + 4, h * 0.03 + bob, cx + 6, h * 0.1 + bob);
  ctx.quadraticCurveTo(cx + 15, h * 0.2 + bob, cx + 12, h * 0.36 + bob);
  ctx.quadraticCurveTo(cx, h * 0.46 + bob, cx - 12, h * 0.34 + bob);
  ctx.closePath();
  ctx.fill();
  if (outline) ctx.stroke();

  if (dir !== 1) {
    // face shadow under hood with a hint of chin
    ctx.fillStyle = F.ink;
    ctx.beginPath();
    ctx.ellipse(cx + (side ? 4 : 0), h * 0.36 + bob, 8.5, 4.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = shade(F.cream, 0.92);
    ctx.beginPath();
    ctx.ellipse(cx + (side ? 5 : 0), h * 0.395 + bob, 5.5, 2.2, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  return flip;
}

function drawOgre(ctx, w, h, rng, frame) {
  const F = PALETTE.forest;
  const cx = w / 2;
  const bob = frame ? 2 : 0;
  blobShadow(ctx, cx, h * 0.95, w * 0.36, h * 0.05);
  ctx.strokeStyle = F.ink; ctx.lineWidth = 2.8;

  // feet
  ctx.fillStyle = F.ink;
  ctx.beginPath(); ctx.ellipse(cx - w * 0.14, h * 0.93, w * 0.075, h * 0.03, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(cx + w * 0.14, h * 0.93, w * 0.075, h * 0.03, 0, 0, Math.PI * 2); ctx.fill();

  // arms hang beside the body
  for (const s of [-1, 1]) {
    ctx.fillStyle = F.ogreRed;
    rr(ctx, cx + s * w * 0.34 - w * 0.06, h * 0.34 + bob, w * 0.12, h * 0.4, w * 0.06);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = F.cream;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(cx + s * w * 0.34 - w * 0.03 + i * w * 0.03, h * 0.73 + bob);
      ctx.lineTo(cx + s * w * 0.34 - w * 0.035 + i * w * 0.03, h * 0.77 + bob);
      ctx.lineTo(cx + s * w * 0.34 - w * 0.015 + i * w * 0.03, h * 0.74 + bob);
      ctx.closePath(); ctx.fill();
    }
  }

  // black shorts (bottom half)
  ctx.fillStyle = F.ogreBlack;
  rr(ctx, cx - w * 0.26, h * 0.6 + bob * 0.4, w * 0.52, h * 0.32, w * 0.1);
  ctx.fill(); ctx.stroke();

  // big round red body
  ctx.fillStyle = F.ogreRed;
  ctx.beginPath();
  ctx.ellipse(cx, h * 0.42 + bob, w * 0.3, h * 0.31, 0, 0, Math.PI * 2);
  ctx.fill(); ctx.stroke();

  // fur stitch line down the middle
  ctx.strokeStyle = F.ogreDark; ctx.lineWidth = 2;
  Sketch.line(ctx, cx, h * 0.14 + bob, cx, h * 0.36 + bob, rng, { rough: 1, passes: 1 });
  for (let i = 0; i < 3; i++) {
    const y = h * (0.17 + i * 0.06) + bob;
    Sketch.line(ctx, cx - w * 0.025, y, cx + w * 0.025, y, rng, { rough: 0.6, passes: 1 });
  }
  // fur ticks around silhouette
  ctx.strokeStyle = F.ink; ctx.lineWidth = 1.6;
  for (let i = 0; i < 8; i++) {
    const a = Math.PI * (0.15 + 0.7 * (i / 7)) + Math.PI;
    const x = cx + Math.cos(a) * w * 0.3, y = h * 0.42 + bob + Math.sin(a) * h * 0.31;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * 4, y + Math.sin(a) * 4);
    ctx.stroke();
  }

  // horns
  ctx.fillStyle = F.cream;
  ctx.strokeStyle = F.ink; ctx.lineWidth = 2;
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(cx + s * w * 0.18, h * 0.16 + bob);
    ctx.quadraticCurveTo(cx + s * w * 0.26, h * 0.06 + bob, cx + s * w * 0.29, h * 0.11 + bob);
    ctx.quadraticCurveTo(cx + s * w * 0.26, h * 0.16 + bob, cx + s * w * 0.2, h * 0.2 + bob);
    ctx.closePath(); ctx.fill(); ctx.stroke();
  }

  // eyes: yellow with dark pupils, slightly cross
  for (const s of [-1, 1]) {
    ctx.fillStyle = F.ogreEye;
    ctx.beginPath();
    ctx.ellipse(cx + s * w * 0.11, h * 0.3 + bob, w * 0.065, h * 0.05, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = F.ink; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = F.ink;
    ctx.beginPath();
    ctx.arc(cx + s * w * 0.09, h * 0.31 + bob, w * 0.02, 0, Math.PI * 2);
    ctx.fill();
  }
  // brow
  ctx.strokeStyle = F.ink; ctx.lineWidth = 2.4;
  Sketch.line(ctx, cx - w * 0.17, h * 0.24 + bob, cx - w * 0.05, h * 0.26 + bob, rng, { rough: 0.8, passes: 1 });
  Sketch.line(ctx, cx + w * 0.05, h * 0.26 + bob, cx + w * 0.17, h * 0.24 + bob, rng, { rough: 0.8, passes: 1 });

  // mouth with underbite tusks
  ctx.fillStyle = F.ogreDark;
  rr(ctx, cx - w * 0.13, h * 0.38 + bob, w * 0.26, h * 0.09, w * 0.045);
  ctx.fill();
  ctx.strokeStyle = F.ink; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = F.cream;
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(cx + s * w * 0.09, h * 0.46 + bob);
    ctx.lineTo(cx + s * w * 0.11, h * 0.39 + bob);
    ctx.lineTo(cx + s * w * 0.05, h * 0.44 + bob);
    ctx.closePath(); ctx.fill(); ctx.stroke();
  }

  // white skulls on the shorts
  ctx.fillStyle = F.cream;
  for (const s of [-1, 1]) {
    const sx = cx + s * w * 0.12, sy = h * 0.72 + bob * 0.4;
    ctx.beginPath(); ctx.arc(sx, sy, w * 0.045, 0, Math.PI * 2); ctx.fill();
    rr(ctx, sx - w * 0.025, sy + w * 0.03, w * 0.05, w * 0.03, 2); ctx.fill();
    ctx.fillStyle = F.ogreBlack;
    ctx.beginPath(); ctx.arc(sx - w * 0.017, sy - w * 0.008, w * 0.011, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(sx + w * 0.017, sy - w * 0.008, w * 0.011, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = F.cream;
  }
}

function drawSlime(ctx, w, h, rng, frame) {
  const F = PALETTE.forest;
  const squish = frame ? 0.85 : 1;
  const cx = w / 2, ry = h * 0.36 * squish, rx = w * 0.38 / squish;
  blobShadow(ctx, cx, h * 0.88, rx * 0.9, h * 0.08);
  Sketch.blob(ctx, Sketch.ellipsePts(cx, h * 0.82 - ry, rx, ry, 9, rng, 0.08), rng, {
    fill: F.slime, stroke: F.ink, lineWidth: 2.2, rough: 1.2,
  });
  ctx.fillStyle = F.slimeDark;
  ctx.beginPath();
  ctx.ellipse(cx, h * 0.82 - ry * 0.3, rx * 0.75, ry * 0.35, 0, 0, Math.PI);
  ctx.fill();
  // content face
  ctx.fillStyle = F.ink;
  ctx.beginPath(); ctx.arc(cx - rx * 0.35, h * 0.82 - ry * 1.1, 2.2, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(cx + rx * 0.35, h * 0.82 - ry * 1.1, 2.2, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = F.ink; ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.arc(cx, h * 0.82 - ry * 1.05, rx * 0.22, 0.2, Math.PI - 0.2);
  ctx.stroke();
}

function drawWatcher(ctx, w, h, rng) {
  const F = PALETTE.forest;
  const cx = w / 2, cy = h * 0.5;
  blobShadow(ctx, cx, h * 0.9, w * 0.34, h * 0.08);
  // tentacle nubs
  ctx.fillStyle = F.watcher;
  ctx.strokeStyle = F.ink; ctx.lineWidth = 2;
  for (let i = 0; i < 5; i++) {
    const a = Math.PI * (0.15 + 0.7 * (i / 4));
    const x = cx + Math.cos(a + Math.PI) * w * 0.28;
    const y = h * 0.72 + Math.sin(a) * h * 0.14;
    ctx.beginPath();
    ctx.ellipse(x, y + h * 0.08, w * 0.07, h * 0.12, (a - Math.PI / 2) * 0.4, 0, Math.PI * 2);
    ctx.fill();
  }
  // round body
  Sketch.blob(ctx, Sketch.ellipsePts(cx, cy, w * 0.32, h * 0.3, 9, rng, 0.06), rng, {
    fill: F.watcher, stroke: F.ink, lineWidth: 2.2, rough: 1,
  });
  // huge eye (pupil drawn at runtime so it can track the player)
  ctx.fillStyle = F.ogreEye;
  ctx.strokeStyle = F.ink; ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(cx, cy, w * 0.2, h * 0.19, 0, 0, Math.PI * 2);
  ctx.fill(); ctx.stroke();
}

/* ---------------- build everything ---------------- */

// The Great Stump — the dungeon entrance landmark: a colossal cut stump with
// a dark doorway and two sconce torches, drawn in the storybook ink treatment.
function drawStump(ctx, w, h, rng) {
  const F = PALETTE.forest, DN = PALETTE.dungeon;
  const cx = w / 2;
  blobShadow(ctx, cx, h - 8, w * 0.42, 12);
  // root flares
  ctx.fillStyle = F.trunk;
  for (const [dx, rw] of [[-w * 0.38, 26], [w * 0.38, 26], [-w * 0.18, 20], [w * 0.2, 20]]) {
    Sketch.blob(ctx, [
      [cx + dx - rw, h - 8], [cx + dx - rw * 0.3, h - 30],
      [cx + dx + rw * 0.3, h - 32], [cx + dx + rw, h - 8],
    ], rng, { fill: F.trunk, stroke: F.ink, lineWidth: 2.4, rough: 2 });
  }
  // main trunk body — wide, slightly tapered, scalloped bark edge
  const bodyPts = [];
  const topY = h * 0.24, botY = h - 10;
  for (let i = 0; i <= 6; i++) {
    bodyPts.push([cx - w * 0.44 + (i / 6) * 0.06 * w * (i % 2 ? 1 : 0.4), botY - (i / 6) * (botY - topY)]);
  }
  for (let i = 0; i <= 6; i++) {
    bodyPts.push([cx - w * 0.38 + (i / 6) * w * 0.76, topY + (i % 2 ? 3 : -3)]);
  }
  for (let i = 0; i <= 6; i++) {
    bodyPts.push([cx + w * 0.44 - (i / 6) * 0.06 * w * (i % 2 ? 1 : 0.4), topY + (i / 6) * (botY - topY)]);
  }
  Sketch.blob(ctx, bodyPts, rng, { fill: F.trunk, stroke: F.ink, lineWidth: 3, rough: 2.6 });
  // cut top: ellipse with growth rings
  ctx.save();
  Sketch.ellipse(ctx, cx, topY, w * 0.41, h * 0.1, rng, { fill: F.woodLight, stroke: F.ink, lineWidth: 3, rough: 2 });
  ctx.strokeStyle = withAlpha(F.trunk, 0.75);
  ctx.lineWidth = 2;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.ellipse(cx, topY, w * (0.3 - i * 0.09), h * (0.072 - i * 0.02), 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
  // bark texture squiggles
  ctx.strokeStyle = withAlpha(F.ink, 0.5);
  ctx.lineWidth = 1.8;
  for (let i = 0; i < 7; i++) {
    const bx = cx - w * 0.34 + rng() * w * 0.68;
    const by = topY + h * 0.16 + rng() * (h * 0.4);
    Sketch.line(ctx, bx, by, bx + (rng() - 0.5) * 6, by + 12 + rng() * 16, rng, { rough: 1.6, passes: 1 });
  }
  // the doorway: dark arch with a worn stone step
  const dw = w * 0.2, dh = h * 0.3, dy = h - 12;
  ctx.fillStyle = DN.dark;
  ctx.beginPath();
  ctx.moveTo(cx - dw, dy);
  ctx.lineTo(cx - dw, dy - dh * 0.6);
  ctx.quadraticCurveTo(cx, dy - dh * 1.25, cx + dw, dy - dh * 0.6);
  ctx.lineTo(cx + dw, dy);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = F.ink; ctx.lineWidth = 2.6;
  ctx.stroke();
  ctx.fillStyle = F.stone;
  ctx.strokeStyle = F.ink; ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(cx - dw - 4, dy - 5, dw * 2 + 8, 9, 4);
  ctx.fill(); ctx.stroke();
  // sconce torches flanking the door (flames animated at runtime by world code? no — baked cozy embers)
  for (const side of [-1, 1]) {
    const tx = cx + side * (dw + 16), ty = dy - dh * 0.66;
    ctx.strokeStyle = F.ink; ctx.lineWidth = 2.2;
    ctx.fillStyle = F.hoodDark;
    rr(ctx, tx - 3, ty, 6, 18, 3); ctx.fill(); ctx.stroke();
    ctx.fillStyle = DN.torchFlame;
    Sketch.blob(ctx, [[tx - 5, ty + 2], [tx, ty - 12], [tx + 5, ty + 2], [tx, ty + 5]], rng,
      { fill: DN.torchFlame, stroke: F.ink, lineWidth: 1.8, rough: 1.2 });
    ctx.fillStyle = DN.torchGlow;
    ctx.beginPath(); ctx.arc(tx, ty - 1, 2.4, 0, Math.PI * 2); ctx.fill();
  }
}

// wall torch used inside the dungeon: bracket + shaft baked; the flame is
// drawn animated at runtime on top of the sconce anchor
function drawTorchSconce(ctx, w, h, rng) {
  const F = PALETTE.forest;
  ctx.strokeStyle = F.ink; ctx.lineWidth = 2;
  ctx.fillStyle = PALETTE.dungeon.iron;
  rr(ctx, w / 2 - 5, h - 10, 10, 7, 2.5); ctx.fill(); ctx.stroke();
  ctx.fillStyle = F.hoodDark;
  rr(ctx, w / 2 - 2.6, h - 22, 5.2, 14, 2.4); ctx.fill(); ctx.stroke();
}

function buildSprites(seedInt) {
  const R = mulberry32(seedInt ^ 0x5157);

  SPRITES.cactus = [];
  for (let i = 0; i < 6; i++) {
    const s = [1, 0.75, 0.55][i % 3];
    const w = 74 * s, h = 88 * s;
    SPRITES.cactus.push(flatSprite(w, h, w / 2, h - 2, (ctx) => drawCactus(ctx, w, h, R, i % 2 === 0 && s > 0.6)));
  }
  SPRITES.rock = [];
  for (let i = 0; i < 5; i++) {
    const s = 0.5 + R() * 0.9;
    const w = 90 * s, h = 66 * s;
    SPRITES.rock.push(flatSprite(w, h, w / 2, h - 4, (ctx) => drawRock(ctx, w, h, R)));
  }
  SPRITES.skull = flatSprite(150, 190, 75, 170, (ctx) => drawSkull(ctx, 150, 190));
  SPRITES.rib = [];
  for (let i = 0; i < 4; i++) {
    const s = 0.6 + R() * 0.6;
    const w = 46 * s, h = 80 * s;
    SPRITES.rib.push(flatSprite(w, h, w / 2, h - 2, (ctx) => drawRib(ctx, w, h, R)));
  }
  SPRITES.knuckle = [];
  for (let i = 0; i < 4; i++) {
    const s = 0.7 + R() * 0.6;
    const w = 40 * s, h = 32 * s;
    SPRITES.knuckle.push(flatSprite(w, h, w / 2, h - 2, (ctx) => drawKnuckle(ctx, w, h, R)));
  }

  SPRITES.treeRound = [];
  for (let i = 0; i < 5; i++) {
    const s = 0.8 + R() * 0.5;
    const w = 150 * s, h = 160 * s;
    SPRITES.treeRound.push(sprite(w, h, w / 2, h * 0.9, (ctx) => drawTreeRound(ctx, w, h, R)));
  }
  SPRITES.treeConifer = [];
  for (let i = 0; i < 4; i++) {
    const s = 0.75 + R() * 0.5;
    const w = 110 * s, h = 150 * s;
    SPRITES.treeConifer.push(sprite(w, h, w / 2, h * 0.93, (ctx) => drawTreeConifer(ctx, w, h, R)));
  }
  SPRITES.barrel = [sprite(44, 52, 22, 48, (ctx) => drawBarrel(ctx, 44, 52, R)),
                    sprite(38, 46, 19, 43, (ctx) => drawBarrel(ctx, 38, 46, R))];
  SPRITES.palisade = [sprite(130, 96, 65, 88, (ctx) => drawPalisade(ctx, 130, 96, R)),
                      sprite(130, 96, 65, 88, (ctx) => drawPalisade(ctx, 130, 96, R))];
  SPRITES.sign = sprite(76, 86, 38, 82, (ctx) => drawSign(ctx, 76, 86, R));
  SPRITES.stone = [];
  for (let i = 0; i < 4; i++) {
    const s = 0.6 + R() * 0.9;
    const w = 34 * s, h = 26 * s;
    SPRITES.stone.push(sprite(w, h, w / 2, h * 0.8, (ctx) => drawStone(ctx, w, h, R)));
  }
  SPRITES.mushroom = [sprite(20, 22, 10, 20, (ctx) => drawMushroom(ctx, 20, 22, R))];
  SPRITES.grass = [];
  for (let i = 0; i < 4; i++) {
    SPRITES.grass.push(sprite(20, 16, 10, 15, (ctx) => drawGrassTuft(ctx, 20, 16, R)));
  }
  SPRITES.leaf = [];
  for (let i = 0; i < 3; i++) {
    SPRITES.leaf.push(sprite(14, 14, 7, 10, (ctx) => drawLeaf(ctx, 14, 14, R)));
  }
  SPRITES.letter = sprite(40, 32, 20, 28, (ctx) => drawLetter(ctx, 40, 32, R));

  SPRITES.heart = sprite(26, 26, 13, 22, (ctx) => {
    const F = PALETTE.forest;
    blobShadow(ctx, 13, 22, 8, 3);
    ctx.fillStyle = PALETTE.fx.heart;
    ctx.strokeStyle = F.ink; ctx.lineWidth = 2;
    heartPath(ctx, 13, 12, 16);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = PALETTE.fx.flash;
    ctx.beginPath(); ctx.arc(9, 8, 2.2, 0, Math.PI * 2); ctx.fill();
  });
  SPRITES.trinket = sprite(20, 20, 10, 17, (ctx) => {
    const F = PALETTE.forest;
    blobShadow(ctx, 10, 17, 6, 2.4);
    ctx.fillStyle = PALETTE.fx.trinket;
    ctx.strokeStyle = F.ink; ctx.lineWidth = 1.8;
    starPath(ctx, 10, 9, 8, 4);
    ctx.fill(); ctx.stroke();
  });

  // the staff: grip at the anchor, shaft along +X. Ink-outlined for the
  // forest, flat for the desert — rotated around the hand pivot at runtime.
  SPRITES.staff = {};
  for (const style of ['forest', 'desert']) {
    SPRITES.staff[style] = sprite(54, 18, 8, 9, (ctx) => {
      const F = PALETTE.forest;
      ctx.fillStyle = F.trunk;
      rr(ctx, 4, 6.2, 42, 5.6, 2.8);
      ctx.fill();
      if (style === 'forest') {
        ctx.strokeStyle = F.ink; ctx.lineWidth = 1.8;
        ctx.stroke();
      }
      // gnarled knob at the tip
      ctx.fillStyle = F.trunk;
      ctx.beginPath(); ctx.arc(46, 9, 4.6, 0, Math.PI * 2); ctx.fill();
      if (style === 'forest') ctx.stroke();
      // grip wrap
      ctx.fillStyle = F.hoodDark;
      rr(ctx, 12, 5.6, 5, 6.8, 2);
      ctx.fill();
    });
  }

  // player: [style][dir][frame][boil]
  SPRITES.player = {};
  for (const style of ['forest', 'desert']) {
    SPRITES.player[style] = [];
    for (let dir = 0; dir < 4; dir++) {
      SPRITES.player[style][dir] = [];
      for (let frame = 0; frame < 2; frame++) {
        SPRITES.player[style][dir][frame] = [];
        for (let boil = 0; boil < 2; boil++) {
          const rr2 = mulberry32(hash2i(dir * 4 + frame, boil, seedInt ^ 0xB01));
          if (style === 'forest') {
            SPRITES.player[style][dir][frame].push(sprite(56, 58, 28, 54, (ctx) => {
              blobShadow(ctx, 28, 53, 13, 4);
              drawPlayerBody(ctx, 56, 58, rr2, dir, frame, true);
            }));
          } else {
            SPRITES.player[style][dir][frame].push(
              flatSprite(56, 58, 28, 54, (ctx) => drawPlayerBody(ctx, 56, 58, rr2, dir, frame, false))
            );
          }
        }
      }
    }
  }

  SPRITES.ogre = [];
  for (let frame = 0; frame < 2; frame++) {
    SPRITES.ogre[frame] = [];
    for (let boil = 0; boil < 2; boil++) {
      const rr2 = mulberry32(hash2i(frame, boil, seedInt ^ 0x06E));
      SPRITES.ogre[frame].push(sprite(96, 116, 48, 110, (ctx) => drawOgre(ctx, 96, 116, rr2, frame)));
    }
  }
  SPRITES.slime = [];
  for (let frame = 0; frame < 2; frame++) {
    SPRITES.slime[frame] = [];
    for (let boil = 0; boil < 2; boil++) {
      const rr2 = mulberry32(hash2i(frame, boil, seedInt ^ 0x517));
      SPRITES.slime[frame].push(sprite(42, 36, 21, 32, (ctx) => drawSlime(ctx, 42, 36, rr2, frame)));
    }
  }
  SPRITES.watcher = [];
  for (let boil = 0; boil < 2; boil++) {
    const rr2 = mulberry32(hash2i(9, boil, seedInt ^ 0x3E1));
    SPRITES.watcher.push(sprite(44, 46, 22, 42, (ctx) => drawWatcher(ctx, 44, 46, rr2)));
  }

  // the Great Stump (dungeon entrance) + dungeon torch sconce & baked glow
  SPRITES.stump = sprite(230, 200, 115, 190, (ctx) => drawStump(ctx, 230, 200, R));
  SPRITES.torch = [];
  for (let boil = 0; boil < 2; boil++) {
    const rr2 = mulberry32(hash2i(3, boil, seedInt ^ 0x70C));
    SPRITES.torch.push(sprite(24, 30, 12, 26, (ctx) => drawTorchSconce(ctx, 24, 30, rr2)));
  }
  // torch glow: ONE baked radial sprite, composited 'lighter' at runtime with
  // pulsing alpha/scale — never a per-frame gradient
  {
    const g = makeCanvas(160, 160);
    const gctx = g.getContext('2d');
    const grad = gctx.createRadialGradient(80, 80, 6, 80, 80, 78);
    grad.addColorStop(0, withAlpha(PALETTE.dungeon.torchGlow, 0.34));
    grad.addColorStop(0.55, withAlpha(PALETTE.dungeon.torchFlame, 0.12));
    grad.addColorStop(1, withAlpha(PALETTE.dungeon.torchFlame, 0));
    gctx.fillStyle = grad;
    gctx.fillRect(0, 0, 160, 160);
    SPRITES.torchGlow = g;
  }

  // paper grain tile (multiply-composited over the forest)
  const grain = makeCanvas(256, 256);
  const gctx = grain.getContext('2d');
  const img = gctx.createImageData(256, 256);
  const gr = mulberry32(seedInt ^ 0x96A1);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 235 + gr() * 20;
    img.data[i] = v; img.data[i + 1] = v - 4; img.data[i + 2] = v - 12;
    img.data[i + 3] = 255;
  }
  gctx.putImageData(img, 0, 0);
  // low-frequency watercolor blotches
  gctx.globalAlpha = 0.5;
  for (let i = 0; i < 26; i++) {
    gctx.fillStyle = withAlpha(PALETTE.forest.groundSpeckle, 0.1 + gr() * 0.12);
    gctx.beginPath();
    gctx.ellipse(gr() * 256, gr() * 256, 20 + gr() * 46, 16 + gr() * 36, gr() * 3, 0, Math.PI * 2);
    gctx.fill();
  }
  SPRITES.grain = grain;
}
