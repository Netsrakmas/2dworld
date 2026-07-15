// The Waystone Camp: three storybook NPCs where the two worlds meet.
// Fennel keeps the shop (a trinket sink), Maple sells fortunes (a hint
// system), Pip the snail bard is pure charm. Recipe per the NPC research:
// one name + one visual quirk + one mechanical function each, and every
// line changes with real story progress.
const NPC = Object.freeze({
  FACE_R: 170,                     // px: NPCs turn to face the player inside this
  BUBBLE_R: 240,                   // px: !/… bubbles show inside this
  PRICE_SNACK: 8,                  // full heal, restocks forever
  PRICE_POUCH: 60,                 // bombs cap +2, once
  PRICE_BUNDLE: 12,                // the pouch pedestal's restock: refill blooms
  PRICE_CONTAINER: 200,            // +1 max heart, the aspirational anchor
  PRICE_FORTUNE: 15,               // hint + full heal (a paid hint never feels wasted)
  CONFIRM_T: 6,                    // s: window between price tag and confirm
  OFFER_T: 10,                     // s: Maple's fortune offer window
  PING_T: 45,                      // s: minimap hint ping lifetime
  PAGE_TIMER: 30,                  // s: paged dialog waits for [E] this long
  NOTE_R: 280,                     // px: Pip hums when the player is this close
});

const NPC_SPR = {};

/* ---------------- sprite bakes (once, seeded, palette-locked) ---------------- */

