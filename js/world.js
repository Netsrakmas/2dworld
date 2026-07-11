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
  World.noiseBiome = makeNoise(seedInt ^ 0xB10);
  World.noiseWater = makeNoise(seedInt ^ 0x77A);
  World.noiseTree = makeNoise(seedInt ^ 0x7EE);
  World.noiseCactus = makeNoise(seedInt ^ 0xCAC);
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

  // ground: per-tile fill lerped between sand and parchment
  for (let ty = -1; ty <= CHUNK; ty++) {
    for (let tx = -1; tx <= CHUNK; tx++) {
      const wtx = cx * CHUNK + tx, wty = cy * CHUNK + ty;
      const bl = blendAtTile(wtx, wty);
      ctx.fillStyle = bl <= 0 ? D.sandBase : bl >= 1 ? F.ground : mixColor(D.sandBase, F.ground, bl);
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

  const addProp = (list, variant, wtx, wty, jx, jy, blocking, sway) => {
    const spr = Array.isArray(list) ? list[variant % list.length] : list;
    chunk.props.push({ spr, x: (wtx + 0.5) * TILE + jx, y: (wty + 0.5) * TILE + jy, sway: sway || 0, phase: (wtx * 7 + wty * 13) % 6.28 });
    if (blocking) markSolid(chunk, wtx - baseTx, wty - baseTy);
  };

  // per-tile scatter
  for (let ty = 0; ty < CHUNK; ty++) {
    for (let tx = 0; tx < CHUNK; tx++) {
      const wtx = baseTx + tx, wty = baseTy + ty;
      if (!tileFreeForProp(wtx, wty)) continue;
      const bl = blendAtTile(wtx, wty);
      const r = rng2(wtx, wty, World.seedInt ^ 0x9B0);
      const roll = r();

      if (bl < 0.45) {
        const cn = World.noiseCactus.fbm(wtx / 9, wty / 9, 2);
        if (cn > 0.60 && roll < 0.16) {
          addProp(SPRITES.cactus, (r() * 6) | 0, wtx, wty, (r() - 0.5) * 14, (r() - 0.5) * 10, true);
        } else if (roll < 0.012) {
          addProp(SPRITES.rock, (r() * 5) | 0, wtx, wty, (r() - 0.5) * 12, (r() - 0.5) * 8, true);
          if (r() < 0.5) addProp(SPRITES.rock, (r() * 5) | 0, wtx + 1, wty, (r() - 0.5) * 16, (r() - 0.5) * 10, false);
        } else if (roll < 0.022) {
          addProp(SPRITES.knuckle, (r() * 4) | 0, wtx, wty, (r() - 0.5) * 16, (r() - 0.5) * 12, false);
        } else if (roll < 0.028) {
          addProp(SPRITES.rib, (r() * 4) | 0, wtx, wty, (r() - 0.5) * 16, (r() - 0.5) * 12, false);
        }
      } else if (bl > 0.55) {
        const tn = World.noiseTree.fbm(wtx / 8, wty / 8, 3);
        if (tn > 0.55 && roll < 0.55 && !inCampClearing(wtx, wty)) {
          const conifer = r() < 0.4;
          addProp(conifer ? SPRITES.treeConifer : SPRITES.treeRound,
            (r() * 5) | 0, wtx, wty, (r() - 0.5) * 20, (r() - 0.5) * 14, true, 1);
        } else if (roll < 0.6 && r() < 0.17) {
          addProp(SPRITES.grass, (r() * 4) | 0, wtx, wty, (r() - 0.5) * 24, (r() - 0.5) * 20, false, 1);
        } else if (r() < 0.012) {
          addProp(SPRITES.stone, (r() * 4) | 0, wtx, wty, (r() - 0.5) * 14, (r() - 0.5) * 10, false);
        } else if (r() < 0.012) {
          addProp(SPRITES.mushroom, 0, wtx, wty, (r() - 0.5) * 14, (r() - 0.5) * 10, false);
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

  // lost letters
  for (const spot of World.letterSpots) {
    const stx = Math.floor(spot.tx / CHUNK), sty = Math.floor(spot.ty / CHUNK);
    if (stx === cx && sty === cy) {
      const p = findFreeTile(spot.tx, spot.ty, 6);
      if (p) chunk.entities.push({ kind: 'letter', tx: p[0], ty: p[1], idx: spot.idx });
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
  const tx = Math.floor(wx / TILE), ty = Math.floor(wy / TILE);
  const cx = Math.floor(tx / CHUNK), cy = Math.floor(ty / CHUNK);
  const ch = getChunk(cx, cy);
  return ch.solid[(ty - cy * CHUNK) * CHUNK + (tx - cx * CHUNK)] === 1;
}

function evictFarChunks(pcx, pcy, onEvict) {
  if (World.chunks.size <= 36) return;
  let worst = null, worstD = -1;
  for (const [key, ch] of World.chunks) {
    const d = Math.abs(ch.cx - pcx) + Math.abs(ch.cy - pcy);
    if (d > worstD) { worstD = d; worst = key; }
  }
  if (worst && worstD > 3) {
    const ch = World.chunks.get(worst);
    World.chunks.delete(worst);
    if (onEvict) onEvict(ch);
  }
}
