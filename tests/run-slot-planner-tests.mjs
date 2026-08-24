import assert from 'node:assert/strict';

import {
  PRIMARY_SECTIONS,
  SECONDARY_TARGETS,
  calculateSlotCounts,
  buildSlotSequence,
  assignWorkoutsToSlots,
  buildGoalPlan,
  isSecondaryAllowed,
} from '../src/tate-engine/slot-planner.js';

import {
  performanceBandForScore,
  scoreGroupForScore,
  materializeWorkout,
  formatMaterializedWorkout,
} from '../src/tate-engine/database-library.js';

function testBandsAndGroups() {
  assert.equal(performanceBandForScore(30), 1);
  assert.equal(performanceBandForScore(31), 2);
  assert.equal(performanceBandForScore(70), 2);
  assert.equal(performanceBandForScore(71), 3);
  assert.equal(scoreGroupForScore(85), 9);
  assert.equal(scoreGroupForScore(100), 10);
}

function testFixed10KPrimaryDistribution() {
  assert.deepEqual(
    PRIMARY_SECTIONS,
    ['Aerobic', 'Threshold', 'VO2max']
  );

  const counts = calculateSlotCounts({
    event: '10K',
    slotCount: 10,
    scores: {
      Aerobic: 1,
      Threshold: 100,
      VO2max: 1,
    },
  });

  assert.deepEqual(
    Object.fromEntries(
      counts.map(item => [
        item.section,
        item.count,
      ])
    ),
    {
      Aerobic: 7,
      Threshold: 2,
      VO2max: 1,
    }
  );

  const sequence = buildSlotSequence(counts);
  assert.equal(sequence.length, 10);
}

function testFixedSecondaryHierarchy() {
  assert.deepEqual(
    SECONDARY_TARGETS.Aerobic,
    ['strides', 'progressive', 'long_run']
  );
  assert.deepEqual(
    SECONDARY_TARGETS.Threshold,
    ['race_specific', 'durability']
  );
  assert.deepEqual(
    SECONDARY_TARGETS.VO2max,
    ['speed', 'sprint', 'hill_work']
  );

  assert.equal(
    isSecondaryAllowed('VO2max', 'speed'),
    true
  );
  assert.equal(
    isSecondaryAllowed('VO2max', 'durability'),
    false
  );
  assert.equal(
    isSecondaryAllowed('Threshold', 'durability'),
    true
  );
}

function testPrimaryPriorityCoverageRotation() {
  const workouts = [
    {
      id: '10K_VO2_1000',
      role: 'priority',
      stimulus: 'VO2max',
      active: true,
    },
    {
      id: '10K_VO2_200',
      role: 'priority',
      stimulus: 'VO2max',
      active: true,
    },
    {
      id: '10K_VO2_PYRAMID_400_1200',
      role: 'coverage',
      stimulus: 'VO2max',
      active: true,
    },
  ];

  const slots = [1, 2, 3, 4].map(slot => ({
    slot,
    stimulus: 'VO2max',
    primaryAnchor: 'VO2max',
    secondaryTarget: null,
  }));

  const assigned = assignWorkoutsToSlots(
    slots,
    workouts
  );

  assert.deepEqual(
    assigned.map(item => item.workout.id),
    [
      '10K_VO2_1000',
      '10K_VO2_PYRAMID_400_1200',
      '10K_VO2_200',
      '10K_VO2_1000',
    ]
  );

  assert.ok(
    assigned.every(
      item => item.selectionMode === 'primary'
    )
  );
}

