import assert from 'node:assert/strict';

import {
  applyProgressionLever,
  buildProgressionPlan,
  normalizeProgressionDecision,
  progressionCapabilities,
  progressionLeverOrder,
  progressMaterializedWorkout,
  selectProgressionFamily,
} from '../src/tate-engine/progression-machine.js';

import {
  materializeWorkout,
} from '../src/tate-engine/database-library.js';

function thresholdWorkout({
  id = '10K_THR_TEST',
  reps = true,
  pace = true,
  recovery = true,
  blockRecovery = false,
  role = 'priority',
} = {}) {
  return {
    id,
    event: '10K',
    role,
    status: 'draft',
    active: true,
    stimulus: 'Threshold',
    structureType: 'time_intervals',
    dynamicType: null,
    progress_reps: reps,
    progress_pace: pace,
    progress_recovery: recovery,
    progress_block_recovery: blockRecovery,
    blocks: [
      {
        block_number: 1,
        distance_m: null,
        duration_sec: 600,
        active: true,
      },
    ],
    bandDefaults: [
      {
        performance_band: 3,
        block_number: 1,
        reps_min: 3,
        reps_default: 4,
        reps_max: 5,
        recovery_type: 'jog',
        recovery_min_sec: 60,
        recovery_default_sec: 90,
        recovery_max_sec: 150,
        block_recovery_type: null,
        block_recovery_min_sec: null,
        block_recovery_default_sec: null,
        block_recovery_max_sec: null,
      },
    ],
    paceDefaults: [
      {
        block_number: 1,
        score_group: 8,
        pace_factor_default: 0.90,
      },
      {
        block_number: 1,
        score_group: 9,
        pace_factor_default: 0.92,
      },
      {
        block_number: 1,
        score_group: 10,
        pace_factor_default: 0.94,
      },
    ],
    steps: [],
    stepPaceDefaults: [],
    volumeProfiles: [],
  };
}

function materialized(workout) {
  return materializeWorkout(workout, {
    score: 90,
    current10k: '30:00',
  });
}

function testDecisionNormalization() {
  assert.equal(normalizeProgressionDecision('PROGRESS'), 'progress');
  assert.equal(normalizeProgressionDecision('recovery'), 'recover');
  assert.equal(normalizeProgressionDecision('hold'), 'maintain');
  assert.equal(normalizeProgressionDecision('unknown'), 'maintain');
}

function testCapabilities() {
  assert.deepEqual(
    progressionCapabilities(
      thresholdWorkout({
        reps: true,
        pace: false,
        recovery: true,
      })
    ),
    {
      reps: true,
      pace: false,
      recovery: true,
      block_recovery: false,
    }
  );
}

function testThresholdLeverOrderAndRecentLeverAvoidance() {
  const workout = thresholdWorkout();

  assert.deepEqual(
    progressionLeverOrder({
      workout,
      decision: 'progress',
    }),
    ['reps', 'pace', 'recovery']
  );

  assert.deepEqual(
    progressionLeverOrder({
      workout,
      decision: 'progress',
      recentLevers: ['reps'],
    }),
    ['pace', 'recovery', 'reps']
  );
}

function testProgressChangesOnlyRepsFirst() {
  const workout = thresholdWorkout();
  const before = materialized(workout);
  const result = progressMaterializedWorkout({
    workout,
    materialized: before,
    decision: 'progress',
  });

  assert.equal(result.changed, true);
  assert.equal(result.lever, 'reps');
  assert.equal(result.materialized.blocks[0].reps, 5);
  assert.equal(
    result.materialized.blocks[0].recoverySeconds,
    before.blocks[0].recoverySeconds
  );
  assert.equal(
    result.materialized.blocks[0].paceFactor,
    before.blocks[0].paceFactor
  );
  assert.ok(
    result.materialized.workDistanceKm > before.workDistanceKm
  );
}

function testAtRepMaxFallsThroughToPace() {
  const workout = thresholdWorkout();
  const before = materialized(workout);
  before.blocks[0].reps = 5;
  before.blocks[0].workDistanceKm =
    before.blocks[0].repWorkDistanceKm * 5;
  before.workDistanceKm = before.blocks[0].workDistanceKm;

  const result = progressMaterializedWorkout({
    workout,
    materialized: before,
    decision: 'progress',
  });

  assert.equal(result.changed, true);
  assert.equal(result.lever, 'pace');
  assert.equal(result.materialized.blocks[0].reps, 5);
  assert.equal(
    result.materialized.progressionPaceGroup,
    10
  );
  assert.ok(
    result.materialized.blocks[0].paceSecondsPerKm <
      before.blocks[0].paceSecondsPerKm
  );
  assert.equal(result.attempts[0].lever, 'reps');
  assert.equal(result.attempts[0].changed, false);
}

