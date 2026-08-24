# Changelog

## 0.2.0-lab
- Reworked TATE Lab to use a database-first workout architecture.
- Added Supabase Workout Library loading.
- TATE no longer generates arbitrary workouts for the new planner workflow.
- Added Goal Slot Planner for configurable quality-session slots.
- Added stimulus allocation across:
  - VO2max
  - Threshold
  - 10K Specific
  - Aerobic
  - Speed Endurance
  - Speed
- Added Athlete Score based workout resolution.
- Added Athlete Score Group 1–10 pace selection.
- Added Performance Band 1–3 volume and recovery selection.
- Added Priority vs Coverage workout rotation.
- Priority workouts can repeat throughout a goal.
- Coverage workouts are favored when not yet used in the current goal.
- Added database-gap handling when no eligible workout exists.
- Added support for multi-block workouts.
- Added support for pyramid and step-based workouts.
- Added fixed inter-block recovery handling.
- Added tests for:
  - Slot allocation
  - Athlete Score groups
  - Performance bands
  - Priority/Coverage rotation
  - Missing database workouts
  - Multi-block recovery
- Supabase TATE workout tables are readable by the Lab through SELECT-only RLS policies.
- Workout database remains protected against anonymous INSERT, UPDATE, and DELETE.
- Removed the legacy workout generator architecture from the active TATE Lab.
- Removed legacy parser, scoring, learning, progression, and candidate-generation modules.
- TATE now follows the architecture:
  Supabase Workout Library → Stimulus Slot Allocation → Priority/Coverage Assignment → Athlete-specific Workout.

## 0.1.0-lab
- Initial standalone TATE Lab scaffold.
- Added config-driven candidate scoring.
- Added progression and recent-similarity logic.
- Added natural coach workout parser.
- Added distinct rep recovery and inter-block rest.
- Added contextual block classification.
- Added bounded coach-preference learning.
- Added first 5K + Threshold + Speed-maintenance composite guardrail.
