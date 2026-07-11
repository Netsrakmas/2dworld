# Two Worlds

A 2D top-down world-explorer browser game where the art style itself changes with the biome: a flat-vector desert (coral sand, stepped teal oases, barrel cacti, bleached skulls) blends into a hand-drawn storybook forest (wobbly ink outlines, paper grain, ogres, slimes, murky purple ponds).

Built from the researched master prompt in [`PROMPT.md`](PROMPT.md); research notes in [`RESEARCH.md`](RESEARCH.md). All graphics are procedural — no image assets, everything is drawn in code onto canvases at load time.

## Run it

Open `index.html` in a browser. That's it — no build step, no dependencies.

For a shareable world, add a seed: `index.html?seed=yourname`. The same seed always generates the same world.

## Play

- **WASD / arrow keys** — walk (virtual joystick + tap on touch devices)
- **E** — read signs, poke slimes, stare back at watchers
- **Space / J** — swing the staff (on touch, tap the right side of the screen). Chain three presses for the combo: forehand &rarr; backhand &rarr; spin finisher that hits all around and does double damage
- Find the **5 lost letters** (red dots on the minimap edge) scattered across both biomes
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
| `js/entities.js` | Player, ogres, slimes, watchers, letters, particles |
| `js/game.js` | Fixed-timestep loop, camera, input, juice, day/night, minimap, UI |
