import assert from 'node:assert/strict';

import {
  PRIMARY_SECTIONS,
  SECONDARY_TARGETS,
  TRAINING_PHASES,
  TRAINING_PHASE_CONFIG,
  normalizeTrainingPhase,
  calculateSlotCounts,
  buildSlotSequence,
  buildAutomaticSecondaryPlan,
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

import {
  DAY_ROLES,
  WEEKDAYS,
  blankWeekRule,
  schedulePlanIntoWeeks,
  sessionPlacementType,
  trainingDaysInRule,
} from '../src/tate-engine/week-scheduler.js';


function fakeAssignment(
  slot,
  primaryAnchor,
  selectedStimulus = primaryAnchor,
  secondaryTarget = null
) {
  return {
    slot,
    stimulus: primaryAnchor,
    primaryAnchor,
    selectedStimulus,
    secondaryTarget,
    selectionMode:
      selectedStimulus === primaryAnchor
        ? 'primary'
        : 'secondary_override',
    status: 'assigned',
    workout: {
      id: `TEST_${slot}`,
      stimulus: selectedStimulus,
      role: 'priority',
      active: true,
    },
  };
}

function testDefaultWeeklyAvailabilityPattern() {
  const rule = blankWeekRule(1);

  assert.equal(trainingDaysInRule(rule), 7);
  assert.equal(rule.days.tue, DAY_ROLES.WORKOUT);
  assert.equal(rule.days.fri, DAY_ROLES.WORKOUT);
  assert.equal(rule.days.sun, DAY_ROLES.LONG_RUN);
  assert.equal(rule.days.mon, DAY_ROLES.EASY);
}

function testUnavailableDaysAreNeverScheduled() {
  const assignments = Array.from(
    { length: 5 },
    (_, index) => fakeAssignment(index + 1, 'Aerobic')
  );

  const rule = blankWeekRule(1);
  rule.days.thu = DAY_ROLES.UNAVAILABLE;
  rule.days.sat = DAY_ROLES.UNAVAILABLE;

  const schedule = schedulePlanIntoWeeks(
    assignments,
    rule
  );

  assert.equal(schedule.trainingDaysPerWeek, 5);
  assert.equal(schedule.weeks.length, 1);
  assert.equal(schedule.unscheduledCount, 0);

  const week = schedule.weeks[0];
  assert.equal(
    week.days.find(day => day.day === 'thu').assignment,
    null
  );
  assert.equal(
    week.days.find(day => day.day === 'sat').assignment,
    null
  );
}

function testCheckedDayCountControlsWeekCapacity() {
  const assignments = Array.from(
    { length: 12 },
    (_, index) => fakeAssignment(index + 1, 'Aerobic')
  );

  const rule = blankWeekRule(1);
  rule.days.thu = DAY_ROLES.UNAVAILABLE;
  rule.days.sat = DAY_ROLES.UNAVAILABLE;

  const schedule = schedulePlanIntoWeeks(
    assignments,
    rule
  );

  assert.equal(schedule.trainingDaysPerWeek, 5);
  assert.equal(schedule.weeks.length, 3);
  assert.deepEqual(
    schedule.weeks.map(week => week.scheduledTrainingDays),
    [5, 5, 2]
  );
  assert.equal(schedule.unscheduledCount, 0);
}

function testWorkoutOnlyUsesWorkoutDay() {
  const assignments = [
    fakeAssignment(1, 'Threshold'),
    fakeAssignment(2, 'VO2max'),
    ...Array.from({ length: 5 }, (_, index) =>
      fakeAssignment(index + 3, 'Aerobic')
    ),
  ];

  const rule = blankWeekRule(1);

  const week = schedulePlanIntoWeeks(
    assignments,
    rule
  ).weeks[0];

  assert.equal(
    week.days.find(day => day.day === 'tue').placementType,
    'workout'
  );
  assert.equal(
    week.days.find(day => day.day === 'fri').placementType,
    'workout'
  );

  for (const day of week.days) {
    if (day.placementType === 'workout') {
      assert.equal(day.effectiveRole, DAY_ROLES.WORKOUT);
    }
  }
}

function testLongRunOnlyUsesLongRunDay() {
  const assignments = [
    fakeAssignment(1, 'Aerobic', 'Long Run', 'long_run'),
    ...Array.from({ length: 6 }, (_, index) =>
      fakeAssignment(index + 2, 'Aerobic')
    ),
  ];

  const rule = blankWeekRule(1);
  const week = schedulePlanIntoWeeks(
    assignments,
    rule
  ).weeks[0];

  assert.equal(
    week.days.find(day => day.day === 'sun').placementType,
    'long_run'
  );
  assert.notEqual(
    week.days.find(day => day.day === 'tue').placementType,
    'long_run'
  );
}

function testLongRunNeverUsesWorkoutDay() {
  const assignments = [
    fakeAssignment(1, 'Aerobic', 'Long Run', 'long_run'),
    ...Array.from({ length: 6 }, (_, index) =>
      fakeAssignment(index + 2, 'Aerobic')
    ),
  ];

  const rule = blankWeekRule(1);
  rule.days.sun = DAY_ROLES.UNAVAILABLE;

  const schedule = schedulePlanIntoWeeks(
    assignments,
    rule
  );

  assert.ok(
    schedule.unscheduled.some(item => item.placementType === 'long_run')
  );

  for (const week of schedule.weeks) {
    for (const day of week.days) {
      if (day.effectiveRole === DAY_ROLES.WORKOUT) {
        assert.notEqual(day.placementType, 'long_run');
      }
    }
  }
}

function testSpeedMayUseLongRunDayWhenNoLongRunExists() {
  const assignments = [
    fakeAssignment(1, 'Threshold'),
    fakeAssignment(2, 'VO2max', 'Speed', 'speed'),
    ...Array.from({ length: 5 }, (_, index) =>
      fakeAssignment(index + 3, 'Aerobic')
    ),
  ];

  const rule = blankWeekRule(1);
  rule.days.fri = DAY_ROLES.EASY;

  const week = schedulePlanIntoWeeks(
    assignments,
    rule
  ).weeks[0];

  assert.equal(
    week.days.find(day => day.day === 'tue').placementType,
    'workout'
  );
  assert.equal(
    week.days.find(day => day.day === 'sun').placementType,
    'speed'
  );
}

function testSpeedCannotUseEasyDay() {
  const assignments = [
    fakeAssignment(1, 'Threshold'),
    fakeAssignment(2, 'VO2max', 'Speed', 'speed'),
    fakeAssignment(3, 'Aerobic', 'Long Run', 'long_run'),
    ...Array.from({ length: 4 }, (_, index) =>
      fakeAssignment(index + 4, 'Aerobic')
    ),
  ];

  const rule = blankWeekRule(1);
  rule.days.fri = DAY_ROLES.EASY;

  const schedule = schedulePlanIntoWeeks(
    assignments,
    rule
  );

  assert.ok(
    schedule.unscheduled.some(item => item.placementType === 'speed')
  );

  for (const week of schedule.weeks) {
    for (const day of week.days) {
      if (day.effectiveRole === DAY_ROLES.EASY) {
        assert.notEqual(day.placementType, 'speed');
      }
    }
  }
}

function testReservedDaysCanFallBackToEasy() {
  const assignments = Array.from(
    { length: 7 },
    (_, index) => fakeAssignment(index + 1, 'Aerobic')
  );

  const rule = blankWeekRule(1);
  const week = schedulePlanIntoWeeks(
    assignments,
    rule
  ).weeks[0];

  assert.equal(
    week.days.find(day => day.day === 'tue').placementType,
    'easy'
  );
  assert.equal(
    week.days.find(day => day.day === 'sun').placementType,
    'easy'
  );
}

function testThirtySlotFiveDayRecurringAvailability() {
  const plan = buildGoalPlan({
    event: '10K',
    phase: 'base',
    slotCount: 30,
    workouts: [],
  });

  const rule = blankWeekRule(1);
  rule.days.thu = DAY_ROLES.UNAVAILABLE;
  rule.days.sat = DAY_ROLES.UNAVAILABLE;

  const schedule = schedulePlanIntoWeeks(
    plan.assignments,
    rule
  );

  assert.deepEqual(
    Object.fromEntries(
      plan.counts.map(item => [item.section, item.count])
    ),
    {
      Aerobic: 21,
      Threshold: 6,
      VO2max: 3,
    }
  );

  assert.equal(schedule.trainingDaysPerWeek, 5);
  assert.equal(schedule.weeks.length, 6);
  assert.equal(schedule.unscheduledCount, 0);

  for (const week of schedule.weeks) {
    for (const day of week.days) {
      if (!day.available) {
        assert.equal(day.assignment, null);
      }
      if (day.placementType === 'workout') {
        assert.equal(day.effectiveRole, DAY_ROLES.WORKOUT);
      }
    }
  }
}

function testAllWorkoutDaysPreservePrimarySequence() {
  const plan = buildGoalPlan({
    event: '10K',
    phase: 'base',
    slotCount: 30,
    workouts: [],
  });

  const rule = blankWeekRule(1);
  for (const day of WEEKDAYS) {
    rule.days[day] = DAY_ROLES.WORKOUT;
  }

  const schedule = schedulePlanIntoWeeks(
    plan.assignments,
    rule
  );

  assert.equal(schedule.trainingDaysPerWeek, 7);
  assert.equal(schedule.unscheduledCount, 0);

  assert.deepEqual(
    Object.fromEntries(
      plan.counts.map(item => [item.section, item.count])
    ),
    {
      Aerobic: 21,
      Threshold: 6,
      VO2max: 3,
    }
  );

  const scheduledSequence = schedule.weeks
    .flatMap(week => week.days)
    .filter(day => day.assignment)
    .map(day => day.assignment.primaryAnchor);

  assert.deepEqual(
    scheduledSequence,
    plan.assignments.map(item => item.primaryAnchor)
  );

  assert.equal(
    scheduledSequence.filter(item => item === 'Aerobic').length,
    21
  );
  assert.equal(
    scheduledSequence.filter(item => item === 'Threshold').length,
    6
  );
  assert.equal(
    scheduledSequence.filter(item => item === 'VO2max').length,
    3
  );
}

function testNoSelectedTrainingDaysCreatesScheduleGaps() {
  const assignments = [
    fakeAssignment(1, 'Aerobic'),
    fakeAssignment(2, 'Threshold'),
  ];

  const rule = blankWeekRule(1);
  for (const day of WEEKDAYS) {
    rule.days[day] = DAY_ROLES.UNAVAILABLE;
  }

  const schedule = schedulePlanIntoWeeks(
    assignments,
    rule
  );

  assert.equal(schedule.trainingDaysPerWeek, 0);
  assert.equal(schedule.unscheduledCount, 2);
  assert.ok(
    schedule.weeks[0].days.every(day => day.assignment === null)
  );
}


function testAutomaticSecondaryNeedRatiosAndWeeklyLongRun() {
  const counts = calculateSlotCounts({
    event: '10K',
    slotCount: 30,
  });
  const slots = buildSlotSequence(counts);

  const automatic = buildAutomaticSecondaryPlan({
    slots,
    phase: 'base',
    trainingDaysPerWeek: 5,
    hasLongRunDay: true,
  });

  assert.equal(automatic.totalWeeks, 6);
  assert.equal(automatic.summary.primaryCounts.Aerobic, 21);
  assert.equal(automatic.summary.primaryCounts.Threshold, 6);
  assert.equal(automatic.summary.primaryCounts.VO2max, 3);

  assert.equal(automatic.summary.countsByTarget.long_run, 6);
  assert.equal(
    (automatic.summary.countsByTarget.strides || 0) +
      (automatic.summary.countsByTarget.progressive || 0),
    4
  );
  assert.equal(
    (automatic.summary.countsByTarget.race_specific || 0) +
      (automatic.summary.countsByTarget.durability || 0),
    2
  );
  assert.equal(automatic.summary.countsByTarget.speed, 1);

  const longRunEntries = Object.entries(
    automatic.secondaryPlan
  ).filter(([, entry]) => entry.target === 'long_run');

  assert.deepEqual(
    longRunEntries.map(([, entry]) => entry.week),
    [1, 2, 3, 4, 5, 6]
  );

  for (const [slotNumber] of longRunEntries) {
    const slot = slots.find(
      item => item.slot === Number(slotNumber)
    );
    assert.equal(slot.primaryAnchor, 'Aerobic');
  }
}

function testAutomaticSecondariesDoNotChangePrimary701020() {
  const plan = buildGoalPlan({
    event: '10K',
    phase: 'base',
    slotCount: 30,
    workouts: [],
    secondaryContext: {
      trainingDaysPerWeek: 5,
      hasLongRunDay: true,
    },
  });

  assert.deepEqual(
    Object.fromEntries(
      plan.counts.map(item => [item.section, item.count])
    ),
    {
      Aerobic: 21,
      Threshold: 6,
      VO2max: 3,
    }
  );

  assert.equal(
    plan.assignments.filter(
      item => item.primaryAnchor === 'Aerobic'
    ).length,
    21
  );
  assert.equal(
    plan.assignments.filter(
      item => item.secondaryTarget === 'long_run'
    ).length,
    6
  );
}

function testWeeklyLongRunIsPlacedOnDesiredDay() {
  const plan = buildGoalPlan({
    event: '10K',
    phase: 'base',
    slotCount: 30,
    workouts: [],
    secondaryContext: {
      trainingDaysPerWeek: 5,
      hasLongRunDay: true,
    },
  });

  const rule = blankWeekRule(1);
  rule.days.thu = DAY_ROLES.UNAVAILABLE;
  rule.days.sat = DAY_ROLES.UNAVAILABLE;

  const schedule = schedulePlanIntoWeeks(
    plan.assignments,
    rule
  );

  assert.equal(schedule.weeks.length, 6);
  assert.equal(schedule.unscheduledCount, 0);

  for (const week of schedule.weeks) {
    const sunday = week.days.find(day => day.day === 'sun');
    assert.equal(sunday.placementType, 'long_run');
    assert.equal(sunday.assignment.primaryAnchor, 'Aerobic');
    assert.equal(sunday.assignment.secondaryTarget, 'long_run');
  }
}

function testSharpeningThresholdIsFiftyFiftyRaceSpecific() {
  const counts = calculateSlotCounts({
    event: '10K',
    slotCount: 30,
  });
  const slots = buildSlotSequence(counts);

  const automatic = buildAutomaticSecondaryPlan({
    slots,
    phase: 'sharpening',
    trainingDaysPerWeek: 5,
    hasLongRunDay: true,
  });

  assert.equal(
    automatic.summary.countsByTarget.race_specific,
    3
  );
  assert.equal(
    automatic.summary.countsByTarget.durability || 0,
    0
  );
}

function testMissingLongRunDayCreatesNeedGap() {
  const counts = calculateSlotCounts({
    event: '10K',
    slotCount: 30,
  });
  const slots = buildSlotSequence(counts);

  const automatic = buildAutomaticSecondaryPlan({
    slots,
    phase: 'base',
    trainingDaysPerWeek: 5,
    hasLongRunDay: false,
  });

  assert.ok(
    automatic.gaps.some(
      gap => gap.type === 'long_run_day_missing'
    )
  );
  assert.equal(
    automatic.summary.countsByTarget.long_run || 0,
    0
  );
}

function testBandsAndGroups() {
  assert.equal(performanceBandForScore(30), 1);
  assert.equal(performanceBandForScore(31), 2);
  assert.equal(performanceBandForScore(70), 2);
  assert.equal(performanceBandForScore(71), 3);
  assert.equal(scoreGroupForScore(85), 9);
  assert.equal(scoreGroupForScore(100), 10);
}


function testTrainingPhasePlaceholders() {
  assert.deepEqual(
    TRAINING_PHASES,
    ['loading', 'base', 'sharpening', 'tapering']
  );

  for (const phase of TRAINING_PHASES) {
    assert.equal(
      TRAINING_PHASE_CONFIG[phase].status,
      'placeholder'
    );
    assert.equal(
      TRAINING_PHASE_CONFIG[phase].rulesDefined,
      false
    );
  }

  assert.equal(
    normalizeTrainingPhase('Sharpening'),
    'sharpening'
  );
  assert.equal(
    normalizeTrainingPhase('unknown'),
    'base'
  );

  const loading = buildGoalPlan({
    event: '10K',
    phase: 'loading',
    slotCount: 10,
    workouts: [],
  });
  const base = buildGoalPlan({
    event: '10K',
    phase: 'base',
    slotCount: 10,
    workouts: [],
  });

  assert.equal(loading.phase, 'loading');
  assert.equal(base.phase, 'base');
  assert.deepEqual(loading.counts, base.counts);
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

testAutomaticSecondaryNeedRatiosAndWeeklyLongRun();
testAutomaticSecondariesDoNotChangePrimary701020();
testWeeklyLongRunIsPlacedOnDesiredDay();
testSharpeningThresholdIsFiftyFiftyRaceSpecific();
testMissingLongRunDayCreatesNeedGap();
testDefaultWeeklyAvailabilityPattern();
testUnavailableDaysAreNeverScheduled();
testCheckedDayCountControlsWeekCapacity();
testWorkoutOnlyUsesWorkoutDay();
testLongRunOnlyUsesLongRunDay();
testLongRunNeverUsesWorkoutDay();
testSpeedMayUseLongRunDayWhenNoLongRunExists();
testSpeedCannotUseEasyDay();
testReservedDaysCanFallBackToEasy();
testThirtySlotFiveDayRecurringAvailability();
testAllWorkoutDaysPreservePrimarySequence();
testNoSelectedTrainingDaysCreatesScheduleGaps();
testBandsAndGroups();
testTrainingPhasePlaceholders();
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
  'TATE weekly planner tests: PASS'
);
