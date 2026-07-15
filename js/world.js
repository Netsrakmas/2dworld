// Chunked infinite world. Terrain is baked once per chunk to an offscreen
// canvas; props/creatures are spawned per chunk and y-sorted at render time.
const TILE = 40;
const CHUNK = 32;                 // tiles per chunk side
const CHUNK_PX = TILE * CHUNK;
const CELL = 2;                   // water/ground detail resolution: 2x2 tiles
const CELL_PX = TILE * CELL;
const REGION = 16;                // camp/skull placement regions (tiles)

const World = {
  seedInt: 0,
  chunks: new Map(),
  noiseBiome: null, noiseWater: null, noiseTree: null, noiseCactus: null,
  letterSpots: [],
  onSpawnEntity: null,            // set by game.js
  genQueue: [],
};

function worldInit(seedInt) {
  World.seedInt = seedInt;
  World.chunks.clear();
  _landmarks.clear();
  _edges.clear();
  World.noiseBiome = makeNoise(seedInt ^ 0xB10);
  World.noiseWater = makeNoise(seedInt ^ 0x77A);
  World.noiseTree = makeNoise(seedInt ^ 0x7EE);
  World.noiseCactus = makeNoise(seedInt ^ 0xCAC);
  // art direction (polish pass 2): macro tint + per-family density fields
  World.noiseMacroL = makeNoise(seedInt ^ 0x3AC1);   // light/dark, feature ~34 tiles
  World.noiseMacroW = makeNoise(seedInt ^ 0x3AC2);   // warm/cool, feature ~46 tiles
  World.noiseDenCactus = makeNoise(seedInt ^ 0xD3C1);
  World.noiseDenRock = makeNoise(seedInt ^ 0xD3C2);
  World.noiseDenBone = makeNoise(seedInt ^ 0xD3C3);
  World.noiseDenGrass = makeNoise(seedInt ^ 0xD3C4);
  const r = mulberry32(seedInt ^ 0x1E7);
  World.letterSpots = [];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + r() * 1.1;
    const rad = 20 + i * 9 + r() * 5;
    World.letterSpots.push({
      tx: Math.round(Math.cos(a) * rad),
      ty: Math.round(Math.sin(a) * rad),
      idx: i,
    });
  }
  World.campSpot = findCampSpot();
  World.stumpSpot = findStumpSpot();
  World.skullSpot = findSkullSpot();
  // cracked boulders: bomb-gated caches, visible from day one ("show the
  // lock before the key"), scattered on dry land around the spawn
  World.boulderSpots = [];
  const br = mulberry32(seedInt ^ 0xB01D);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + br() * 1.4;
    const rad = 13 + i * 6 + br() * 4;
    World.boulderSpots.push({
      tx: Math.round(Math.cos(a) * rad),
      ty: Math.round(Math.sin(a) * rad),
      idx: i,
    });
  }
}

// The Waystone Camp (the NPC cast): the first dry spot ON the biome border —
// blend 0.4-0.6, a comfortable walk from spawn, clear of chunk edges so the
// whole camp's solids land in one chunk. Pure function of the noise.
function findCampSpot() {
  for (let rad = 9; rad <= 28; rad += 2) {
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2 + 0.07;
      const tx = Math.round(Math.cos(a) * rad), ty = Math.round(Math.sin(a) * rad);
      const bl = blendAtTile(tx, ty);
      if (bl < 0.4 || bl > 0.6) continue;
      const mx = ((tx % CHUNK) + CHUNK) % CHUNK, my = ((ty % CHUNK) + CHUNK) % CHUNK;
      if (mx < 6 || mx > 25 || my < 4 || my > 27) continue;
      let ok = true;
      for (let dy = -3; ok && dy <= 3; dy++) {
        for (let dx = -6; ok && dx <= 5; dx++) {
          if (isWaterTile(tx + dx, ty + dy)) ok = false;
        }
      }
      if (ok) return { tx, ty };
    }
  }
  return { tx: 12, ty: 4 };
}

// The Great Stump (dungeon entrance): the first comfortably-forest, dry spot
// found by a fixed outward search from spawn — pure function of the noise, so
// the same seed always grows the stump in the same place.
function findStumpSpot() {
  for (let rad = 30; rad <= 140; rad += 4) {
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const tx = Math.round(Math.cos(a) * rad), ty = Math.round(Math.sin(a) * rad);
      if (blendAtTile(tx, ty) < 0.8) continue;
      let ok = true;
      for (let dy = -4; ok && dy <= 2; dy++) {
        for (let dx = -3; ok && dx <= 3; dx++) {
          if (isWaterTile(tx + dx, ty + dy)) ok = false;
        }
      }
      if (ok && !inCampClearing(tx, ty)) return { tx, ty };
    }
  }
  return { tx: 40, ty: 0 };
}

// The Colossus Skull (the Marrow Den's entrance): first comfortably-desert,
// dry spot on a fixed outward search — the bleached twin of the Great Stump.
function findSkullSpot() {
  for (let rad = 34; rad <= 150; rad += 4) {
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2 + 0.13;
      const tx = Math.round(Math.cos(a) * rad), ty = Math.round(Math.sin(a) * rad);
      if (blendAtTile(tx, ty) > 0.15) continue;
      let ok = true;
      for (let dy = -4; ok && dy <= 2; dy++) {
        for (let dx = -4; ok && dx <= 4; dx++) {
          if (isWaterTile(tx + dx, ty + dy)) ok = false;
        }
      }
      if (ok) return { tx, ty };
    }
  }
  return { tx: -46, ty: 4 };
}

// biome blend: 0 = desert, 1 = forest (elevation-style noise, band ~12 tiles)
function blendAtTile(tx, ty) {
  const b = World.noiseBiome.fbm(tx / 95, ty / 95, 3);
  return smoothstep(0.465, 0.535, b);
}

// water on a coarse cell grid so desert shorelines come out chunky
function isWaterCell(cx, cy) {
  const tx = cx * CELL + 1, ty = cy * CELL + 1;
  let w = World.noiseWater.fbm(tx / 26, ty / 26, 3);
  const d = Math.hypot(tx, ty);
  if (d < 14) w += (14 - d) / 14 * 0.5;   // keep the spawn clearing dry
  return w < 0.335;
}

