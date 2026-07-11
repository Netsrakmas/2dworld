# Research: How to Prompt an AI to Build a Style-Accurate 2D World Explorer

Research conducted 2026-07-11 across practitioner sources (Twitter/X vibe-coding threads, YouTube build-alongs, GitHub prompt-engineering repos, gamedev blogs, graphics-programming references). This document summarizes the findings that shaped `PROMPT.md`.

---

## 1. How specialists structure game-building prompts

**Consensus: structured-iterative, not one-shot.** Every practitioner source lands the same way:

- **Pieter Levels (@levelsio)** built fly.pieter.com from a one-line seed prompt ("make a 3d flying game in browser with skyscrapers") plus ~3 hours of micro-iterations, reverting to the last good version whenever a fix-loop degraded things. Lesson: revert-and-re-ask is a first-class tool; lean into what code-rendered graphics are naturally good at.
- **EnzeD/vibe-coding (Nicolas Zullo)** — the most-cited structured workflow: write a game-design doc + implementation plan of small steps *first*, each step with a validation test, and gate progress: *"Do not start Step 2 until I validate the tests."* Keep an always-read art/architecture memory doc.
- **XDA's "doesn't look vibe-coded" build**: first prompt = dense purely-functional feature list (mechanics gray-box), then ONE big named-aesthetic transform pass ("transform this into a complete, polished, 90s-inspired retro arcade experience"). Naming a coherent era/genre lets the model pull in genre-correct details unprompted.
- **Agent-skill repos (threejs-game-skills, game-creator)** treat polish as *measurable*: thumbnail-readability tests, "zero hardcoded colors in game logic," visual scorecards, and the pipeline rule *"first build authored forms, then materials, then lighting, then effects"* — never fake polish with glow.

**Top rules extracted:**
1. Write the art bible before the first prompt; paste it into every prompt (or CLAUDE.md). The model can't hold your vision; the document does.
2. Anchor style with named references (games, artists, eras), not adjective soup. A screenshot + "match this" beats paragraphs.
3. Lock the palette in code: one frozen `PALETTE` constant, zero inline hex in game logic — consistency by architecture, not hope.
4. Mechanics first, then a named-aesthetic transform pass.
5. Spell out juice with numbers (shake ms/amplitude, particle counts, easing curves), never just "make it juicy."
6. Give acceptance criteria the model can check itself (60 fps target, no console errors, readable at thumbnail size, "could I draw this?" test).
7. Forbid the known failure modes explicitly: default/generic styles, glow-on-primitives, one pretty hero object among placeholders, palette drift, black shadows.

## 2. Style A — the flat-vector desert (image 1)

**What it's called:** flat design / minimalist vector game art / "Kurzgesagt style"; the rocks are "2D low-poly/faceted"; the pond edge is a chunky tile shoreline rendered as flat vector.

**Anchor references:** Alto's Odyssey (art: Harry Nesbitt), Kurzgesagt, Overland (Finji, AD Heather Penn), TinyTouchTales/Max Fiedler (Card Crawl), Monument Valley.

**Visual grammar that makes it read correctly:**
- Flat solid fills only — zero gradients, textures, or outlines; depth from 2–3 layered tones per object.
- Hard palette cap (~13 hexes for the whole scene).
- Hue-shifted shadows, never black/gray: shift hue ~10–20° toward red/purple, drop lightness ~10–15%.
- One global light direction; shadows are offset silhouette *shapes*, not blurs.
- Rounded geometry everywhere; the faceted rocks are the one straight-edge exception.
- Stepped water edge: pond contour snapped to a coarse grid (~5% of viewport), rounded stairstep corners, concentric lighter inner band, sparse dash highlights.
- Ground detail via sparse deterministic speckle scatter, not texture.

**Implementation:** `roundRect`/`Path2D` primitives; shadow = same path drawn first, offset, in the shadow hue; painter's-algorithm layering; seeded PRNG scatter.

## 3. Style B — the hand-drawn storybook forest (image 2)

**What it's called:** storybook / children's picture-book illustration style; "hand-drawn ink-and-watercolor game art"; wobbly linework = "line boil"; the academic term is "sketchy rendering" (the RoughJS paper).

**Anchor references:** Wildfrost, Cozy Grove, Hidden Folks (illustrator Sylvain Tegroeg), Wanderhome, Tiny Epic box art.

