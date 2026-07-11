---
name: researched-feature
description: Research-first feature workflow for this game. Use whenever the user asks for a new feature or a quality upgrade to Two Worlds (e.g. "add fishing", "make the animations better") — FIRST research how specialists design and spec the feature, THEN write it into PROMPT.md as a feature-addition prompt, THEN execute that prompt. Do not skip straight to code.
---

# Researched Feature Workflow

This repo's features are built by a fixed three-step loop: **research → prompt → execute**. `PROMPT.md` is the living spec; `RESEARCH.md` is the evidence trail. Never implement a feature that isn't specced in PROMPT.md first, and never spec it without research.

## Step 1 — Research (parallel web-research agents)

Decompose the request into 2–3 research questions and launch parallel background agents (WebSearch; WebFetch works for GitHub/raw.githubusercontent.com, many blogs 403 at the proxy — agents should compensate with more searches and use result excerpts). The standard decomposition:

1. **Design craft** — how do the best games in this genre do the feature? Name anchor games, extract the mechanics and *the numbers* (durations in ms, distances in px, HP values, easing curves). Reviews of games that got it wrong are as valuable as ones that got it right.
2. **Implementation patterns** — how is it built procedurally in JS/canvas (this game has no assets, no frameworks, everything drawn in code)? Look for named algorithms and concrete recipes.
3. **Prompt-spec craft** (only if the feature type is new — combat/feel specs are already researched in RESEARCH.md §5) — how do specialists write AI prompts for this feature class so the result is polished?

Require each agent to return: concrete numbers, named anchor references, implementation recipes, and sources.

## Step 2 — Write the prompt (append to PROMPT.md)

Synthesize the research into a new section of `PROMPT.md`, following the house format for feature additions:

- **Map of what exists**: name the files/functions the feature touches, and hard *don't-touch* constraints ("do NOT modify movement/worldgen; integrate as new states").
- **Tone rule**: everything must fit the picture-book art bibles (no blood, no pure black/white, palette-locked colors, flat-vector desert / wobbly-ink forest treatments both covered).
- **Spec with numbers**: exact ms/px/degree values in tables or dense bullets — never adjectives. All tunables demanded into one frozen constants block.
- **Simultaneity acceptance criteria**: effects that must fire together are listed as requirements, not polish.
- **Regression checklist**: 60 fps, zero console errors, seed-determinism, prior features unchanged.

Also append a short addendum to `RESEARCH.md` (findings + sources).

## Step 3 — Execute the prompt

Implement exactly what the new PROMPT.md section says, one mechanic per pass. Then verify headlessly before claiming done:

- Playwright + chromium at `/opt/pw-browsers/chromium` (see `scratchpad` test scripts from prior sessions: load `index.html?seed=twoworlds` via `file://`, drive via `window.__game`, `queueAttack`, teleports).
- Screenshot the feature in action **in both biomes** and squint-test against the reference images.
- Assert behavior programmatically (state changes, counters, HP) — not just screenshots.
- Run the regression suite: fps while active, console errors, letter collection, same-seed world identity.

Fix what fails, re-verify, then commit and push to the designated branch with a descriptive message.