function isWaterTile(tx, ty) {
  return isWaterCell(Math.floor(tx / CELL), Math.floor(ty / CELL));
}

// deterministic per-region feature (skeleton / ogre camp / slimes) — used both
// for spawning and for carving tree clearings around camps
function regionFeature(wrx, wry) {
  const rr = rng2(wrx, wry, World.seedInt ^ 0xCA2);
  const ctx0 = wrx * REGION + ((rr() * REGION) | 0);
  const cty0 = wry * REGION + ((rr() * REGION) | 0);
  const roll = rr();
  const extra = rr();
  const far = Math.hypot(ctx0, cty0) > 16;
  const bl = blendAtTile(ctx0, cty0);
  let type = null;
  if (bl < 0.35 && roll < 0.4) type = 'skeleton';
  else if (bl > 0.7 && far && roll < 0.45) type = 'camp';
  else if (bl > 0.55 && roll < 0.5) type = 'slime';
  return { type, tx: ctx0, ty: cty0, extra };
}

function inCampClearing(wtx, wty) {
  const f = regionFeature(Math.floor(wtx / REGION), Math.floor(wty / REGION));
  return f.type === 'camp' && Math.hypot(wtx - f.tx, wty - f.ty) < 7;
}

/* ---------- landmarks & desire paths (polish pass 3) ---------- */

// one landmark region = 40 tiles, so set pieces stay >=40 tiles apart. Each
// rolls from a per-biome rarity table; rare entries are the "weenies" that
// pull the player across dull space.
const LREGION = 40;
const LANDMARK_APRON = Object.freeze({
  rocktrio: 4, cactusring: 6, ribcage: 7, greatskull: 5,
  cairn: 4, fairyring: 5, stones: 6, greattree: 8,
});
const _landmarks = new Map();

function landmarkFeature(lrx, lry) {
  const key = lrx + ',' + lry;
  let lm = _landmarks.get(key);
  if (lm !== undefined) return lm;
  const rr = rng2(lrx, lry, World.seedInt ^ 0x1A2D);
  const tx = lrx * LREGION + 8 + ((rr() * (LREGION - 16)) | 0);
  const ty = lry * LREGION + 8 + ((rr() * (LREGION - 16)) | 0);
  const roll = rr(), pick = rr(), extra = rr();
  let type = null;
  if (roll < 0.62 && Math.hypot(tx, ty) > 12) {
    const bl = blendAtTile(tx, ty);
    const s = World.stumpSpot, k = World.skullSpot, wc = World.campSpot;
    const nearStump = (s && Math.hypot(tx - s.tx, ty - s.ty) < 12) ||
                      (k && Math.hypot(tx - k.tx, ty - k.ty) < 12) ||
                      (wc && Math.hypot(tx - wc.tx, ty - wc.ty) < 12);
    if (!nearStump && !isWaterTile(tx, ty) && !inCampClearing(tx, ty)) {
      if (bl < 0.4) type = pick < 0.42 ? 'rocktrio' : pick < 0.72 ? 'cactusring' : pick < 0.92 ? 'ribcage' : 'greatskull';
      else if (bl > 0.6) type = pick < 0.38 ? 'cairn' : pick < 0.68 ? 'fairyring' : pick < 0.92 ? 'stones' : 'greattree';
    }
  }
  lm = { type, tx, ty, extra };
  _landmarks.set(key, lm);
  return lm;
}

// desire paths: each landmark links to its east and south neighbors' landmarks
// (a lattice reads like a near-MST plus loops), midpoint-displaced twice.
// Memoized per region; derived purely from seeded positions, so any chunk can
// compute its crossings with no neighbors loaded.
const _edges = new Map();

function edgesFor(lrx, lry) {
  const key = lrx + ',' + lry;
  let segs = _edges.get(key);
  if (segs !== undefined) return segs;
  segs = [];
  const a = landmarkFeature(lrx, lry);
  if (a.type) {
    for (const [nx, ny] of [[lrx + 1, lry], [lrx, lry + 1]]) {
      const b = landmarkFeature(nx, ny);
      if (!b.type) continue;
      const rr = rng2(lrx * 7 + nx, lry * 7 + ny, World.seedInt ^ 0xA7B0);
      // midpoint displacement, 2 levels, +/-15% perpendicular
      let pts = [[a.tx * TILE, a.ty * TILE], [b.tx * TILE, b.ty * TILE]];
      for (let level = 0; level < 2; level++) {
        const next = [pts[0]];
        for (let i = 1; i < pts.length; i++) {
          const [x1, y1] = pts[i - 1], [x2, y2] = pts[i];
          const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
          const len = Math.hypot(x2 - x1, y2 - y1) || 1;
          const px = -(y2 - y1) / len, py = (x2 - x1) / len;
          const d = (rr() - 0.5) * 0.3 * len;
          next.push([mx + px * d, my + py * d], [x2, y2]);
        }
        pts = next;
      }
      for (let i = 1; i < pts.length; i++) segs.push([pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]]);
    }
  }
  _edges.set(key, segs);
  return segs;
}

function distToSeg2(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const t = clamp(((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy || 1), 0, 1);
  return dist2(px, py, x1 + dx * t, y1 + dy * t);
}

function nearPath(wtx, wty, radTiles) {
  const px = (wtx + 0.5) * TILE, py = (wty + 0.5) * TILE;
  const r2 = (radTiles * TILE) ** 2;
  const lrx = Math.floor(wtx / LREGION), lry = Math.floor(wty / LREGION);
  for (let dy = -1; dy <= 0; dy++) {
    for (let dx = -1; dx <= 0; dx++) {
      for (const s of edgesFor(lrx + dx, lry + dy)) {
        if (distToSeg2(px, py, s[0], s[1], s[2], s[3]) < r2) return true;
      }
    }
  }
  return false;
}

function inLandmarkApron(wtx, wty) {
  const lrx = Math.floor(wtx / LREGION), lry = Math.floor(wty / LREGION);
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const lm = landmarkFeature(lrx + dx, lry + dy);
      if (lm.type && Math.hypot(wtx - lm.tx, wty - lm.ty) < LANDMARK_APRON[lm.type] + 2) return true;
    }
  }
  return false;
}

