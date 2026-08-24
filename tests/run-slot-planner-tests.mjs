import assert from 'node:assert/strict';

import {
  calculateSlotCounts,
  buildSlotSequence,
  assignWorkoutsToSlots,
  buildGoalPlan,
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

function testSlotAllocationSumsExactly() {
  const counts = calculateSlotCounts({
    event: '10K',
    slotCount: 10,
    scores: {
      VO2max: 85,
      Threshold: 80,
      '10K Specific': 80,
      Aerobic: 85,
      'Speed Endurance': 75,
      Speed: 75,
    },
  });

  assert.equal(
    counts.reduce((sum, item) => sum + item.count, 0),
    10
  );

  const sequence = buildSlotSequence(counts);
  assert.equal(sequence.length, 10);
}

function testPriorityCoverageRotation() {
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
}

function testMissingDatabaseWorkout() {
  const plan = buildGoalPlan({
    event: '10K',
    slotCount: 10,
    scores: {},
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
      .filter(item => item.stimulus === 'VO2max')
      .every(item => item.status === 'assigned')
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
testSlotAllocationSumsExactly();
testPriorityCoverageRotation();
testMissingDatabaseWorkout();
testMaterializeBandTwoTwoBlocks();

console.log('Database slot planner tests: PASS');
