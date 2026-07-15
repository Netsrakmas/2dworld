// Saves: the whole adventure persists in localStorage, one slot per seed.
// Durable state only — pots, dungeon enemies, and screen state rebuild from
// the seed; what's saved is what the DESIGN says is permanent (letters,
// trinkets, opened doors, latched switches, bosses, purchases, the hat).
const SAVE = Object.freeze({
  VERSION: 1,
  AUTOSAVE_T: 5000,                // ms between background autosaves
});

function saveSlotKey(seedStr) { return 'twoworlds:' + seedStr; }

function serializeGame(game, seedStr) {
  const p = game.player;
  // saving mid-dungeon parks the bookmark at the dungeon's front door
  let px = p.x, py = p.y;
  if (Dungeon.active || Dungeon.fade) {
    const s = Dungeon.d.exitSpot();
    px = (s.tx + 0.5) * TILE;
    py = (s.ty + 1.4) * TILE;
  }
  return {
    v: SAVE.VERSION, seed: seedStr,
    time: game.time,
    px, py,
    hp: p.hp, maxHp: p.maxHp,
    trinkets: game.trinkets,
    letters: [...game.collected],
    boulders: [...game.bouldersOpened],
    bombs: game.bombs ? { count: game.bombs.count, cap: game.bombs.cap } : null,
    hasHat: !!game.hasHat,
    hatReturned: !!game.hatReturned,
    dropDeck: game.dropDeck | 0,
    camp: game.camp || null,
    dungeons: Dungeon.defs.map((d) => ({
      keys: d.keys, bossKey: d.bossKey,
      // persist door UNLOCKS only — never closed states. Combat shutters are
      // closed while a fight is live; an autosave landing mid-fight must not
      // seal that room shut forever on reload (it did: the Pebblit Den's
      // hub door came back closed with no way to open it).
      doors: [...d.doors].filter(([, dr]) => dr.state === 'open' && dr.type !== 'open' && dr.type !== 'exit')
        .map(([k]) => k),
      flags: {
        latched: [...d.flags.latched],
        chests: [...d.flags.chests],
        keysTaken: [...d.flags.keysTaken],
        bossDefeated: d.flags.bossDefeated,
        heartTaken: d.flags.heartTaken,
        metM: d.flags.metM,
      },
    })),
  };
}

function applySave(game, data) {
  const p = game.player;
  p.x = p.px = data.px; p.y = p.py = data.py;
  game.cam.x = game.cam.px = p.x;
  game.cam.y = game.cam.py = p.y;
  p.maxHp = data.maxHp || p.maxHp;
  p.hp = data.hp > 0 ? data.hp : p.maxHp;
  game.time = data.time || 0;
  game.trinkets = data.trinkets | 0;
  game.collected = new Set(data.letters || []);
  game.bouldersOpened = new Set(data.boulders || []);
  if (data.bombs) game.bombs = { count: data.bombs.count, cap: data.bombs.cap, regrowT: 0 };
  game.hasHat = !!data.hasHat;
  game.hatReturned = !!data.hatReturned;
  game.dropDeck = data.dropDeck | 0;
  if (data.camp) game.camp = data.camp;
  (data.dungeons || []).forEach((sd, i) => {
    const d = Dungeon.defs[i];
    if (!d) return;
    d.keys = sd.keys | 0;
    d.bossKey = !!sd.bossKey;
    for (const entry of sd.doors || []) {
      // new format: plain door keys (unlocked doors). Old saves stored
      // [key, state] pairs — apply only their 'open' entries, so a stale
      // save with a closed shutter self-heals to the built default.
      const key = Array.isArray(entry) ? entry[0] : entry;
      const st = Array.isArray(entry) ? entry[1] : 'open';
      const dr = d.doors.get(key);
      if (dr && st === 'open') { dr.state = 'open'; dr.anim = 1; }
    }
    const f = sd.flags || {};
    d.flags.latched = new Set(f.latched || []);
    d.flags.chests = new Set(f.chests || []);
    d.flags.keysTaken = new Set(f.keysTaken || []);
    d.flags.bossDefeated = !!f.bossDefeated;
    d.flags.heartTaken = !!f.heartTaken;
    d.flags.metM = !!f.metM;
  });
}

function clearSave(seedStr) {
  try { localStorage.removeItem(saveSlotKey(seedStr)); } catch (e) { /* private mode */ }
}

// returns true when a matching save was found and applied
function initSaveSystem(game, seedStr) {
  let loaded = false;
  try {
    const raw = localStorage.getItem(saveSlotKey(seedStr));
    if (raw) {
      const data = JSON.parse(raw);
      if (data && data.v === SAVE.VERSION && data.seed === seedStr) {
        applySave(game, data);
        loaded = true;
      }
    }
  } catch (e) { /* corrupt or unavailable storage: start fresh */ }

  game.saveNow = () => {
    if (game.state !== 'play' || game.deathT !== null) return false;
    try {
      localStorage.setItem(saveSlotKey(seedStr), JSON.stringify(serializeGame(game, seedStr)));
      return true;
    } catch (e) { return false; }
  };
  setInterval(game.saveNow, SAVE.AUTOSAVE_T);
  addEventListener('beforeunload', game.saveNow);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') game.saveNow();
  });
  return loaded;
}
