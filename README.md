# TATE Lab v0.1

Standalone test environment for the TWETE Adaptive Training Engine (TATE).

## Purpose

TATE Lab is deliberately separate from the live TWETE athlete product. It exists to:

- create synthetic athlete scenarios,
- generate and rank workout candidates,
- inspect score components,
- parse natural coach notation,
- classify workout blocks in athlete context,
- apply bounded coach corrections,
- test progression and repetition logic,
- later run regression banks across hundreds or thousands of synthetic athletes.

## Critical architecture rule

**Coach corrections influence bounded scores/preferences. They do not create hard workout prescriptions.**

Global engine rules live in `src/tate-engine/config.js` and can be changed/versioned deliberately.

## Current MVP features

- Athlete scenario editor
- Candidate generator
- 0–100 scoring breakdown
- Threshold progression candidates
- Repetition penalty
- 5K+ Threshold + Speed-maintenance composite candidate
- 800/1500 composite guardrail
- Natural workout parser
- `recovery_between_reps`
- `rest_between_blocks`
- Athlete-context classification
- Local learning state with bounded modifiers
- Resettable lab learning
- Smoke tests

## Example correction syntax

```text
6x1000m in 3:00, 2min rest
+ 5min jog between blocks
+ 5x200m in 36s, 30sec rest
```

TATE stores the first and second work blocks separately, with a distinct inter-block recovery object.

## Run locally

```bash
npm test
npm run serve
```

Then open `http://localhost:8080`.

## Where to change TATE later

- scoring weights → `src/tate-engine/config.js`
- repetition penalty → `src/tate-engine/config.js`
- event composite rules → `src/tate-engine/config.js`
- parser → `src/tate-engine/parser.js`
- classification → `src/tate-engine/classifier.js`
- progression logic → `src/tate-engine/progression.js`
- workout generation → `src/tate-engine/generator.js`
- bounded learning → `src/tate-engine/learning.js`

This structure is intentional so a coach can say, for example, “increase the repeat penalty” or “do not add Threshold inside an 800m Speed session,” and the change can be made in one targeted engine area rather than rewriting the app.
