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

## 6. Swing-animation addendum (researched 2026-07-11 for the animation update)

**Attack animation structure** (Slynyrd Pixelblog 9/56, GDKeys, GDQuest "Juicy Attack"): anticipation → strike → follow-through → recovery with asymmetric timing — ~1 frame of anticipation (Hollow Knight ships exactly that), the entire strike arc crossed in 2–4 frames (~60–80 ms), then a ~100 ms hold at full extension and an interruptible recovery. Strong extreme poses over in-betweens. **Smear frames** (stretch, afterimage multiples, or crescent wedges) go only on the fastest strike frames — on anticipation/follow-through they read as noise.

**Separate-weapon-layer technique** (GDQuest, KidsCanCode, Godot/Unity tutorials): weapon sprite rotates around a hand/shoulder pivot; base rotation aims at facing so one swing animation serves all directions; sweeps of 90–180° for slashes, 360° for spins; easing is the key finding — **strike eases OUT hard** (quart/circ: instant max speed through contact, deceleration doubles as follow-through), anticipation eases in, never linear. Stretch the weapon tangentially ∝ angular velocity for a free smear.

**3-hit combo choreography** (Hades slash-slash-thrust, Wind Waker horizontal/backhand/spin, Dead Cells alternation): alternate sweep direction per hit so chains read as one continuous motion; escalate arc and trail size per hit; the finisher gets the long wind-up, the biggest smear, hitstop, and a non-cancellable recovery. Chain windows ~150–400 ms after the strike via input buffering.

**Canvas recipes**: pivot = translate/rotate; crescent = two-arc tapered wedge filled in stepped-alpha strips (thick at the leading edge, thin at the tail, trail always *behind* the weapon); afterimages = redraw the weapon at recent angles, oldest faintest (Kirupa motion-trail pattern).

Key added sources: slynyrd.com Pixelblog 9 & 56 · gdquest.com juicy_attack · gdkeys.com anatomy-of-an-attack · Wikipedia/Bloop Animation smear frames · kidscancode.org melee recipes · febucci.com easing · kirupa.com motion trails · Hades/Wind Waker combo wikis.

## 7. Graphics-polish addendum (researched 2026-07-12)

**Art direction — good→great for flat-vector & storybook scenes** (Level Design Book, concept-art BMS literature, anchor-game interviews): the top amateur tells are uniform scatter, same-size props, no focal landmark, and everything equally detailed. Fixes: one hero landmark per screen (biggest silhouette + the only bright accent + framing negative space); big-medium-small scale buckets (70/25/5); rule-of-odds clusters with true voids (~70% of the scene quiet, detail concentrated in ~30%); narrow ground value band with contrast reserved for focal points; saturation discipline (1–2 loud accents max); a map-scale ambient gradient wash to kill digital flatness. Named devices: Alto's blended color schemes + silhouette layers; Hidden Folks' narrative clutter ("alive clutter" that implies micro-stories); Cozy Grove's color-as-light vignette; Overland's diorama framing.