**Visual grammar:**
- Wobbly, weight-varying ink outlines in warm dark sepia (#3d2c1e-ish), never pure black; lines may overshoot or fail to close — imperfection is the point.
- Muted desaturated warm palette on a parchment base; olive/forest greens, ochres, murky accent hues; no pure white or black.
- Paper grain multiply-blended over the whole frame; watercolor fills slightly darker at edges; hachure hatching instead of gradients.
- Round chunky blobby shapes: scalloped cloud trees, big-headed short-limbed characters with dot-and-line faces.
- Soft flat blob shadows (single translucent warm-brown ellipse), never directional realism.
- "Alive clutter": pebbles, grass tufts, leaves + tiny idle loop animations (the Hidden Folks lesson).

**Implementation:** RoughJS-style jittered-bezier double-stroke (or rough.js itself, <9 kB); **seeded** per-object jitter so lines don't boil every frame (precompute 2–3 wobble variants, cycle at ~120 ms for deliberate line boil); paper grain from a pre-generated noise tile multiply-composited at ~0.05–0.12 alpha; pre-render all wobbly assets to offscreen canvases at load, never re-jitter per frame.

## 4. Explorer-game architecture worth demanding

- Tile/chunk world; logic grid separate from visual layer (MDN tilemap pattern).
- Seeded deterministic procgen (`?seed=` in URL); elevation + moisture dual-noise biome lookup (Red Blob Games recipe), elevation raised to an exponent for flat lowlands.
- Chunk-based lazy generation around the player, cached to offscreen canvases, evicted when far; visible-tile culling.
- Delta-time WASD movement with normalized diagonals; axis-separated AABB collision (slide along walls); lerped camera with integer-rounded final offsets.
- Proximity-prompt interactables; ambient detail layer (sway phases, particles); day/night multiply-tint with radial light holes.
- Minimap = 1px-per-tile cached offscreen canvas; virtual joystick on touch devices.
- Fixed-timestep update + interpolated `requestAnimationFrame` render; no per-frame allocation.

## 5. Combat addendum (researched 2026-07-11 for the combat update)

**Design consensus for cozy top-down melee** (Zelda-likes, Moonlighter, Garden Story, Turnip Boy, Death's Door): wide forgiving swing arcs beat thrusts (Turnip Boy's thrust was widely criticized); attacks are 3-phase state machines (windup/active/recovery) with the hitbox bound to the state machine, never the sprite; no stamina (Garden Story's most-criticized mechanic); combat should be skippable; enemy telegraphs long (400–600 ms), player windups short (~70 ms). Cozy dressing: white flash + squash + poof-into-leaves, dazed stars instead of death, non-punitive respawn keeping all progress (Garden Story / Cozy Grove ethos).

**Game-feel numbers** (GDC "Juice It or Lose It", SFV/Smash hitstop data, Eiserloh trauma-shake talk, agent-skill repos): hitstop 50–80 ms light / 120–160 ms kill, freezing simulation but never the render loop; knockback ~300 px/s decaying ×0.85/frame; i-frames 800–1000 ms with flicker; enemy flash 80–100 ms via pre-rendered white silhouette; squash 1.25/0.75 over 120 ms; input buffer 100–130 ms ("honor the intent, not the signal" — Maddy Thorson); shake = camera-only, kills only.

**Prompt-spec craft for feature additions** (game-creator add-feature skill, triz-gamedev brief template, vibe-coding guides): open with a map of existing files and forbid rewrites ("do NOT modify movement; integrate as new states"); all tunables in one constants block; feedback written as *simultaneous acceptance criteria with numbers* (AI treats juice as optional polish otherwise); explicit hit-dedup spec (once per activation per enemy — else per-frame damage melts enemies); regression checklist attached to the prompt; one mechanic per pass.

Key added sources: Zeldix ALttP sword data · Moonlighter wiki (3-hit combo, 2× finisher) · shoryuken.com SFV hitstop · SmashWiki hitlag · Eiserloh GDC 2016 trauma shake · maddythorson.medium.com Celeste forgiveness · gdkeys.com anatomy of an attack · pavcreations.com melee AI FSM · PlayableIntelligence/game-creator add-feature + game-designer skills · gamedev-skills game-feel SKILL.md · yfwangning/triz-guided-ai-gamedev-skill · Garden Story / Turnip Boy reviews.

## Key sources

levels.io / @levelsio fly.pieter.com thread · github.com/EnzeD/vibe-coding · github.com/cpjet64/vibecoding prompt-engineering guide · github.com/PlayableIntelligence/game-creator · github.com/majidmanzarpour/threejs-game-skills · XDA-Developers "vibe coded a game with Claude Code" · harrynesbitt.com (Making of Alto's Adventure) · finji.co/games/overland · mexer.pigsell.com (Max Fiedler) · roughjs.com + shihn.ca/posts/2020/roughjs-algorithms · redblobgames.com/maps/terrain-from-noise · MDN Tilemaps & globalCompositeOperation · tympanus.net Codrops feTurbulence guide · camillovisini.com hand-drawn SVG motion · wertn.com Sylvain Tegroeg interview · valdemird.com game-feel-on-the-web · gamejuice.co.uk · designmodo.com long-shadows · mlpds.art hue-shifting guide · 2dwillneverdie.com sprite colors
