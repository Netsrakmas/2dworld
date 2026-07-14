# Two Worlds

A 2D top-down world-explorer browser game where the art style itself changes with the biome: a flat-vector desert (coral sand, stepped teal oases, barrel cacti, bleached skulls) blends into a hand-drawn storybook forest (wobbly ink outlines, paper grain, ogres, slimes, murky purple ponds).

Beneath the forest waits **the Hollow Stump**, and out in the desert a **Colossus Skull** hides the harder, post-game **Marrow Den** — same rules, meaner rooms, a faster Elder, a fifth heart, and something small and sentimental that M. has been missing.

The first of the two is **the Hollow Stump** — a full GBA-era-Zelda-style dungeon: twelve hand-authored rooms behind a room-locked camera with classic screen-slide transitions, small keys and locked doors, smashable pots, push-block puzzles, floor switches, a combat room that seals its shutters, a one-way ledge, Blossom Bombs that crumble cracked walls in the dungeon *and* the overworld, a boss key, a three-cycle boss with a bomb-hungry inhale, a Heart Container, and the letter-writer M. waiting at the end of it all.

Built from the researched master prompt in [`PROMPT.md`](PROMPT.md); research notes in [`RESEARCH.md`](RESEARCH.md). All graphics are procedural — no image assets, everything is drawn in code onto canvases at load time.

## Run it

Open `index.html` in a browser. That's it — no build step, no dependencies.

For a shareable world, add a seed: `index.html?seed=yourname`. The same seed always generates the same world.

## Play

- **WASD / arrow keys** — walk (virtual joystick + tap on touch devices)
- **E** — read signs, poke slimes, stare back at watchers
- **Space / J** — swing the staff (on touch, tap the right side of the screen). Chain three presses for the combo: forehand &rarr; backhand &rarr; spin finisher that hits all around and does double damage
- **K / Shift** — throw a Blossom Bomb, once you've found the pouch (touch: the blossom button)
- Find the **5 lost letters** (red dots on the minimap edge) scattered across both biomes — and find out who signs them "M."
- Seek the **Great Stump** (the stump icon on the minimap) and walk into its doorway. Inside: keys open locks, pots hide hearts, blocks weigh down switches, cracked walls remember the sound of blossoms, and something enormous snores behind the ornate door
- The three **cracked boulders** near spawn are exactly what they look like: an invitation for later
- Ogres telegraph a big slam — step out of the marked zone, then bonk them during the recovery. Defeated ogres get dazed with stars and poof into leaves, dropping hearts and trinkets
- You have 3 hearts; running out just carries you softly back to the spawn clearing with everything you found
- Wait for nightfall (~2 min): the light shifts and fireflies come out in the forest

## Code layout

| File | What it does |
|---|---|
| `js/palette.js` | The only place a color may be defined |
| `js/util.js` | Seeded RNG, easing, color derivation helpers |
| `js/noise.js` | Seeded value noise + fbm |
| `js/sketch.js` | Hand-drawn ink renderer (jittered double-stroked béziers, scalloped clouds) |
| `js/sprites.js` | Pre-renders every prop/creature to offscreen canvases in both art styles |
| `js/world.js` | Infinite chunked world: biome blend, stepped/murky ponds, prop placement, collision |
| `js/combat.js` | All combat tunables (`COMBAT`) + swing state machine, hit resolution, damage, pickups |
| `js/dungeon.js` | The Hollow Stump: all dungeon tunables (`DUNGEON`), ASCII-authored rooms, doors, camera slides, interactables, dungeon enemies, Blossom Bombs, the Great Gulper, the ending |
| `js/entities.js` | Player, ogres, slimes, watchers, letters, particles |
| `js/game.js` | Fixed-timestep loop, camera, input, juice, day/night, minimap, UI |
