import assert from 'node:assert/strict';

import {
  applyDistanceSelectionLayer,
  LONG_RUN_SHARE_PATTERN,
} from '../src/tate-engine/distance-selection.js';

const distanceProfiles = [
  {
    distance_mode: 'short',
    multiplier_min: 0.75,
    multiplier_default: 0.80,
    multiplier_max: 0.85,
    active: true,
  },
  {
    distance_mode: 'normal',
    multiplier_min: 0.90,
    multiplier_default: 1.00,
    multiplier_max: 1.10,
    active: true,
  },
  {
    distance_mode: 'longer',
    multiplier_min: 1.15,
    multiplier_default: 1.25,
    multiplier_max: 1.35,
    active: true,
  },
];

const aerobicPhaseRules = [
  {
    phase: 'loading',
    active: true,

    longer_max_sessions_per_week: 2,

    pre_quality_pace_level:
      'easy',

    pre_quality_distance_mode:
      'short',

    post_quality_pace_level:
      'easy',

    post_quality_distance_mode:
      'short',
  },
];

const generationRule = {
  prefer_distance_variation: true,
  avoid_same_distance_mode_streak: true,
};

function aerobic(slot) {
  return {
    slot,
    primaryAnchor: 'Aerobic',

    workout: {
      id: `A-${slot}`,
      dynamicType: 'aerobic',

      dynamicConfig: {
        generationRule,
        distanceProfiles,

        phaseRules:
          aerobicPhaseRules,
      },
    },
  };
}

function progressive(slot) {
  return {
    slot,
    primaryAnchor: 'Aerobic',

    workout: {
      id: `P-${slot}`,
      dynamicType: 'progressive',

      dynamicConfig: {
        generationRule,
        distanceProfiles,

        phaseRules:
          aerobicPhaseRules,
      },
    },
  };
}
function quality(slot) {
  return {
    slot,
    primaryAnchor: 'Threshold',

    workout: {
      id: `Q-${slot}`,
    },
  };
}

const longRunRules = [
  {
    phase: 'loading',
    active: true,

    long_run_allowed: true,
    sessions_per_week: 1,

    weekly_km_share_min: 0.18,

    weekly_km_share_default:
      0.205,

    weekly_km_share_max: 0.23,
  },
  {
    phase: 'taper',
    active: true,

    long_run_allowed: false,
    sessions_per_week: 0,

    weekly_km_share_min: 0.10,

    weekly_km_share_default:
      0.125,

    weekly_km_share_max: 0.15,
  },
];

function longRun(slot) {
  return {
    slot,
    primaryAnchor: 'Aerobic',

    workout: {
      id: `LR-${slot}`,
      dynamicType: 'long_run',

      dynamicConfig: {
        phaseRules:
          longRunRules,
      },
    },
  };
}

const schedule = {
  weeks: [
    {
      week: 1,

      days: [
        {
          day: 'mon',
          assignment: aerobic(1),
          placementType: 'easy',
        },
        {
          day: 'tue',
          assignment: quality(2),
          placementType: 'workout',
        },
        {
          day: 'wed',
          assignment: aerobic(3),
          placementType: 'easy',
        },
        {
          day: 'thu',
          assignment: aerobic(4),
          placementType: 'easy',
        },
        {
          day: 'fri',
          assignment: null,
          placementType: null,
        },
        {
          day: 'sat',
          assignment: aerobic(5),
          placementType: 'easy',
        },
        {
          day: 'sun',
          assignment: longRun(6),
          placementType:
            'long_run',
        },
      ],
    },

    {
      week: 2,

      days: [
        {
          day: 'mon',
          assignment: aerobic(7),
          placementType: 'easy',
        },
        {
          day: 'tue',
          assignment: null,
        },
        {
          day: 'wed',
          assignment: aerobic(8),
          placementType: 'easy',
        },
        {
          day: 'thu',
          assignment: null,
        },
        {
          day: 'fri',
          assignment: aerobic(9),
          placementType: 'easy',
        },
        {
          day: 'sat',
          assignment: null,
        },
        {
          day: 'sun',
          assignment: longRun(10),
          placementType:
            'long_run',
        },
      ],
    },

    {
      week: 3,
      days: [
        {
          day: 'mon',
          assignment: aerobic(11),
        },
        {
          day: 'wed',
          assignment: aerobic(12),
        },
        {
          day: 'fri',
          assignment: aerobic(13),
        },
        {
          day: 'sun',
          assignment: longRun(14),
          placementType:
            'long_run',
        },
      ],
    },

    {
      week: 4,
      days: [
        {
          day: 'mon',
          assignment: aerobic(15),
        },
        {
          day: 'wed',
          assignment: aerobic(16),
        },
        {
          day: 'fri',
          assignment: aerobic(17),
        },
        {
          day: 'sun',
          assignment: longRun(18),
          placementType:
            'long_run',
        },
      ],
    },
  ],
};

