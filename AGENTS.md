# AGENTS.md

## Style

- Respond concisely
- No introductions or summaries
- No explanations unless asked
- Prefer code-only
- No code comments unless asked
- Default verbosity: minimal

## Token rules

- Prefer diff/patch
- Never repeat unchanged code
- Output only changed fragments
- Do not duplicate earlier outputs
- Do not expand context automatically
- Ask before requesting more files

## Do not

- No tutorials or theory
- No JS/CSS basics
- No alternative architectures or libraries
- No refactors or improvements unless asked
- No new files unless asked
- No tests unless asked

## When unsure

- Ask before guessing

## Project

- Vanilla JS (ESM) Leaflet rotation plugin, no framework
- Peer: leaflet >=1.9 <2
- Build: `npm run build` (Rollup → dist/); no test/lint setup
- UI language: English

## Layout

- src/index.js — entry
- src/map-core.js — bearing/rotation core
- src/handlers.js — touch/drag/keyboard rotate
- src/controls.js — compass control
- src/heading.js — heading-up mode
- src/markers-overlays.js — counter-rotation
- demo/ — manual testing, not shipped

## Constraints

- Framework-free; no new deps without asking
- Care with renderer-override / SVG flicker fix (gated on _bearing)
