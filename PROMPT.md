# Master Prompt: "Two Worlds" — a 2D Top-Down World Explorer

> **How to use this file** (based on the research in `RESEARCH.md`):
> 1. Paste the entire prompt below as your **first message** to the AI coding assistant, together with the two reference images.
> 2. Let it complete **one milestone at a time** (the build order is at the bottom). Verify in the browser, then say "proceed to Milestone N+1". Don't let it skip ahead.
> 3. If a fix-loop starts degrading visuals, **revert to the last good commit and re-ask differently** — don't argue with a broken state.
> 4. If you only want ONE of the two art styles, delete the other art bible section and the "Style Transition" section before pasting.

---

## THE PROMPT

You are a senior game developer and art director. Build a polished 2D top-down world-explorer browser game called **Two Worlds**. Two reference images are attached; they are the single source of truth for the visuals. Everything must be rendered **procedurally in code** — no image files, no sprite sheets, no emoji, no external assets. If a detail in this brief conflicts with the reference images, the images win.

### Concept

An infinite, seeded, procedurally generated world made of two great biomes that the player travels between:

- **The Sunburnt Wastes** — a flat-vector desert (reference image 1): coral sand, teal oasis ponds with chunky stepped shorelines, barrel cacti with pink blossoms, faceted purple rocks, bleached cow skulls and scattered bones.
- **The Whispering Woods** — a hand-drawn storybook forest (reference image 2): parchment-colored clearings, scalloped ink-outlined trees, murky purple ponds, wooden palisades, barrels, warning signs, red ogres, slimes, and strange one-eyed critters.

The signature feature: **the art style itself changes with the biome.** In the Wastes everything renders as clean flat vector; in the Woods the same engine renders wobbly sepia ink outlines on paper grain. Crossing between them, the styles blend over a transition band. The player is a small hooded adventurer with a wooden staff who explores, collects letters/artifacts, and avoids or befriends creatures.

### Tech constraints

- Vanilla JavaScript + HTML5 Canvas 2D. No frameworks, no build step, no npm. Deliver `index.html` + a handful of ES modules (or a single file if under ~3000 lines).
- Runs at 60 fps on a mid-range laptop with 500+ visible objects. Fixed-timestep update (60 Hz) + interpolated `requestAnimationFrame` render. No allocation inside the game loop.
- Deterministic: one seeded PRNG (e.g. mulberry32) drives ALL randomness — terrain, prop placement, line wobble. Seed comes from `?seed=` in the URL; show it in the UI so worlds are shareable.
- Works with keyboard (WASD + arrows), and on touch devices with a virtual joystick + context action button.

### GLOBAL ART RULES (apply everywhere)

1. **Every color in the game lives in one frozen `PALETTE` constant.** Zero hardcoded hex values anywhere in rendering or game logic. This is non-negotiable — it is how palette consistency is enforced architecturally.
2. **Never use pure black, pure white, or gray shadows.** All shadows are hue-shifted colors (spec per biome below).
3. **Shape language is round and chunky.** Generous corner radii, capsules, blobs. Big-headed, short-limbed characters with simple dot-and-line faces. The only straight edges allowed in the whole game are the desert rock facets and the stepped pond shorelines.
4. **Depth = flat layered tones, never gradients or blurs.** Max 3 tones per object (base + shade + optional highlight).
5. **Every object must pass the "could I draw this?" test** — a recognizable icon, readable when the whole screen is shrunk to a 300×300 thumbnail.
6. **Upgrade every visible surface, not one hero object.** A scene is done when nothing on screen looks like placeholder programmer art.
7. Build in this order and never fake it: **authored forms → color/shading → lighting/mood → effects.** Adding glow or filters to lazy shapes is forbidden.

---

### ART BIBLE A — The Sunburnt Wastes (match reference image 1 exactly)

**Style anchors:** Alto's Odyssey, Kurzgesagt, Overland (Finji), Card Crawl. Flat minimalist vector illustration.

**Rendering rules:**
- Flat solid fills ONLY. No outlines, no gradients, no textures, no strokes.
- **One global light direction for the whole biome.** Every cast shadow is the object's own silhouette (or a rounded blob) drawn *first*, offset by the same fixed vector (≈ +0.8% , +1.2% of viewport), filled with `sandShadow`. Crisp edges — never canvas `shadowBlur`.
- Ground detail = sparse deterministic scatter: tiny darker speckle dots (2–4 px) at roughly 1 per 3000 px², plus a few large rounded darker patches. Keep speckles out of object footprints.
- **Oasis ponds:** the shoreline snaps to a coarse virtual grid (step ≈ 5% of viewport width) producing chunky right-angle stairsteps with small rounded corners; inside, a concentric lighter band repeats the same stepped contour one cell in; scatter a few short rounded-cap dash highlights on the water.

**Desert palette (all values go into `PALETTE.desert`):**

| Role | Hex |
|---|---|
| Sand base | `#E8845C` |
| Sand speckle / patches | `#D96E4A` |
| Cast shadow (everything) | `#C75B3F` |
| Water deep | `#1E8E82` |
| Water light band | `#59BFAE` |
| Water dash highlight | `#BFF0E4` |
| Cactus body | `#2A9D8F` |
| Cactus ribs / dark | `#166B60` |
| Rock light facet | `#6E5380` |
| Rock dark facet | `#4A3757` |
| Bone cream | `#F6EBD9` |
| Bone shade | `#E3CDB4` |
| Blossom pink | `#E85D75` |

**Object specs (match image 1):**
- **Barrel cactus:** squat capsule body in cactus body color, 3–5 darker vertical ribs (rounded rects), a pink blossom on top built from 5–6 rounded petals around a small cream center; some cacti get a smaller side-arm. 2–3 size variants.
- **Faceted rock:** irregular 5–7-sided polygon split into 3–5 flat facets; top-facing facets use the light tone, side facets the dark tone, consistent with the global light. Slightly rounded corners.
- **Bones:** cow skull (rounded cranium, two curved horns, dark rounded eye sockets, snout with nostril dots), curved rib arcs, and knuckle-shaped vertebrae clusters — all cream with one shade tone, scattered as if a giant skeleton is half-buried across several screens.

---

### ART BIBLE B — The Whispering Woods (match reference image 2 exactly)

**Style anchors:** Wildfrost, Cozy Grove, Hidden Folks (Sylvain Tegroeg), children's picture-book illustration, Tiny Epic box art. Warm ink-and-watercolor storybook.

