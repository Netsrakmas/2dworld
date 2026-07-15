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

## 9. Zelda-structure addendum (researched 2026-07-14 for the Zelda update)

**Dungeon design** (Boss Keys/GMTK, Zelda 1 Level 1, TMC Deepwood Shrine via the zeldaret/tmc decompilation's room enum): a GBA-era dungeon ≈ 20 rooms / 4 small keys / 1 miniboss / 1 item / 1 boss; Zelda 1 Level 1 sets the honest key economy (6 keys / 6 doors); the Deepwood grammar is entrance → puzzle-key + combat-key branches → miniboss → **item** → item-gated puzzles → boss key behind the dungeon's signature contraption → boss. Mark Brown's core finding: "short fat" branching graphs with a loop and backtracking-with-new-item beat "tall skinny" corridors; three archetypes (lock-and-key, puzzle box, gauntlet). Spec-scale template: 12–18 rooms, 2 small keys + boss key + item, one one-way ledge forming a loop, first locked door adjacent to its key.

**Combat numbers** (zeldaret/tmc decomp `enemy.c`/`collision.c`, walkingeyerobot alttp-disassembly): TMC enemy HP — Octorok/Keese 2, ChuChu/Stalfos 4, Moblin 8, Darknut 12 vs base sword damage 4 (fodder 1 hit / mid 2 / elite 3); enemy i-frames 16 f (~267 ms), player i-frames 0x3A = 58 f (LttP) with 2-frame blink; knockback ≈ 12 f at 1.5–2.5 px/f ≈ 1–2 tiles, both parties; every enemy attack preceded by 0.4–1.3 s readable pause (Octorok pause = `(rand&0x38)+24` frames, 30-frame freeze telegraph before shooting). Bosses: the dungeon item is the exam (Armos = 3 arrows vs 16 sword hits); canonical loop = invulnerable pattern → item-created window ~2–4 s → 1–3 sword hits → escalate, ×3–4 cycles ≈ 60–90 s; reward = heart container.

**Rooms & camera**: 16 px tiles everywhere; Z1 16×11 tiles/room, TMC viewport 15×10, LttP 512 px supertiles with clamp-follow inside; room-locked camera + slide is load-bearing (rooms become discrete puzzle units; "kill all enemies"/switch state scoped per room). NES slide = 4 px/frame drawing both rooms translated, entities frozen, Link nudged through the door, snap on completion (ZeldaJS `MainGameState`, gridbugs.org); modern spec ≈ 480–600 ms ease-out.

**Implementation patterns** (bobbylight/ZeldaJS, Jupi007/TLOZ-js, tcoxon/metazelda, Eloquent JS ch.16): rooms as ASCII string maps where a char is either a tile id or an actor spawn (replaced by floor); door taxonomy open/locked/shutter/boss/bombable with one `setOpen(reason)` mutation point; per-room spawn specs instantiated on enter, `cleared` flag drives shutters; enemy FSMs = Moving/ChangeDirection/Attack + orthogonal knockback/i-frame timers, direction changes only when grid-aligned; blade trap = idle→dash-on-axis-alignment→slow retract (dash ~4 px/f, retract ~1 px/f); interiors are a separate world/mode behind a fade, sharing a `solidAt(x,y)` interface with the chunk overworld — never embedded in the chunk stream. Metazelda lock-key algorithm (spanning tree + key-levels, keys placed in rooms preceding their locks) noted for reference but rejected: research consensus is that authored placement IS the Zelda value (game-wisdom "Zelda-Rogue trap"); dungeon ships hand-authored, identical every seed. Boss = phase-table FSM (`PHASES[{hpAbove, attacks, speed}]`) with arena lock and vulnerability windows; screen shake via trauma model.

**Items** (boristhebrave lock-and-key, howtomakeanrpg): show the lock before the key (cracked walls visible in dungeon 1 pre-bombs become self-directed quests); one mysterious lock type at a time; teaching pattern = item room → safe use next room → combat use → boss use → 2–3 overworld locks reopened; an item with <3 uses gets cut. Bombs = highest value-per-line-of-code (timer + radius; gates walls, doubles as weapon, enables secrets). Minimal complete Zelda: sword minute 1 → dungeon → item → item-gated overworld → boss with item exam → legible MacGuffin framing; heart containers only from bosses.

Key added sources: github.com/zeldaret/tmc (enemy.c, collision.c, playerItemSword.c, octorok.c, roomid.h) · github.com/walkingeyerobot/alttp-disassembly · alttp-wiki.net Movement/EG_Map · zeldaspeedruns.com LADX movement · GMTK Boss Keys (LttP + TMC episodes, Patreon graph explainer) · github.com/bobbylight/ZeldaJS · github.com/Jupi007/TLOZ-js · github.com/tcoxon/metazelda + bytten-studio lock-key writeup · shaggydev.com lock-key generation · boristhebrave.com lock-and-key dungeons + Unexplored cyclic generation · eloquentjavascript.net ch.16 · gridbugs.org Zelda screen transitions · redcandle.us Z1 technical info · zeldadungeon.net (Z1 Level 1, drop rates, Deepwood walkthrough) · strategywiki LttP/TMC bosses · howtomakeanrpg.com zelda-lock-and-key · gameprogrammingpatterns.com/state · game-wisdom.com zelda-rogue · blog.cloakedgames.com zelda-like design.


## 10. Character-sprite addendum (researched 2026-07-14 for the character glow-up)

**Walk cycles at ~50px** (Slynyrd Pixelblogs 22/50/52/55): 4-frame = contact+pass per leg; bob pattern down-1/down-1/up-2 px on a 32px body (3-6% of height) with FAST rise at the leg-pass and slow sink — a pure sine reads robotic; hold the contact (extremity) frames ~2x longer than in-betweens (Pixelblog 52 times 100ms holds vs 50ms transitions); 8-12 fps; design side view, mirror for the off side, change only the informative pixels between facings (down = face, up = featureless hood back, side = profile beak + one arm + lead foot). Head = 1/3 to 1/2 of total sprite height (chibi 2-heads sweet spot).

**Secondary motion**: cloth = traveling wave with amplitude scaling by distance from the anchor (hem ~5-10% of cloth length, ~2 Hz idle, 4-6 Hz + bigger moving; >8 Hz = jelly), or a Celeste-style 4-6 node follow chain (2-4px max per node); cape/hood-tip trails 100-200ms behind the body and overshoots 1-2 frames on stop. Idle breathing: scaleY 1.02-1.03, 3-4s period, feet-pivoted, X counter-scaled. Tunic/Death's Door lesson: one bouncing accent appendage beats more anatomy.

**Shading & accent**: one top light for every facing/frame; 2-3 flat tones — shade inside the hood opening, under the rim, lower third of the cloak; never rim the outline (pillow shading). Character palette 60/30/10 with ONE saturated warm accent unused by terrain (HLD cloak, Link green); value beats hue — keep the cloak a clear value step off the terrain band; Dead Cells ladder: actors get the highest saturation/brightness.

Key added sources: slynyrd.com Pixelblogs 6/17/22/25/50/52/55 · Clip Studio chibi-ratio articles · 80 Level shape language · Godot 2D flag shader + racer.nl flag · Celeste hair example (shapedbyrainstudios) · Pikuma Verlet cloth · Pixune follow-through · Palos procedural breathing · GameMaker Juicing Your Movements · CharacterHub 60/30/10 · Dead Cells art deep dive · Tunic + Death's Door + HLD interviews.


## 11. NPC addendum (researched 2026-07-14 for the NPC update)

**Casts** (Link's Awakening ~10-12 Mabe villagers, A Short Hike, Cozy Grove, Death's Door): 6-12 NPCs is plenty; each = name + one quirk + one function (comic relief counts); the failure mode is shared silhouettes/functions (Death's Door's undifferentiated crows). State-aware lines: 2-3 idle variants x ~3 story phases (~6-9 lines/NPC); every NPC acknowledging a finished quest beat is the highest-leverage aliveness trick. **Dialog UX**: 2-3 lines x 35-45 chars (~70-120/page); typewriter 30-50 cps if used (never slower than auto-dismiss allows; at 7s the ceiling is ~140 chars); press 1 = reveal, press 2 = advance, blinking arrow for more pages; bottom box + tinted speaker name approximates bubbles' attribution. Notice-juice ladder: face player -> !/… emote -> idle fidgets. **Shops**: Zelda 1 = exactly 3 items, walk-into-to-buy; ladder = consumable 2-6x common drop, mid ~1 session of saving, aspirational 3-5x mid (Blue Ring 250, LA Bow 980 after Shovel 200 — rotating reveal); first purchase affordable in 5-10 min; sell heart/capacity/hints/cosmetics. **Hints**: Ulrira = state-aware free hints as a personality quirk; ALttP fortune teller = 10-30 rupees + a free heal so it never feels wasted; two tiers (vague free rumor / paid precise); landmark-relative directions only (BotW triangle rule).

Key added sources: zeldadungeon.net LA character analysis + Town Tool Shop · MCV + GoNintendo adamgryu interviews · vghpe dialogue comparison · Xbox Wire Death's Door cast · cozygrove wiki · Pixel Crushers barks · zladx dialog disassembly · GameFAQs Zelda 1 shop index · zelda.fandom Fortune-Teller/Ulrira · Kotaku BotW triangles · epiloguegaming rupee-economy essay.

## Key sources

levels.io / @levelsio fly.pieter.com thread · github.com/EnzeD/vibe-coding · github.com/cpjet64/vibecoding prompt-engineering guide · github.com/PlayableIntelligence/game-creator · github.com/majidmanzarpour/threejs-game-skills · XDA-Developers "vibe coded a game with Claude Code" · harrynesbitt.com (Making of Alto's Adventure) · finji.co/games/overland · mexer.pigsell.com (Max Fiedler) · roughjs.com + shihn.ca/posts/2020/roughjs-algorithms · redblobgames.com/maps/terrain-from-noise · MDN Tilemaps & globalCompositeOperation · tympanus.net Codrops feTurbulence guide · camillovisini.com hand-drawn SVG motion · wertn.com Sylvain Tegroeg interview · valdemird.com game-feel-on-the-web · gamejuice.co.uk · designmodo.com long-shadows · mlpds.art hue-shifting guide · 2dwillneverdie.com sprite colors


---

## §12 addendum — procedural WebAudio (the sound update)

Sources: MDN Advanced Techniques, web.dev "A tale of two clocks", noisehack (Paul Kellet pink filter), IRCAM/gskinner feedback-delay reverb recipes, Chrome autoplay policy, Bainter generative.fm writeups, padenot web-audio-perf, ZzFX param model.

- **Fire-and-forget voices:** osc/buffer → gain envelope → lowpass → bus; `stop()` scheduled ⇒ nodes GC themselves. Never ramp gain to true 0 (breaks exponential); floor at 0.0001. Attack ≥3 ms kills clicks.
- **Noise:** build 2 s white + pink buffers ONCE; every shot is a new `AudioBufferSourceNode` over the shared buffer (sources are one-shot, buffers are not). Pink = organic (steps, poofs, booms, wind); white = airy (whoosh, ching, fuse).
- **Reverb without files:** feedback delay loop (delay 0.25-0.35 s, feedback 0.3-0.4, lowpass 1800-2500 INSIDE the loop so echoes darken); two parallel taps at a non-integer ratio (0.27/0.41) kill flutter. Wet 0.15-0.25.
- **Mix:** master 0.8, sfx 0.9, music 0.30 (≈ −10 dB under SFX); compressor −18/25/6/3ms/250ms absorbs pile-ups; per-name retrigger throttle + ±10% gain jitter prevents phase-stacked doubling; ~16-24 voice cap is mobile-safe.
- **Autoplay:** create the context on first trusted gesture (pointerdown/keydown/touchend) and `resume()`; re-resume on visibilitychange. Creating it at page load logs a console warning — lazy creation avoids even that.
- **Generative ambient:** per-voice independent timers (Music-for-Airports model), 2-8 s melody / 12-25 s drone / 9-20 s sparkle; C-major pentatonic = the storybook default, C-minor pentatonic shares the root for dungeon crossfades; detune ±6 cents = free chorus (>15 = seasick); ducking down τ50 ms, up τ300 ms; rAF-driven scheduling is fine at these timescales and pauses with the tab.
