// The Hollow Stump — the Zelda layer. A separate room-based game mode: 12
// hand-authored rooms (ASCII maps, same for every seed), room-locked camera
// with screen-slide transitions, a door taxonomy, torch light, and its own
// solidity. The overworld never sees any of this: while Dungeon.active the
// one seam in isSolidAt() answers from the room tilemap instead of chunks.
//
// Every tunable lives in DUNGEON. Zero magic numbers in logic.
const DUNGEON = Object.freeze({
  ROOM_W: 15, ROOM_H: 11,          // tiles per room
  GRID_W: 5, GRID_H: 4,            // room grid
  SLIDE_T: 0.48,                   // screen-slide duration (s), quad ease-out
  AUTO_WALK: 2.2,                  // tiles the player advances across a slide
  DOOR_SNAP: 0.35,                 // lerp toward door center line during slide
  FADE_T: 0.35,                    // each side of the enter/exit fade (s)
  DOOR_OPEN_T: 0.25,               // leaf slides into the wall (s)
  LOCK_SHAKE_T: 0.4,               // padlock shake before opening (s)
  SHUTTER_T: 0.15,                 // shutter slam (s)
  LEDGE_DROP: 3.2,                 // tiles the ledge hop carries the player
  ENTER_RADIUS: 24,                // px from the stump doorway that triggers entry
  CAM_LERP: 0.14,                  // clamp-follow smoothing inside big-viewport rooms
  TORCH_GLOW_R: 150,               // px, drawn from the baked glow sprite
  VIGNETTE_ALPHA: 0.42,
  SPAWN_ROOM: '2,3',               // entrance hall
  SPAWN_TILE: [7, 8.5],            // player spawn inside the entrance (tile coords)
  // interactables (pass 2)
  PUSH_HOLD: 0.4,                  // sustained push before a block moves (s)
  PUSH_TWEEN: 0.18,                // one-tile block slide (s), quad ease-out
  POT_SHARDS: 5,
  POT_DROP_HEART: 0.3,             // then 0.4 trinket, else nothing
  POT_DROP_TRINKET: 0.7,
  CHEST_LID_T: 0.3,                // lid pop (s)
  CHEST_RISE_T: 0.4,               // item rises 20px over this (s)
  CHEST_GRANT_T: 0.9,              // total ceremony time before the item is granted
  KEY_RADIUS: 16,                  // px pickup touch radius
});

const Dungeon = {
  built: false,
  active: false,
  rooms: new Map(),                // "gx,gy" -> room
  doors: new Map(),                // edgeKey -> { type, state, anim }
  cur: null,
  visited: new Set(),
  slide: null,                     // { t, camFrom, camTo, pFrom, pTo, toRoom, hop }
  fade: null,                      // { t, phase: 'out'|'in', onMid }
  saved: null,                     // stashed overworld state while inside
  keys: 0, bossKey: false,
  vignette: null, vigW: 0, vigH: 0,
  leaves: {},                      // baked door-leaf sprites
  spr: {},                         // baked interactable sprites
  // session-long flags: chests stay open forever, latched switches stay
  // latched; smashed pots regrow when the dungeon is re-entered
  flags: { smashed: new Set(), latched: new Set(), chests: new Set(), keysTaken: new Set() },
};

// what each chest holds, by room
const CHEST_CONTENTS = { '1,2': 'key', '0,1': 'bombs', '3,1': 'bosskey' };
// which rooms' switches drive what: a chest unlock or a door edge
const SWITCH_WIRES = { '1,2': { chest: true }, '4,2': { door: ['4,1', '4,2'] } };

/* ---------------- authored rooms ----------------
   15 columns x 11 rows. '#' wall, 'T' wall with a torch sconce, '.' floor.
   Lowercase/uppercase letters are spawn specs for later passes (pots P,
   blocks B, switches s, chests C, pebblits o, gloomwings m, snappers x,
   boss X) — they parse as floor with a recorded spawn. Doorways are carved
   by the loader at the center of each side that has a door. */
const DUNGEON_ROOMS = [
  { key: '2,3', name: 'Entrance Hall', map: [
    '####T#####T####',
    '#.............#',
    '#.............#',
    '#.............#',
    '#.............#',
    '#.............#',
    '#.............#',
    '#.............#',
    '#....P...P....#',
    '#.............#',
    '####T#####T####',
  ]},
  { key: '2,2', name: 'The Hub', map: [
    '###T#######T###',
    '#.............#',
    '#.............#',
    '#....#...#....#',
    '#.............#',
    '#.............#',
    '#.............#',
    '#....#...#....#',
    '#..P.......P..#',
    '#.............#',
    '###T#######T###',
  ]},
  { key: '3,2', name: 'Pebblit Den', map: [
    '###############',
    '#.............#',
    '#..##.....##..#',
    '#..#T.....T#..#',
    '#......k......#',
    '#......o......#',
    '#....o...o....#',
    '#..##.....##..#',
    '#..#.......#..#',
    '#.............#',
    '###############',
  ]},
  { key: '1,2', name: 'The Weighted Door', map: [
    '###T#######T###',
    '#......C......#',
    '#....#...#....#',
    '#.............#',
    '#......B......#',
    '#.............#',
    '#......s......#',
    '#.............#',
    '#....#...#....#',
    '#..P.......P..#',
    '###############',
  ]},
  { key: '2,1', name: 'Moth Gallery', map: [
    '######T#T######',
    '#.............#',
    '#..m.......m..#',
    '#.............#',
    '#....##.##....#',
    '#.............#',
    '#....##.##....#',
    '#.............#',
    '#......m......#',
    '#.............#',
    '######T#T######',
  ]},
  { key: '1,1', name: 'Snapper Run', map: [
    '###############',
    '#.............#',
    '#..########...#',
    '#.............#',
    '#...x.....x...#',
    '#.............#',
    '#...########..#',
    '#.............#',
    '#..P.......P..#',
    '#.............#',
    '###############',
  ]},
  { key: '0,1', name: 'The Gift Room', map: [
    '####T#####T####',
    '#.............#',
    '#..#.......#..#',
    '#......C......#',
    '#..#.......#..#',
    '#.............#',
    '#..#.......#..#',
    '#.....P.P.....#',
    '#..#.......#..#',
    '#.............#',
    '###############',
  ]},
  { key: '0,2', name: 'Cracked Cellar', map: [
    '###############',
    '#.............#',
    '#..P.......P..#',
    '#.............#',
    '#.............#',
    '#.............#',
    '#.............#',
    '#.............#',
    '#..P.......P..#',
    '#.............#',
    '###############',
  ]},
  { key: '4,1', name: "M.'s Camp", map: [
    '####T#####T####',
    '#.............#',
    '#..P..........#',
    '#.............#',
    '#.............#',
    '#.............#',
    '#.............#',
    '#.......P.....#',
    '#..P........P.#',
    '#.............#',
    '###############',
  ]},
  { key: '4,2', name: 'The Switch Maze', map: [
    '###############',
    '#.............#',
    '#...#######...#',
    '#...#.....#...#',
    '#...#..s..#...#',
    '#.............#',
    '#...#..s..#...#',
    '#...#.....#...#',
    '#...##.####...#',
    '#......B......#',
    '###############',
  ]},
  { key: '3,1', name: 'The High Shelf', map: [
    '####T#####T####',
    '#.............#',
    '#.............#',
    '#......C......#',
    '#....x...x....#',
    '#.............#',
    '#.............#',
    '#.............#',
    '#.............#',
    '#.............#',
    '###############',
  ]},
  { key: '2,0', name: "The Gulper's Hollow", map: [
    '###T#######T###',
    '#.............#',
    '#.............#',
    '#.............#',
    '#.............#',
    '#.............#',
    '#.............#',
    '#......X......#',
    '#.............#',
    '#.............#',
    '######T#T######',
  ]},
];

// room-to-room edges: [roomA, roomB, type]. Sides are derived from the grid.
// 'ledge' is one-way (A -> B only); R1 additionally owns the 'exit' door south.
const DUNGEON_EDGES = [
  ['2,3', '2,2', 'open'],     // entrance -> hub
  ['2,2', '1,2', 'open'],     // hub -> weighted door (key 2 puzzle)
  ['2,2', '3,2', 'open'],     // hub -> pebblit den (key 1 combat)
  ['2,2', '2,1', 'locked'],   // hub -> moth gallery
  ['3,2', '4,2', 'locked'],   // pebblit den -> switch maze
  ['2,1', '1,1', 'open'],     // moths -> snapper run
  ['2,1', '3,1', 'cracked'],  // moths -> high shelf (boss key, needs bombs)
  ['2,1', '2,0', 'boss'],     // moths -> arena
  ['1,1', '0,1', 'open'],     // snappers -> gift room (Blossom Bombs)
  ['0,1', '0,2', 'open'],     // gift room -> cracked cellar
  ['0,2', '1,2', 'cracked'],  // cellar -> weighted door (the teaching wall)
  ['4,1', '4,2', 'shut'],     // M.'s camp -> switch maze: opens on the two switches
  ['3,1', '3,2', 'ledge'],    // high shelf -> pebblit den, one-way drop
];