**Rendering rules:**
- **Wobbly hand-drawn ink outlines on everything.** Implement sketchy rendering the RoughJS way: draw each segment as a cubic bézier whose endpoints and control points are jittered by a seeded roughness offset, with a slight midpoint bow; stroke each path **twice** with different seeds for the overdrawn-sketch feel. Line weight varies subtly along the stroke; lines may slightly overshoot corners. Outline color is warm dark sepia `ink` — never black.
- **Seeded wobble, pre-rendered:** every prop's jitter derives from its object id, and all wobbly art is rendered ONCE to offscreen canvases at load/chunk-generation time, then blitted. Never re-jitter per frame. For hero elements (player, creatures) precompute 2–3 wobble variants and cycle them every ~120 ms for a gentle "line boil".
- **Paper grain:** generate one noise tile at load (value noise, subtle) and composite it over the forest region with `multiply` at 6–10% alpha, over a warm parchment ground. Add a low-frequency blotch layer for watercolor unevenness.
- **Watercolor fills:** flat muted fill, then re-stroke the shape slightly inset with the fill darkened ~10% at low alpha, so pigment pools at the edges.
- **Shadows:** a single soft flat translucent warm-brown ellipse under each object (multiply). No directional shadows.
- **Alive clutter:** pebbles, grass tufts, fallen leaves, mushrooms scattered everywhere open ground gets boring; scalloped-edge dirt paths wind between clearings.

**Forest palette (all values go into `PALETTE.forest`):**

| Role | Hex |
|---|---|
| Parchment ground | `#E2C68F` |
| Ground speckle / path edge | `#CFAF72` |
| Ink outline | `#3D2C1E` |
| Blob shadow (at ~25% alpha) | `#5A4630` |
| Tree canopy dark | `#4F5D3A` |
| Tree canopy mid | `#66754A` |
| Tree canopy light | `#7E8C5A` |
| Trunk / wood | `#8A6642` |
| Wood light (planks, barrels) | `#A67C52` |
| Murky pond purple | `#7E5A8C` |
| Pond deep purple | `#63467A` |
| Stone gray-tan | `#B8A88C` |
| Ogre red | `#D95B43` |
| Slime green | `#93B85C` |
| Accent cream (paper, skulls on signs) | `#EFE3C8` |

