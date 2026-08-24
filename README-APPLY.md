# TATE Lab — Database Slot Planner v0.2.0

This replacement set converts the lab UI to a database-first planner.

## Replace/add these files in `hammer1david/tate-lab`

Replace:
- `index.html`
- `styles.css`
- `src/main.js`
- `package.json`

Add:
- `src/tate-engine/database-library.js`
- `src/tate-engine/slot-planner.js`
- `tests/run-slot-planner-tests.mjs`

Reference only (the SQL is already applied to the live Supabase project):
- `SUPABASE_READ_ACCESS.sql`

## Runtime architecture

1. Workout Library loads only active 10K workout definitions from Supabase.
2. Goal Slot Planner receives a total number of quality slots and six section Athlete Scores.
3. The planner allocates the total slots across VO2max, Threshold, 10K Specific, Aerobic, Speed Endurance, and Speed.
4. Workout Assignment only chooses eligible database workouts.
5. Priority workouts are repeatable; the second exposure to a stimulus uses an unused Coverage workout when available.
6. If a planned stimulus has no database workout, the UI shows `DATABASE GAP` and does not invent a workout.
7. The selected workout is materialized for the athlete's section score (Band 1-3, Score Group 1-10) and current 10K PB.

## Current temporary 10K slot weights

These are the first deterministic planner weights and are intentionally isolated in `slot-planner.js` so they can be tuned later:

- Threshold: 32%
- 10K Specific: 25%
- VO2max: 22%
- Aerobic: 10%
- Speed Endurance: 7%
- Speed: 4%

Athlete section scores modify these weights mildly: a weaker section receives a larger need multiplier.

## Tests

Run:

```bash
npm test
```

Or only the new planner tests:

```bash
npm run test:slots
```

The new slot-planner test suite passes in the generated package.

## Supabase access

The live TATE workout tables now have read-only Data API access for `anon` and `authenticated` via RLS SELECT policies. No INSERT, UPDATE, or DELETE policies were added.