const ROOM_PX_W = DUNGEON.ROOM_W * TILE;   // 600
const ROOM_PX_H = DUNGEON.ROOM_H * TILE;   // 440

function edgeKey(a, b) { return a < b ? a + '|' + b : b + '|' + a; }

function roomAt(gx, gy) { return Dungeon.rooms.get(gx + ',' + gy); }

/* ---------------- build ---------------- */

function buildDungeon(seedInt) {
  const DN = PALETTE.dungeon;
  Dungeon.rooms.clear();
  Dungeon.doors.clear();

  for (const def of DUNGEON_ROOMS) {
    const [gx, gy] = def.key.split(',').map(Number);
    const room = {
      key: def.key, gx, gy, name: def.name,
      ox: gx * ROOM_PX_W, oy: gy * ROOM_PX_H,
      tiles: new Uint8Array(DUNGEON.ROOM_W * DUNGEON.ROOM_H), // 0 floor, 1 wall, 2 door tile
      doorAt: new Map(),          // tileIndex -> door
      torches: [],                // { x, y } world px flame anchors
      spawns: [],                 // { ch, lx, ly } for later passes
      canvas: null,
      doors: [],                  // { side, door, tx, ty } (world tiles)
    };
    for (let ly = 0; ly < DUNGEON.ROOM_H; ly++) {
      const row = def.map[ly];
      for (let lx = 0; lx < DUNGEON.ROOM_W; lx++) {
        const ch = row[lx];
        if (ch === '#' || ch === 'T') {
          room.tiles[ly * DUNGEON.ROOM_W + lx] = 1;
          if (ch === 'T') room.torches.push(torchAnchor(room, lx, ly, def.map));
        } else {
          if (ch !== '.') room.spawns.push({ ch, lx, ly });
        }
      }
    }
    Dungeon.rooms.set(def.key, room);
  }

  // doors: carve a 1-tile gap at the center of each connected side
  for (const [aKey, bKey, type] of DUNGEON_EDGES) {
    const a = Dungeon.rooms.get(aKey), b = Dungeon.rooms.get(bKey);
    const door = { type, state: type === 'open' ? 'open' : 'closed', anim: type === 'open' ? 1 : 0, key: edgeKey(aKey, bKey) };
    Dungeon.doors.set(door.key, door);
    const dx = b.gx - a.gx, dy = b.gy - a.gy;
    const sideA = dx === 1 ? 'E' : dx === -1 ? 'W' : dy === 1 ? 'S' : 'N';
    carveDoor(a, sideA, door, b);
    if (type !== 'ledge') carveDoor(b, opposite(sideA), door, a);
  }
  // the entrance hall's south door leads back to the overworld
  const r1 = Dungeon.rooms.get(DUNGEON.SPAWN_ROOM);
  const exitDoor = { type: 'exit', state: 'open', anim: 1, key: 'exit' };
  Dungeon.doors.set('exit', exitDoor);
  carveDoor(r1, 'S', exitDoor, null);

  bakeDoorLeaves(seedInt);
  bakeDungeonProps(seedInt);
  for (const room of Dungeon.rooms.values()) room.canvas = bakeRoom(room, seedInt);

  Dungeon.built = true;
  window.__dungeon = Dungeon;   // debug/testing hook
  Dungeon.debugOpenAll = () => {
    for (const d of Dungeon.doors.values()) {
      if (d.type !== 'ledge') { d.state = 'open'; d.anim = 1; }
    }
  };
}

function opposite(s) { return s === 'N' ? 'S' : s === 'S' ? 'N' : s === 'E' ? 'W' : 'E'; }

function doorLocal(side) {
  const cx = (DUNGEON.ROOM_W - 1) / 2, cy = (DUNGEON.ROOM_H - 1) / 2; // 7, 5
  if (side === 'N') return [cx, 0];
  if (side === 'S') return [cx, DUNGEON.ROOM_H - 1];
  if (side === 'W') return [0, cy];
  return [DUNGEON.ROOM_W - 1, cy];
}

function carveDoor(room, side, door, other) {
  const [lx, ly] = doorLocal(side);
  const idx = ly * DUNGEON.ROOM_W + lx;
  room.tiles[idx] = 2;
  room.doorAt.set(idx, door);
  room.doors.push({ side, door, other, tx: room.gx * DUNGEON.ROOM_W + lx, ty: room.gy * DUNGEON.ROOM_H + ly });
}

// flame anchor for a torch wall tile: mount on whichever face touches floor
function torchAnchor(room, lx, ly, map) {
  const below = ly + 1 < DUNGEON.ROOM_H && map[ly + 1][lx] !== '#' && map[ly + 1][lx] !== 'T';
  const x = room.gx * ROOM_PX_W + (lx + 0.5) * TILE;
  let y;
  if (below) y = room.gy * ROOM_PX_H + (ly + 1) * TILE - 4;        // south face
  else y = room.gy * ROOM_PX_H + ly * TILE + 12;                    // north face (bottom walls)
  return { x, y, phase: (lx * 13 + ly * 7) % 6.28 };
}

/* ---------------- baking ---------------- */