function testSecondaryFallsBackToPrimaryWhenDedicatedWorkoutMissing() {
  const workouts = [
    {
      id: 'VO2_1000',
      role: 'priority',
      stimulus: 'VO2max',
      active: true,
    },
    {
      id: 'VO2_200',
      role: 'priority',
      stimulus: 'VO2max',
      active: true,
    },
  ];

  const assigned = assignWorkoutsToSlots(
    [
      {
        slot: 1,
        stimulus: 'VO2max',
        primaryAnchor: 'VO2max',
        secondaryTarget: 'speed',
      },
    ],
    workouts
  );

  assert.equal(
    assigned[0].selectionMode,
    'primary'
  );
  assert.equal(
    assigned[0].primaryAnchor,
    'VO2max'
  );
  assert.equal(
    assigned[0].secondaryTarget,
    'speed'
  );
  assert.equal(
    assigned[0].selectedStimulus,
    'VO2max'
  );
}

function testPureSecondaryOverride() {
  const workouts = [
    {
      id: 'VO2_BASE',
      role: 'priority',
      stimulus: 'VO2max',
      active: true,
    },
    {
      id: 'PURE_SPEED',
      role: 'priority',
      stimulus: 'Speed',
      active: true,
    },
  ];

  const assigned = assignWorkoutsToSlots(
    [
      {
        slot: 1,
        stimulus: 'VO2max',
        primaryAnchor: 'VO2max',
        secondaryTarget: 'speed',
      },
    ],
    workouts
  );

  assert.equal(
    assigned[0].workout.id,
    'PURE_SPEED'
  );
  assert.equal(
    assigned[0].selectionMode,
    'secondary_override'
  );
  assert.equal(
    assigned[0].primaryAnchor,
    'VO2max'
  );
}

function testDisallowedSecondaryDoesNotOverride() {
  const workouts = [
    {
      id: 'VO2_BASE',
      role: 'priority',
      stimulus: 'VO2max',
      active: true,
    },
    {
      id: 'DURABILITY_SESSION',
      role: 'priority',
      stimulus: 'Durability',
      active: true,
    },
  ];

  const assigned = assignWorkoutsToSlots(
    [
      {
        slot: 1,
        stimulus: 'VO2max',
        primaryAnchor: 'VO2max',
        secondaryTarget: 'durability',
      },
    ],
    workouts
  );

  assert.equal(
    assigned[0].workout.id,
    'VO2_BASE'
  );
  assert.equal(
    assigned[0].secondaryTarget,
    null
  );
  assert.equal(
    assigned[0].selectionMode,
    'primary'
  );
}

function testSecondaryPlanValidation() {
  const workouts = [
    {
      id: 'AEROBIC_BASE',
      role: 'priority',
      stimulus: 'Aerobic',
      active: true,
    },
    {
      id: 'THRESHOLD_BASE',
      role: 'priority',
      stimulus: 'Threshold',
      active: true,
    },
    {
      id: 'VO2_BASE',
      role: 'priority',
      stimulus: 'VO2max',
      active: true,
    },
    {
      id: 'PURE_SPEED',
      role: 'priority',
      stimulus: 'Speed',
      active: true,
    },
  ];

  const plan = buildGoalPlan({
    event: '10K',
    slotCount: 10,
    workouts,
    secondaryPlan: {
      5: 'speed',
    },
  });

  const slot5 = plan.assignments.find(
    item => item.slot === 5
  );

  // Secondary only survives if slot 5 is a VO2max anchor.
  if (slot5.primaryAnchor === 'VO2max') {
    assert.equal(slot5.secondaryTarget, 'speed');
    assert.equal(
      slot5.selectionMode,
      'secondary_override'
    );
  } else {
    assert.equal(slot5.secondaryTarget, null);
  }
}


