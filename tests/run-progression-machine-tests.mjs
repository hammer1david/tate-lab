import assert from 'node:assert/strict';

import {
  applyProgressionLever,
  buildProgressionPlan,
  normalizeProgressionDecision,
  progressionCapabilities,
  progressionLeverOrder,
  progressMaterializedWorkout,
  selectProgressionFamily,
  applyWeeklyWorkoutProgressionToSchedule,
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

function stepSetWorkout() {
  return {
    id: '10K_VO2_800_600_400_SETS_TEST',
    event: '10K',
    role: 'priority',
    status: 'draft',
    active: true,
    stimulus: 'VO2max',
    structureType: 'step_sets',
    dynamicType: null,

    progress_reps: true,
    progress_pace: false,
    progress_recovery: false,
    progress_block_recovery: false,

    blocks: [],

    bandDefaults: [
      {
        performance_band: 3,
        block_number: 1,
        reps_min: 3,
        reps_default: 3,
        reps_max: 4,
      },
    ],

    paceDefaults: [],

    steps: [
      {
        performance_band: 3,
        block_number: 1,
        step_number: 1,
        distance_m: 800,
        reps: 1,
        recovery_type: 'jog',
        recovery_sec: 120,
        active: true,
      },
      {
        performance_band: 3,
        block_number: 1,
        step_number: 2,
        distance_m: 600,
        reps: 1,
        recovery_type: 'jog',
        recovery_sec: 120,
        active: true,
      },
      {
        performance_band: 3,
        block_number: 1,
        step_number: 3,
        distance_m: 400,
        reps: 1,
        recovery_type: 'jog',
        recovery_sec: 120,
        active: true,
      },
    ],

    stepPaceDefaults: [],

    volumeProfiles: [
      {
        workout_id:
          '10K_VO2_800_600_400_SETS_TEST',
        performance_band: 3,
        distance_mode: 'fixed',
        work_distance_km: 1.8,
      },
    ],
  };
}

function multiBlockStepPaceWorkout() {
  return {
    id: '10K_VO2_MULTI_BLOCK_STEP_TEST',
    event: '10K',
    role: 'priority',
    status: 'draft',
    active: true,
    stimulus: 'VO2max',
    structureType: 'steps',
    dynamicType: null,

    progress_reps: false,
    progress_pace: true,
    progress_recovery: false,
    progress_block_recovery: false,

    blocks: [],

    bandDefaults: [
      {
        performance_band: 3,
        block_number: 1,
        reps_min: 1,
        reps_default: 1,
        reps_max: 1,
      },
      {
        performance_band: 3,
        block_number: 2,
        reps_min: 1,
        reps_default: 1,
        reps_max: 1,
      },
    ],

    paceDefaults: [],

    steps: [
      {
        performance_band: 3,
        block_number: 1,
        step_number: 1,
        distance_m: 400,
        reps: 1,
        recovery_type: 'jog',
        recovery_sec: 120,
        active: true,
      },
      {
        performance_band: 3,
        block_number: 2,
        step_number: 1,
        distance_m: 400,
        reps: 1,
        recovery_type: 'jog',
        recovery_sec: 120,
        active: true,
      },
    ],

    stepPaceDefaults: [
      {
        performance_band: 3,
        block_number: 1,
        step_number: 1,
        score_group: 8,
        pace_factor_default: 0.95,
      },
      {
        performance_band: 3,
        block_number: 1,
        step_number: 1,
        score_group: 9,
        pace_factor_default: 0.97,
      },

      {
        performance_band: 3,
        block_number: 2,
        step_number: 1,
        score_group: 8,
        pace_factor_default: 1.00,
      },
      {
        performance_band: 3,
        block_number: 2,
        step_number: 1,
        score_group: 9,
        pace_factor_default: 1.02,
      },
    ],

    volumeProfiles: [],
  };
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
function testMaintainKeepsLastCompletedFamily() {
  const workoutA =
    thresholdWorkout({
      id: '10K_THR_A',
    });

  const workoutB =
    thresholdWorkout({
      id: '10K_THR_B',
    });

  const schedule = {
    weeks: [
      {
        week: 1,

        days: [
          {
            day: 'tue',

            placementType:
              'workout',

            simulated: true,

            assignment: {
              slot: 1,
              status: 'assigned',
              primaryAnchor:
                'Threshold',
              workout:
                workoutA,
            },
          },
        ],
      },

      {
        week: 2,

        days: [
          {
            day: 'tue',

            placementType:
              'workout',

            simulated: false,

            /*
             * Slot Planner pre-selected B,
             * but Maintain must keep the
             * actually completed family A.
             */
            assignment: {
              slot: 2,
              status: 'assigned',
              primaryAnchor:
                'Threshold',
              workout:
                workoutB,
            },
          },
        ],
      },
    ],
  };

  applyWeeklyWorkoutProgressionToSchedule({
    schedule,

    weeklyDecisions: [
      null,
      'maintain',
    ],

    scores: {
      Threshold: 90,
    },

    current10k:
      '30:00',

    workouts: [
      workoutA,
      workoutB,
    ],
  });

  const week2 =
    schedule
      .weeks[1]
      .days[0]
      .assignment;

  assert.equal(
    week2.workout.id,
    '10K_THR_A'
  );

  assert.equal(
    week2
      .progressionDecision,
    'maintain'
  );

  assert.equal(
    week2
      .progressionResult
      .lever,
    null
  );

  assert.equal(
    week2
      .progressionMaterialized
      .blocks[0]
      .reps,
    4
  );
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
function testStepSetProgressionChangesSetsOnly() {
  const workout = stepSetWorkout();

  const before = materializeWorkout(
    workout,
    {
      score: 90,
      current10k: '30:00',
    }
  );

  assert.equal(
    before.steps[0].setCount,
    3
  );

  assert.equal(
    before.workDistanceKm,
    5.4
  );

  const result =
    progressMaterializedWorkout({
      workout,
      materialized: before,
      decision: 'progress',
    });

  assert.equal(
    result.changed,
    true
  );

  assert.equal(
    result.lever,
    'reps'
  );

  for (const step of result.materialized.steps) {
    assert.equal(
      step.setCount,
      4
    );

    assert.equal(
      step.reps,
      1
    );
  }

  assert.equal(
    result.materialized.workDistanceKm,
    7.2
  );
}


function testRepeatedPaceProgressionAdvancesAgain() {
  const workout = thresholdWorkout({
    reps: false,
    pace: true,
    recovery: false,
  });

  const before = materializeWorkout(
    workout,
    {
      score: 80,
      current10k: '30:00',
    }
  );

  assert.equal(
    before.scoreGroup,
    8
  );

  const first =
    progressMaterializedWorkout({
      workout,
      materialized: before,
      decision: 'progress',
    });

  assert.equal(
    first.materialized.progressionPaceGroup,
    9
  );

  assert.equal(
    first.materialized.blocks[0].paceFactor,
    0.92
  );

  const second =
    progressMaterializedWorkout({
      workout,
      materialized: first.materialized,
      decision: 'progress',
    });

  assert.equal(
    second.materialized.progressionPaceGroup,
    10
  );

  assert.equal(
    second.materialized.blocks[0].paceFactor,
    0.94
  );
}


function testStepPaceProgressionRespectsBlockNumber() {
  const workout =
    multiBlockStepPaceWorkout();

  const before = materializeWorkout(
    workout,
    {
      score: 80,
      current10k: '30:00',
    }
  );

  assert.equal(
    before.steps[0].paceFactor,
    0.95
  );

  assert.equal(
    before.steps[1].paceFactor,
    1.00
  );

  const result =
    progressMaterializedWorkout({
      workout,
      materialized: before,
      decision: 'progress',
    });

  assert.equal(
    result.changed,
    true
  );

  assert.equal(
    result.lever,
    'pace'
  );

  assert.equal(
    result.materialized.steps[0].paceFactor,
    0.97
  );

  assert.equal(
    result.materialized.steps[1].paceFactor,
    1.02
  );
}
function testWeeklyScheduleProgressionCarriesState() {
  const workout =
    thresholdWorkout();

  const schedule = {
    weeks: [
      1,
      2,
      3,
    ].map(
      (week, index) => ({
        week,

        days: [
          {
            day: 'tue',

            placementType:
              'workout',

            simulated:
              false,

            assignment: {
              slot:
                index + 1,

              status:
                'assigned',

              primaryAnchor:
                'Threshold',

              workout,
            },
          },
        ],
      })
    ),
  };


  const result =
    applyWeeklyWorkoutProgressionToSchedule({
      schedule,

      weeklyDecisions: [
        null,
        'progress',
        'progress',
      ],

      scores: {
        Threshold:
          90,
      },

      current10k:
        '30:00',
    });


  assert.equal(
    result.weeks[0].status,
    'no_feedback'
  );


  const week2 =
    schedule
      .weeks[1]
      .days[0]
      .assignment;

  assert.equal(
    week2
      .progressionResult
      .lever,
    'reps'
  );

  assert.equal(
    week2
      .progressionMaterialized
      .blocks[0]
      .reps,
    5
  );


  const week3 =
    schedule
      .weeks[2]
      .days[0]
      .assignment;

  /*
   * State must carry forward:
   * week 3 starts at 5 reps,
   * not DB default 4.
   *
   * Because reps was the previous
   * lever, pace is preferred next.
   */
  assert.equal(
    week3
      .progressionResult
      .lever,
    'pace'
  );

  assert.equal(
    week3
      .progressionMaterialized
      .blocks[0]
      .reps,
    5
  );

  assert.equal(
    week3
      .progressionMaterialized
      .progressionPaceGroup,
    10
  );


  assert.equal(
    result.changedCount,
    2
  );
}

function testWeeklyFamilyRotationUsesCompletedHistory() {
  const workoutA =
    thresholdWorkout({
      id: '10K_THR_A',
    });

  const workoutB =
    thresholdWorkout({
      id: '10K_THR_B',
    });

  const completedA =
    materializeWorkout(
      workoutA,
      {
        score: 90,
        current10k:
          '30:00',
      }
    );

  const schedule = {
    weeks: [
      {
        week: 1,

        days: [
          {
            day: 'tue',

            placementType:
              'workout',

            simulated: true,

            assignment: {
              slot: 1,
              status: 'assigned',
              primaryAnchor:
                'Threshold',
              workout:
                workoutA,

              progressionMaterialized:
                completedA,
            },
          },
        ],
      },

      {
        week: 2,

        days: [
          {
            day: 'tue',

            placementType:
              'workout',

            simulated: true,

            assignment: {
              slot: 2,
              status: 'assigned',
              primaryAnchor:
                'Threshold',
              workout:
                workoutA,

              progressionMaterialized:
                completedA,
            },
          },
        ],
      },

      {
        week: 3,

        days: [
          {
            day: 'tue',

            placementType:
              'workout',

            simulated: false,

            assignment: {
              slot: 3,
              status: 'assigned',
              primaryAnchor:
                'Threshold',
              workout:
                workoutA,
            },
          },
        ],
      },
    ],
  };

  const result =
    applyWeeklyWorkoutProgressionToSchedule({
      schedule,

      weeklyDecisions: [
        null,
        null,
        'progress',
      ],

      scores: {
        Threshold: 90,
      },

      current10k:
        '30:00',

      workouts: [
        workoutA,
        workoutB,
      ],

      repeatLimit: 2,
    });

  const week3 =
    schedule
      .weeks[2]
      .days[0]
      .assignment;

  assert.equal(
    week3.workout.id,
    '10K_THR_B'
  );

  assert.equal(
    week3
      .progressionResult
      .familyChanged,
    true
  );

  /*
   * Family switch itself is the
   * single adaptation.
   *
   * No reps / pace / recovery
   * change in the same session.
   */
  assert.equal(
    week3
      .progressionResult
      .lever,
    null
  );

  assert.equal(
    week3
      .progressionMaterialized
      .blocks[0]
      .reps,
    4
  );

  assert.equal(
    result.familyChangeCount,
    1
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
    testStepSetProgressionChangesSetsOnly,
  testRepeatedPaceProgressionAdvancesAgain,
  testStepPaceProgressionRespectsBlockNumber,
  testWeeklyScheduleProgressionCarriesState,
  testWeeklyFamilyRotationUsesCompletedHistory,
testMaintainKeepsLastCompletedFamily,
];

for (const test of tests) {
  test();
}

console.log(`progression machine tests passed (${tests.length} tests)`);
