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