**Canvas-2D atmosphere** (MDN/web.dev perf docs, Clockwork Chilli cloud-shadow article, GameDev.net wind threads, Cyanilux god-ray breakdown): bake every soft element once, runtime = drawImage only (runtime `ctx.filter` blur and `shadowBlur` are documented fps killers); blend modes are universally supported and GPU-cheap for a few large quads but hostile in particle loops — batch by mode, ≤10 non-source-over full-screen draws. Ranked bang-for-buck: (1) drifting cloud shadows / sun patches (one baked tileable blob texture, ~4 draws), (2) traveling gust waves via `sin(t·ω + dot(windDir, worldPos)/λ)` with a shared `windAt()` so sway/particles/clouds form one weather system, (3) biome-tinted vignette + overlay grade wash, (4) bake-time low-frequency chunk tinting (zero runtime cost), (5) water glints/foam/ripples on an overlay pass, (6) baked god-ray sprites stamped in world space, (7) foreground parallax silhouettes (scroll factor 1.15–1.4, edges only), (8) desert shimmer bands + particle-column dust devils (real heat-haze refraction is shader-only — don't attempt).

**Placement aesthetics** (Horizon Zero Dawn GDC placement talk, Thomas cluster process, Don't Starve set pieces, Valheim POI model, weenie taxonomy): three-layer hybrid — per-family low-frequency density noise (wavelength 40–80 tiles, remapped so 30–40% of the map is prop-free) → parent–child clusters (3/5 children, gaussian σ≈2–3 tiles, child scale falls with distance, mixed families) → min spacing 2–4 tiles for large props only. Landmarks: per-region tables with rarity tiers and exclusion radii (Don't Starve ships ~5 narrative set pieces per world — arrangement implying a story is the cheapest art direction); "weenies" = tall unique silhouettes + accent color + particle tells that pull players across dull space. Desire paths: near-MST + one loop between POIs, midpoint-displaced, stamped into the terrain bake as trodden strips with suppressed-then-redressed edges. Variants: ≥3 per repeated prop, scale 0.85–1.3× skewed to 1.0, hue jitter ≤±8°, partly driven by the density noise so patches trend together.

Key added sources: book.leveldesignbook.com (composition, wayfinding, env-art) · ArtStation BMS theory · Harry Nesbitt / Team Alto IGF interviews · wertn.com + Edge Hidden Folks making-of · gamerant.com Cozy Grove art interview · guerrilla-games.com HZD procedural placement · hpaulkeeler.com Thomas cluster process · dontstarve.wiki.gg set pieces · valheim POI model · Game Developer weenie taxonomy · clockworkchilli.com scrolling cloud shadows · GameDev.net swaying-grass formula threads · slynyrd.com Pixelblog 43 (water marks) · cyanilux.com god rays · MDN canvas optimization · web.dev canvas performance · redblobgames.com noise articles.

## 8. Character-asset addendum (researched 2026-07-12)

**Generation tools 2025–26**: Scenario is the most complete managed pipeline (custom style/character models from 5–15 refs, spritesheet + video workflows, commercial rights on paid plans only); ComfyUI + Flux.2 multi-reference / SDXL + IP-Adapter + ControlNet OpenPose is the free/local equivalent (Civitai ships 8-direction walk-cycle pose packs); Nano Banana Pro (Gemini 3 Pro Image) is the practitioner favorite for reference-sheet character consistency; PixelLab has the deepest animation features but is pixel-art-native (wrong style here); Retro Diffusion is the "ethically trained" option. Consistency ladder: reference-sheet conditioning (start here, no training) → ControlNet pose control per frame → character LoRA once volume justifies it (15–20 varied images). Style matching: fixed style-anchor paragraph in every prompt + the game's two reference images as style refs + **img2img restyle of the existing procedural characters** (keeps established silhouettes/palette; denoise 0.45–0.65).

**Animation pipelines**: the 2026 convergent workflow for painted styles is image-to-video (Kling/Seedance) from one still per direction → ffmpeg frame extraction → Aseprite cleanup; budget 2–4 generations per keeper and real cleanup (detail drift is the #1 failure). Attacks are the weak spot for video models — author them as 4–6 anticipation/smear/impact stills instead (smears look hand-drawn AND hide inconsistency). Meta's Animated Drawings (MIT, incl. weights) auto-rigs a single drawing and retargets BVH clips, renders transparent GIFs headlessly via Python — great free walk/idle factory, weak for directional combat. Spine ($69+) with AI part-separation (Layer.ai Spine components) gives most control, exports PNG sequences so no runtime needed; DragonBones is effectively dead. Sheet spec consensus: 4 directions (author 3, mirror side), walk 6 frames @ ~10 fps, idle 4 @ ~5, attacks 4–6 @ 12–15, per-frame durations with holds; ~96 px cells for 40 px tiles; pivot at bottom-center feet, identical every frame.

**Integration (no-build, file://)**: `fetch()` of JSON/PNG fails on `file://` and `<img src>` taints canvases — the clean pattern is base64 data-URIs inside plain `.js` asset files loaded by script tag (data URIs are same-origin: no CORS, no tainting); `img.decode()` + `Promise.allSettled`; hot-swap per-character draw slots with procedural fallback and a `?procedural` kill switch. Anti-"pasted-on" fixes: quantize frames to the game palette, strip baked shadows (share the game's blob shadow), match outline weight/color, defringe alpha halos, integer-rounded draws. Perf: sheets ≤4096 px (mobile GPU cap), one pre-baked white-flash sheet per character, 6 characters ≈ 12–24 MB decoded — trivial.

**Licensing/disclosure**: commercial rights generally require paid tiers; US copyright favors human-modified output (another reason for the cleanup pass); Steam (rewritten Jan 2026) and itch.io (since Nov 2024) both require generative-AI disclosure — itch delists undisclosed AI assets.

Key added sources: scenario.com docs/pricing · pixellab.ai docs · retrodiffusion.ai · github.com/facebookresearch/AnimatedDrawings (verified against repo) · esotericsoftware.com Spine licensing · slynyrd.com Pixelblogs 22/55 · aseprite CLI docs · civitai 8-direction pose packs · MDN (CORS file://, decode(), canvas optimization) · sosquishy.io sheet benchmarks · Valve/itch AI-disclosure policy coverage · HN practitioner threads.

## Key sources

levels.io / @levelsio fly.pieter.com thread · github.com/EnzeD/vibe-coding · github.com/cpjet64/vibecoding prompt-engineering guide · github.com/PlayableIntelligence/game-creator · github.com/majidmanzarpour/threejs-game-skills · XDA-Developers "vibe coded a game with Claude Code" · harrynesbitt.com (Making of Alto's Adventure) · finji.co/games/overland · mexer.pigsell.com (Max Fiedler) · roughjs.com + shihn.ca/posts/2020/roughjs-algorithms · redblobgames.com/maps/terrain-from-noise · MDN Tilemaps & globalCompositeOperation · tympanus.net Codrops feTurbulence guide · camillovisini.com hand-drawn SVG motion · wertn.com Sylvain Tegroeg interview · valdemird.com game-feel-on-the-web · gamejuice.co.uk · designmodo.com long-shadows · mlpds.art hue-shifting guide · 2dwillneverdie.com sprite colors