/* ---------- terrain baking ---------- */

// union of per-cell rounded rects + seam bridges (straight edges between
// neighbors, rounded outer corners) — the chunky stepped shoreline
function paintWaterUnion(ctx, cells, cellSet, ox, oy, inset, radius, color, dy) {
  ctx.fillStyle = color;
  ctx.beginPath();
  for (const [cx, cy] of cells) {
    const x = cx * CELL_PX - ox + inset, y = cy * CELL_PX - oy + inset + (dy || 0);
    const s = CELL_PX - inset * 2;
    const right = cellSet.has((cx + 1) + ',' + cy);
    const down = cellSet.has(cx + ',' + (cy + 1));
    ctx.roundRect(x, y, s, s, radius);
    // bridges span center-to-center so they always reach the neighbor's rect
    if (right) ctx.rect(x + s / 2, y, CELL_PX, s);
    if (down) ctx.rect(x, y + s / 2, s, CELL_PX);
    if (right && down && cellSet.has((cx + 1) + ',' + (cy + 1))) {
      ctx.rect(x + s / 2, y + s / 2, CELL_PX, CELL_PX);
    }
  }
  ctx.fill();
}

function bakeTerrain(chunk) {
  const { cx, cy } = chunk;
  const D = PALETTE.desert, F = PALETTE.forest;
  const c = makeCanvas(CHUNK_PX, CHUNK_PX);
  const ctx = c.getContext('2d');
  const ox = cx * CHUNK_PX, oy = cy * CHUNK_PX;

  // ground: per-tile fill lerped between sand and parchment, then shifted by
  // two very-low-frequency macro noises (light/dark + warm/cool) so large
  // areas breathe instead of reading as flat digital fill
  const sandRgb = hexToRgb(D.sandBase), groundRgb = hexToRgb(F.ground);
  for (let ty = -1; ty <= CHUNK; ty++) {
    for (let tx = -1; tx <= CHUNK; tx++) {
      const wtx = cx * CHUNK + tx, wty = cy * CHUNK + ty;
      const bl = blendAtTile(wtx, wty);
      const ml = 1 + (World.noiseMacroL.fbm(wtx / 34, wty / 34, 2) - 0.5) * 0.15;
      const mw = (World.noiseMacroW.fbm(wtx / 46, wty / 46, 2) - 0.5) * 0.11;
      ctx.fillStyle = rgbToCss(
        clamp(lerp(sandRgb[0], groundRgb[0], bl) * ml * (1 + mw), 0, 255),
        clamp(lerp(sandRgb[1], groundRgb[1], bl) * ml * (1 + mw * 0.25), 0, 255),
        clamp(lerp(sandRgb[2], groundRgb[2], bl) * ml * (1 - mw), 0, 255));
      ctx.fillRect(tx * TILE - 1, ty * TILE - 1, TILE + 2, TILE + 2);
    }
  }

  // large soft ground patches
  for (let gy = -1; gy <= CHUNK / CELL; gy++) {
    for (let gx = -1; gx <= CHUNK / CELL; gx++) {
      const wcx = cx * (CHUNK / CELL) + gx, wcy = cy * (CHUNK / CELL) + gy;
      const r = rng2(wcx, wcy, World.seedInt ^ 0xA7C);
      if (r() < 0.16) {
        const wtx = wcx * CELL, wty = wcy * CELL;
        const bl = blendAtTile(wtx, wty);
        const px = gx * CELL_PX + r() * CELL_PX, py = gy * CELL_PX + r() * CELL_PX;
        const pw = 36 + r() * 70, ph = 24 + r() * 40;
        ctx.fillStyle = withAlpha(bl < 0.5 ? D.sandSpeckle : F.groundSpeckle, 0.32);
        ctx.beginPath();
        ctx.roundRect(px - pw / 2, py - ph / 2, pw, ph, Math.min(pw, ph) / 2);
        ctx.fill();
      }
    }
  }

  // speckles
  for (let ty = 0; ty < CHUNK; ty++) {
    for (let tx = 0; tx < CHUNK; tx++) {
      const wtx = cx * CHUNK + tx, wty = cy * CHUNK + ty;
      const r = rng2(wtx, wty, World.seedInt ^ 0x59E);
      const bl = blendAtTile(wtx, wty);
      const forest = bl >= 0.5;
      const n = forest ? 3 : 2;
      for (let i = 0; i < n; i++) {
        if (r() < (forest ? 0.4 : 0.55)) continue;
        const px = tx * TILE + r() * TILE, py = ty * TILE + r() * TILE;
        ctx.fillStyle = forest ? F.groundSpeckle : D.sandSpeckle;
        ctx.beginPath();
        ctx.arc(px, py, 1.5 + r() * 2, 0, Math.PI * 2);
        ctx.fill();
      }
      // tiny ink flecks give the forest floor its hand-drawn busyness
      if (forest && r() < 0.28) {
        ctx.strokeStyle = withAlpha(F.ink, 0.28);
        ctx.lineWidth = 1.4;
        const px = tx * TILE + r() * TILE, py = ty * TILE + r() * TILE;
        const a = r() * Math.PI, l = 2 + r() * 3;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px + Math.cos(a) * l, py + Math.sin(a) * l);
        ctx.stroke();
      }
    }
  }

  // desire paths: trodden strips between neighboring landmarks, stamped
  // before the water so ponds naturally interrupt them. Lighter, desaturated
  // ground in two feathered widths; props are suppressed along them.
  {
    const creamRgb = hexToRgb(F.cream);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const lr0x = Math.floor((ox - LREGION * TILE) / (LREGION * TILE));
    const lr1x = Math.floor((ox + CHUNK_PX + LREGION * TILE) / (LREGION * TILE));
    const lr0y = Math.floor((oy - LREGION * TILE) / (LREGION * TILE));
    const lr1y = Math.floor((oy + CHUNK_PX + LREGION * TILE) / (LREGION * TILE));
    for (let lry = lr0y; lry <= lr1y; lry++) {
      for (let lrx = lr0x; lrx <= lr1x; lrx++) {
        for (const s of edgesFor(lrx, lry)) {
          const minx = Math.min(s[0], s[2]) - 80, maxx = Math.max(s[0], s[2]) + 80;
          const miny = Math.min(s[1], s[3]) - 80, maxy = Math.max(s[1], s[3]) + 80;
          if (maxx < ox || minx > ox + CHUNK_PX || maxy < oy || miny > oy + CHUNK_PX) continue;
          const mbl = blendAtTile(Math.floor((s[0] + s[2]) / 2 / TILE), Math.floor((s[1] + s[3]) / 2 / TILE));
          const pr = lerp(lerp(sandRgb[0], groundRgb[0], mbl), creamRgb[0], 0.35);
          const pg = lerp(lerp(sandRgb[1], groundRgb[1], mbl), creamRgb[1], 0.35);
          const pb = lerp(lerp(sandRgb[2], groundRgb[2], mbl), creamRgb[2], 0.35);
          for (const [w, a] of [[58, 0.16], [34, 0.2]]) {
            ctx.strokeStyle = rgbToCss(pr, pg, pb, a);
            ctx.lineWidth = w;
            ctx.beginPath();
            ctx.moveTo(s[0] - ox, s[1] - oy);
            ctx.lineTo(s[2] - ox, s[3] - oy);
            ctx.stroke();
          }
        }
      }
    }
  }

  // water: gather cells (with 1-cell margin so seams and rims cross chunk borders)
  const cellsD = [], cellsF = [];
  const setD = new Set(), setF = new Set();
  const c0x = Math.floor(ox / CELL_PX), c0y = Math.floor(oy / CELL_PX);
  const cn = CHUNK / CELL;
  for (let gy = -2; gy <= cn + 1; gy++) {
    for (let gx = -2; gx <= cn + 1; gx++) {
      const wcx = c0x + gx, wcy = c0y + gy;
      if (!isWaterCell(wcx, wcy)) continue;
      const bl = blendAtTile(wcx * CELL + 1, wcy * CELL + 1);
      if (bl < 0.5) { cellsD.push([wcx, wcy]); setD.add(wcx + ',' + wcy); }
      else { cellsF.push([wcx, wcy]); setF.add(wcx + ',' + wcy); }
    }
  }

  if (cellsD.length) {
    paintWaterUnion(ctx, cellsD, setD, ox, oy, 0, 12, D.sandRim, -6);   // pink lip above
    paintWaterUnion(ctx, cellsD, setD, ox, oy, 0, 12, D.waterDeep, 0);
    paintWaterUnion(ctx, cellsD, setD, ox, oy, 14, 10, D.waterLight, 0);
    // sparkle dashes
    ctx.strokeStyle = D.waterDash; ctx.lineWidth = 4; ctx.lineCap = 'round';
    for (const [wcx, wcy] of cellsD) {
      const r = rng2(wcx, wcy, World.seedInt ^ 0xDA5);
      const n = (r() * 2.4) | 0;
      for (let i = 0; i < n; i++) {
        const px = wcx * CELL_PX - ox + 18 + r() * (CELL_PX - 50);
        const py = wcy * CELL_PX - oy + 18 + r() * (CELL_PX - 36);
        const len = 8 + r() * 14;
        ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + len, py); ctx.stroke();
      }
    }
  }

  if (cellsF.length) {
    paintWaterUnion(ctx, cellsF, setF, ox, oy, -4, 36, shade(F.pond, 1.08), 0);
    paintWaterUnion(ctx, cellsF, setF, ox, oy, 2, 34, F.pond, 0);
    paintWaterUnion(ctx, cellsF, setF, ox, oy, 22, 30, F.pondDeep, 0);
    // hand-placed stones ringing the shoreline + murky blotches
    for (const [wcx, wcy] of cellsF) {
      const r = rng2(wcx, wcy, World.seedInt ^ 0x570);
      const bx = wcx * CELL_PX - ox, by = wcy * CELL_PX - oy;
      const edges = [
        [!setF.has(wcx + ',' + (wcy - 1)), 0, -1], [!setF.has(wcx + ',' + (wcy + 1)), 0, 1],
        [!setF.has((wcx - 1) + ',' + wcy), -1, 0], [!setF.has((wcx + 1) + ',' + wcy), 1, 0],
      ];
      for (const [open, dx, dy] of edges) {
        if (!open) continue;
        const n = 2 + ((r() * 2) | 0);
        for (let i = 0; i < n; i++) {
          const t = (i + 0.5) / n + (r() - 0.5) * 0.2;
          const sx = dx === 0 ? bx + t * CELL_PX : bx + (dx > 0 ? CELL_PX : 0) + (r() - 0.5) * 6;
          const sy = dy === 0 ? by + t * CELL_PX : by + (dy > 0 ? CELL_PX : 0) + (r() - 0.5) * 6;
          const rw = 7 + r() * 8, rh = 5 + r() * 5;
          ctx.fillStyle = F.stone;
          ctx.strokeStyle = F.ink; ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.ellipse(sx, sy, rw, rh, (r() - 0.5) * 0.8, 0, Math.PI * 2);
          ctx.fill(); ctx.stroke();
        }
      }
      ctx.fillStyle = withAlpha(F.pondDeep, 0.35);
      const nb = r() < 0.5 ? 1 : 0;
      for (let i = 0; i < nb; i++) {
        ctx.beginPath();
        ctx.ellipse(bx + 16 + r() * (CELL_PX - 32), by + 16 + r() * (CELL_PX - 32), 10 + r() * 16, 6 + r() * 9, r() * 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // fallen leaves baked into forest ground
  for (let ty = 0; ty < CHUNK; ty++) {
    for (let tx = 0; tx < CHUNK; tx++) {
      const wtx = cx * CHUNK + tx, wty = cy * CHUNK + ty;
      const r = rng2(wtx, wty, World.seedInt ^ 0x1EAF);
      if (r() > 0.09) continue;
      const bl = blendAtTile(wtx, wty);
      if (bl < 0.6 || isWaterTile(wtx, wty)) continue;
      const spr = SPRITES.leaf[(r() * SPRITES.leaf.length) | 0];
      ctx.drawImage(spr.c, tx * TILE + r() * TILE - 7, ty * TILE + r() * TILE - 7);
    }
  }

  // paper grain multiply over the forest side (pattern fill: no tile seams)
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = ctx.createPattern(SPRITES.grain, 'repeat');
  for (let gy = 0; gy < cn; gy++) {
    for (let gx = 0; gx < cn; gx++) {
      const bl = blendAtTile(cx * CHUNK + gx * CELL + 1, cy * CHUNK + gy * CELL + 1);
      if (bl < 0.04) continue;
      ctx.globalAlpha = 0.45 * bl;
      ctx.fillRect(gx * CELL_PX, gy * CELL_PX, CELL_PX, CELL_PX);
    }
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  return c;
}

/* ---------- chunk generation ---------- */

function markSolid(chunk, tx, ty) {
  if (tx >= 0 && ty >= 0 && tx < CHUNK && ty < CHUNK) chunk.solid[ty * CHUNK + tx] = 1;
}

function tileFreeForProp(wtx, wty) {
  if (isWaterTile(wtx, wty)) return false;
  if (Math.hypot(wtx, wty) < 6) return false;  // spawn clearing
  const s = World.stumpSpot;
  if (s && Math.hypot(wtx - s.tx, wty - s.ty) < 6) return false; // stump apron
  const k = World.skullSpot;
  if (k && Math.hypot(wtx - k.tx, wty - k.ty) < 7) return false; // skull apron
  const wc = World.campSpot;
  if (wc && Math.hypot(wtx - wc.tx, wty - wc.ty) < 8) return false; // Waystone Camp clearing
  if (inLandmarkApron(wtx, wty)) return false; // set pieces clear their stage
  if (nearPath(wtx, wty, 1.3)) return false;   // desire paths stay walkable
  return true;
}

function genChunk(cx, cy) {
  const chunk = {
    cx, cy,
    solid: new Uint8Array(CHUNK * CHUNK),
    props: [],
    entities: [],
    canvas: null,
    mini: null,
  };

  const baseTx = cx * CHUNK, baseTy = cy * CHUNK;

  // water blocks movement
  for (let ty = 0; ty < CHUNK; ty++) {
    for (let tx = 0; tx < CHUNK; tx++) {
      if (isWaterTile(baseTx + tx, baseTy + ty)) chunk.solid[ty * CHUNK + tx] = 1;
    }
  }

  const addProp = (list, variant, wtx, wty, jx, jy, blocking, sway, scale, flip) => {
    const spr = Array.isArray(list) ? list[variant % list.length] : list;
    const sc = scale || 1;
    chunk.props.push({
      spr, x: (wtx + 0.5) * TILE + jx, y: (wty + 0.5) * TILE + jy,
      sway: sway || 0, phase: (wtx * 7 + wty * 13) % 6.28,
      s: sc, flip: flip || false,
      // true render extents so big/scaled sprites are culled by what they
      // actually cover on screen, not by a fixed margin around the anchor
      rx: Math.max(spr.ax, spr.c.width - spr.ax) * sc + 10,
      top: spr.ay * sc + 10,
      bot: (spr.c.height - spr.ay) * sc + 10,
    });
    if (blocking) markSolid(chunk, wtx - baseTx, wty - baseTy);
  };

  /* ---- clustered scatter (Thomas process over per-family density fields) ----
     Three layers: (a) low-frequency density noise per family, remapped so
     30-40% of the map is a TRUE void; (b) sparse parents spawning 3 or 5
     children (rule of odds) at gaussian radius, child scale falling with
     distance, mixed families; (c) minimum spacing between LARGE props only.
     Scale buckets: 70% small (0.72-0.9), 25% medium (1.0-1.4), 5% big (1.8+,
     reserved for parents so "big" stays a signal). Flip jitter forest-only —
     desert sprites carry a baked directional shadow that must not mirror. */
  const den = (noise, wtx, wty, lam) => {
    const n = noise.fbm(wtx / lam, wty / lam, 2);
    return clamp((n - 0.47) / 0.13, 0, 1);
  };
  const largeSpots = [];
  const largeOk = (wtx, wty) => {
    for (const [lx2, ly2] of largeSpots) {
      if (Math.abs(wtx - lx2) < 3 && Math.abs(wty - ly2) < 3) return false;
    }
    return true;
  };
  const bucketScale = (r) => {
    const b = r();
    if (b < 0.70) return 0.72 + r() * 0.18;
    if (b < 0.95) return 1.0 + r() * 0.4;
    return 1.8 + r() * 0.35;
  };
  // family tables: parent sprite + mixed child recipes [list, blocking, sway]
  const CHILD_MIX = {
    cactus: () => [[SPRITES.cactus, true, 0], [SPRITES.cactus, true, 0], [SPRITES.knuckle, false, 0]],
    rock: () => [[SPRITES.rock, false, 0], [SPRITES.knuckle, false, 0], [SPRITES.rock, false, 0]],
    bone: () => [[SPRITES.rib, false, 0], [SPRITES.knuckle, false, 0], [SPRITES.knuckle, false, 0]],
    grass: () => [[SPRITES.grass, false, 1], [SPRITES.stone, false, 0], [SPRITES.mushroom, false, 0]],
  };
  const cluster = (family, parentList, wtx, wty, r, forest, parentBlocks) => {
    const pScale = bucketScale(r);
    if (pScale > 1.5 && !largeOk(wtx, wty)) return;
    if (pScale > 1.0) largeSpots.push([wtx, wty]);
    addProp(parentList, (r() * 6) | 0, wtx, wty, (r() - 0.5) * 12, (r() - 0.5) * 8,
      parentBlocks, forest ? 1 : 0, pScale, false);
    const n = r() < 0.55 ? 3 : 5;                     // rule of odds
    const mixes = CHILD_MIX[family]();
    for (let i = 0; i < n; i++) {
      const dx = Math.round((r() + r() - 1) * 2.6);   // ~gaussian, sigma 2-3 tiles
      const dy = Math.round((r() + r() - 1) * 2.6);
      if (!dx && !dy) continue;
      const cxT = wtx + dx, cyT = wty + dy;
      if (cxT < baseTx || cyT < baseTy || cxT >= baseTx + CHUNK || cyT >= baseTy + CHUNK) continue;
      if (!tileFreeForProp(cxT, cyT)) continue;
      if (chunk.solid[(cyT - baseTy) * CHUNK + (cxT - baseTx)]) continue;
      const [list, blocks, sw] = mixes[(r() * mixes.length) | 0];
      const cScale = clamp((0.78 + r() * 0.22) * (1 - Math.hypot(dx, dy) * 0.055), 0.5, 1);
      addProp(list, (r() * 6) | 0, cxT, cyT, (r() - 0.5) * 18, (r() - 0.5) * 14,
        blocks && cScale > 0.7, sw, cScale, false);
    }
  };

  for (let ty = 0; ty < CHUNK; ty++) {
    for (let tx = 0; tx < CHUNK; tx++) {
      const wtx = baseTx + tx, wty = baseTy + ty;
      if (!tileFreeForProp(wtx, wty)) continue;
      const bl = blendAtTile(wtx, wty);
      const r = rng2(wtx, wty, World.seedInt ^ 0x9B0);
      const roll = r();

      if (bl < 0.45) {
        const dc = den(World.noiseDenCactus, wtx, wty, 48);
        const dr = den(World.noiseDenRock, wtx, wty, 64);
        const db = den(World.noiseDenBone, wtx, wty, 44);
        const cn = World.noiseCactus.fbm(wtx / 9, wty / 9, 2);
        if (dc > 0 && cn > 0.58 && roll < 0.035 * dc) {
          cluster('cactus', SPRITES.cactus, wtx, wty, r, false, true);
        } else if (dr > 0 && roll < 0.006 * dr) {
          cluster('rock', SPRITES.rock, wtx, wty, r, false, true);
        } else if (db > 0 && roll < 0.005 * db) {
          cluster('bone', SPRITES.rib, wtx, wty, r, false, false);
        } else if (dc > 0.5 && cn > 0.62 && roll < 0.05) {
          // patch filler: lone small cactus inside dense flats
          addProp(SPRITES.cactus, (r() * 6) | 0, wtx, wty, (r() - 0.5) * 14, (r() - 0.5) * 10,
            true, 0, 0.72 + r() * 0.18, false);
        }
      } else if (bl > 0.55) {
        // trees are level geometry (forest walls) — the density fields sculpt
        // only the walkable clutter between them
        const tn = World.noiseTree.fbm(wtx / 8, wty / 8, 3);
        if (tn > 0.55 && roll < 0.55 && !inCampClearing(wtx, wty)) {
          const conifer = r() < 0.4;
          addProp(conifer ? SPRITES.treeConifer : SPRITES.treeRound,
            (r() * 5) | 0, wtx, wty, (r() - 0.5) * 20, (r() - 0.5) * 14, true, 1,
            0.85 + r() * 0.32, r() < 0.4);
        } else {
          const dg = den(World.noiseDenGrass, wtx, wty, 40);
          if (dg > 0 && roll < 0.022 * dg) {
            cluster('grass', SPRITES.grass, wtx, wty, r, true, false);
          } else if (dg > 0 && roll > 0.99 && r() < 0.5 * dg) {
            cluster('rock', SPRITES.stone, wtx, wty, r, true, false);
          }
        }
      } else {
        // transition band: last cacti mingle with first trees
        if (roll < 0.01) {
          if (r() < bl) addProp(SPRITES.treeRound, (r() * 5) | 0, wtx, wty, 0, 0, true, 1);
          else addProp(SPRITES.cactus, (r() * 6) | 0, wtx, wty, 0, 0, true);
        } else if (roll < 0.03 && r() < 0.4) {
          addProp(SPRITES.grass, (r() * 4) | 0, wtx, wty, (r() - 0.5) * 20, (r() - 0.5) * 20, false, 1);
        }
      }
    }
  }

  // region features: desert skeletons, forest camps and slimes
  const r0x = Math.floor(baseTx / REGION), r0y = Math.floor(baseTy / REGION);
  for (let ry = 0; ry < CHUNK / REGION; ry++) {
    for (let rx = 0; rx < CHUNK / REGION; rx++) {
      const feat = regionFeature(r0x + rx, r0y + ry);
      if (!feat.type) continue;
      const spot = findFreeTile(feat.tx, feat.ty, 4);
      if (!spot) continue;
      const [ftx, fty] = spot;
      const rr = rng2(ftx, fty, World.seedInt ^ 0xFEA);

      if (feat.type === 'skeleton') {
        // half-buried giant skeleton
        addProp(SPRITES.skull, 0, ftx, fty, 0, 0, true);
        markSolid(chunk, ftx - baseTx - 1, fty - baseTy);
        markSolid(chunk, ftx - baseTx + 1, fty - baseTy);
        for (let i = 0; i < 6; i++) {
          const a = Math.PI * (0.9 + 0.5 * (i / 5));
          const bx2 = ftx + Math.round(Math.cos(a) * (3 + (i % 2)));
          const by2 = fty + Math.round(Math.sin(a) * (3 + (i % 2))) - 2;
          if (tileFreeForProp(bx2, by2)) addProp(SPRITES.rib, i, bx2, by2, (rr() - 0.5) * 10, 0, false);
        }
        for (let i = 0; i < 4; i++) {
          const bx2 = ftx - 4 - i, by2 = fty - 4 + ((rr() * 3) | 0);
          if (tileFreeForProp(bx2, by2)) addProp(SPRITES.knuckle, i, bx2, by2, (rr() - 0.5) * 12, 0, false);
        }
      } else if (feat.type === 'camp') {
        // ogre camp: palisade, warning sign, barrels, patrol + watcher
        if (inChunk(chunk, ftx, fty)) {
          addProp(SPRITES.palisade, 0, ftx - 2, fty - 1, 0, 0, true);
          addProp(SPRITES.palisade, 1, ftx + 1, fty - 1, 0, 0, true);
          markSolid(chunk, ftx - 3 - baseTx, fty - 1 - baseTy);
          markSolid(chunk, ftx - 1 - baseTx, fty - 1 - baseTy);
          markSolid(chunk, ftx - baseTx, fty - 1 - baseTy);
          markSolid(chunk, ftx + 2 - baseTx, fty - 1 - baseTy);
          addProp(SPRITES.barrel, 0, ftx - 4, fty, (rr() - 0.5) * 10, 0, true);
          addProp(SPRITES.barrel, 1, ftx - 4, fty + 1, (rr() - 0.5) * 10, 0, false);
          chunk.entities.push({ kind: 'sign', tx: ftx + 3, ty: fty + 1 });
          chunk.entities.push({ kind: 'ogre', tx: ftx - 1, ty: fty + 3 });
          chunk.entities.push({ kind: 'ogre', tx: ftx + 2, ty: fty + 5 });
          chunk.entities.push({ kind: 'watcher', tx: ftx - 2, ty: fty + 2 });
        }
      } else if (feat.type === 'slime') {
        chunk.entities.push({ kind: 'slime', tx: ftx, ty: fty });
        if (feat.extra < 0.4) chunk.entities.push({ kind: 'slime', tx: ftx + 2, ty: fty + 1 });
      }
    }
  }

  // landmarks: authored set pieces on the 40-tile grid. A landmark is built
  // by EVERY chunk it overlaps — the seeded part sequence is identical, each
  // chunk just keeps the parts that fall inside it, so borders never cut one.
  {
    const inMe = (wtx, wty) => wtx >= baseTx && wty >= baseTy && wtx < baseTx + CHUNK && wty < baseTy + CHUNK;
    const lr0x = Math.floor((baseTx - 10) / LREGION), lr1x = Math.floor((baseTx + CHUNK + 10) / LREGION);
    const lr0y = Math.floor((baseTy - 10) / LREGION), lr1y = Math.floor((baseTy + CHUNK + 10) / LREGION);
    for (let lry = lr0y; lry <= lr1y; lry++) {
      for (let lrx = lr0x; lrx <= lr1x; lrx++) {
        const lm = landmarkFeature(lrx, lry);
        if (!lm.type) continue;
        if (lm.tx < baseTx - 10 || lm.tx >= baseTx + CHUNK + 10 ||
            lm.ty < baseTy - 10 || lm.ty >= baseTy + CHUNK + 10) continue;
        const rr = rng2(lm.tx, lm.ty, World.seedInt ^ 0x1A2E);
        const place = (list, variant, dx, dy, blocking, sway, s, flip) => {
          const wtx = lm.tx + Math.round(dx), wty = lm.ty + Math.round(dy);
          const jx = (rr() - 0.5) * 10, jy = (rr() - 0.5) * 8;   // consume rng FIRST: identical sequence in every chunk
          if (!inMe(wtx, wty) || isWaterTile(wtx, wty)) return;
          addProp(list, variant, wtx, wty, jx, jy, blocking, sway, s, flip);
        };
        const ring = (list, n, rad, s0, blocking, sway) => {
          for (let i = 0; i < n; i++) {
            const a = (i / n) * Math.PI * 2 + 0.4;
            place(list, i, Math.cos(a) * rad, Math.sin(a) * rad * 0.8, blocking, sway, s0 + rr() * 0.2, false);
          }
        };
        if (lm.type === 'rocktrio') {
          place(SPRITES.rock, 0, 0, 0, true, 0, 1.9);
          place(SPRITES.rock, 2, 1.7, 0.7, true, 0, 1.15);
          place(SPRITES.rock, 4, -1.5, 0.9, false, 0, 0.72);
          for (let i = 0; i < 3; i++) place(SPRITES.knuckle, i, (rr() - 0.5) * 6, 2 + rr() * 2, false, 0, 0.7);
        } else if (lm.type === 'cactusring') {
          ring(SPRITES.cactus, lm.extra < 0.5 ? 5 : 7, 2.6, 0.95, true, 0);
          place(SPRITES.knuckle, 1, 0, 0, false, 0, 0.8);
        } else if (lm.type === 'ribcage') {
          // colossal half-buried ribcage, walk-through
          for (let i = 0; i < 4; i++) {
            place(SPRITES.rib, i, -2.2 - i * 0.25, -3 + i * 2, false, 0, 2.3);
            place(SPRITES.rib, i + 1, 2.2 + i * 0.25, -3 + i * 2, false, 0, 2.3);
          }
          place(SPRITES.skull, 0, 0, -4.6, true, 0, 1.5);
        } else if (lm.type === 'greatskull') {
          place(SPRITES.skull, 0, 0, 0, true, 0, 2.2);
          for (let i = 0; i < 4; i++) place(SPRITES.knuckle, i, (rr() - 0.5) * 8, 2.4 + rr() * 2.4, false, 0, 0.8);
        } else if (lm.type === 'cairn') {
          place(SPRITES.stone, 0, 0, 0, true, 0, 1.8);
          place(SPRITES.stone, 1, 1, 0.6, false, 0, 1.2);
          place(SPRITES.stone, 2, -0.9, 0.7, false, 0, 0.9);
          place(SPRITES.mushroom, 0, 1.6, -0.6, false, 0, 1.1);
          place(SPRITES.grass, 0, -1.6, -0.4, false, 1, 1);
        } else if (lm.type === 'fairyring') {
          ring(SPRITES.mushroom, 7, 2.2, 1.0, false, 0);
          for (let i = 0; i < 3; i++) place(SPRITES.grass, i, (rr() - 0.5) * 2.4, (rr() - 0.5) * 2, false, 1, 0.9);
        } else if (lm.type === 'stones') {
          ring(SPRITES.stone, lm.extra < 0.5 ? 5 : 7, 3, 1.75, true, 0);
        } else if (lm.type === 'greattree') {
          place(SPRITES.treeRound, 2, 0, 0, true, 1, 2.9);
          markSolid(chunk, lm.tx - 1 - baseTx, lm.ty - baseTy);
          markSolid(chunk, lm.tx + 1 - baseTx, lm.ty - baseTy);
          markSolid(chunk, lm.tx - baseTx, lm.ty - 1 - baseTy);
          for (let i = 0; i < 5; i++) place(SPRITES.grass, i, (rr() - 0.5) * 7, 2.6 + rr() * 2.6, false, 1, 1);
          for (let i = 0; i < 3; i++) place(SPRITES.mushroom, 0, (rr() - 0.5) * 6, 2 + rr() * 3, false, 0, 1.1);
        }
      }
    }
  }

  // the Great Stump — dungeon entrance landmark (doorway tile stays open)
  {
    const s = World.stumpSpot;
    if (s && Math.floor(s.tx / CHUNK) === cx && Math.floor(s.ty / CHUNK) === cy) {
      addProp(SPRITES.stump, 0, s.tx, s.ty, 0, TILE * 0.35, false);
      for (let dy = -3; dy <= 0; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          if (dx === 0 && dy === 0) continue; // the doorway
          markSolid(chunk, s.tx + dx - baseTx, s.ty + dy - baseTy);
        }
      }
      chunk.entities.push({ kind: 'stumpdoor', tx: s.tx, ty: s.ty });
    }
  }

  // the Colossus Skull — the Marrow Den's entrance (mouth stays open)
  {
    const k = World.skullSpot;
    if (k && Math.floor(k.tx / CHUNK) === cx && Math.floor(k.ty / CHUNK) === cy) {
      addProp(SPRITES.skull, 0, k.tx, k.ty, 0, TILE * 0.4, false, 0, 2.0);
      for (let dy = -3; dy <= 0; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          if (dx === 0 && dy === 0) continue; // the mouth
          markSolid(chunk, k.tx + dx - baseTx, k.ty + dy - baseTy);
        }
      }
      chunk.entities.push({ kind: 'skulldoor', tx: k.tx, ty: k.ty });
    }
  }

  // the Waystone Camp — NPC cast + shop pedestals around a fire
  {
    const wc = World.campSpot;
    if (wc && Math.floor(wc.tx / CHUNK) === cx && Math.floor(wc.ty / CHUNK) === cy) {
      spawnWaystoneCamp(chunk, wc, addProp, (tx, ty) => markSolid(chunk, tx - baseTx, ty - baseTy));
    }
  }

  // lost letters
  for (const spot of World.letterSpots) {
    const stx = Math.floor(spot.tx / CHUNK), sty = Math.floor(spot.ty / CHUNK);
    if (stx === cx && sty === cy) {
      const p = findFreeTile(spot.tx, spot.ty, 6);
      if (p) chunk.entities.push({ kind: 'letter', tx: p[0], ty: p[1], idx: spot.idx });
    }
  }

  // cracked boulders (bomb caches)
  for (const spot of World.boulderSpots) {
    const stx = Math.floor(spot.tx / CHUNK), sty = Math.floor(spot.ty / CHUNK);
    if (stx === cx && sty === cy) {
      const p = findFreeTile(spot.tx, spot.ty, 6);
      if (p) chunk.entities.push({ kind: 'boulder', tx: p[0], ty: p[1], idx: spot.idx });
    }
  }

  chunk.canvas = bakeTerrain(chunk);
  chunk.mini = bakeMini(chunk);
  if (World.onSpawnEntity) for (const e of chunk.entities) World.onSpawnEntity(e, chunk);
  return chunk;
}

function inChunk(chunk, wtx, wty) {
  return wtx >= chunk.cx * CHUNK + 2 && wtx < (chunk.cx + 1) * CHUNK - 2 &&
         wty >= chunk.cy * CHUNK + 2 && wty < (chunk.cy + 1) * CHUNK - 2;
}

function findFreeTile(tx, ty, radius) {
  for (let rad = 0; rad <= radius; rad++) {
    for (let dy = -rad; dy <= rad; dy++) {
      for (let dx = -rad; dx <= rad; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== rad) continue;
        const x = tx + dx, y = ty + dy;
        if (tileFreeForProp(x, y)) return [x, y];
      }
    }
  }
  return null;
}

function bakeMini(chunk) {
  const D = PALETTE.desert, F = PALETTE.forest;
  const size = CHUNK / CELL; // 1 px per 2x2 tiles
  const m = makeCanvas(size, size);
  const mctx = m.getContext('2d');
  for (let gy = 0; gy < size; gy++) {
    for (let gx = 0; gx < size; gx++) {
      const wtx = chunk.cx * CHUNK + gx * CELL, wty = chunk.cy * CHUNK + gy * CELL;
      const bl = blendAtTile(wtx + 1, wty + 1);
      let col;
      if (isWaterCell(Math.floor(wtx / CELL), Math.floor(wty / CELL))) {
        col = bl < 0.5 ? D.waterDeep : F.pond;
      } else {
        col = mixColor(D.sandBase, F.ground, bl);
        if (bl > 0.55 && World.noiseTree.fbm(wtx / 8, wty / 8, 3) > 0.55) col = F.canopyDark;
      }
      mctx.fillStyle = col;
      mctx.fillRect(gx, gy, 1, 1);
    }
  }
  return m;
}

/* ---------- access + upkeep ---------- */

function chunkKey(cx, cy) { return cx + ',' + cy; }

function getChunk(cx, cy) {
  const key = chunkKey(cx, cy);
  let ch = World.chunks.get(key);
  if (!ch) {
    ch = genChunk(cx, cy);
    World.chunks.set(key, ch);
  }
  ch.lastUsed = performance.now();
  return ch;
}

function isSolidAt(wx, wy) {
  // inside the dungeon, the same call answers from the room tilemap — the one
  // seam that lets movement/combat/knockback code work unchanged in both modes
  if (typeof Dungeon !== 'undefined' && Dungeon.active) return dungeonSolidAt(wx, wy);
  const tx = Math.floor(wx / TILE), ty = Math.floor(wy / TILE);
  const cx = Math.floor(tx / CHUNK), cy = Math.floor(ty / CHUNK);
  const ch = getChunk(cx, cy);
  return ch.solid[(ty - cy * CHUNK) * CHUNK + (tx - cx * CHUNK)] === 1;
}

function evictFarChunks(pcx, pcy, onEvict) {
  for (let n = 0; n < 4 && World.chunks.size > 36; n++) {
    let worst = null, worstD = -1;
    for (const [key, ch] of World.chunks) {
      const d = Math.abs(ch.cx - pcx) + Math.abs(ch.cy - pcy);
      if (d > worstD) { worstD = d; worst = key; }
    }
    if (!worst || worstD <= 3) return;
    const ch = World.chunks.get(worst);
    World.chunks.delete(worst);
    if (onEvict) onEvict(ch);
  }
}