function bakeRoom(room, seedInt) {
  const DN = PALETTE.dungeon, F = PALETTE.forest;
  const c = makeCanvas(ROOM_PX_W, ROOM_PX_H);
  const ctx = c.getContext('2d');
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  const W = DUNGEON.ROOM_W, H = DUNGEON.ROOM_H;
  const at = (lx, ly) => (lx < 0 || ly < 0 || lx >= W || ly >= H) ? 1 : room.tiles[ly * W + lx];

  // floor
  ctx.fillStyle = DN.floor;
  ctx.fillRect(0, 0, ROOM_PX_W, ROOM_PX_H);
  for (let ly = 0; ly < H; ly++) {
    for (let lx = 0; lx < W; lx++) {
      if (at(lx, ly) === 1) continue;
      const r = rng2(room.gx * W + lx, room.gy * H + ly, seedInt ^ 0xD00F);
      if (r() < 0.2) {
        ctx.fillStyle = withAlpha(DN.floorSpeckle, 0.22);
        ctx.beginPath();
        ctx.roundRect(lx * TILE + r() * 10, ly * TILE + r() * 10, 18 + r() * 18, 12 + r() * 12, 8);
        ctx.fill();
      }
      for (let i = 0; i < 2; i++) {
        if (r() < 0.5) continue;
        ctx.fillStyle = DN.floorSpeckle;
        ctx.beginPath();
        ctx.arc(lx * TILE + r() * TILE, ly * TILE + r() * TILE, 1.4 + r() * 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
      // stray ink flecks, the hand-drawn busyness
      if (r() < 0.2) {
        ctx.strokeStyle = withAlpha(F.ink, 0.24);
        ctx.lineWidth = 1.3;
        const px = lx * TILE + r() * TILE, py = ly * TILE + r() * TILE;
        const a = r() * Math.PI;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px + Math.cos(a) * 3, py + Math.sin(a) * 3);
        ctx.stroke();
      }
    }
  }

  // walls: bark base, lit south-facing cap, dark under-strip, root squiggles
  for (let ly = 0; ly < H; ly++) {
    for (let lx = 0; lx < W; lx++) {
      if (at(lx, ly) !== 1) continue;
      const x = lx * TILE, y = ly * TILE;
      const r = rng2(room.gx * W + lx, room.gy * H + ly, seedInt ^ 0xBA2C);
      ctx.fillStyle = DN.wall;
      ctx.fillRect(x - 0.5, y - 0.5, TILE + 1, TILE + 1);
      if (at(lx, ly - 1) !== 1) {           // exposed top edge
        ctx.fillStyle = withAlpha(DN.dark, 0.35);
        ctx.fillRect(x, y, TILE, 5);
      }
      if (at(lx, ly + 1) !== 1) {           // south face catches the light
        ctx.fillStyle = DN.wallRim;
        ctx.fillRect(x, y + TILE - 9, TILE, 9);
        ctx.fillStyle = withAlpha(DN.dark, 0.3);
        ctx.fillRect(x, y + TILE - 2, TILE, 2);
      }
      // vertical bark grain
      ctx.strokeStyle = withAlpha(F.ink, 0.35);
      ctx.lineWidth = 1.6;
      const n = 1 + ((r() * 2) | 0);
      for (let i = 0; i < n; i++) {
        const bx = x + 6 + r() * (TILE - 12);
        ctx.beginPath();
        ctx.moveTo(bx, y + 4 + r() * 8);
        ctx.quadraticCurveTo(bx + (r() - 0.5) * 5, y + TILE / 2, bx + (r() - 0.5) * 3, y + TILE - 6 - r() * 6);
        ctx.stroke();
      }
    }
  }

  // wobbly ink line along every wall/floor boundary (the storybook outline)
  const rEdge = rng2(room.gx, room.gy, seedInt ^ 0x1BCE);
  ctx.strokeStyle = F.ink;
  ctx.lineWidth = 2.2;
  for (let ly = 0; ly < H; ly++) {
    for (let lx = 0; lx < W; lx++) {
      if (at(lx, ly) !== 1) continue;
      const x = lx * TILE, y = ly * TILE;
      if (at(lx, ly + 1) === 0 || at(lx, ly + 1) === 2) Sketch.line(ctx, x, y + TILE, x + TILE, y + TILE, rEdge, { rough: 1.5 });
      if (at(lx, ly - 1) === 0 || at(lx, ly - 1) === 2) Sketch.line(ctx, x, y, x + TILE, y, rEdge, { rough: 1.5 });
      if (at(lx - 1, ly) === 0 || at(lx - 1, ly) === 2) Sketch.line(ctx, x, y, x, y + TILE, rEdge, { rough: 1.5 });
      if (at(lx + 1, ly) === 0 || at(lx + 1, ly) === 2) Sketch.line(ctx, x + TILE, y, x + TILE, y + TILE, rEdge, { rough: 1.5 });
    }
  }

  // door tiles: dark recess arches (cracked doors keep the wall look + cracks)
  for (const d of room.doors) {
    const lx = d.tx - room.gx * W, ly = d.ty - room.gy * H;
    const x = lx * TILE, y = ly * TILE;
    if (d.door.type === 'cracked') {
      // looks like wall until pass 4 opens it: bake bark + a web of ink cracks
      ctx.fillStyle = DN.wall;
      ctx.fillRect(x, y, TILE, TILE);
      const rc = rng2(d.tx, d.ty, seedInt ^ 0xC2AC);
      ctx.strokeStyle = withAlpha(F.ink, 0.85);
      ctx.lineWidth = 1.8;
      const cx0 = x + TILE / 2 + (rc() - 0.5) * 6, cy0 = y + TILE / 2 + (rc() - 0.5) * 6;
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 + rc() * 0.7;
        Sketch.line(ctx, cx0, cy0, cx0 + Math.cos(a) * (10 + rc() * 9), cy0 + Math.sin(a) * (10 + rc() * 9), rc, { rough: 2, passes: 1 });
      }
      continue;
    }
    if (d.door.type === 'ledge') {
      // a gap with a stone lip — you can drop off it, never climb back
      ctx.fillStyle = DN.dark;
      ctx.fillRect(x, y + 4, TILE, TILE - 4);
      const rl = rng2(d.tx, d.ty, seedInt ^ 0x1ED6E);
      for (let i = 0; i < 4; i++) {
        const sx = x + 4 + i * (TILE / 4);
        ctx.fillStyle = F.stone;
        ctx.strokeStyle = F.ink; ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.ellipse(sx + 4, y + TILE - 5, 6 + rl() * 3, 4 + rl() * 2, (rl() - 0.5) * 0.6, 0, Math.PI * 2);
        ctx.fill(); ctx.stroke();
      }
      continue;
    }
    // recess: dark passage through the wall thickness
    ctx.fillStyle = DN.dark;
    if (d.side === 'N' || d.side === 'S') ctx.fillRect(x + 3, y - 2, TILE - 6, TILE + 4);
    else ctx.fillRect(x - 2, y + 3, TILE + 4, TILE - 6);
    ctx.strokeStyle = F.ink; ctx.lineWidth = 2;
    if (d.side === 'N' || d.side === 'S') { Sketch.line(ctx, x + 3, y, x + 3, y + TILE, rEdge, { rough: 1.4 }); Sketch.line(ctx, x + TILE - 3, y, x + TILE - 3, y + TILE, rEdge, { rough: 1.4 }); }
    else { Sketch.line(ctx, x, y + 3, x + TILE, y + 3, rEdge, { rough: 1.4 }); Sketch.line(ctx, x, y + TILE - 3, x + TILE, y + TILE - 3, rEdge, { rough: 1.4 }); }
  }

  // torch sconces (flames + glow are drawn live)
  for (const t of room.torches) {
    const spr = SPRITES.torch[0];
    ctx.drawImage(spr.c, t.x - room.ox - spr.ax, t.y - room.oy - spr.ay);
  }

  // paper grain, the storybook signature
  ctx.globalCompositeOperation = 'multiply';
  ctx.globalAlpha = 0.4;
  ctx.fillStyle = ctx.createPattern(SPRITES.grain, 'repeat');
  ctx.fillRect(0, 0, ROOM_PX_W, ROOM_PX_H);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  return c;
}