function testSecondaryOverrideDoesNotCountAsPrimaryExposure() {
  const workouts = [
    {
      id: 'VO2_PRIORITY',
      role: 'priority',
      stimulus: 'VO2max',
      active: true,
    },
    {
      id: 'VO2_COVERAGE',
      role: 'coverage',
      stimulus: 'VO2max',
      active: true,
    },
    {
      id: 'PURE_SPEED',
      role: 'priority',
      stimulus: 'Speed',
      active: true,
    },
  ];

  const assigned = assignWorkoutsToSlots(
    [
      {
        slot: 1,
        stimulus: 'VO2max',
        primaryAnchor: 'VO2max',
        secondaryTarget: 'speed',
      },
      {
        slot: 2,
        stimulus: 'VO2max',
        primaryAnchor: 'VO2max',
        secondaryTarget: null,
      },
      {
        slot: 3,
        stimulus: 'VO2max',
        primaryAnchor: 'VO2max',
        secondaryTarget: null,
      },
    ],
    workouts
  );

  assert.equal(assigned[0].workout.id, 'PURE_SPEED');
  assert.equal(assigned[0].primaryExposure, 0);

  assert.equal(assigned[1].workout.id, 'VO2_PRIORITY');
  assert.equal(assigned[1].primaryExposure, 1);

  assert.equal(assigned[2].workout.id, 'VO2_COVERAGE');
  assert.equal(assigned[2].primaryExposure, 2);
}

function testMissingDatabaseWorkout() {
  const plan = buildGoalPlan({
    event: '10K',
    slotCount: 10,
    workouts: [
      {
        id: 'ONLY_VO2',
        role: 'priority',
        stimulus: 'VO2max',
        active: true,
      },
    ],
  });

  assert.ok(
    plan.assignments.some(
      item => item.status === 'missing'
    )
  );

  assert.ok(
    plan.assignments
      .filter(
        item =>
          item.primaryAnchor === 'VO2max'
      )
      .every(
        item => item.status === 'assigned'
      )
  );
}

function testMaterializeBandTwoTwoBlocks() {
  const workout = {
    id: '10K_VO2_200',
    event: '10K',
    role: 'priority',
    status: 'draft',
    stimulus: 'VO2max',
    structureType: 'interval_sets',
    steps: [],
    stepPaceDefaults: [],
    blocks: [
      { block_number: 1, distance_m: 200 },
      { block_number: 2, distance_m: 200 },
      { block_number: 3, distance_m: 200 },
    ],
    bandDefaults: [
      {
        block_number: 1,
        performance_band: 2,
        reps_default: 10,
        recovery_type: 'jog',
        recovery_default_sec: 30,
        block_recovery_type: 'full_rest',
        block_recovery_default_sec: 300,
      },
      {
        block_number: 2,
        performance_band: 2,
        reps_default: 10,
        recovery_type: 'jog',
        recovery_default_sec: 30,
        block_recovery_type: null,
        block_recovery_default_sec: null,
      },
    ],
    paceDefaults: [
      {
        block_number: 1,
        score_group: 6,
        pace_factor_default: 1.095,
      },
      {
        block_number: 2,
        score_group: 6,
        pace_factor_default: 1.095,
      },
    ],
  };

  const materialized = materializeWorkout(
    workout,
    {
      score: 55,
      current10k: '30:00',
    }
  );

  assert.equal(materialized.performanceBand, 2);
  assert.equal(materialized.scoreGroup, 6);
  assert.equal('secondaryTargets' in materialized, false);
  assert.equal(materialized.blocks.length, 2);
  assert.equal(materialized.blocks[0].reps, 10);
  assert.equal(
    materialized.blocks[0].blockRecoverySeconds,
    300
  );

  const lines = formatMaterializedWorkout(
    materialized
  );

  assert.equal(lines.length, 3);
  assert.match(lines[0], /10×200m/);
  assert.match(lines[1], /5:00 full_rest/);
}

testBandsAndGroups();
testFixed10KPrimaryDistribution();
testFixedSecondaryHierarchy();
testPrimaryPriorityCoverageRotation();
testSecondaryFallsBackToPrimaryWhenDedicatedWorkoutMissing();
testPureSecondaryOverride();
testDisallowedSecondaryDoesNotOverride();
testSecondaryPlanValidation();
testSecondaryOverrideDoesNotCountAsPrimaryExposure();
testMissingDatabaseWorkout();
testMaterializeBandTwoTwoBlocks();

console.log(
  'TATE primary/secondary planner tests: PASS'
);