function testPaceProgressionUsesNextDatabaseScoreGroup() {
  const workout = thresholdWorkout({
    reps: false,
    pace: true,
    recovery: false,
  });
  const before = materialized(workout);

  const result = applyProgressionLever({
    workout,
    materialized: before,
    decision: 'progress',
    lever: 'pace',
  });

  assert.equal(result.changed, true);
  assert.equal(result.materialized.progressionPaceGroup, 10);
  assert.equal(result.materialized.blocks[0].paceFactor, 0.94);
  assert.ok(
    result.materialized.blocks[0].paceSecondsPerKm <
      before.blocks[0].paceSecondsPerKm
  );
  assert.ok(
    result.materialized.workDistanceKm > before.workDistanceKm,
    'time-based threshold work should cover more distance when pace progresses'
  );
}

function testRecoveryProgressionRespectsConfiguredBounds() {
  const workout = thresholdWorkout({
    reps: false,
    pace: false,
    recovery: true,
  });
  const before = materialized(workout);

  const progress = progressMaterializedWorkout({
    workout,
    materialized: before,
    decision: 'progress',
    recoveryStepSeconds: 15,
  });

  assert.equal(progress.lever, 'recovery');
  assert.equal(progress.materialized.blocks[0].recoverySeconds, 75);

  const recover = progressMaterializedWorkout({
    workout,
    materialized: before,
    decision: 'recover',
    recoveryStepSeconds: 15,
  });

  assert.equal(recover.lever, 'recovery');
  assert.equal(recover.materialized.blocks[0].recoverySeconds, 105);
}

function testRecoverReducesRepsBeforeChangingAnythingElse() {
  const workout = thresholdWorkout();
  const before = materialized(workout);

  const result = progressMaterializedWorkout({
    workout,
    materialized: before,
    decision: 'recover',
  });

  assert.equal(result.changed, true);
  assert.equal(result.lever, 'reps');
  assert.equal(result.materialized.blocks[0].reps, 3);
  assert.equal(
    result.materialized.blocks[0].paceFactor,
    before.blocks[0].paceFactor
  );
  assert.equal(
    result.materialized.blocks[0].recoverySeconds,
    before.blocks[0].recoverySeconds
  );
}

function testMaintainDoesNothing() {
  const workout = thresholdWorkout();
  const before = materialized(workout);

  const result = progressMaterializedWorkout({
    workout,
    materialized: before,
    decision: 'maintain',
  });

  assert.equal(result.changed, false);
  assert.equal(result.lever, null);
  assert.deepEqual(result.materialized, before);
}

function testRecentFamilyRotatesToLeastRecentAlternative() {
  const current = thresholdWorkout({ id: '10K_THR_4X8' });
  const altA = thresholdWorkout({ id: '10K_THR_3X10' });
  const altB = thresholdWorkout({
    id: '10K_THR_5X2000',
    role: 'coverage',
  });

  const result = selectProgressionFamily({
    currentWorkout: current,
    candidates: [current, altA, altB],
    decision: 'progress',
    recentWorkoutIds: [
      '10K_THR_4X8',
      '10K_THR_4X8',
      '10K_THR_3X10',
    ],
    repeatLimit: 2,
  });

  assert.equal(result.switched, true);
  assert.equal(result.workout.id, '10K_THR_5X2000');
}

function testMaintainNeverRotatesFamily() {
  const current = thresholdWorkout({ id: '10K_THR_4X8' });
  const alt = thresholdWorkout({ id: '10K_THR_3X10' });

  const result = selectProgressionFamily({
    currentWorkout: current,
    candidates: [current, alt],
    decision: 'maintain',
    recentWorkoutIds: ['10K_THR_4X8', '10K_THR_4X8'],
  });

  assert.equal(result.switched, false);
  assert.equal(result.workout.id, current.id);
}

function testProgressionPlanReturnsFamilyAndOnePreferredLever() {
  const current = thresholdWorkout({ id: 'A' });
  const alternate = thresholdWorkout({ id: 'B' });

  const plan = buildProgressionPlan({
    currentWorkout: current,
    candidates: [current, alternate],
    decision: 'progress',
    recentWorkoutIds: ['A'],
    recentLevers: ['reps'],
    repeatLimit: 2,
  });

  assert.equal(plan.switchedFamily, false);
  assert.equal(plan.workout.id, 'A');
  assert.equal(plan.preferredLever, 'pace');
  assert.deepEqual(
    plan.leverOrder,
    ['pace', 'recovery', 'reps']
  );
}

const tests = [
  testDecisionNormalization,
  testCapabilities,
  testThresholdLeverOrderAndRecentLeverAvoidance,
  testProgressChangesOnlyRepsFirst,
  testAtRepMaxFallsThroughToPace,
  testPaceProgressionUsesNextDatabaseScoreGroup,
  testRecoveryProgressionRespectsConfiguredBounds,
  testRecoverReducesRepsBeforeChangingAnythingElse,
  testMaintainDoesNothing,
  testRecentFamilyRotatesToLeastRecentAlternative,
  testMaintainNeverRotatesFamily,
  testProgressionPlanReturnsFamilyAndOnePreferredLever,
];

for (const test of tests) {
  test();
}

console.log(`progression machine tests passed (${tests.length} tests)`);