**Object specs (match image 2):**
- **Trees:** round bushy canopies drawn as scalloped cloud outlines, filled with canopy tones; short sketchy interior squiggle strokes suggest leaf clumps; occasional visible trunk with root flare. Cluster them densely at clearing edges so the forest reads as walls.
- **Murky ponds:** irregular blob shape in murky purple with a deeper purple center, edged with a ring of rough hand-drawn stones.
- **Props:** wooden palisade fences (vertical wobbly planks, pointed tops), stacked barrels with two dark hoops, wooden signposts bearing a painted purple skull mark, scattered rocks and pebbles, grass tufts of 3–5 blades, fallen leaves.
- **Player — the hooded adventurer:** small chunky body, oversized pointed brown hood covering the eyes (face is just the hood's shadow with a hint of chin), simple cape, carries a wooden staff taller than themself, tiny black feet. 4-direction facing, 2-frame walk bob.
- **Creatures:** • **Ogres** — big round red furry bodies with stitch marks, small yellow eyes, underbite with two tusks, little horns, black shorts printed with white skulls; they patrol slowly and lumber after the player on sight. • **Slime** — green blob with a simple content face, squishes as it hops. • **Watcher** — small dark-purple tentacled critter that is a single huge yellow cat-eye; it sits near ogre camps and turns to watch the player.

---

### Style Transition (the signature moment)

Biome style is a smooth scalar `styleBlend` (0 = desert, 1 = forest) computed from the biome noise, changing over a transition band ~12 tiles wide:
- Ground color lerps between the two palettes.
- Ink outline alpha ramps 0 → 1 entering the forest; drop-shadow offset shrinks to zero as blob shadows fade in.
- Paper-grain overlay alpha ramps 0 → forest level.
- Props swap species gradually (last cacti mingle with first trees).
The player character is always drawn in storybook style, but in the desert their outline drops away and they gain the flat offset shadow — they adopt the local art rules.

### Gameplay features

1. **Movement:** WASD/arrows, delta-time based, normalized diagonals, speed ~4 tiles/s. Axis-separated AABB collision against a logic grid (trees, rocks, water, fences block; player slides along obstacles).
2. **Camera:** lerped follow (`cam += (target − cam) * 0.08` per tick), final render offsets rounded to integers (no sub-pixel seams).
3. **World:** chunked (32×32 tiles), generated lazily around the player from elevation + moisture noise (2 independent simplex/value noises, 4 octaves, elevation raised to power 1.7); biome lookup on (elevation, moisture) → desert, forest, transition, water. Chunks pre-render their terrain to offscreen canvases and are evicted when far. Visible-tile culling always.
4. **Interaction:** proximity-highlighted interactables with a floating "E" prompt — read signs (short flavor text in a storybook dialogue box), open letters (like the envelope in image 2), inspect skulls/bones, poke the slime. A few collectible letters form a tiny narrative goal ("find the 5 lost letters").
5. **Creatures:** ogres patrol waypoints, chase on sight (line-of-sight + radius), give up and wander back; contact knocks the player back with screen shake — no death, this is cozy. Slimes hop idly. Watchers track the player with their eye.
6. **Ambient life:** every frame has motion — cactus blossoms and grass sway on per-object sine phases, leaves drift down in the forest, dust motes in the desert, water dashes shimmer, birds occasionally cross the sky as small silhouettes.
7. **Day/night:** slow cycle (~4 min); a full-screen tint composited with `multiply` lerps through warm noon → amber dusk → gentle blue night (keep it cozy, never too dark); fireflies appear in the forest at night.
8. **Minimap:** corner minimap, 1 px per 2 tiles, drawn from cached chunk data only when new chunks generate; player dot + facing tick.
9. **UI:** seed display, letters-collected counter, muted-paper UI panels that match the storybook style. Title screen with the game name hand-lettered in the ink style over a split desert/forest vignette.

### Juice spec (exact numbers, wire these next to the game logic, not as an afterthought)

- Footsteps: dust puff of 4–6 particles every 0.25 s while moving (desert: sand-colored; forest: tiny leaf flecks), 300–500 ms lifespan, scale 0.8 → 0, alpha 0.5 → 0.
- Player start/stop: squash-and-stretch, 1.0 → 1.12/0.88 → 1.0 over 150 ms, `Back.easeOut`.
- Ogre contact: screen shake 200 ms, amplitude 2% of viewport, decaying; 60 ms hit-freeze; 12–16 particle burst.
- Pickup: item pops to 1.3× then eases down (`Elastic.easeOut`, 500 ms) with a small sparkle burst and floating "+1 letter" text.
- Dialogue boxes and UI: slide+fade in 200 ms, `Back.easeOut`. Nothing ever appears or disappears without easing.
- Particle budget: pooled emitters, ≤ 60 live particles desktop, ≤ 20 mobile.

### Forbidden (the known AI-art failure modes — do none of these)

- No gradients, no `shadowBlur`, no glow, no CSS filters as a substitute for authored shapes.
- No black or gray shadows; no pure #000/#FFF anywhere.
- No hex values outside the `PALETTE` constant.
- No emoji, no Unicode symbols as art, no loaded images or fonts for world art (UI text may use one Google-fonts-free system stack; hand-letter the title procedurally or use a rounded system font).
- No default-looking rectangles: if a placeholder shape survives to the end of a milestone, the milestone is not done.
- Don't add features beyond this brief without asking.

### Acceptance criteria (self-check before declaring any milestone done)

- Side-by-side squint test: a screenshot of each biome should be mistakable for the corresponding reference image's world (same palette temperature, same shape language, same detail density).
- 300×300 thumbnail of the screen still readable; every entity passes "could I draw this?".
- Steady 60 fps with the browser dev-tools performance panel; no console errors or warnings; no allocation-driven GC sawtooth in the loop.
- Same seed ⇒ pixel-identical world layout on reload.
- Playable start-to-finish on a phone via touch.

### Build order (complete one milestone, show it running, wait for my validation before the next)

1. **Gray-box explorer:** canvas loop, seeded chunked world with 2 placeholder biome colors, WASD movement, collision, camera, culling. Prove 60 fps.
2. **Desert art pass:** full Art Bible A — sand, speckles, stepped ponds, cacti, rocks, bones, unified shadows. Squint-test against image 1.
3. **Forest art pass:** full Art Bible B — sketchy renderer, pre-rendered wobbly props, paper grain, trees, ponds, palisades, signs. Squint-test against image 2.
4. **Character & creatures:** hooded player with walk cycle, ogres with patrol/chase, slimes, watchers.
5. **Style transition band + biome-aware player rendering.**
6. **Interaction & goal:** signs, letters, dialogue boxes, counter, title screen.
7. **Life & juice:** ambient motion, particles, squash/stretch, shake, day/night, fireflies, minimap, touch controls.
8. **Polish audit:** run the full acceptance-criteria checklist, fix everything that fails, then a final pass upgrading the three weakest-looking things on screen.

---

## THE COMBAT UPDATE (feature-addition prompt — run after the base game ships)

You are adding **cozy "bonk" combat** to the existing game. This is a feature addition, not a rewrite.

**Map of what exists:** movement/collision and the fixed-timestep loop live in `js/game.js`; creature AI in `js/entities.js`; pre-rendered sprites in `js/sprites.js`; every color in `js/palette.js`. Integration constraints:
- Do NOT modify the existing movement, collision, camera, or world-generation code paths — add combat as new states alongside them. Regression check: walking, sliding along obstacles, letter collection, and interaction must behave exactly as before.
- Every tunable (HP, damage, durations, ranges, impulses) goes in ONE frozen `COMBAT` constants block. Zero magic numbers in logic.
- One mechanic per pass, in this order: player swing state machine → hit resolution → impact feedback → enemy attack/defeat states → health/death → pickups. Playtest between passes.

**Tone rule:** picture-book bonk combat. No blood, no corpses, no "GAME OVER". Enemies get dazed with stars over their head and poof into leaves. Defeat of the player is a soft fade and "you were carried back to safety."

**Player attack — 3-phase state machine** (hitbox belongs to the state machine, never to the sprite):
- Input: Space / J (tap right side on touch when no interactable is near). Inputs during recovery are **buffered for 130 ms** and fire the frame recovery ends; buffer clears on taking damage.
- Phases: windup **70 ms** → active **120 ms** → recovery **160 ms**, then **60 ms** cooldown (~2.5 swings/s). Movement damped to 30% during windup+active; small **12 px forward lunge** across windup+active.
- Hitbox: **120° arc sector, radius 58 px**, centered on facing. Tested every active frame as circle-vs-sector against each enemy, with a per-swing `alreadyHit` set so each enemy takes damage **once per activation**.
- 3-hit combo: a buffered swing chains; the 3rd hit deals **2× damage, 2× knockback, 130 ms hitstop**. Combo resets after 600 ms without attacking.

**A landed hit must trigger SIMULTANEOUSLY (acceptance criteria, not polish):** 60 ms hitstop (130 ms on kill/finisher) that freezes simulation but never the render loop · enemy white-silhouette flash 100 ms (pre-rendered `source-in` copy, no per-frame filters) · knockback impulse 300 px/s decaying ×0.85/frame · squash 1.25×/0.75× easing back over 120 ms · 8–12 particles at the contact point · 200 ms AI stagger (400 ms on finisher). A whiffed swing triggers none of these. Screen shake on kills only — and shake offsets the camera, never entity positions.

**Enemies:**
- **Ogre (5 HP):** patrol → alert ("!" bubble, brief pause) → chase → when within 78 px, telegraphed **slam**: 500 ms windup (lean back, "!", target zone drawn on the ground where the slam will land) → 150 ms active (dust-ring effect; 1 heart damage + knockback if the player is inside the 55 px zone) → 700 ms vulnerable recovery. That windup-dodge-punish loop is the whole combat dance. Contact while chasing costs ½ heart. On 0 HP: dazed 800 ms with stars circling, then leaf-poof + drops 1 heart + 2–3 trinkets.
- **Slime (1 HP):** stays gentle — one bonk splats it into a poof; 20% heart drop, 1 trinket. No contact damage; slimes are swing tutorials.
- **Watcher:** unkillable and harmless; bonking it makes it spin, and the first bonk drops 2 trinkets. Reactivity without threat.
- Defeated camp enemies come back only when their chunk regenerates (never on screen).

**Player health & death:** 3 hearts (half-heart granularity) drawn as storybook hearts under the HUD panels. On damage: **1000 ms i-frames with sprite flicker**, knockback with control locked 150 ms, small shake. At 0 hearts: soft cream fade (no death text), respawn at the spawn clearing with full hearts and ALL progress kept, one-line dialog. Heart pickups heal 1 heart; trinkets are a counter in the HUD. Drops scatter with a random impulse, then magnet to the player after 300 ms.

**Regression checklist before declaring done:** 60 fps with combat active; no console errors; same seed still generates the identical world; movement/interaction unchanged; enemies can never be multi-hit by one swing; hitstop never stops `requestAnimationFrame`.

---

## THE SWING ANIMATION UPDATE (feature-addition prompt — run after the combat update)

You are upgrading the attack visuals: the staff must be a **visible, separately animated weapon**, and the 3-hit combo must be **three visually distinct swings**. Feature addition, not a rewrite.

**Map of what exists:** the swing state machine and `COMBAT` constants live in `js/combat.js`; the player sprite (currently with a baked-in staff) in `js/sprites.js` (`drawPlayerBody`); player rendering in `js/game.js` (`drawPlayer`). Constraints: do NOT modify movement, hit-resolution feedback (hitstop/flash/knockback stay as specced), world code, or enemy AI. All new tunables go into the `COMBAT` block (a per-swing table). The old whole-sprite-rotation + fixed swoosh is replaced.

**Weapon as a separate layer (the standard indie pivot technique):**
- Remove the staff from the baked player sprites. Pre-render a staff sprite (grip at origin, shaft along +X, ~34 px, small knob at the tip) in both art treatments — ink-outlined for the forest, flat for the desert.
- Idle/walk: staff held upright at the hand position (side mirrored with facing), bobbing with the walk cycle.
- Attacking: the staff rotates around a hand pivot near the player's center. One choreography works for all four facings because all angles are relative to the facing angle θ.

**Animation grammar (anticipation → strike → follow-through → recovery, never linear):**
- **Anticipation** eases IN (quad): the staff pulls back ~25° BEYOND the swing's start angle; the body counter-leans. This phase telegraphs which swing is coming.
- **Strike** eases OUT hard (quart): the entire arc is crossed in 60–80 ms — deliberately too fast to read as motion, which is what smears are for. Damage lands during this phase only.
- **Follow-through**: the staff holds at full extension ~100 ms (sells weight). No trail during anticipation or follow-through — smears on non-strike frames read as noise.
- **Recovery** eases in-out back to idle; cancellable into the next combo swing after 40% (the finisher is never cancellable).

**The three swings (all angles relative to θ):**

| | Swing | Arc | Phases (windup/strike/follow/recover) | Emphasis |
|---|---|---|---|---|
| 1 | Forehand sweep | −70° → +70° (140°) | 70 / 80 / 100 / 100 ms | thin crescent trail |
| 2 | Backhand sweep (reverse) | +80° → −80° (160°) | 50 / 75 / 90 / 100 ms | starts where hit 1 ended — chains read as one motion; bigger trail |
| 3 | **Spin finisher** | −90° → +270° (360°, hits all around) | 130 / 160 / 120 / 220 ms | exaggerated wind-up, biggest brightest trail, 2× damage & knockback, longer hitstop, small shake, stronger lunge |

**Smears & trails (procedural, palette-locked, no gradients):**
- **Crescent smear**: a tapered wedge behind the staff — thick at the leading edge, knife-thin at the tail — built from ~6 arc strips with stepped alpha (head ~0.8 → tail ~0.05) in the flash cream. Trail span grows with angular velocity. In the forest add a thin wobbly ink edge along the outer rim. Fades out ~120 ms after the strike ends.
- **Afterimages**: 2–3 fading staff copies at angles just behind the current one during the strike (multiples-style smear).
- **Tangential stretch**: scale the staff perpendicular to its shaft by up to ~1.5× proportional to instantaneous angular speed — a free smear frame.
- Draw order: crescent → afterimages → player body → staff on top. The weapon is always the leading edge; trail geometry only ever spans backward.

**Acceptance criteria:** each of the three swings is distinguishable in a single freeze-frame (direction of crescent, size of trail, spin coverage); the staff is visible at all times (idle, walking, all 4 facings, both biomes); anticipation pose visibly cocks before every strike; the finisher hits enemies on all sides; existing combat behavior (damage per swing, dedup, buffering, feedback) unchanged; 60 fps sustained while spamming combos; zero console errors; the desert staff has no ink outline and the forest staff does.

---

## THE GRAPHICS POLISH UPDATE (feature-addition prompt — run after the swing animation update)

You are upgrading the game from "reads correctly" to "art-directed." Two problems to solve, named by the research: **uniform scatter** (even density everywhere = wallpaper) and **dead air** (static terrain with no atmosphere between the player and the world). Feature addition in four passes — do them in order, verify between each.

**Map of what exists:** chunk terrain baking and prop placement in `js/world.js` (`bakeTerrain`, `genChunk`, `regionFeature`); render layering, day/night tint, and particles in `js/game.js`; sprites in `js/sprites.js`; every color derives from `js/palette.js`. Constraints: do NOT modify movement, combat, collision semantics, or entity AI. World generation may change (prop placement is visual), but the same seed must still be deterministic. All new tunables go in one frozen `ATMOS` constants block. Bake-once rule: every soft element (gradients, blurred blobs, noise tiles, ray sprites) is rendered to an offscreen canvas at load/resize — runtime is `drawImage` only; runtime `ctx.filter`/`shadowBlur` are forbidden (documented fps killers). Batch composite modes: one multiply group, one overlay/screen group per frame, ≤10 non-source-over full-screen draws total.

### Pass 1 — Atmosphere layer (biggest bang for buck)

1. **Cloud shadows / sun patches.** Bake one tileable 512² cloud texture at load (20–40 soft radial-gradient blobs, radii 80–300 px, edge-wrapped for tiling, one bake-time blur pass to fuse). Per frame: multiply-composite it tiled across the viewport, scrolled by `worldCam + t·wind`; a second layer at 1.7× scale and 0.6× speed kills visible repetition. Shadow alpha 0.06–0.12, drift 10–30 px/s, moving at ~20° off the leaf-wind axis. Forest: dark soft dapple. Desert: invert — fewer, larger **warm light patches** (overlay-composited) so the sand shimmers with sun instead of darkening. Shadows scroll exactly with terrain (parallax 1.0).
2. **Vignette + biome grade.** Bake a viewport radial vignette at resize (transparent to ~0.55× half-diagonal, biome-tinted at the rim — warm brown in desert, cool blue-green in forest — never pure black, alpha ~0.3 at corners); draw last, alpha breathing ±0.05 over ~8 s. Add a per-biome full-screen wash (overlay, alpha 0.08–0.15; warm in desert, cool in forest) crossfaded over ~1.5 s at the border, layered with the existing day/night multiply.
3. **One wind system.** A single global `windAt(worldPos, t)` function: 3 superposed sines with the phase term `dot(windDir, worldPos)/λ` (λ ≈ 300–700 px) so gust fronts visibly TRAVEL across the field, plus a slow gust envelope and a discrete gust event every 20–60 s (amplitude ×2–3 spike over ~1 s, decay 3–4 s). Everything reads from it: prop sway (grass T≈1.5–3 s, canopies 3–5 s at lower amplitude), leaf/dust particle spawn rate and velocity, cloud drift nudge. One weather system, not independent wiggles.

### Pass 2 — Bake-time art direction (zero runtime cost)

4. **Macro chunk tinting.** At bake, sample two very-low-frequency noises (feature size 20–60 tiles): one light/dark, one warm/cool; shift ground fills ±4–8% lightness/hue toward them. Kills large-area flatness; makes cloud shadows feel native.
5. **Clustered placement replaces uniform scatter.** Three layers: (a) per-family low-frequency density noise (wavelength 40–80 tiles, different seed per family so "rocky stretch" ≠ "cactus flat"), remapped so **30–40% of the map has literally zero props** — real voids are what make clusters read; (b) parent–child clusters (Thomas process): sparse parents, 3 or 5 children (rule of odds) at gaussian radius σ≈2–3 tiles, child scale shrinking with distance from parent, mixed families (rock parent → pebbles + grass children); (c) minimum spacing 2–4 tiles between LARGE props only — small clutter may overlap freely, and clusters should overlap 15–40% with y-sort.
6. **Big–medium–small scale buckets.** Replace uniform prop scale with 70% small (0.7–0.9×), 25% medium (1.0–1.4×), 5% big (1.8×+, reserved so "big" stays a signal). Per-instance flip jitter; hue/lightness jitter within the palette: hue ±4–8°, lightness ±5–8%, partly driven by the density noise so whole patches trend warm/cool together.

### Pass 3 — Landmarks & paths (composition + exploration pull)

7. **Landmark tables per region** (extend `regionFeature`): each region draws 2–4 set pieces ≥40 tiles apart, each with a cleared apron (zero props in footprint +2 tiles) and a boosted detail ring (+50–100% clutter within 4 tiles). Desert table: bone "kill site" micro-scene (common), hero rock trio (common), giant cactus ring of 5/7 (uncommon), oasis with palm cluster (uncommon), colossal walk-through ribcage (rare), rock arch "weenie" (rare). Forest table: stump + mushroom ring + felled log (common), flower-patch clearing (common), fairy circle (uncommon), standing stones of 5/7 (uncommon), abandoned campfire (uncommon), Great Ancient Tree at 3–4× scale with root props (rare). Rare landmarks get the biome's brightest accent hex (used nowhere else nearby) and a particle tell visible from afar (circling birds over the ribcage, fireflies at the great tree).
8. **Desire paths.** Per region: connect landmarks + camps with a near-MST plus one loop edge; midpoint-displace each edge (±10–20% perpendicular, 1–2 levels); stamp into the terrain bake as 1–2 tile "trodden" strips (lighter/desaturated ground, dithered 1-tile feather), suppress props on the path and halve density within 2 tiles, then dress the edges sparsely (edge stones, the odd bone/flower). Derive the graph purely from region-seeded positions so any chunk computes its crossings without neighbors loaded.

### Pass 4 — Living details

9. **Water life** (overlay pass over visible water cells only, never re-bake): cell-hashed dash glints (6–16 px, alpha 0→0.5→0 on 2–4 s cycles, ~¼ of cells, phases staggered so ~⅓ visible at once); expanding ripple rings every 4–10 s per screenful (radius 2→20 px over ~1.5 s, alpha 0.35→0); shore-foam ticks on boundary cells pulsing on 3–5 s sine cycles.
10. **Forest god rays**: 3–5 baked skewed bright quads (bake-blurred, screen-composited, alpha 0.10–0.2) stamped at fixed world positions in clearings so they scroll with terrain, each pulsing on 6–12 s cycles, paired with a ground light-pool ellipse and a firefly/pollen spawn bias inside the shaft.
11. **Ambient drifters**: forest pollen/seeds (3–8 on screen, 15–30 s lifetimes) and 1–2 butterflies (two-triangle flap ~8 Hz, wandering); desert dust streaks (thin, alpha ≤0.15, gusts only) and a rare wandering **dust devil** (25–50 particles on a helical column, r 6→30 px over 40–80 px height, spawns once every few minutes).
12. **Foreground parallax silhouettes**: 2–4 baked soft dark canopy/frond clusters anchored at screen edges/corners, scroll factor 1.15–1.4, slow 4–8 s sway, alpha ≤0.4 — edges only, the one true depth cue in top-down; easy to overdo, so keep them rare in the desert.

**Acceptance criteria:** a 30-second stationary screen recording in each biome shows visible motion in ≥4 independent systems (cloud light, gust fronts, water, drifters); a gust event visibly travels across grass, particles, and cloud drift together; standing anywhere, the squint test shows one dominant focal area, not uniform salt-and-pepper; each region contains ≥2 discoverable set pieces connected by visible trails; prop layouts show clusters with true empty corridors (≥4 tiles) between them; both biomes still squint-match the original reference images; frame time budget: ≤10 non-source-over full-screen draws, no runtime blur.

**Regression checklist:** 60 fps while walking through dense areas with all atmosphere on; zero console errors; same seed ⇒ identical world (placement rework changes layouts once — after it lands, determinism must hold again); letters, combat, camps, minimap all behave identically; chunk bake time stays under ~16 ms per chunk.

---

## THE CHARACTER ASSET PIPELINE (two-part spec: generation runbook + engine integration)

Goal: replace the procedurally drawn characters (player, ogre, slime, watcher) with **production-grade illustrated sprite sheets with real animation frames**, generated with AI tooling, while the game stays no-build and double-click-openable and falls back to procedural sprites if sheets are missing.

### Part A — Asset generation runbook (human + AI tools, outside the game code)

**A1. Style anchor.** Prepend this to every generation prompt: *"hand-drawn storybook children's-book illustration, warm cozy palette, confident dark sepia ink outlines, soft flat watercolor-wash fills, flat ambient lighting, NO cast shadows, plain solid background, full-body game character, top-down-friendly 3/4 view. No photorealism, no 3D render, no gradients, no pixel art."* Attach the two original reference images as style references on every generation (Nano Banana Pro / Flux.2 multi-reference / Midjourney --sref / Scenario image references all support this).

**A2. Identity from the existing game (the key trick).** Render each current procedural character at 4–8× scale from the game itself and use it as img2img/structure input (denoise ~0.45–0.65, or instruction-edit: "redraw this exact character as a storybook illustration, keep pose, proportions and colors"). This preserves the silhouettes and palette the game already established.

**A3. Reference sheets, then poses.** For each character produce one canonical reference sheet (front/side/back, neutral pose, solid background). Generate all subsequent poses by conditioning on that sheet — never from text alone. One character per generation. If a character needs dozens of assets, bootstrap a character model/LoRA from the best 10–20 outputs (Scenario hosted training: 5–15 images, ~30–60 min; or ComfyUI/Kohya locally).

**A4. Animation frames.**
- *Idle / walk / hurt / death*: image-to-video (Kling / Seedance via Scenario, or equivalent) from each direction's still — prompt "walk cycle **in place**, looping, side view" — then `ffmpeg -vf fps=12` frame extraction; hand-pick the 4–6 frames hitting the key poses (contact/lift/passing); background-remove (rembg); clean drift in Aseprite (timeline + onion skin + tags), force the loop.
- *The 3 attack swings*: do NOT trust video models here — author 4–6 frames per swing as **anticipation / smear / impact / follow-through** stills via A3 pose edits (a big painted smear frame both looks hand-drawn and hides AI inconsistency). Match the existing combat choreography: forehand, backhand, 360° spin.
- *Free fallback*: Meta Animated Drawings (MIT) — annotate each drawn view, retarget BVH walk/idle clips, render transparent GIFs headlessly via its Python API, explode to frames. Good for walk/idle; not for attacks.

**A5. Post-processing every frame (the anti-"pasted-on" pass):** quantize colors to the game palette (nearest-color script); erase ALL baked shadows (the game draws its own blob shadow); normalize ink outline weight (~2 px at authoring scale, sepia not black); defringe/matte alpha edges (no white halos — test on dark background); author at 192×192, downscale 2× to 96×96 with Lanczos.

**A6. Sheet assembly (Aseprite as source of truth).** Per character one PNG: cell **96×96** (2 px inner gutter), **rows = directions in order down/left/right/up** (author 3 views, mirror side at runtime — bake both side rows only if staff-hand matters), columns = frames. States and budgets per direction: idle 4 @ ~5 fps · walk 6 @ ~10 fps · attack1 4 · attack2 4 · attack3 6 (all 12–15 fps, non-loop) · hurt 3 · death 6 @ 8 fps (hold last). Pivot: bottom-center of feet at **(48, 88)**, identical in every frame — feet baseline never moves inside the cell. Slime/watcher need fewer states (no attacks; watcher: idle + spin).

**A7. Licensing/disclosure (non-optional):** generate on a PAID plan (free-tier outputs are usually non-commercial); record which tool produced what; when shipping to Steam/itch, fill the generative-AI disclosure (required on both since 2024; itch delists undisclosed AI assets).

### Part B — Engine integration (implementable now, before any assets exist)

**Map of what exists:** character rendering in `js/game.js` (`drawPlayer`, `drawEntity`, `drawCreature`), procedural sprites in `js/sprites.js`, combat states in `js/combat.js`. Constraints: do NOT change movement, combat logic, or entity AI; the animation layer only *observes* game state. The game must keep working with zero asset files present.

1. **Packaging — no fetch, no server:** each character's assets ship as `assets/<name>.js` defining `GAME_ASSETS.<name> = { frameW, frameH, anchor, anims, png: "data:image/png;base64,..." }`, loaded via plain script tags. Data URIs are same-origin (no CORS, no canvas tainting on `file://`). Load with `new Image() → await img.decode()` under `Promise.allSettled`.
2. **Animation table + state machine:** per-frame durations in ms (support scalar or array — uneven holds are what make few frames feel like many); advance frames in the fixed-timestep update with a while-loop, never in render; derive the desired animation from game state each tick through a priority filter (`death > hurt > attackN > walk > idle`); non-looping states are uninterruptible except by higher priority; re-setting the same looping state is a no-op.
3. **Rendering:** translate to interpolated position (integer-rounded) → rotate/flip/squash via the existing transform chain (`scale(facingLeft ? -sx : sx, sy)`) → `drawImage(sheet, col*96, dirRow*96, 96, 96, -48, -88, 96, 96)`. White hit-flash = a pre-baked white-silhouette copy of the whole sheet (source-in fill at load), drawn with alpha over the frame — no per-frame compositing. The game's blob shadow, squash, flash and i-frame flicker apply identically to both render paths.
4. **Hot-swap fallback:** every character has a `draw` slot initialized to the procedural renderer; when its sheet decodes, the slot flips to the sheet renderer. `?procedural` URL flag forces the old path (A/B comparison + kill switch). A missing/corrupt `assets/*.js` degrades only that character.
5. **Combat sync:** attack animations map to the existing swing phases — the sheet's `hitFrame` metadata must land inside the strike's active window; if frame counts and COMBAT.SWINGS timings disagree, the state machine stretches frame durations to fit the swing duration (code timing stays authoritative, art follows).

**Acceptance criteria (Part B, testable with a generated placeholder sheet):** game boots and plays identically with zero assets, with all assets, and with one corrupt asset; `?procedural` flips all characters; feet never slide or sink at walk speed changes; hit-flash/squash/knockback visuals identical across both paths; 60 fps; no console errors on `file://`.

**Regression checklist:** all prior suites green; total asset payload target &lt; 4 MB base64; sheet dimensions ≤ 2048 px per side.

---

## THE ZELDA UPDATE (feature-addition prompt — the game becomes a complete Zelda-like)

You are adding the structural half of a GBA-era Zelda (The Minish Cap / A Link to the Past / Link's Awakening) to Two Worlds: **one authored dungeon with lock-and-key progression, a dungeon item, a 3-cycle boss, a heart container, overworld gating, and a real ending.** The combat half already exists (hearts, i-frames, knockback, 3-hit combo, telegraphed enemies) — do not rebuild it. This is a feature addition in five passes; complete one pass, verify, then continue.

**Map of what exists:** fixed-timestep loop, input, camera, rendering and HUD in `js/game.js`; overworld chunks/collision (`isSolidAt`) in `js/world.js`; swing state machine + all combat tunables in `js/combat.js` (`COMBAT`, frozen); creatures in `js/entities.js`; pre-rendered sprites in `js/sprites.js`; every color in `js/palette.js`. Integration constraints:

- The dungeon is a **separate game mode**, not chunks: `game.mode = 'overworld' | 'dungeon'` plus transition states. New logic lives in new files (`js/dungeon.js` for rooms/doors/mode, plus sprite additions in `js/sprites.js`). Do NOT modify overworld world-generation, chunk baking, creature AI, or the swing state machine.
- The ONLY permitted edits to existing logic files, each a one-line seam: (1) movement/knockback solidity routes through a swappable `game.solidAt(x,y)` (overworld: the existing `isSolidAt`; dungeon: room-tile lookup); (2) the swing hit-loop tests `e.hittable` instead of a hardcoded kind list (set `hittable = true` on ogre/slime/watcher at spawn); (3) player heal/HUD read `p.maxHp` (init `COMBAT.MAX_HP`) instead of the constant, so heart containers can raise it; (4) `update()`/`render()` branch to the dungeon path when `game.mode !== 'overworld'`; (5) input gains one item button. Regression: with the dungeon never entered, the overworld must play byte-identically.
- Every new tunable lives in ONE frozen `DUNGEON` constants block in `js/dungeon.js`. Zero magic numbers in logic. New colors only in `PALETTE.dungeon`.
- The dungeon is **hand-authored, same for every seed** (research consensus: Zelda value is authored, placed content — never procgen rooms). Room layouts are ASCII string maps, 15×11 chars, one char per tile: `#` wall, `.` floor, `T` torch-wall, `P` pot, `B` push block, `s` floor switch, `k` small-key spawn, `C` chest, `c` cracked wall, `~` void/pit rim decor, letters for enemy spawns (`o` pebblit, `m` gloomwing, `x` snapper), `@` player-entry fallback. Doors are declared per-room (side + type), not in the ASCII.

**Tone rule:** the dungeon is *The Hollow Stump* — the inside of a colossal ancient tree stump, drawn in the storybook ink treatment on dusk-darkened parchment. Cozy-spooky, never horror: torchlight, root-woven walls, sleepy moths. No blood, no bones of anything recent, no pure black — the darkest value is warm `PALETTE.dungeon.dark`. Defeat anywhere in the dungeon = the usual soft cream fade, wake at the dungeon entrance room with full hearts and everything kept.

### Architecture (pass 1 — the shell)

- **Rooms:** 15×11 tiles of the existing `TILE` (40 px) = 600×440 px, on a small room grid (max 5×4). Camera is **room-locked**: room centered in the viewport; if the viewport is smaller than the room (phones), clamp-follow the player within room bounds. Solid = wall chars + shut doors + blocks + pots.
- **Screen-slide transition** (the genre's load-bearing camera move): walking through an open door freezes all entities, then slides the camera from old room to new over **480 ms, quadratic ease-out**, drawing BOTH rooms translated during the slide; the player auto-walks **1.2 tiles** through the doorway across the slide, then control returns. New room's enemies spawn at slide end. Never mid-slide input, never a visible seam.
- **Doors**, one object type, center of each wall side: `open` (archway), `locked` (padlock leaf, consumes a small key: lock shakes 400 ms, then leaf slides into the wall over 250 ms ease-out), `boss` (big ornate leaf, needs the boss key), `shutter` (slams shut 150 ms after you enter a combat room, reopens on clear), `cracked` (item-gated). Doors are the single mutation point: `setOpen(reason)`.
- **Enter/exit the dungeon:** a Great Stump landmark placed deterministically in the forest ≥30 tiles from spawn (searched outward from spawn along the forest direction at bake time; drawn like a 3×3-tile scalloped stump with a dark doorway and two torch sconces; shown on the minimap like letters are). Walking into the doorway: 350 ms fade to `dungeon.dark`, swap mode, 350 ms fade in. Exiting likewise. Dungeon state (opened doors, taken chests/keys, boss defeated) persists in `game.dungeonState` for the whole session.
- **Dungeon HUD:** existing hearts + trinkets stay; add small-key count (little gold keys), boss-key icon when held, blossom-bomb count, and a **room map** replacing the minimap: visited rooms as parchment cells on the room grid, current room highlighted, pulsing dot at the entrance.
- **Dungeon art bible (C):** forest ink rules apply (wobbly outlines, pre-rendered wobble variants, blob shadows) on darker ground. `PALETTE.dungeon`: floor `#C7A76F`, floor speckle `#B08F5A`, wall bark `#6B4E33`, wall rim light `#8A6642`, dark (vignette/doorways/pits) `#2E2118`, torch flame `#E8A13C`, torch glow `#F2C063`, key gold `#E3B341`, iron fittings `#7B6B57`, moth lavender `#9B8AA6`, snapper rust `#8C3B2E`. Reuse forest ink/cream/wood and desert blossom pink. Wall tiles: bark base + 2 px lighter top rim + darker bottom rim (the classic fake-depth strip), plus occasional root squiggles. Torches: pre-baked glow sprites (2–3 variants) pulsing alpha/scale at seeded phases — **no per-frame gradients**; a room-wide warm-dark vignette (baked once per room size) with soft light holes at torches sells the underground without ever going black.

### The Hollow Stump — 12 rooms (pass 1 layout, passes 2–3 fill it)

Deepwood-template graph, deliberately "short and fat" (Boss Keys finding: branching + one loop beats a corridor). Rooms on a 5×4 grid, entrance at bottom-center:

| id | room | grammar role |
|---|---|---|
| R1 | Entrance hall — torches, sign, safe | sets tone; respawn point |
| R2 | Hub — four doors, cracked wall visible (the lock shown before its key), pots | branch point |
| R3 | Combat room (E of hub) — 3 pebblits + shutter doors | **small key 1** drops on clear |
| R4 | Puzzle room (W of hub) — push block onto floor switch | **small key 2** in a chest that thunks open |
| R5 | Locked door N of hub → moth gallery — gloomwings + pots | breather combat |
| R6 | Snapper corridor — 2 snapper traps, safe lane readable | the "respect me" hazard room |
| R7 | Item room — big chest ceremony: **Blossom Bombs** | the dungeon's gift |
| R8 | Bomb-teaching room — cracked wall exit, pots of spare blooms | use the item 10 s after getting it |
| R9 | One-way ledge room — drop back down toward the hub | the loop; re-entry shortcut |
| R10 | Locked door E wing → switch maze — 2 switches, 1 needs a block, gloomwing pressure | second key spent here |
| R11 | Boss-key room — behind the hub's cracked wall (bombs!) — **boss key** chest, snappers guard | item recontextualizes R2 |
| R12 | Boss door (top-center) → arena: **the Great Gulper** | the exam |

Key economy: 2 small keys / 2 locked doors, exact (Zelda 1's honest ratio); the first key's door is adjacent to where the key drops. Compass-style kindness: chests sparkle faintly when the room is entered.

### Interactables (pass 2 — exact numbers)

- **Pots:** solid, 1 staff hit smashes: 5 shard particles + puff, drop roll 30% heart / 40% trinket / 30% nothing (seeded per pot). Respawn only when the dungeon is re-entered.
- **Push blocks:** grid-snapped, solid always. Sustained push (player walking into it) for **0.4 s** starts a one-tile tween, **180 ms ease-out-quad**; destination must be floor and empty; each block moves **once** (Zelda 1 rule) unless the room spec says re-pushable. A moving/settled block presses switches.
- **Floor switches:** pressed while player, block, or pot sits on the tile; a block latches it permanently (soft *chunk*, switch darkens). Doors wired to switches use the same `setOpen` path. Multi-switch rooms open when ALL are latched/pressed.
- **Chests:** closed sprite → open on interact: 300 ms lid pop with `Back.easeOut`, item rises 20 px over 400 ms with sparkle burst, dialogue line, THEN the item joins inventory (the little ceremony is non-negotiable — it is the reward's frame).
- **Small keys:** float + bob over their spawn; collected on touch with the pickup pop; spent keys vanish from the HUD with a 200 ms shrink.

### Dungeon enemies (pass 3 — numbers table; all use the existing hit-feedback stack via `hittable`)

Telegraph band from the TMC decomp: every attack is preceded by **0.4–1.0 s of readable pause**. All contact damage uses existing `damagePlayer`.

| enemy | HP | speed | behavior loop | damage |
|---|---|---|---|---|
| **Pebblit** (round pebble critter, stubby legs, sleepy eyes) | 2 | 55 px/s | walk 0.5–1.5 s in a cardinal dir → pause 0.4–1.0 s → 1-in-3: crouch telegraph 0.5 s, spit a pebble (150 px/s, straight, breaks on walls) | pebble ½ heart, contact ½ heart |
| **Gloomwing** (dusty lavender moth, huge wings, ignores walls but not room bounds) | 1 | ease 0→90→0 px/s | rest 1.0–2.0 s (wings fold) → flutter to a point near the player with ±6 px 7 Hz sine wobble → rest | contact ½ heart |
| **Snapper** (rust-red spiky seed pod; **unkillable hazard** — staff bonks it back 1 tile with a *tink*) | — | dash 260 px/s, retract 70 px/s | idle until player aligns within 14 px of its row/col with clear line → dash to the player's axis point or wall → retract home | contact 1 heart |

Combat rooms: shutters slam 150 ms after entry, reopen + key/chest drops with a chime when the last hittable enemy poofs. Defeated dungeon enemies stay dead until the dungeon is re-entered (boss stays dead forever).

### The item — Blossom Bombs (pass 4)

A pouch of desert-cactus blossoms that bloom into a petal-burst — the item that ties the two biomes together.

- Input: **K / Shift** (touch: a blossom button above the attack zone). Throws 100 px (2.5 tiles) forward with a small arc; fuse **1.2 s**, blink cadence doubling over the last 0.4 s; blast radius **70 px**: enemies take 2 damage + standard knockback/feedback, the player takes ½ heart if inside (gentle, but teaches spacing), **cracked walls/boulders within the radius crumble** (300 ms, 12 rubble particles + puff, permanently open). Petal burst: 16 pink particles + expanding ring + 0.15 s / 0.012 shake.
- Supply: capacity **3**, one regrows every **8 s** (never softlocked, still rationed mid-fight); pots in bomb-rooms drop spare blooms (instant +1).
- **≥3 uses rule** (research: an item with fewer than 3 uses gets cut): (1) dungeon progression — R8 exit + the hub's cracked wall to the boss key; (2) the boss exam; (3) overworld — **3 cracked boulders** placed deterministically near desire-line landmarks (visible from day one; each hides a trinket hoard or a heart piece), so the item re-opens the whole map.

### The boss — the Great Gulper (pass 5)

A huge round storybook toad-grub squatting in the arena, slime-green with a cream belly; invulnerable to the staff (bonks *tink* off its hide). Classic 3-cycle vulnerability loop (design in cycles, not HP):

- **Pattern phase (~15 s):** 3 hop-slams (shadow telegraph where it lands, existing slam rings, 1 heart in zone) + a 3-glob spit volley (globs 140 px/s, ½ heart).
- **The opening:** cheeks puff for **0.8 s** (telegraph sparkle), then it **inhales for 2.5 s**, dragging the player toward its mouth at 90 px/s. Throwing a Blossom Bomb into the inhale: gulp → muffled *pomf* → petal burst from its ears → **stunned 3.0 s** (stars, tongue out) — the only window it is `hittable`. It takes 3 staff hits per window (9 total; the combo finisher counts double, rewarding clean play).
- **Escalation:** cycle 2 = 4 slams, ×1.2 speed; cycle 3 = 4 slams + 5-glob volley, ×1.4. Missing the window just restarts the pattern.
- Arena: boss door slams behind you; defeat = 2 s escalating leaf-poof finale (no corpse — it burps, shrinks, and hops off sheepishly), doors open, drops a **Heart Container** (+1 max heart via `p.maxHp`, full heal, held-overhead pop) and frees **M.** — a small spectacled mole with an ink-stained satchel, the letter-writer, who walks you out with a thank-you dialogue. Losing = soft fade to R1 with everything kept; the boss resets to cycle 1.
- **Ending:** after M is freed, a hand-lettered **"The End — the worlds keep wandering"** card (same treatment as the title) with letters-found and trinket tallies, then play continues free-roam. Finding all 5 letters BEFORE the boss adds one grateful extra line from M.

**A landed anything must keep firing the existing simultaneous feedback stack** (hitstop, flash, knockback, squash, particles — acceptance criteria, not polish); new events that must fire together: door-open = leaf slide + dust puff + soft *chunk*; switch-latch = darken + *chunk* + door reaction ≤1 frame later; bomb = blink→burst→crumble→shake as one beat.

### Regression checklist (after every pass)

60 fps in dungeon rooms with torches + enemies active; zero console errors; same seed ⇒ identical overworld AND identical stump/boulder placement; overworld play (movement, combat, letters, camps, minimap) unchanged when the dungeon is untouched; slide transitions never desync player/camera; keys can never go negative or be double-spent; shutter rooms can never softlock (clear condition always reachable); bombs regrow so no puzzle is ever unsolvable; hitstop never freezes `requestAnimationFrame`.

### Build order (one pass per session, verify between)

1. **Shell:** stump landmark + enter/exit fades, room system + ASCII loader, room-locked camera + slide transitions, doors (open/shutter visuals), torches, vignette, room map HUD, all 12 rooms walkable gray-boxed in the dungeon treatment.
2. **Interactables:** keys/locked doors/boss door, pots, push blocks, switches, chests + ceremony.
3. **Enemies:** pebblit, gloomwing, snapper + combat-room shutters and key drops.
4. **Item:** Blossom Bombs, cracked walls in-dungeon, the 3 overworld boulders, teaching room.
5. **Boss & ending:** the Great Gulper, heart container, M., the End card.
