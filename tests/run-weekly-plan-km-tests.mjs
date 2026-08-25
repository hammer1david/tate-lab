import assert from 'node:assert/strict';

import {
  applyWeeklyKmPlanToSchedule,
  stridesAddonKm,
} from '../src/tate-engine/weekly-plan-km.js';

function fakeMaterialize(
  workout,
  athlete
) {
  return {
    performanceBand:
      workout.band ?? 2,
    workDistanceKm:
      workout.workKm ?? null,
    athleteScore:
      athlete.score,
  };
}

assert.equal(
  stridesAddonKm({
    addonStatus: 'assigned',
    addonWorkout: {
      dynamicType: 'strides',
      dynamicConfig: {
        variant: {
          reps: 6,
          distance_m: 100,
        },
      },
    },
  }),
  0.6
);

const longRunWorkout = {
  id: 'LR',
  dynamicType: 'long_run',
  dynamicConfig: {
    phaseRules: [
      {
        phase: 'loading',
        active: true,
        weekly_km_share_default: 0.20,
        max_distance_km: 30,
      },
    ],
  },
};

const schedule = {
  trainingDaysPerWeek: 5,
  weeks: [
    {
      week: 1,
      trainingDays: 5,
      scheduledTrainingDays: 5,
      days: [
        {
          day: 'mon',
          assignment: {
            slot: 1,
            primaryAnchor: 'Aerobic',
            workout: {
              id: 'A',
              dynamicType: 'aerobic',
            },
          },
        },
        {
          day: 'tue',
          assignment: {
            slot: 2,
            primaryAnchor: 'Threshold',
            workout: {
              id: 'Q',
              workKm: 8,
              band: 2,
            },
          },
        },
        {
          day: 'wed',
          assignment: {
            slot: 3,
            primaryAnchor: 'Aerobic',
            workout: {
              id: 'REC',
              dynamicType: 'recovery',
            },
          },
        },
        {
          day: 'fri',
          assignment: {
            slot: 4,
            primaryAnchor: 'Aerobic',
            addonStatus: 'assigned',
            addonWorkout: {
              dynamicType: 'strides',
              dynamicConfig: {
                variant: {
                  reps: 6,
                  distance_m: 100,
                },
              },
            },
            workout: {
              id: 'A2',
              dynamicType: 'aerobic',
            },
          },
        },
        {
          day: 'sun',
          assignment: {
            slot: 5,
            primaryAnchor: 'Aerobic',
            workout: longRunWorkout,
          },
        },
      ],
    },
    {
      week: 2,
      trainingDays: 5,
      scheduledTrainingDays: 3,
      days: [
        {
          day: 'mon',
          assignment: {
            slot: 6,
            primaryAnchor: 'Aerobic',
            workout: {
              id: 'A3',
              dynamicType: 'aerobic',
            },
          },
        },
        {
          day: 'tue',
          assignment: {
            slot: 7,
            primaryAnchor: 'Threshold',
            workout: {
              id: 'Q2',
              workKm: 6,
              band: 2,
            },
          },
        },
        {
          day: 'sun',
          assignment: {
            slot: 8,
            primaryAnchor: 'Aerobic',
            workout: longRunWorkout,
          },
        },
      ],
    },
  ],
};

const result =
  applyWeeklyKmPlanToSchedule({
    schedule,
    phase: 'loading',
    scores: {
      Aerobic: 20,
      Threshold: 60,
    },
    current10k: '40:00',
    startWeeklyKm: 100,
    materializeWorkoutFn:
      fakeMaterialize,
  });

assert.equal(
  result.performanceBand,
  1
);
assert.equal(
  result.weeks[0]
    .fullWeekTargetKm,
  105
);
assert.equal(
  result.weeks[0]
    .targetWeeklyKm,
  105
);
assert.equal(
  result.weeks[0]
    .plannedKm,
  105
);
assert.equal(
  result.weeks[0].status,
  'balanced'
);

assert.equal(
  schedule.weeks[0]
    .days[1].plannedKm,
  10
);

assert.equal(
  schedule.weeks[0]
    .days[4].plannedKm,
  21
);

assert.equal(
  result.weeks[1]
    .fullWeekTargetKm,
  110.5
);
assert.equal(
  result.weeks[1]
    .completionShare,
  0.6
);
assert.equal(
  result.weeks[1]
    .targetWeeklyKm,
  66.5
);
assert.equal(
  result.weeks[1]
    .plannedKm,
  66.5
);

const incompleteSchedule = {
  trainingDaysPerWeek: 2,
  weeks: [
    {
      week: 1,
      trainingDays: 2,
      scheduledTrainingDays: 2,
      days: [
        {
          day: 'tue',
          assignment: {
            slot: 1,
            primaryAnchor: 'VO2max',
            workout: {
              id: 'HILLWORK',
              dynamicType: 'hillwork',
            },
          },
        },
        {
          day: 'thu',
          assignment: {
            slot: 2,
            primaryAnchor: 'Aerobic',
            workout: {
              id: 'A',
              dynamicType: 'aerobic',
            },
          },
        },
      ],
    },
  ],
};

const incomplete =
  applyWeeklyKmPlanToSchedule({
    schedule:
      incompleteSchedule,
    phase: 'base',
    scores: {
      Aerobic: 80,
      VO2max: 80,
    },
    current10k: '35:00',
    startWeeklyKm: 80,
    materializeWorkoutFn:
      fakeMaterialize,
  });

assert.equal(
  incomplete.weeks[0].status,
  'incomplete'
);
assert.equal(
  incomplete.hasIncompleteWeeks,
  true
);

const makeupSchedule = {
  trainingDaysPerWeek: 4,
  weeks: [
    {
      week: 1,
      trainingDays: 4,
      scheduledTrainingDays: 4,
      days: [
        {
          day: 'tue',
          simulated: true,
          missed: true,
          plannedKm: 10,
          assignment: {
            slot: 1,
            primaryAnchor: 'Threshold',
            workout: {
              id: 'Q',
              workKm: 8,
              band: 2,
            },
          },
        },
        {
          day: 'thu',
          assignment: {
            slot: 1,
            feedbackMakeup: true,
            primaryAnchor: 'Threshold',
            workout: {
              id: 'Q',
              workKm: 8,
              band: 2,
            },
          },
        },
        {
          day: 'sat',
          assignment: {
            slot: 2,
            primaryAnchor: 'Aerobic',
            workout: {
              id: 'A-MAKEUP-WEEK',
              dynamicType: 'aerobic',
            },
          },
        },
        {
          day: 'sun',
          assignment: {
            slot: 3,
            primaryAnchor: 'Aerobic',
            workout: longRunWorkout,
          },
        },
      ],
    },
  ],
};

const makeup =
  applyWeeklyKmPlanToSchedule({
    schedule: makeupSchedule,
    phase: 'loading',
    scores: {
      Aerobic: 50,
      Threshold: 50,
    },
    startWeeklyKm: 90,
    current10k: '40:00',
    materializeWorkoutFn:
      fakeMaterialize,
  });

assert.equal(
  makeupSchedule.weeks[0]
    .days[0].plannedKm,
  10
);
assert.equal(
  makeupSchedule.weeks[0]
    .days[1].plannedKm,
  10
);
assert.equal(
  makeup.weeks[0].status,
  'balanced'
);

console.log(
  'TATE real weekly km integration tests passed'
);