// door leaves, baked once per type (drawn rotated for E/W doors)
function bakeDoorLeaves(seedInt) {
  const DN = PALETTE.dungeon, F = PALETTE.forest;
  const R = mulberry32(seedInt ^ 0xD002);
  Dungeon.leaves.locked = sprite(TILE, TILE + 8, TILE / 2, TILE + 4, (ctx) => {
    ctx.fillStyle = F.woodLight;
    ctx.strokeStyle = F.ink; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(3, 2, TILE - 6, TILE + 2, 5); ctx.fill(); ctx.stroke();
    for (let i = 1; i < 3; i++) Sketch.line(ctx, 3 + i * (TILE - 6) / 3, 4, 3 + i * (TILE - 6) / 3, TILE, R, { rough: 1.2, passes: 1 });
    ctx.fillStyle = DN.iron;
    ctx.beginPath(); ctx.roundRect(TILE / 2 - 7, TILE / 2 - 4, 14, 15, 4); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(TILE / 2, TILE / 2 - 4, 5.5, Math.PI, 0); ctx.stroke();
    ctx.fillStyle = F.ink;
    ctx.beginPath(); ctx.arc(TILE / 2, TILE / 2 + 2.5, 2.2, 0, Math.PI * 2); ctx.fill();
  });
  Dungeon.leaves.boss = sprite(TILE + 8, TILE + 10, TILE / 2 + 4, TILE + 5, (ctx) => {
    ctx.fillStyle = F.trunk;
    ctx.strokeStyle = F.ink; ctx.lineWidth = 2.4;
    ctx.beginPath(); ctx.roundRect(2, 2, TILE + 4, TILE + 4, 7); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = withAlpha(F.ink, 0.6); ctx.lineWidth = 1.6;
    for (let i = 1; i < 4; i++) Sketch.line(ctx, 2 + i * (TILE + 4) / 4, 4, 2 + i * (TILE + 4) / 4, TILE + 2, R, { rough: 1.2, passes: 1 });
    // the ornate lock: purple skull-blossom motif
    ctx.fillStyle = F.pond;
    ctx.strokeStyle = F.ink; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(TILE / 2 + 4, TILE / 2 - 2, 9, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = DN.keyGold;
    starPath(ctx, TILE / 2 + 4, TILE / 2 - 2, 6, 4); ctx.fill(); ctx.stroke();
    ctx.fillStyle = DN.iron;
    ctx.beginPath(); ctx.roundRect(TILE / 2 - 2, TILE / 2 + 6, 12, 10, 3); ctx.fill(); ctx.stroke();
  });
  Dungeon.leaves.shutter = sprite(TILE, TILE + 8, TILE / 2, TILE + 4, (ctx) => {
    ctx.fillStyle = DN.iron;
    ctx.strokeStyle = F.ink; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(3, 2, TILE - 6, TILE + 2, 4); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = withAlpha(F.ink, 0.7); ctx.lineWidth = 1.8;
    for (let i = 1; i < 5; i++) Sketch.line(ctx, 5, 2 + i * TILE / 5, TILE - 5, 2 + i * TILE / 5, R, { rough: 1, passes: 1 });
  });
}

/* ---------------- solidity ---------------- */

function dungeonSolidAt(wx, wy) {
  const tx = Math.floor(wx / TILE), ty = Math.floor(wy / TILE);
  const gx = Math.floor(tx / DUNGEON.ROOM_W), gy = Math.floor(ty / DUNGEON.ROOM_H);
  const room = roomAt(gx, gy);
  if (!room) return true;
  const lx = tx - gx * DUNGEON.ROOM_W, ly = ty - gy * DUNGEON.ROOM_H;
  const idx = ly * DUNGEON.ROOM_W + lx;
  const v = room.tiles[idx];
  if (v === 0) return room.dyn ? room.dyn.has(idx) : false;   // pots/blocks/chests
  if (v === 1) return true;
  const door = room.doorAt.get(idx);
  if (!door) return true;
  if (door.type === 'ledge') return false;          // walkable from the shelf side only (other side never carved)
  return door.state !== 'open';
}

/* ---------------- interactables (pass 2) ---------------- */

function bakeDungeonProps(seedInt) {
  const DN = PALETTE.dungeon, F = PALETTE.forest;
  const S = Dungeon.spr;

  S.pot = [];
  for (let i = 0; i < 2; i++) {
    const R = mulberry32(seedInt ^ (0x907 + i));
    S.pot.push(sprite(34, 38, 17, 26, (ctx) => {
      blobShadow(ctx, 17, 33, 11, 3.5);
      Sketch.blob(ctx, [
        [7, 30], [4, 18], [9, 8], [17, 6], [25, 8], [30, 18], [27, 30], [17, 33],
      ], R, { fill: F.stone, stroke: F.ink, lineWidth: 2.2, rough: 1.6 });
      ctx.fillStyle = shade(PALETTE.forest.stone, 0.85);
      ctx.beginPath(); ctx.roundRect(9, 6, 16, 5, 2.5); ctx.fill();
      ctx.strokeStyle = F.ink; ctx.lineWidth = 2; ctx.stroke();
      ctx.strokeStyle = withAlpha(F.ink, 0.5); ctx.lineWidth = 1.6;
      Sketch.line(ctx, 8, 22, 26, 22, R, { rough: 1.4, passes: 1 });
    }));
  }

  {
    const R = mulberry32(seedInt ^ 0xB10C);
    S.block = sprite(TILE, TILE + 8, TILE / 2, 30, (ctx) => {
      // mossy root-bound cube: light top, dark base, ink outline
      ctx.fillStyle = F.stone;
      ctx.strokeStyle = F.ink; ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.roundRect(3, 10, TILE - 6, TILE - 8, 5); ctx.fill(); ctx.stroke();
      ctx.fillStyle = shade(PALETTE.forest.stone, 1.14);
      ctx.beginPath(); ctx.roundRect(3, 10, TILE - 6, 10, 5); ctx.fill();
      ctx.fillStyle = withAlpha(PALETTE.dungeon.dark, 0.25);
      ctx.fillRect(5, TILE - 4, TILE - 10, 5);
      ctx.strokeStyle = withAlpha(F.ink, 0.6); ctx.lineWidth = 1.6;
      Sketch.line(ctx, 8, 20, 16, 26, R, { rough: 1.4, passes: 1 });
      Sketch.line(ctx, TILE - 14, 18, TILE - 8, 26, R, { rough: 1.4, passes: 1 });
      ctx.fillStyle = withAlpha(PALETTE.forest.canopyMid, 0.7);
      ctx.beginPath(); ctx.arc(10, 13, 3, 0, Math.PI * 2); ctx.arc(26, 12, 2.4, 0, Math.PI * 2); ctx.fill();
    });
  }

  for (const pressed of [0, 1]) {
    const R = mulberry32(seedInt ^ (0x51C + pressed));
    S['switch' + pressed] = sprite(TILE, TILE, TILE / 2, TILE / 2, (ctx) => {
      ctx.fillStyle = withAlpha(PALETTE.dungeon.dark, 0.3);
      ctx.beginPath(); ctx.roundRect(7, 9, TILE - 14, TILE - 16, 6); ctx.fill();
      ctx.fillStyle = pressed ? shade(PALETTE.dungeon.floorSpeckle, 0.8) : PALETTE.dungeon.floorSpeckle;
      ctx.strokeStyle = F.ink; ctx.lineWidth = 2;
      const lift = pressed ? 0 : 3;
      ctx.beginPath(); ctx.roundRect(9, 11 - lift, TILE - 18, TILE - 20, 5); ctx.fill(); ctx.stroke();
      ctx.fillStyle = withAlpha(F.ink, 0.55);
      ctx.beginPath(); ctx.arc(TILE / 2, TILE / 2 - 2 - lift, 3, 0, Math.PI * 2); ctx.fill();
    });
  }

  for (const open of [0, 1]) {
    const R = mulberry32(seedInt ^ (0xCE57 + open));
    S['chest' + open] = sprite(44, 42, 22, 30, (ctx) => {
      blobShadow(ctx, 22, 37, 15, 4);
      if (open) {
        ctx.fillStyle = PALETTE.dungeon.dark;
        ctx.beginPath(); ctx.roundRect(6, 16, 32, 18, 4); ctx.fill();
        ctx.strokeStyle = F.ink; ctx.lineWidth = 2.2; ctx.stroke();
        ctx.fillStyle = F.woodLight;                    // lid tipped back
        ctx.beginPath(); ctx.roundRect(4, 4, 36, 10, 4); ctx.fill(); ctx.stroke();
        ctx.fillStyle = PALETTE.dungeon.iron;
        ctx.fillRect(19, 4, 6, 10); ctx.strokeRect(19, 4, 6, 10);
      } else {
        ctx.fillStyle = F.woodLight;
        ctx.strokeStyle = F.ink; ctx.lineWidth = 2.2;
        ctx.beginPath(); ctx.roundRect(6, 12, 32, 22, 5); ctx.fill(); ctx.stroke();
        ctx.fillStyle = F.trunk;
        ctx.beginPath(); ctx.roundRect(6, 12, 32, 9, 5); ctx.fill(); ctx.stroke();
        ctx.fillStyle = PALETTE.dungeon.iron;
        ctx.fillRect(19, 12, 6, 22); ctx.strokeRect(19, 12, 6, 22);
        ctx.fillStyle = PALETTE.dungeon.keyGold;
        ctx.beginPath(); ctx.arc(22, 24, 3, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      }
    });
  }

  for (const big of [0, 1]) {
    const R = mulberry32(seedInt ^ (0x4E1 + big));
    const s = big ? 1.4 : 1;
    S[big ? 'bosskey' : 'key'] = sprite(26 * s, 30 * s, 13 * s, 26 * s, (ctx) => {
      ctx.save();
      ctx.scale(s, s);
      blobShadow(ctx, 13, 26, 8, 2.6);
      ctx.fillStyle = PALETTE.dungeon.keyGold;
      ctx.strokeStyle = F.ink; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(13, 8, 5.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = F.cream;
      ctx.beginPath(); ctx.arc(13, 8, 2.2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = PALETTE.dungeon.keyGold;
      ctx.beginPath(); ctx.roundRect(11.4, 12, 3.2, 12, 1.5); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.roundRect(14, 19, 5, 2.6, 1); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.roundRect(14, 23, 4, 2.6, 1); ctx.fill(); ctx.stroke();
      if (big) {
        ctx.fillStyle = PALETTE.forest.pond;
        starPath(ctx, 13, 8, 4.4, 4); ctx.fill();
      }
      ctx.restore();
    });
  }

  {
    // a blossom bomb bud (chest ceremony + pass 4 item)
    const R = mulberry32(seedInt ^ 0xB0B);
    S.bloom = sprite(26, 26, 13, 22, (ctx) => {
      const D = PALETTE.desert;
      blobShadow(ctx, 13, 22, 8, 2.6);
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
        ctx.fillStyle = D.blossom;
        ctx.strokeStyle = F.ink; ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.ellipse(13 + Math.cos(a) * 6, 12 + Math.sin(a) * 6, 5, 4, a, 0, Math.PI * 2);
        ctx.fill(); ctx.stroke();
      }
      ctx.fillStyle = D.blossomYellow;
      ctx.beginPath(); ctx.arc(13, 12, 3.6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    });
  }
}

// spawn the current room's live objects from its spawn specs + session flags
function activateRoom(game, room) {
  // despawn everything room-scoped (dungeon entities never outlive their room)
  game.entities.length = 0;
  room.dyn = new Map();
  const W = DUNGEON.ROOM_W;
  const addDyn = (lx, ly, e) => room.dyn.set(ly * W + lx, e);
  const solved = roomSwitchesLatched(room);
  let potIdx = 0;
  for (const sp of room.spawns) {
    const wx = room.ox + (sp.lx + 0.5) * TILE;
    const wy = room.oy + (sp.ly + 0.5) * TILE;
    if (sp.ch === 'P') {
      const id = room.key + ':pot' + potIdx++;
      if (Dungeon.flags.smashed.has(id)) continue;
      const r = rng2(room.gx * W + sp.lx, room.gy * DUNGEON.ROOM_H + sp.ly, World.seedInt ^ 0x907);
      const e = { kind: 'pot', id, x: wx, y: wy, px: wx, py: wy, lx: sp.lx, ly: sp.ly,
                  radius: 14, hittable: true, variant: (r() * 2) | 0, drop: r() };
      game.entities.push(e);
      addDyn(sp.lx, sp.ly, e);
    } else if (sp.ch === 'B') {
      // blocks reset to their authored tile until the room's puzzle is latched
      const e = { kind: 'dblock', x: wx, y: wy, px: wx, py: wy, lx: sp.lx, ly: sp.ly,
                  pushT: 0, slide: null, room };
      game.entities.push(e);
      addDyn(sp.lx, sp.ly, e);
    } else if (sp.ch === 's') {
      const id = room.key + ':sw' + sp.lx + ',' + sp.ly;
      const e = { kind: 'dswitch', id, x: wx, y: wy, px: wx, py: wy, lx: sp.lx, ly: sp.ly,
                  latched: Dungeon.flags.latched.has(id), pressed: false };
      game.entities.push(e);
    } else if (sp.ch === 'C') {
      const id = room.key + ':chest';
      const contents = CHEST_CONTENTS[room.key] || 'trinkets';
      const opened = Dungeon.flags.chests.has(id);
      const wired = SWITCH_WIRES[room.key] && SWITCH_WIRES[room.key].chest;
      const e = { kind: 'dchest', id, contents, x: wx, y: wy, px: wx, py: wy, lx: sp.lx, ly: sp.ly,
                  state: opened ? 'open' : (wired && !solved) ? 'locked' : 'closed',
                  openT: 0, sparkleT: Math.random() * 2 };
      e.interact = { label: 'open', action: () => openChest(game, e) };
      game.entities.push(e);
      addDyn(sp.lx, sp.ly, e);
    } else if (sp.ch === 'k') {
      const id = room.key + ':key';
      if (Dungeon.flags.keysTaken.has(id)) continue;
      game.entities.push({ kind: 'dkey', id, x: wx, y: wy, px: wx, py: wy, bobT: Math.random() * 6 });
    }
    // enemy chars (o m x X) spawn in pass 3 / 5
  }
}

function roomSwitchesLatched(room) {
  const W = DUNGEON.ROOM_W;
  let all = true, any = false;
  for (const sp of room.spawns) {
    if (sp.ch !== 's') continue;
    any = true;
    if (!Dungeon.flags.latched.has(room.key + ':sw' + sp.lx + ',' + sp.ly)) all = false;
  }
  return any && all;
}

function smashPot(game, e) {
  Dungeon.flags.smashed.add(e.id);
  if (Dungeon.cur && Dungeon.cur.dyn) Dungeon.cur.dyn.delete(e.ly * DUNGEON.ROOM_W + e.lx);
  game.freeze(COMBAT.HITSTOP);
  game.burst(e.x, e.y - 10, DUNGEON.POT_SHARDS, PALETTE.forest.stone);
  game.burst(e.x, e.y - 10, 4, PALETTE.forest.cream);
  if (e.drop < DUNGEON.POT_DROP_HEART) spawnPickup(game, e.x, e.y, 'heart');
  else if (e.drop < DUNGEON.POT_DROP_TRINKET) spawnPickup(game, e.x, e.y, 'trinket');
  game.removeEntity(e);
}

function openChest(game, e) {
  if (e.state === 'locked') {
    game.showDialog('The lid is held fast by roots. Something in this room must loosen them.');
    return;
  }
  if (e.state !== 'closed') return;
  e.state = 'opening';
  e.openT = 0;
  game.burst(e.x, e.y - 14, 6, PALETTE.fx.trinket);
}

function grantChest(game, e) {
  Dungeon.flags.chests.add(e.id);
  if (e.contents === 'key') {
    Dungeon.keys++;
    game.floatText(e.x, e.y - 40, '+1 key');
    game.showDialog('A small golden key! It smells faintly of moss.');
  } else if (e.contents === 'bosskey') {
    Dungeon.bossKey = true;
    game.shake(0.15, 0.01);
    game.showDialog('The <b>Big Key</b>! Far below, something enormous sighs in its sleep.');
  } else if (e.contents === 'bombs') {
    game.bombs = { count: 3, cap: 3, regrowT: 0 };
    game.showDialog('<b>Blossom Bombs!</b> Cactus buds that pop into a cheerful petal-BOOM.<span class="hint">They regrow on their own. Cracked walls beware.</span>');
  } else {
    for (let i = 0; i < 3; i++) spawnPickup(game, e.x, e.y, 'trinket');
  }
}

function updateDChest(e, game, dt) {
  e.sparkleT -= dt;
  if (e.sparkleT <= 0 && e.state !== 'open' && e.state !== 'opening') {
    e.sparkleT = 1.6 + Math.random();
    emitParticle(game.particles, e.x + (Math.random() - 0.5) * 24, e.y - 18 - Math.random() * 8,
      0, -8, 0.5, 1.6, PALETTE.fx.trinket);
  }
  if (e.state === 'opening') {
    e.openT += dt;
    if (e.openT > DUNGEON.CHEST_LID_T && !e.popped) {
      e.popped = true;
      game.burst(e.x, e.y - 16, 8, PALETTE.fx.flash);
    }
    if (e.openT > DUNGEON.CHEST_GRANT_T) {
      e.state = 'open';
      grantChest(game, e);
    }
  }
}

function updateDKey(e, game, dt) {
  e.bobT += dt;
  const p = game.player;
  if (dist2(p.x, p.y, e.x, e.y) < DUNGEON.KEY_RADIUS * DUNGEON.KEY_RADIUS * 4) {
    Dungeon.flags.keysTaken.add(e.id);
    Dungeon.keys++;
    game.burst(e.x, e.y - 8, 8, PALETTE.dungeon.keyGold);
    game.floatText(e.x, e.y - 28, '+1 key');
    game.removeEntity(e);
  }
}

function updateDSwitch(e, game, dt) {
  const p = game.player;
  const room = Dungeon.cur;
  const idx = e.ly * DUNGEON.ROOM_W + e.lx;
  const occ = room.dyn && room.dyn.get(idx);
  const playerOn = Math.floor(p.x / TILE) === room.gx * DUNGEON.ROOM_W + e.lx &&
                   Math.floor(p.y / TILE) === room.gy * DUNGEON.ROOM_H + e.ly;
  const wasActive = e.pressed || e.latched;
  e.pressed = playerOn || !!occ;
  // a block that has come to rest on the plate latches it for good
  if (!e.latched && occ && occ.kind === 'dblock' && !occ.slide) {
    e.latched = true;
    occ.locked = true;              // the roots grip the block for good
    Dungeon.flags.latched.add(e.id);
    game.burst(e.x, e.y - 4, 8, PALETTE.dungeon.floorSpeckle);
    game.floatText(e.x, e.y - 24, 'chunk!');
  }
  if (!wasActive && (e.pressed || e.latched)) game.shake(0.05, 0.004);
}

// sustained-push block movement, grid-snapped with a tweened slide
function updateDBlock(e, game, dt) {
  const room = Dungeon.cur;
  const W = DUNGEON.ROOM_W, H = DUNGEON.ROOM_H;
  if (e.slide) {
    const s = e.slide;
    s.t += dt / DUNGEON.PUSH_TWEEN;
    const u = clamp(s.t, 0, 1);
    const k = 1 - (1 - u) * (1 - u);
    e.x = lerp(s.fx, s.tx, k);
    e.y = lerp(s.fy, s.ty, k);
    if (u >= 1) {
      room.dyn.delete(s.fromIdx);
      e.lx = s.toLx; e.ly = s.toLy;
      e.slide = null;
      game.burst(e.x, e.y + 6, 4, PALETTE.dungeon.floorSpeckle);
    }
    return;
  }
  if (e.locked) return;             // settled onto a switch — held fast
  const p = game.player;
  // is the player walking into this block?
  const { ix, iy } = game.readInput();
  let dx = 0, dy = 0;
  if (Math.abs(ix) > Math.abs(iy) && Math.abs(ix) > 0.3) dx = Math.sign(ix);
  else if (Math.abs(iy) > 0.3) dy = Math.sign(iy);
  const facingTileX = Math.floor((p.x + dx * (p.radius + 8)) / TILE);
  const facingTileY = Math.floor((p.y + dy * (p.radius + 8)) / TILE);
  const bTx = room.gx * W + e.lx, bTy = room.gy * H + e.ly;
  const pushing = (dx || dy) && facingTileX === bTx && facingTileY === bTy &&
    Math.abs(p.x - e.x) < TILE && Math.abs(p.y - e.y) < TILE;
  if (!pushing) { e.pushT = Math.max(0, e.pushT - dt * 2); return; }
  e.pushT += dt;
  if (e.pushT < DUNGEON.PUSH_HOLD) return;
  const nlx = e.lx + dx, nly = e.ly + dy;
  if (nlx < 1 || nly < 1 || nlx >= W - 1 || nly >= H - 1) { e.pushT = 0; return; }
  const nIdx = nly * W + nlx;
  if (room.tiles[nIdx] !== 0 || room.dyn.has(nIdx)) { e.pushT = 0; return; }
  e.pushT = 0;
  const fromIdx = e.ly * W + e.lx;
  room.dyn.set(nIdx, e);                     // destination becomes solid immediately
  e.slide = {
    t: 0, fromIdx, toLx: nlx, toLy: nly,
    fx: e.x, fy: e.y,
    tx: room.ox + (nlx + 0.5) * TILE,
    ty: room.oy + (nly + 0.5) * TILE,
  };
}

// switch wiring: one mutation point, checked once per tick for the current room
function checkRoomWiring(game) {
  const room = Dungeon.cur;
  const wire = SWITCH_WIRES[room.key];
  if (!wire) return;
  let all = true, any = false;
  for (const e of game.entities) {
    if (e.kind !== 'dswitch') continue;
    any = true;
    if (!(e.pressed || e.latched)) all = false;
  }
  if (!any || !all) return;
  if (wire.chest) {
    for (const e of game.entities) {
      if (e.kind === 'dchest' && e.state === 'locked') {
        e.state = 'closed';
        game.burst(e.x, e.y - 14, 10, PALETTE.fx.trinket);
        game.floatText(e.x, e.y - 36, '*click*');
        game.shake(0.08, 0.006);
      }
    }
  } else if (wire.door) {
    const door = Dungeon.doors.get(edgeKey(wire.door[0], wire.door[1]));
    if (door && door.state === 'closed' && !door.opening) {
      door.opening = true;
      game.shake(0.08, 0.006);
      game.floatText(game.player.x, game.player.y - 44, 'something opened...');
    }
  }
}

// pushing against a locked/boss door spends the matching key
function checkDoorUnlock(game, dt) {
  const p = game.player;
  const room = Dungeon.cur;
  const DIRV = [[0, 1], [0, -1], [-1, 0], [1, 0]];   // down, up, left, right
  const [dx, dy] = DIRV[p.dir];
  if (!p.moving) return;
  const tx = Math.floor((p.x + dx * (p.radius + 10)) / TILE);
  const ty = Math.floor((p.y + dy * (p.radius + 10)) / TILE);
  if (Math.floor(tx / DUNGEON.ROOM_W) !== room.gx || Math.floor(ty / DUNGEON.ROOM_H) !== room.gy) return;
  const idx = (ty - room.gy * DUNGEON.ROOM_H) * DUNGEON.ROOM_W + (tx - room.gx * DUNGEON.ROOM_W);
  const door = room.doorAt.get(idx);
  if (!door || door.state !== 'closed' || door.opening || door.shakeT > 0) return;
  if (door.type === 'locked') {
    if (Dungeon.keys > 0) {
      Dungeon.keys--;
      door.shakeT = DUNGEON.LOCK_SHAKE_T;
      game.floatText((tx + 0.5) * TILE, (ty + 0.5) * TILE - 20, '*click*');
    } else if (!door.hinted || door.hinted < game.time - 4) {
      door.hinted = game.time;
      game.showDialog('Locked. The keyhole is shaped like a little moss-flower.');
    }
  } else if (door.type === 'boss') {
    if (Dungeon.bossKey) {
      door.shakeT = DUNGEON.LOCK_SHAKE_T;
      game.shake(0.1, 0.008);
    } else if (!door.hinted || door.hinted < game.time - 4) {
      door.hinted = game.time;
      game.showDialog('An enormous ornate door. It wants an enormous ornate key.');
    }
  }
}

// door animation bookkeeping (shake -> leaf slides into the wall -> open)
function updateDoors(game, dt) {
  for (const door of Dungeon.doors.values()) {
    if (door.shakeT > 0) {
      door.shakeT -= dt;
      if (door.shakeT <= 0) door.opening = true;
    } else if (door.opening && door.state === 'closed') {
      door.anim += dt / DUNGEON.DOOR_OPEN_T;
      if (door.anim >= 1) {
        door.anim = 1;
        door.state = 'open';
        door.opening = false;
      }
    }
  }
}

/* ---------------- enter / exit / respawn ---------------- */

function dungeonSpawnPos() {
  const room = Dungeon.rooms.get(DUNGEON.SPAWN_ROOM);
  return {
    x: room.ox + (DUNGEON.SPAWN_TILE[0] + 0.5) * TILE,
    y: room.oy + DUNGEON.SPAWN_TILE[1] * TILE,
  };
}

function placePlayerInDungeon(game) {
  const p = game.player;
  const s = dungeonSpawnPos();
  p.x = p.px = s.x; p.y = p.py = s.y;
  p.knockX = p.knockY = 0;
  p.attackState = 'none';
  p.dir = 1; // facing up, into the dungeon
  Dungeon.cur = Dungeon.rooms.get(DUNGEON.SPAWN_ROOM);
  Dungeon.visited.add(DUNGEON.SPAWN_ROOM);
  activateRoom(game, Dungeon.cur);
  const cam = dungeonCamTarget(Dungeon.cur, p);
  game.cam.x = game.cam.px = cam.x;
  game.cam.y = game.cam.py = cam.y;
}

function enterDungeon(game) {
  if (Dungeon.fade || Dungeon.active) return;
  Dungeon.fade = {
    t: 0, phase: 'out',
    onMid: () => {
      const p = game.player;
      Dungeon.saved = { x: p.x, y: p.y, entities: game.entities };
      game.entities = [];
      Dungeon.active = true;
      Dungeon.flags.smashed.clear();   // pots regrow between visits
      placePlayerInDungeon(game);
      game.showDialog('The Hollow Stump. Somewhere below, a quill is still scratching.');
    },
  };
}

function exitDungeon(game) {
  if (Dungeon.fade) return;
  Dungeon.fade = {
    t: 0, phase: 'out',
    onMid: () => {
      const p = game.player;
      game.entities = Dungeon.saved ? Dungeon.saved.entities : [];
      Dungeon.active = false;
      Dungeon.slide = null;
      const s = World.stumpSpot;
      p.x = p.px = (s.tx + 0.5) * TILE;
      p.y = p.py = (s.ty + 1.4) * TILE;
      p.dir = 0;
      p.knockX = p.knockY = 0;
      p.attackState = 'none';
      game.cam.x = game.cam.px = p.x;
      game.cam.y = game.cam.py = p.y;
      Dungeon.saved = null;
      Dungeon.leaveCooldown = 1.2;   // don't get re-swallowed by the doorway
    },
  };
}

// overworld trigger entity in the stump doorway
function updateStumpDoor(e, game, dt) {
  if (Dungeon.leaveCooldown > 0) { Dungeon.leaveCooldown -= dt; return; }
  const p = game.player;
  if (game.deathT !== null || Dungeon.fade) return;
  if (dist2(p.x, p.y, e.x, e.y) < DUNGEON.ENTER_RADIUS * DUNGEON.ENTER_RADIUS) enterDungeon(game);
}

/* ---------------- camera & slides ---------------- */

function dungeonCamTarget(room, p) {
  const vw = innerWidth, vh = innerHeight;
  const x = ROOM_PX_W <= vw ? room.ox + ROOM_PX_W / 2 : clamp(p.x, room.ox + vw / 2, room.ox + ROOM_PX_W - vw / 2);
  const y = ROOM_PX_H <= vh ? room.oy + ROOM_PX_H / 2 : clamp(p.y, room.oy + vh / 2, room.oy + ROOM_PX_H - vh / 2);
  return { x, y };
}

function startSlide(game, toRoom, dirX, dirY, hop) {
  const p = game.player;
  const pTo = { x: p.x + dirX * DUNGEON.AUTO_WALK * TILE, y: p.y + dirY * (hop ? DUNGEON.LEDGE_DROP : DUNGEON.AUTO_WALK) * TILE };
  // drift toward the door's center line so the walk-through never clips a jamb
  if (dirY !== 0) pTo.x = lerp(p.x, (Math.floor(p.x / TILE) + 0.5) * TILE, DUNGEON.DOOR_SNAP);
  if (dirX !== 0) pTo.y = lerp(p.y, (Math.floor(p.y / TILE) + 0.5) * TILE, DUNGEON.DOOR_SNAP);
  Dungeon.slide = {
    t: 0,
    camFrom: { x: game.cam.x, y: game.cam.y },
    camTo: dungeonCamTarget(toRoom, pTo),
    pFrom: { x: p.x, y: p.y },
    pTo, toRoom, hop: !!hop,
  };
}

/* ---------------- the mode update ---------------- */

function updateDungeonMode(game, dt) {
  const p = game.player;

  // enter/exit fade: gameplay frozen, world swaps at the midpoint
  if (Dungeon.fade) {
    const f = Dungeon.fade;
    f.t += dt;
    if (f.phase === 'out' && f.t >= DUNGEON.FADE_T) {
      f.onMid();
      f.phase = 'in';
      f.t = 0;
    } else if (f.phase === 'in' && f.t >= DUNGEON.FADE_T) {
      Dungeon.fade = null;
    }
    return;
  }
  if (!Dungeon.active) return;

  p.px = p.x; p.py = p.y;
  game.cam.px = game.cam.x; game.cam.py = game.cam.y;

  // soft defeat: carried back to the entrance hall with everything kept
  if (game.deathT !== null) {
    game.deathT += dt;
    if (game.deathT >= COMBAT.DEATH_FADE && p.hp <= 0) {
      placePlayerInDungeon(game);
      p.hp = p.maxHp || COMBAT.MAX_HP;
      p.iFrameT = COMBAT.IFRAMES;
      Dungeon.slide = null;
      game.showDialog('You wake by the entrance torches. The stump kept everything you found.');
    }
    if (game.deathT >= COMBAT.DEATH_FADE * 2) game.deathT = null;
  }

  // screen-slide between rooms: entities frozen, camera + player tween only
  if (Dungeon.slide) {
    const s = Dungeon.slide;
    s.t += dt;
    const u = clamp(s.t / DUNGEON.SLIDE_T, 0, 1);
    const e = 1 - (1 - u) * (1 - u);     // quad ease-out
    game.cam.x = lerp(s.camFrom.x, s.camTo.x, e);
    game.cam.y = lerp(s.camFrom.y, s.camTo.y, e);
    p.x = lerp(s.pFrom.x, s.pTo.x, u);
    p.y = lerp(s.pFrom.y, s.pTo.y, u);
    if (s.hop) p.y -= Math.sin(Math.PI * u) * 26;   // the little ledge hop
    p.walkT += dt * 8;
    p.moving = true;
    if (u >= 1) {
      Dungeon.cur = s.toRoom;
      Dungeon.visited.add(s.toRoom.key);
      activateRoom(game, s.toRoom);
      if (s.hop) {
        game.burst(p.x, p.y, 8, PALETTE.dungeon.floorSpeckle);
        game.shake(0.1, 0.008);
      }
      Dungeon.slide = null;
    }
    updateDungeonAmbient(game, dt);
    return;
  }

  // ------- normal play -------
  let { ix, iy } = game.readInput();
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
  if (p.moving !== p.wasMoving) { p.squashT = 0; p.wasMoving = p.moving; }
  p.squashT = Math.min(1, p.squashT + dt / 0.15);
  p.squash = 1 + (p.moving ? 0.12 : -0.12) * (1 - easeBackOut(p.squashT));
  p.knockX *= Math.pow(0.001, dt); p.knockY *= Math.pow(0.001, dt);

  const vx = ix * p.speed + p.knockX;
  const vy = iy * p.speed + p.knockY;
  const r = p.radius;
  let nx = p.x + vx * dt;
  if (!isSolidAt(nx - r, p.y - r) && !isSolidAt(nx + r, p.y - r) &&
      !isSolidAt(nx - r, p.y + r) && !isSolidAt(nx + r, p.y + r)) p.x = nx;
  let ny = p.y + vy * dt;
  if (!isSolidAt(p.x - r, ny - r) && !isSolidAt(p.x + r, ny - r) &&
      !isSolidAt(p.x - r, ny + r) && !isSolidAt(p.x + r, ny + r)) p.y = ny;

  if (p.moving) {
    p.stepAcc += dt;
    if (p.stepAcc > 0.25) {
      p.stepAcc = 0;
      for (let i = 0; i < 4; i++) {
        emitParticle(game.particles, p.x + (Math.random() - 0.5) * 10, p.y - 2,
          (Math.random() - 0.5) * 30, -10 - Math.random() * 20,
          0.3 + Math.random() * 0.2, 2 + Math.random() * 2, PALETTE.dungeon.floorSpeckle);
      }
    }
  }

  // room-crossing detection
  const pgx = Math.floor(p.x / ROOM_PX_W), pgy = Math.floor(p.y / ROOM_PX_H);
  if (pgx !== Dungeon.cur.gx || pgy !== Dungeon.cur.gy) {
    const target = roomAt(pgx, pgy);
    if (target) {
      startSlide(game, target, Math.sign(pgx - Dungeon.cur.gx), Math.sign(pgy - Dungeon.cur.gy), false);
    } else {
      exitDungeon(game);   // stepped out through the entrance hall's south door
    }
  } else {
    // special door tiles the player is standing on
    const ltx = Math.floor(p.x / TILE) - Dungeon.cur.gx * DUNGEON.ROOM_W;
    const lty = Math.floor(p.y / TILE) - Dungeon.cur.gy * DUNGEON.ROOM_H;
    const door = Dungeon.cur.doorAt.get(lty * DUNGEON.ROOM_W + ltx);
    if (door) {
      if (door.type === 'ledge') {
        const below = roomAt(Dungeon.cur.gx, Dungeon.cur.gy + 1);
        if (below) startSlide(game, below, 0, 1, true);
      } else if (door.type === 'exit') {
        exitDungeon(game);
      }
    }
  }

  // camera: room-locked (clamp-follow when the viewport is smaller than the room)
  const cam = dungeonCamTarget(Dungeon.cur, p);
  game.cam.x += (cam.x - game.cam.x) * DUNGEON.CAM_LERP;
  game.cam.y += (cam.y - game.cam.y) * DUNGEON.CAM_LERP;
  if (game.shakeT > 0) game.shakeT -= dt;

  checkDoorUnlock(game, dt);
  updateDoors(game, dt);

  // room entities
  for (const e of game.entities) {
    e.px = e.x; e.py = e.y;
    if (e.kind === 'pickup') updatePickup(e, game, dt);
    else if (e.kind === 'dblock') updateDBlock(e, game, dt);
    else if (e.kind === 'dchest') updateDChest(e, game, dt);
    else if (e.kind === 'dkey') updateDKey(e, game, dt);
    else if (e.kind === 'dswitch') updateDSwitch(e, game, dt);
  }
  checkRoomWiring(game);

  updateDungeonAmbient(game, dt);
}

// particles / float texts / rings — same bookkeeping as the overworld loop
function updateDungeonAmbient(game, dt) {
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
  for (let i = game.rings.length - 1; i >= 0; i--) {
    game.rings[i].t += dt;
    if (game.rings[i].t > 0.35) game.rings.splice(i, 1);
  }
}

/* ---------------- rendering ---------------- */

function renderDungeon(ctx, game, alpha, vw, vh) {
  const DN = PALETTE.dungeon, F = PALETTE.forest;
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

  // the dark between rooms
  ctx.fillStyle = DN.dark;
  ctx.fillRect(0, 0, vw, vh);

  // classic room-scoped visibility: only the current room exists on screen
  // (plus the target room while the camera slides between them)
  const visRooms = [Dungeon.cur];
  if (Dungeon.slide && Dungeon.slide.toRoom !== Dungeon.cur) visRooms.push(Dungeon.slide.toRoom);
  for (const room of visRooms) {
    if (!room) continue;
    ctx.drawImage(room.canvas, room.ox - ox, room.oy - oy);
  }

  // door leaves over their recesses
  for (const room of visRooms) {
    for (const d of room.doors) {
      const door = d.door;
      if (door.type === 'open' || door.type === 'exit' || door.type === 'cracked' || door.type === 'ledge') continue;
      if (door.state === 'open' && door.anim >= 1) continue;
      const leaf = Dungeon.leaves[door.type === 'boss' ? 'boss' :
        (door.type === 'shutter' || door.type === 'shut') ? 'shutter' : 'locked'];
      const cx = (d.tx + 0.5) * TILE - ox;
      const cy = (d.ty + 0.5) * TILE - oy;
      const slide = door.anim * TILE;   // leaf retreats into the wall as it opens
      ctx.save();
      ctx.translate(cx, cy);
      if (d.side === 'E') ctx.rotate(Math.PI / 2);
      else if (d.side === 'W') ctx.rotate(-Math.PI / 2);
      if (door.shakeT > 0) ctx.translate((Math.random() - 0.5) * 3, 0);
      ctx.drawImage(leaf.c, -leaf.ax, -leaf.ay + TILE / 2 + 4 - slide);
      ctx.restore();
    }
  }

  // y-sorted entities + player
  const p = game.player;
  const drawables = [];
  for (const e of game.entities) drawables.push(e);
  drawables.push(p);
  drawables.sort((a, b) => a.y - b.y);
  const boil = ((game.time * 8) | 0) % 2;
  for (const d of drawables) {
    if (d === p) game.draw.player(alpha, ox, oy, boil);
    else if (!drawDungeonEntity(ctx, d, alpha, ox, oy)) game.draw.entity(d, alpha, ox, oy, boil);
  }

  game.draw.rings(ox, oy);
  game.draw.particles(ox, oy);

  // torch flames + pooled glow ('lighter', baked sprite, pulsing)
  for (const room of visRooms) {
    for (const t of room.torches) {
      const fx = t.x - ox, fy = t.y - oy;
      const flick = Math.sin(game.time * 9 + t.phase) * 0.5 + Math.sin(game.time * 23 + t.phase * 2) * 0.5;
      // flame: two stacked wobbling blobs
      ctx.fillStyle = DN.torchFlame;
      ctx.beginPath();
      ctx.ellipse(fx + flick * 1.4, fy - 8, 4.4, 7 + flick, flick * 0.12, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = DN.torchGlow;
      ctx.beginPath();
      ctx.ellipse(fx + flick, fy - 6, 2.2, 3.6 + flick * 0.6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = F.ink; ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.ellipse(fx + flick * 1.4, fy - 8, 4.4, 7 + flick, flick * 0.12, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  ctx.globalCompositeOperation = 'lighter';
  for (const room of visRooms) {
    for (const t of room.torches) {
      const flick = Math.sin(game.time * 7 + t.phase);
      const r = DUNGEON.TORCH_GLOW_R * (1 + flick * 0.06);
      ctx.globalAlpha = 0.75 + flick * 0.15;
      ctx.drawImage(SPRITES.torchGlow, t.x - ox - r / 2, t.y - 10 - oy - r / 2, r, r);
    }
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';

  game.draw.prompt(ox, oy);
  game.draw.floatTexts(ox, oy);

  // vignette: baked at viewport size, warm dark, breathing slightly
  if (!Dungeon.vignette || Dungeon.vigW !== vw || Dungeon.vigH !== vh) {
    const v = makeCanvas(Math.max(2, vw), Math.max(2, vh));
    const vctx = v.getContext('2d');
    const g = vctx.createRadialGradient(vw / 2, vh / 2, Math.min(vw, vh) * 0.3, vw / 2, vh / 2, Math.hypot(vw, vh) * 0.6);
    g.addColorStop(0, withAlpha(PALETTE.dungeon.dark, 0));
    g.addColorStop(1, withAlpha(PALETTE.dungeon.dark, DUNGEON.VIGNETTE_ALPHA));
    vctx.fillStyle = g;
    vctx.fillRect(0, 0, vw, vh);
    Dungeon.vignette = v; Dungeon.vigW = vw; Dungeon.vigH = vh;
  }
  ctx.globalAlpha = 1 + Math.sin(game.time * 0.7) * 0.06;
  ctx.drawImage(Dungeon.vignette, 0, 0);
  ctx.globalAlpha = 1;

  drawRoomMapHud(ctx, game, vw);
  game.draw.hearts();
  if (game.touch.active) game.draw.joystick();

  if (game.deathT !== null) {
    const half = COMBAT.DEATH_FADE;
    const a = game.deathT < half ? game.deathT / half : 1 - (game.deathT - half) / half;
    ctx.fillStyle = withAlpha(F.cream, clamp(a, 0, 1));
    ctx.fillRect(0, 0, vw, vh);
  }
}

// draws pass-2+ dungeon kinds; returns false so unknown kinds fall through
// to the shared game.draw.entity path (pickups, creatures)
function drawDungeonEntity(c, e, alpha, ox, oy) {
  const S = Dungeon.spr;
  const x = Math.round(lerp(e.px, e.x, alpha) - ox);
  const y = Math.round(lerp(e.py, e.y, alpha) - oy);
  if (e.kind === 'pot') {
    const spr = S.pot[e.variant];
    c.drawImage(spr.c, x - spr.ax, y - spr.ay);
    return true;
  }
  if (e.kind === 'dblock') {
    c.drawImage(S.block.c, x - S.block.ax, y - S.block.ay);
    return true;
  }
  if (e.kind === 'dswitch') {
    const spr = S['switch' + ((e.pressed || e.latched) ? 1 : 0)];
    c.drawImage(spr.c, x - spr.ax, y - spr.ay);
    return true;
  }
  if (e.kind === 'dchest') {
    let spr = S.chest0;
    let pop = 1;
    if (e.state === 'opening') {
      if (e.openT > DUNGEON.CHEST_LID_T) spr = S.chest1;
      pop = 1 + 0.18 * (1 - Math.abs(1 - 2 * clamp(e.openT / DUNGEON.CHEST_LID_T, 0, 1)));
    } else if (e.state === 'open') spr = S.chest1;
    c.save();
    c.translate(x, y);
    c.scale(pop, 2 - pop);
    c.drawImage(spr.c, -spr.ax, -spr.ay);
    c.restore();
    if (e.state === 'opening' && e.openT > DUNGEON.CHEST_LID_T) {
      // the treasure rises from the chest with a sparkle
      const u = clamp((e.openT - DUNGEON.CHEST_LID_T) / DUNGEON.CHEST_RISE_T, 0, 1);
      const rise = 20 * (1 - (1 - u) * (1 - u));
      const item = e.contents === 'key' ? S.key : e.contents === 'bosskey' ? S.bosskey :
        e.contents === 'bombs' ? S.bloom : SPRITES.trinket;
      c.drawImage(item.c, x - item.ax, y - 26 - rise - item.ay + item.c.height * 0.4);
      if (((e.openT * 20) | 0) % 4 === 0) {
        c.fillStyle = PALETTE.fx.flash;
        starPath(c, x + Math.sin(e.openT * 9) * 12, y - 30 - rise, 4, 4);
        c.fill();
      }
    }
    return true;
  }
  if (e.kind === 'dkey') {
    const bob = Math.sin(e.bobT * 2.6) * 3;
    c.drawImage(S.key.c, x - S.key.ax, y - S.key.ay + bob);
    return true;
  }
  return false;
}

// the parchment room map (replaces the minimap while inside)
function drawRoomMapHud(ctx, game, vw) {
  const F = PALETTE.forest, DN = PALETTE.dungeon;
  const cell = 20, gap = 3, pad = 12;
  const mw = DUNGEON.GRID_W * (cell + gap) + gap + 10;
  const mh = DUNGEON.GRID_H * (cell + gap) + gap + 10;
  const mx = vw - mw - pad, my = pad;
  ctx.fillStyle = F.cream;
  ctx.strokeStyle = F.ink; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.roundRect(mx, my, mw, mh, 8);
  ctx.fill(); ctx.stroke();
  for (const room of Dungeon.rooms.values()) {
    if (!Dungeon.visited.has(room.key)) continue;
    const x = mx + 5 + gap + room.gx * (cell + gap);
    const y = my + 5 + gap + room.gy * (cell + gap);
    ctx.fillStyle = room === Dungeon.cur ? DN.torchGlow : withAlpha(DN.floor, 0.9);
    ctx.strokeStyle = F.ink; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.roundRect(x, y, cell, cell, 4);
    ctx.fill(); ctx.stroke();
    if (room.key === DUNGEON.SPAWN_ROOM) {
      ctx.fillStyle = F.ink;
      ctx.beginPath(); ctx.arc(x + cell / 2, y + cell - 5, 2, 0, Math.PI * 2); ctx.fill();
    }
  }
  // key inventory under the map
  const S = Dungeon.spr;
  let kx = mx + 8;
  const ky = my + mh + 6;
  for (let i = 0; i < Dungeon.keys; i++) {
    ctx.drawImage(S.key.c, kx, ky, S.key.c.width * 0.8, S.key.c.height * 0.8);
    kx += 18;
  }
  if (Dungeon.bossKey) ctx.drawImage(S.bosskey.c, kx + 2, ky - 3);
}

// enter/exit fade overlay — drawn last from game.js in BOTH modes
function drawDungeonFade(ctx, vw, vh) {
  if (!Dungeon.fade) return;
  const f = Dungeon.fade;
  const u = clamp(f.t / DUNGEON.FADE_T, 0, 1);
  const a = f.phase === 'out' ? u : 1 - u;
  ctx.fillStyle = withAlpha(PALETTE.dungeon.dark, a);
  ctx.fillRect(0, 0, vw, vh);
}
