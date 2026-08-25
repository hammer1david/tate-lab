import assert from 'node:assert/strict';
import {
  buildDynamicWorkoutLibrary,
  formatMaterializedWorkout,
  materializeWorkout,
  normalizeStimulus,
} from './database-library.js';

const event = '10K';
const config = {
  tate_aerobic_generation_rules: [{ event, active: true }],
  tate_aerobic_pace_profiles: [
    { event, active: true, pace_level: 'easy', pace_factor_min: 0.6, pace_factor_default: 0.6214, pace_factor_max: 0.6429 },
    { event, active: true, pace_level: 'normal', pace_factor_min: 0.6429, pace_factor_default: 0.6667, pace_factor_max: 0.6923 },
    { event, active: true, pace_level: 'moderate', pace_factor_min: 0.6923, pace_factor_default: 0.72, pace_factor_max: 0.75 },
  ],
  tate_aerobic_distance_profiles: [
    { event, active: true, distance_mode: 'normal', multiplier_min: 0.9, multiplier_default: 1, multiplier_max: 1.1 },
  ],
  tate_aerobic_phase_rules: [{ event, active: true, phase: 'base' }],
  tate_long_run_profiles: [
    { event, active: true, long_run_type: 'normal', start_pace_level: 'normal', finish_pace_level: 'normal' },
  ],
  tate_long_run_phase_rules: [
    { event, active: true, phase: 'base', weekly_km_share_min: 0.2, weekly_km_share_default: 0.225, weekly_km_share_max: 0.25, max_distance_km: 30 },
  ],
  tate_recovery_generation_rules: [
    { event, active: true, effort_guidance: 'very_easy_relaxed', rpe_min: 1, rpe_max: 2 },
  ],
  tate_stride_generation_rules: [
    { event, active: true, effort_guidance: 'fast_but_relaxed', recovery_policy: 'full_or_near_full' },
  ],
  tate_stride_variants: [
    { event, active: true, variant_id: '6x100', reps: 6, distance_m: 100 },
    { event, active: true, variant_id: '8x100', reps: 8, distance_m: 100 },
    { event, active: true, variant_id: '6x150', reps: 6, distance_m: 150 },
  ],
  tate_hill_sprint_generation_rules: [
    { event, active: true, effort_guidance: 'very_fast_explosive_clean', recovery_policy: 'full_or_near_full' },
  ],
  tate_hill_sprint_variants: [
    { event, active: true, variant_id: '6-10x10s', duration_sec: 10, reps_min: 6, reps_default: null, reps_max: 10 },
    { event, active: true, variant_id: '8-15x20s', duration_sec: 20, reps_min: 8, reps_default: null, reps_max: 15 },
  ],
  tate_hillwork_generation_rules: [
    { event, active: true, block_duration_min_sec: 1200, block_duration_max_sec: 2400, uphill_distance_min_m: 100, uphill_distance_max_m: 200, uphill_effort_guidance: 'hard_but_controlled' },
  ],
};

const library = buildDynamicWorkoutLibrary(config, { event });
const byStimulus = Object.groupBy
  ? Object.groupBy(library, workout => workout.stimulus)
  : library.reduce((groups, workout) => {
      (groups[workout.stimulus] ||= []).push(workout);
      return groups;
    }, {});

assert.equal(normalizeStimulus('RacePace'), 'Race Specific');
assert.equal(byStimulus.Aerobic.length, 1);
assert.equal(byStimulus.Progressive.length, 1);
assert.equal(byStimulus['Long Run'].length, 1);
assert.equal(byStimulus.Recovery.length, 1);
assert.equal(byStimulus.Strides.length, 3);
assert.equal(byStimulus.Sprint.length, 2);
assert.equal(byStimulus['Hill Work'].length, 1);

const hillwork = materializeWorkout(byStimulus['Hill Work'][0], {
  score: 90,
  current10k: '30:00',
  phase: 'base',
});
assert.match(formatMaterializedWorkout(hillwork)[0], /20:00–40:00 Hillwork/);
assert.match(formatMaterializedWorkout(hillwork)[0], /100–200m uphill Hard But Controlled/);

const strides = materializeWorkout(byStimulus.Strides[0], {
  score: 90,
  current10k: '30:00',
});
assert.match(formatMaterializedWorkout(strides)[0], /Strides/);

const timeWorkout = {
  id: 'TEST_10MIN',
  event,
  role: 'priority',
  status: 'draft',
  stimulus: 'Threshold',
  structureType: 'time_intervals',
  dynamicType: null,
  blocks: [{ block_number: 1, distance_m: null, duration_sec: 600 }],
  bandDefaults: [{ performance_band: 3, block_number: 1, reps_default: 3, recovery_type: 'jog', recovery_default_sec: 120 }],
  paceDefaults: [{ block_number: 1, score_group: 9, pace_factor_default: 0.9231 }],
  steps: [],
  stepPaceDefaults: [],
  volumeProfiles: [
    {
      workout_id: 'TEST_10MIN',
      performance_band: 3,
      distance_mode: 'time_based',
      work_distance_km: null,
      work_duration_sec: 1800,
    },
  ],
};
const materializedTime = materializeWorkout(timeWorkout, {
  score: 90,
  current10k: '30:00',
});
const timeLine = formatMaterializedWorkout(materializedTime)[0];
assert.match(timeLine, /^3×10:00/);
assert.doesNotMatch(timeLine, /nullm/);
assert.equal(materializedTime.distanceMode, 'time_based');
assert.equal(materializedTime.workDurationSec, 1800);
assert.equal(materializedTime.workDistanceEstimated, true);
assert.equal(materializedTime.workDistanceCalculation, 'work_duration_x_pace_factor_x_current_10k');
assert.ok(
  Math.abs(materializedTime.workDistanceKm - 9.231) < 0.001,
  `expected ~9.231 km, got ${materializedTime.workDistanceKm}`
);
assert.match(
  formatMaterializedWorkout(materializedTime).at(-1),
  /Estimated work distance 9\.23 km/
);

console.log(`dynamic library tests passed (${library.length} dynamic workouts)`);