function buildNpcs(seedInt) {
  const F = PALETTE.forest, D = PALETTE.desert;

  // Fennel — hedgehog with an oversized backpack (the quirk IS the silhouette)
  NPC_SPR.fennel = [0, 1].map((v) => sprite(48, 50, 24, 46, (ctx) => {
    const r = mulberry32(seedInt ^ (0xFE11 + v));
    const w = () => (r() - 0.5) * 1.6;
    // the backpack: taller than Fennel, peeking over the head
    ctx.fillStyle = F.woodLight;
    ctx.strokeStyle = F.ink; ctx.lineWidth = 2;
    rr(ctx, 6 + w(), 6 + w(), 20, 26, 6); ctx.fill(); ctx.stroke();
    ctx.fillStyle = F.trunk;
    rr(ctx, 8 + w(), 10 + w(), 16, 5, 2.5); ctx.fill();   // flap strap
    rr(ctx, 12, 3, 8, 6, 2); ctx.fill(); ctx.stroke();     // rolled bedroll on top
    // spines: a fan of ink-outlined triangles
    ctx.fillStyle = F.hoodDark;
    for (let i = 0; i < 6; i++) {
      const a = -0.4 - i * 0.32 + w() * 0.05;
      const sx = 27 + Math.cos(a) * 11, sy = 30 + Math.sin(a) * 10;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + Math.cos(a) * 9 + w(), sy + Math.sin(a) * 9 + w());
      ctx.lineTo(sx + Math.cos(a + 0.5) * 4, sy + Math.sin(a + 0.5) * 4);
      ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    // round body
    ctx.fillStyle = F.hood;
    ctx.beginPath(); ctx.ellipse(27, 34 + w(), 12, 11, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    // cream face wedge + snout
    ctx.fillStyle = F.cream;
    ctx.beginPath(); ctx.ellipse(32, 33, 8, 7.5, -0.2, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = F.ink;
    ctx.beginPath(); ctx.arc(39.5 + w() * 0.4, 34, 1.8, 0, Math.PI * 2); ctx.fill();   // nose
    ctx.beginPath(); ctx.arc(33, 31, 1.4, 0, Math.PI * 2); ctx.fill();                  // eye
    // feet
    ctx.beginPath(); ctx.ellipse(22, 45, 3, 2, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(31, 45, 3, 2, 0, 0, Math.PI * 2); ctx.fill();
  }));

  // Maple — badger granny: shawl, half-moon spectacles, a basket of yarn
  NPC_SPR.maple = [0, 1].map((v) => sprite(46, 48, 23, 44, (ctx) => {
    const r = mulberry32(seedInt ^ (0x3A91 + v));
    const w = () => (r() - 0.5) * 1.6;
    ctx.strokeStyle = F.ink; ctx.lineWidth = 2;
    // basket at her side
    ctx.fillStyle = F.woodLight;
    rr(ctx, 33 + w(), 32, 11, 9, 3); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = F.trunk; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(34, 36); ctx.lineTo(43, 36); ctx.stroke();
    ctx.fillStyle = D.blossom;   // yarn ball peeking out
    ctx.beginPath(); ctx.arc(38 + w(), 31, 3, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = F.ink; ctx.lineWidth = 2;
    // stout body wrapped in a pond-purple shawl
    ctx.fillStyle = F.stone;
    ctx.beginPath(); ctx.ellipse(20, 33 + w(), 13, 12, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = F.pond;
    ctx.beginPath();
    ctx.moveTo(8, 30 + w()); ctx.quadraticCurveTo(20, 20, 32, 30);
    ctx.quadraticCurveTo(28, 38, 20, 39); ctx.quadraticCurveTo(12, 38, 8, 30);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = shade(F.pond, 1.25);   // shawl knot
    ctx.beginPath(); ctx.arc(20, 36 + w(), 2.6, 0, Math.PI * 2); ctx.fill();
    // head: cream with the two badger stripes
    ctx.fillStyle = F.cream;
    ctx.beginPath(); ctx.ellipse(20, 17 + w(), 10, 9, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = F.watcher;
    for (const sx of [-4.5, 4.5]) {
      ctx.beginPath();
      ctx.ellipse(20 + sx, 15 + w() * 0.5, 2.6, 7, sx * 0.03, 0, Math.PI * 2); ctx.fill();
    }
    // half-moon spectacles + kind eyes
    ctx.strokeStyle = F.ink; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(15.5, 19, 3, 0, Math.PI); ctx.stroke();
    ctx.beginPath(); ctx.arc(24.5, 19, 3, 0, Math.PI); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(18.5, 19); ctx.lineTo(21.5, 19); ctx.stroke();
    ctx.fillStyle = F.ink;
    ctx.beginPath(); ctx.arc(15.5, 18, 1.2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(24.5, 18, 1.2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(20, 22.5, 1.8, 1.3, 0, 0, Math.PI * 2); ctx.fill();   // nose
  }));

  // Pip — snail bard: blossom-pink shell, brave eyestalks
  NPC_SPR.pip = [0, 1].map((v) => sprite(34, 28, 17, 25, (ctx) => {
    const r = mulberry32(seedInt ^ (0x919 + v));
    const w = () => (r() - 0.5) * 1.4;
    ctx.strokeStyle = F.ink; ctx.lineWidth = 2;
    // foot
    ctx.fillStyle = F.slime;
    ctx.beginPath();
    ctx.moveTo(4, 24); ctx.quadraticCurveTo(6, 16 + w(), 13, 15);
    ctx.quadraticCurveTo(26, 14, 30, 20); ctx.quadraticCurveTo(31, 24, 26, 24.5);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    // eyestalks
    ctx.strokeStyle = F.slimeDark; ctx.lineWidth = 2.2;
    ctx.beginPath(); ctx.moveTo(8, 16); ctx.quadraticCurveTo(6 + w(), 8, 5, 5); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(11, 15); ctx.quadraticCurveTo(11 + w(), 8, 12, 4); ctx.stroke();
    ctx.fillStyle = F.cream; ctx.strokeStyle = F.ink; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(5, 4.5, 2.4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(12, 3.5, 2.4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = F.ink;
    ctx.beginPath(); ctx.arc(5.6, 4.5, 1, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(12.6, 3.5, 1, 0, Math.PI * 2); ctx.fill();
    // shell: pink with a hand-drawn spiral
    ctx.strokeStyle = F.ink; ctx.lineWidth = 2;
    ctx.fillStyle = D.blossom;
    ctx.beginPath(); ctx.ellipse(21, 14 + w() * 0.5, 9, 8.5, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = D.blossomLight; ctx.lineWidth = 2;
    ctx.beginPath();
    for (let a = 0; a < Math.PI * 4; a += 0.3) {
      const rad = 1 + a * 1.55;
      const px2 = 21 + Math.cos(a + v) * rad, py2 = 14 + Math.sin(a + v) * rad * 0.9;
      a === 0 ? ctx.moveTo(px2, py2) : ctx.lineTo(px2, py2);
    }
    ctx.stroke();
  }));

  // shop pedestal: a squat waystone with a mossy rim
  NPC_SPR.pedestal = sprite(30, 30, 15, 27, (ctx) => {
    ctx.strokeStyle = F.ink; ctx.lineWidth = 2;
    ctx.fillStyle = F.stone;
    rr(ctx, 6, 8, 18, 17, 4); ctx.fill(); ctx.stroke();
    ctx.fillStyle = shade(F.stone, 1.12);
    rr(ctx, 4, 4, 22, 7, 3.5); ctx.fill(); ctx.stroke();
    ctx.fillStyle = F.grass;
    ctx.beginPath(); ctx.ellipse(9, 24, 4, 2.4, 0.3, 0, Math.PI * 2); ctx.fill();
  });

  // the heart container ware: a big heart in a woven cradle
  NPC_SPR.bigHeart = sprite(26, 24, 13, 20, (ctx) => {
    ctx.strokeStyle = F.ink; ctx.lineWidth = 2;
    ctx.fillStyle = PALETTE.fx.heart;
    ctx.beginPath();
    ctx.moveTo(13, 20);
    ctx.bezierCurveTo(2, 12, 4, 2, 13, 8);
    ctx.bezierCurveTo(22, 2, 24, 12, 13, 20);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = PALETTE.fx.flash;
    ctx.beginPath(); ctx.ellipse(9, 8.5, 2.4, 1.6, -0.5, 0, Math.PI * 2); ctx.fill();
  });

  // campfire: two flame frames + a baked warm glow (no runtime gradients)
  const Dg = PALETTE.dungeon;
  NPC_SPR.fire = [0, 1].map((f) => sprite(30, 34, 15, 30, (ctx) => {
    ctx.strokeStyle = F.ink; ctx.lineWidth = 2;
    ctx.fillStyle = F.trunk;
    for (const [lx, la] of [[-1, 0.5], [1, -0.5]]) {
      ctx.save(); ctx.translate(15 + lx * 5, 27); ctx.rotate(la * 0.5);
      rr(ctx, -8, -2.5, 16, 5, 2.5); ctx.fill(); ctx.stroke();
      ctx.restore();
    }
    const sway = f ? 2 : -2;
    ctx.fillStyle = Dg.torchFlame;
    ctx.beginPath();
    ctx.moveTo(15 + sway, 6 + (f ? 1.5 : 0));
    ctx.quadraticCurveTo(23, 16, 20, 22); ctx.quadraticCurveTo(15, 26, 10, 22);
    ctx.quadraticCurveTo(7, 16, 15 + sway, 6 + (f ? 1.5 : 0));
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = Dg.torchGlow;
    ctx.beginPath();
    ctx.moveTo(15 - sway * 0.6, 13);
    ctx.quadraticCurveTo(19, 18, 17, 22); ctx.quadraticCurveTo(15, 24, 13, 22);
    ctx.quadraticCurveTo(11, 18, 15 - sway * 0.6, 13);
    ctx.closePath(); ctx.fill();
  }));
  {
    const g = makeCanvas(120, 120);
    const gctx = g.getContext('2d');
    const grad = gctx.createRadialGradient(60, 60, 4, 60, 60, 58);
    grad.addColorStop(0, withAlpha(Dg.torchGlow, 0.28));
    grad.addColorStop(1, withAlpha(Dg.torchGlow, 0));
    gctx.fillStyle = grad;
    gctx.fillRect(0, 0, 120, 120);
    NPC_SPR.fireGlow = g;
  }
}

/* ---------------- camp placement (called from genChunk) ---------------- */

// deterministic camp layout around the fire; pieces may spill past the chunk
// edge harmlessly (entities are world-anchored; solids clamp per chunk)
function spawnWaystoneCamp(chunk, spot, addProp, solid) {
  const { tx, ty } = spot;
  chunk.entities.push({ kind: 'campfire', tx, ty });
  solid(tx, ty);
  // Fennel's shop: the hedgehog at the end of a row of three waystones,
  // far enough out that browsing a pedestal never picks him instead
  chunk.entities.push({ kind: 'npc', tx: tx - 6, ty: ty - 1, npc: 'fennel' });
  const wares = ['snack', 'pouch', 'container'];
  for (let i = 0; i < 3; i++) {
    chunk.entities.push({ kind: 'pedestal', tx: tx - 4 + i, ty: ty - 1, ware: wares[i] });
    solid(tx - 4 + i, ty - 1);
  }
  // Maple by her barrel, Pip on a warm stone south of the fire
  chunk.entities.push({ kind: 'npc', tx: tx + 3, ty: ty, npc: 'maple' });
  chunk.entities.push({ kind: 'npc', tx: tx + 1, ty: ty + 2, npc: 'pip' });
  chunk.entities.push({
    kind: 'sign', tx: tx - 1, ty: ty + 2,
    text: '"THE WAYSTONE CAMP — travellers welcome. Mind the spines. Trust the fortunes. Tip the snail."',
  });
  addProp(SPRITES.barrel, 0, tx + 4, ty - 1, 4, 0, true);
  addProp(SPRITES.stone, 1, tx + 1, ty + 2, -6, 8, false, 0, 0.8);
  addProp(SPRITES.grass, 0, tx - 2, ty + 2, 6, 4, false, 1, 0.9);
  addProp(SPRITES.grass, 2, tx + 4, ty + 1, -4, 6, false, 1, 0.85);
}

// persistent camp state (survives chunk eviction; entities are rebuilt)
function campState(game) {
  if (!game.camp) {
    game.camp = {
      welcomed: false,
      pouch: false, container: false,
      fortunes: 0,
      seen: {},          // npc -> last story phase they talked in
      talked: {},        // npc -> conversation count (rotates line variants)
    };
  }
  return game.camp;
}

function initCampEntity(e, spec) {
  if (spec.kind === 'npc') {
    e.npc = spec.npc;
    e.bobT = Math.random() * 6;
    e.flip = false;
    e.spinT = 0;
    e.offerT = 0;        // Maple's fortune window
    e.noteT = 1 + Math.random() * 2;
    e.radius = 14;
    if (spec.npc === 'pip') {
      e.hittable = true;
      e.hp = 999;
      e.onStaffHit = (game, en) => {
        en.spinT = 0.7;
        game.freeze(0.04);
        game.burst(en.x, en.y - 12, 10, PALETTE.desert.blossomLight);
        game.floatText(en.x, en.y - 30, '♪!');
        game.showDialog(npcTag('pip') + '"EVERYONE\'S a critic," Pip hums, wobbling with dignity.');
      };
    }
    e.interact = { label: 'talk', action: (en) => talkToNpc(window.__game, en) };
  } else if (spec.kind === 'pedestal') {
    e.ware = spec.ware;
    e.bobT = Math.random() * 6;
    e.confirmT = 0;
    e.interact = { label: 'browse', action: (en) => pedestalInteract(window.__game, en) };
  } else if (spec.kind === 'campfire') {
    e.emberT = 0;
  }
}

/* ---------------- paged dialog (the A Short Hike name-tag trick) ---------------- */

const NPC_META = {
  fennel: { name: 'Fennel', color: PALETTE.desert.cactusBody },
  maple: { name: 'Maple', color: PALETTE.forest.pond },
  pip: { name: 'Pip', color: PALETTE.desert.blossom },
};

function npcTag(npc) {
  const m = NPC_META[npc];
  return `<b style="color:${m.color}">${m.name}</b> — `;
}

function npcSay(game, npc, pages, armFortune) {
  const d = { pages, idx: 0, npc, armFortune: armFortune || null };
  game.npcDialog = null;
  showNpcPage(game, d);
}

function showNpcPage(game, d) {
  const more = d.idx < d.pages.length - 1;
  game.showDialog(npcTag(d.npc) + d.pages[d.idx] +
    (more ? ' <span class="hint">▼ E</span>' : ''));
  game.dialogTimer = NPC.PAGE_TIMER;
  game.npcDialog = d;   // set AFTER showDialog (which clears any paged state)
}

// returns true if the E press was consumed by an open paged conversation
function advanceNpcDialog(game) {
  const d = game.npcDialog;
  if (!d) return false;
  if (game.dialogTimer <= 0) { game.npcDialog = null; return false; }
  if (d.idx < d.pages.length - 1) {
    d.idx++;
    showNpcPage(game, d);
  } else {
    // finishing Maple's rumor arms her fortune-offer window
    if (d.armFortune) d.armFortune.offerT = NPC.OFFER_T;
    game.npcDialog = null;
    game.dialogTimer = 0.01;   // the update loop dismisses next tick
  }
  return true;
}

/* ---------------- story phases + line tables ---------------- */

function storyPhase(game) {
  const den = typeof Dungeon !== 'undefined' && Dungeon.defs && Dungeon.defs[1];
  const stump = typeof Dungeon !== 'undefined' && Dungeon.defs && Dungeon.defs[0];
  if ((den && den.flags.bossDefeated) || game.hasHat) return 'legend';
  if (stump && stump.flags.bossDefeated) return 'hero';
  return 'early';
}

const FENNEL_LINES = {
  early: [
    ['Oh! A customer! An ACTUAL customer!',
     'Fennel straightens every spine, one by one. "Welcome to the finest shop between the worlds. Also the only one."',
     '"Browse the waystones! Prices are firm. The backpack is NOT for sale — the backpack is family."'],
    ['"Trinkets, dear wanderer. The little gold sparkles. That\'s all I ask, and I ask it politely."',
     '"The far stone holds my pride and joy. Two hundred trinkets. Worth every single one. I counted."'],
  ],
  hero: [
    ['"The wanderer who fed the Great Gulper a BOMB! In MY shop!"',
     '"Prices are the same, mind you. Heroism is its own discount."'],
    ['"Word from the stump says you throw blossoms like a spring storm. Splendid. Buy something."'],
  ],
  legend: [
    ['"They say even the Marrow Den has gone quiet for you."',
     '"Take a heart snack. WELL — buy a heart snack. I\'m sentimental, not bankrupt."'],
    ['"Two dungeons deep and still walking. My spines tingle just standing near you."'],
  ],
};

const MAPLE_LINES = {
  early: [
    ['Maple looks up from her knitting without dropping a stitch. "Sit a moment, dear."',
     '"Lost letters, a stump with a door in it... the world is chattier than it looks, if you know who listens."'],
    ['"The desert bones gossip with the forest roots, you know. Scandalous stuff. Mostly about the weather."'],
  ],
  hero: [
    ['"You walked into the Hollow Stump and the Stump apologized. That\'s how the fire tells it, anyway."',
     '"There\'s a bleached skull out in the sand with a jaw like a doorway. The bones have been humming about it."'],
    ['"M. writes lovely letters for a mole who lost his desk twice. Do give him my regards."'],
  ],
  legend: [
    ['"Both doors, both worlds, and here you are — still polite enough to visit an old badger."',
     '"The leaves have almost nothing left to whisper about you. Almost."'],
    ['"Even my yarn has stopped tangling when you walk by. That\'s as close to a blessing as wool gets."'],
  ],
};

const PIP_LINES = {
  wind: [
    '"Whoooosh," hums Pip, leaning into the gust at a daring angle. "I wrote this one FOR the wind. It\'s called Whoooosh."',
    'Pip\'s eyestalks stream sideways. "A duet! The wind takes the high part. The wind ALWAYS takes the high part."',
  ],
  night: [
    'Pip hums something slow and silvery. "A nocturne. For the fireflies. They never clap, but they glow — which is better."',
    '"Shhh," whispers Pip, mid-hum. "The dark likes this one. It leans in to listen."',
  ],
  early: [
    'Pip hums a wandering little tune. "It\'s about a hood with legs. I\'m still workshopping the ending."',
    '"Every song needs three things," Pip declaims. "A beginning, a middle, and a snail. I provide the snail."',
  ],
  hero: [
    'Pip hums a triumphant march, very slowly. "The Ballad of the Gulper\'s Hiccup! You inspired it. Royalties pending."',
    '"I added a BOOM to the second verse," Pip confides. "Artistically, you understand. Petals everywhere."',
  ],
  legend: [
    'Pip hums something vast and unhurried. "The Song of Two Doors. It has no words. Some things are too big for words."',
    '"When you\'re a legend," Pip muses, "even your footsteps sound like verses. I\'ve been taking notes."',
  ],
};

/* ---------------- talking ---------------- */

function talkToNpc(game, e) {
  const camp = campState(game);
  const phase = storyPhase(game);
  const n = (camp.talked[e.npc] || 0);
  camp.talked[e.npc] = n + 1;
  camp.seen[e.npc] = phase;

  if (e.npc === 'fennel') {
    const vars = FENNEL_LINES[phase];
    npcSay(game, 'fennel', vars[n % vars.length]);
  } else if (e.npc === 'maple') {
    if (e.offerT > 0) { maplesFortune(game, e); return; }
    const vars = MAPLE_LINES[phase];
    const pages = vars[n % vars.length].slice();
    pages.push(`Cross my palm with <b>${NPC.PRICE_FORTUNE} trinkets</b>, dear, and the leaves will point your feet. <span class="hint">press E again for a fortune</span>`);
    npcSay(game, 'maple', pages, e);
  } else if (e.npc === 'pip') {
    let pool;
    if (typeof Atmos !== 'undefined' && Atmos.gust > 1.15) pool = PIP_LINES.wind;
    else if (game.nightFactor && game.nightFactor() > 0.5) pool = PIP_LINES.night;
    else pool = PIP_LINES[phase];
    npcSay(game, 'pip', [pool[n % pool.length]]);
    game.floatText(e.x + (Math.random() - 0.5) * 14, e.y - 28, '♪');
  }
}

/* ---------------- Maple's fortune (the hint system) ---------------- */

// the player's actual next undone thing, in priority order
function nextObjective(game) {
  const p = game.player;
  let best = null, bd = Infinity;
  for (const s of World.letterSpots) {
    if (game.collected.has(s.idx)) continue;
    const d = Math.hypot(s.tx * TILE - p.x, s.ty * TILE - p.y);
    if (d < bd) { bd = d; best = s; }
  }
  if (best) return { tx: best.tx, ty: best.ty, kind: 'letter' };
  const stumpDone = Dungeon.defs[0].flags.bossDefeated;
  const denDone = Dungeon.defs[1].flags.bossDefeated;
  if (game.bombs) {
    for (const s of World.boulderSpots) {
      if (!game.bouldersOpened.has(s.idx)) return { tx: s.tx, ty: s.ty, kind: 'boulder' };
    }
  }
  if (!stumpDone) return { tx: World.stumpSpot.tx, ty: World.stumpSpot.ty, kind: 'stump' };
  if (!denDone && !game.hasHat) return { tx: World.skullSpot.tx, ty: World.skullSpot.ty, kind: 'skull' };
  if (game.hasHat && !game.hatReturned) return { tx: World.stumpSpot.tx, ty: World.stumpSpot.ty, kind: 'hat' };
  return null;
}

const LANDMARK_NAMES = {
  rocktrio: 'the three old stones', cactusring: 'the ring of cacti',
  ribcage: 'the great ribcage', greatskull: 'the bleached skull',
  cairn: 'the mossy cairn', fairyring: 'the fairy ring',
  stones: 'the standing stones', greattree: 'the grandmother tree',
};

function nearestLandmarkTo(tx, ty) {
  const lrx = Math.floor(tx / LREGION), lry = Math.floor(ty / LREGION);
  let best = null, bd = Infinity;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const lm = landmarkFeature(lrx + dx, lry + dy);
      if (!lm.type) continue;
      const d = Math.hypot(lm.tx - tx, lm.ty - ty);
      if (d < bd) { bd = d; best = lm; }
    }
  }
  return best && bd < 55 ? best : null;
}

function compassWord(dx, dy) {
  const a = Math.atan2(dy, dx);
  const oct = Math.round(a / (Math.PI / 4));
  return ['toward the sunrise', 'where the sunrise meets the warm south', 'down the warm south',
    'where sunset meets the warm south', 'toward the sunset', 'where sunset meets the cold north',
    'up the cold north', 'where the sunrise meets the cold north'][(oct + 8) % 8];
}

const OBJECTIVE_TEXT = {
  letter: 'a pale envelope, dreaming in the open air',
  boulder: 'a cracked boulder holding its breath — a blossom would open it',
  stump: 'an old stump with a door in its heart, and something hungry below',
  skull: 'a great bleached skull whose jaw is a doorway',
  hat: 'a much-chewed hat, longing for its mole — carry it back to the stump',
};

function maplesFortune(game, e) {
  const camp = campState(game);
  const p = game.player;
  if (game.trinkets < NPC.PRICE_FORTUNE) {
    game.showDialog(npcTag('maple') +
      `Maple pats your hand. "Save your sparkle, dear. Come back with ${NPC.PRICE_FORTUNE} trinkets and the leaves will talk."`);
    e.offerT = 0;
    return;
  }
  game.trinkets -= NPC.PRICE_FORTUNE;
  game.updateTrinketHud();
  camp.fortunes++;
  e.offerT = 0;
  // a paid hint never feels wasted: it always bundles a full heal
  p.hp = p.maxHp;
  game.burst(p.x, p.y - 12, 10, PALETTE.fx.heart);
  game.floatText(e.x, e.y - 32, `-${NPC.PRICE_FORTUNE}`);

  const obj = nextObjective(game);
  if (!obj) {
    npcSay(game, 'maple', [
      'Maple swirls the leaves in her cup... and chuckles.',
      '"You\'ve done it all, little wanderer. The worlds simply enjoy your company now. THAT is the whole fortune."']);
    return;
  }
  const lm = nearestLandmarkTo(obj.tx, obj.ty);
  let where;
  if (lm) {
    const d = Math.hypot(obj.tx - lm.tx, obj.ty - lm.ty);
    where = d < 5
      ? `right beside ${LANDMARK_NAMES[lm.type]}`
      : `a short walk ${compassWord(obj.tx - lm.tx, obj.ty - lm.ty)} of ${LANDMARK_NAMES[lm.type]}`;
  } else {
    const bl = blendAtTile(obj.tx, obj.ty);
    where = `out where the ${bl < 0.5 ? 'sand rolls' : 'grass whispers'}, ` +
      compassWord(obj.tx * TILE - p.x, obj.ty * TILE - p.y);
  }
  game.hintPing = { tx: obj.tx, ty: obj.ty, until: game.time + NPC.PING_T };
  npcSay(game, 'maple', [
    'Maple swirls the tea leaves and goes very quiet. The fire leans closer.',
    `"I see ${OBJECTIVE_TEXT[obj.kind]}... ${where}."`,
    '"There. And a warm cup on the house — off you trot, dear." <span class="hint">the fortune glows on your map awhile</span>']);
}

/* ---------------- Fennel's shop (the trinket sink) ---------------- */

function wareInfo(game, e) {
  const camp = campState(game);
  if (e.ware === 'snack') {
    return { name: 'Heart Snack', price: NPC.PRICE_SNACK, desc: 'warm bread, mends every heart' };
  }
  if (e.ware === 'pouch') {
    return camp.pouch
      ? { name: 'Spare-Bloom Bundle', price: NPC.PRICE_BUNDLE, desc: 'refills your blossom bombs' }
      : { name: 'Bloom Pouch', price: NPC.PRICE_POUCH, desc: 'carry two more blossom bombs' };
  }
  if (e.ware === 'container') {
    return camp.container ? null
      : { name: 'Heart Container', price: NPC.PRICE_CONTAINER, desc: 'one whole extra heart. Fennel\'s pride and joy' };
  }
  return null;
}

function pedestalInteract(game, e) {
  const w = wareInfo(game, e);
  if (!w) {
    game.showDialog(npcTag('fennel') + '"Sold! To a hero with excellent taste." The empty pedestal gleams, freshly dusted.');
    return;
  }
  if (e.confirmT > 0) { attemptBuy(game, e, w); return; }
  e.confirmT = NPC.CONFIRM_T;
  game.showDialog(`<b>${w.name}</b> — ${w.desc}. <b>${w.price} trinkets</b>.<span class="hint">press E again to buy</span>`);
}

function attemptBuy(game, e, w) {
  const camp = campState(game);
  const p = game.player;
  e.confirmT = 0;
  if (e.ware === 'pouch' && !game.bombs) {
    game.showDialog(npcTag('fennel') + '"These buds only wake for someone who\'s made things bloom before. Try the old stump in the forest first."');
    return;
  }
  if (game.trinkets < w.price) {
    const lines = w.price >= 100
      ? '"Ah — the pride and joy. Two hundred trinkets, and I shall wrap it in my second-best leaf. One day!"'
      : `"That one's ${w.price} trinkets, friend. Shake some ogres, smash some pots — I believe in you."`;
    game.showDialog(npcTag('fennel') + lines);
    return;
  }
  game.trinkets -= w.price;
  game.updateTrinketHud();
  game.floatText(e.x, e.y - 34, `-${w.price}`);
  if (e.ware === 'snack') {
    p.hp = p.maxHp;
    game.burst(p.x, p.y - 12, 12, PALETTE.fx.heart);
    game.showDialog(npcTag('fennel') + '"Baked it this morning!" Warmth spreads from your ears to your boots. <b>Fully healed.</b>');
  } else if (e.ware === 'pouch' && !camp.pouch) {
    camp.pouch = true;
    game.bombs.cap += 2;
    game.bombs.count = game.bombs.cap;
    game.burst(e.x, e.y - 16, 14, PALETTE.desert.blossomLight);
    game.shake(0.1, 0.008);
    game.showDialog(npcTag('fennel') + '"The Bloom Pouch! Room for TWO more blossoms." <b>Bomb capacity +2.</b> The pedestal restocks with spare bundles.');
  } else if (e.ware === 'pouch') {
    game.bombs.count = game.bombs.cap;
    game.burst(e.x, e.y - 16, 10, PALETTE.desert.blossomLight);
    game.showDialog(npcTag('fennel') + '"Fresh from the flats." Your pouch rustles, full of blossoms again.');
  } else if (e.ware === 'container') {
    camp.container = true;
    p.maxHp += 2;
    p.hp = p.maxHp;
    game.burst(e.x, e.y - 16, 18, PALETTE.fx.heart);
    game.burst(p.x, p.y - 12, 10, PALETTE.fx.flash);
    game.freeze(0.08);
    game.shake(0.15, 0.01);
    game.floatText(p.x, p.y - 36, '+1 heart!');
    game.showDialog(npcTag('fennel') + 'Fennel sniffles into a spine. "Take good care of it." <b>+1 max heart!</b> Your chest feels roomier already.');
  }
}

/* ---------------- per-tick updates ---------------- */

function updateNpc(e, game, dt) {
  const p = game.player;
  e.bobT += dt;
  if (e.spinT > 0) e.spinT -= dt;
  if (e.offerT > 0) e.offerT -= dt;
  const d2 = dist2(e.x, e.y, p.x, p.y);
  if (d2 < NPC.FACE_R ** 2) e.flip = p.x < e.x;
  // Pip hums to anyone close enough to hear
  if (e.npc === 'pip' && d2 < NPC.NOTE_R ** 2) {
    e.noteT -= dt;
    if (e.noteT <= 0) {
      e.noteT = 2.2 + Math.random() * 1.8;
      game.floatText(e.x + (Math.random() - 0.5) * 16, e.y - 24, '♪');
    }
  }
}

function updatePedestal(e, game, dt) {
  e.bobT += dt;
  if (e.confirmT > 0) e.confirmT -= dt;
}

function updateCampfire(e, game, dt) {
  const camp = campState(game);
  if (!camp.welcomed && dist2(e.x, e.y, game.player.x, game.player.y) < 200 ** 2) {
    camp.welcomed = true;
    game.showDialog('You\'ve wandered into the <b>WAYSTONE CAMP</b> — a shop, a fortune, and a snail with ambitions.<span class="hint">talk to everyone with E</span>');
  }
  e.emberT -= dt;
  if (e.emberT <= 0) {
    e.emberT = 0.22 + Math.random() * 0.2;
    emitParticle(game.particles, e.x + (Math.random() - 0.5) * 10, e.y - 14,
      (Math.random() - 0.5) * 14, -26 - Math.random() * 22,
      0.5 + Math.random() * 0.4, 1.5 + Math.random() * 1.5,
      Math.random() < 0.5 ? PALETTE.dungeon.torchFlame : PALETTE.dungeon.torchGlow);
  }
}

/* ---------------- drawing ---------------- */

function drawCampEntity(ctx, game, e, x, y, boil) {
  const F = PALETTE.forest;
  if (e.kind === 'campfire') {
    ctx.globalCompositeOperation = 'lighter';
    const flick = 1 + Math.sin(game.time * 7 + 1.3) * 0.06;
    ctx.drawImage(NPC_SPR.fireGlow, x - 60 * flick, y - 60 * flick - 6, 120 * flick, 120 * flick);
    ctx.globalCompositeOperation = 'source-over';
    const spr = NPC_SPR.fire[((game.time * 8) | 0) % 2];
    ctx.drawImage(spr.c, x - spr.ax, y - spr.ay);
    return;
  }
  if (e.kind === 'pedestal') {
    const spr = NPC_SPR.pedestal;
    ctx.drawImage(spr.c, x - spr.ax, y - spr.ay);
    const w = wareInfo(game, e);
    if (w) {
      const icon = e.ware === 'snack' ? SPRITES.heart
        : e.ware === 'container' ? NPC_SPR.bigHeart : Dungeon.spr.bloom;
      const bob = Math.sin(e.bobT * 2.6) * 2;
      ctx.drawImage(icon.c, x - icon.ax, y - 30 - icon.ay + bob);
      if (e.confirmT > 0) {
        ctx.font = 'bold 13px Georgia, serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        const label = `${w.price} ✦`;
        const tw = ctx.measureText(label).width + 12;
        ctx.fillStyle = F.cream; ctx.strokeStyle = F.ink; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.roundRect(x - tw / 2, y - 62, tw, 19, 6); ctx.fill(); ctx.stroke();
        ctx.fillStyle = F.ink;
        ctx.fillText(label, x, y - 52);
      }
    }
    return;
  }
  // NPCs
  const spr = NPC_SPR[e.npc][boil];
  ctx.fillStyle = withAlpha(F.blobShadow, 0.28);
  ctx.beginPath(); ctx.ellipse(x, y + 2, spr.c.width * 0.32, 5, 0, 0, Math.PI * 2); ctx.fill();
  const fidget = Math.sin(e.bobT * 2.2 + x * 0.1) * 1.4;
  ctx.save();
  ctx.translate(x, y + Math.min(0, fidget));
  if (e.spinT > 0) ctx.rotate((1 - e.spinT / 0.7) * Math.PI * 2);
  if (e.flip) ctx.scale(-1, 1);
  ctx.drawImage(spr.c, -spr.ax, -spr.ay);
  ctx.restore();
  // !/… bubble: ! when this phase's lines are unheard, … otherwise
  const p = game.player;
  if (dist2(e.x, e.y, p.x, p.y) < NPC.BUBBLE_R ** 2 && !game.npcDialog) {
    const camp = campState(game);
    const fresh = camp.seen[e.npc] !== storyPhase(game);
    const by = y - spr.ay - 12 + Math.sin(game.time * 3 + x) * 1.5;
    ctx.fillStyle = F.cream; ctx.strokeStyle = F.ink; ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.roundRect(x - 9, by - 9, 18, 18, 6); ctx.fill(); ctx.stroke();
    ctx.fillStyle = fresh ? PALETTE.forest.letterStamp : F.ink;
    ctx.font = 'bold 13px Georgia, serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(fresh ? '!' : '…', x, by + 1);
  }
}