const result =
  applyDistanceSelectionLayer({
    schedule,
    phase: 'loading',
  });

assert.deepEqual(
  LONG_RUN_SHARE_PATTERN,
  [
    'default',
    'max',
    'default',
    'min',
  ]
);

assert.equal(
  schedule.weeks[0]
    .days[0]
    .assignment
    .aerobicDistanceMode,
  'short'
);

assert.equal(
  schedule.weeks[0]
    .days[0]
    .assignment
    .aerobicPaceLevel,
  'easy'
);

assert.equal(
  schedule.weeks[0]
    .days[2]
    .assignment
    .aerobicDistanceMode,
  'short'
);

assert.notEqual(
  schedule.weeks[0]
    .days[0]
    .assignment
    .aerobicDistanceMultiplier,

  schedule.weeks[0]
    .days[2]
    .assignment
    .aerobicDistanceMultiplier
);

const week2Modes =
  schedule.weeks[1]
    .days
    .filter(
      day =>
        day.assignment
          ?.workout
          ?.dynamicType ===
        'aerobic'
    )
    .map(
      day =>
        day.assignment
          .aerobicDistanceMode
    );

assert.ok(
  new Set(
    week2Modes
  ).size > 1
);

assert.ok(
  week2Modes.filter(
    mode =>
      mode === 'longer'
  ).length <= 2
);

assert.deepEqual(
  result.longRun.map(
    item =>
      item.mode
  ),
  [
    'default',
    'max',
    'default',
    'min',
  ]
);

assert.deepEqual(
  result.longRun.map(
    item =>
      item.weeklyShare
  ),
  [
    0.205,
    0.23,
    0.205,
    0.18,
  ]
);


const forcedShortSchedule = {
  weeks: [
    {
      week: 1,

      days: [
        {
          day: 'mon',
          assignment: aerobic(101),
          placementType: 'easy',
        },
        {
          day: 'tue',
          assignment: quality(102),
          placementType: 'workout',
        },
        {
          day: 'wed',
          assignment: aerobic(103),
          placementType: 'easy',
        },
        {
          day: 'thu',
          assignment: progressive(104),
          placementType: 'easy',
        },
        {
          day: 'fri',
          assignment: quality(105),
          placementType: 'workout',
        },
        {
          day: 'sat',
          assignment: aerobic(106),
          placementType: 'easy',
        },
        {
          day: 'sun',
          assignment: longRun(107),
          placementType: 'long_run',
        },
      ],
    },
  ],
};

const forcedShort =
  applyDistanceSelectionLayer({
    schedule:
      forcedShortSchedule,
    phase: 'loading',
  });

assert.deepEqual(
  forcedShort.aerobic.map(
    item =>
      item.mode
  ),
  [
    'short',
    'short',
    'short',
    'short',
  ]
);

assert.deepEqual(
  forcedShort.aerobic.map(
    item =>
      item.distributionFactor
  ),
  [
    1.15,
    0.85,
    1.15,
    1.00,
  ]
);

assert.equal(
  forcedShortSchedule
    .weeks[0]
    .days[3]
    .assignment
    .workout
    .dynamicType,
  'progressive'
);

assert.equal(
  forcedShortSchedule
    .weeks[0]
    .days[3]
    .assignment
    .aerobicDistanceMode,
  'short'
);

const forcedWeights =
  forcedShort.aerobic.map(
    item =>
      item.budgetWeight
  );

assert.ok(
  Math.max(...forcedWeights) /
    Math.min(...forcedWeights) >
    1.30
);
const taperSchedule = {
  weeks: [
    {
      week: 1,

      days: [
        {
          day: 'sun',

          assignment:
            longRun(99),

          placementType:
            'long_run',
        },
      ],
    },
  ],
};

const taper =
  applyDistanceSelectionLayer({
    schedule:
      taperSchedule,

    phase:
      'tapering',
  });

assert.equal(
  taper.longRun[0].allowed,
  false
);

console.log(
  'TATE distance selection layer tests passed'
);
