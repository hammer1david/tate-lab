import assert from 'node:assert/strict';

import {
  QUALITY_WARMUP_COOLDOWN_KM_BY_BAND,
  allocateWeeklyKmBudget,
  calculateLongRunKm,
  qualitySessionTotalKm,
  qualityWarmupCooldownForBand,
} from '../src/tate-engine/weekly-km-budget.js';

assert.deepEqual(
  qualityWarmupCooldownForBand(1),
  {
    warmupKm: 0.5,
    cooldownKm: 0.5,
    totalKm: 1,
  }
);

assert.deepEqual(
  qualityWarmupCooldownForBand(2),
  {
    warmupKm: 1,
    cooldownKm: 1,
    totalKm: 2,
  }
);

assert.deepEqual(
  qualityWarmupCooldownForBand(3),
  {
    warmupKm: 2,
    cooldownKm: 2,
    totalKm: 4,
  }
);

assert.equal(
  QUALITY_WARMUP_COOLDOWN_KM_BY_BAND[1].totalKm,
  1
);

assert.equal(
  QUALITY_WARMUP_COOLDOWN_KM_BY_BAND[2].totalKm,
  2
);

assert.equal(
  QUALITY_WARMUP_COOLDOWN_KM_BY_BAND[3].totalKm,
  4
);

// Recovery jogging inside the workout is intentionally not part
// of this function. Only work km + band warm-up/cool-down count.
assert.equal(
  qualitySessionTotalKm({
    workKm: 8,
    performanceBand: 1,
  }),
  9
);

assert.equal(
  qualitySessionTotalKm({
    workKm: 8,
    performanceBand: 2,
  }),
  10
);

assert.equal(
  qualitySessionTotalKm({
    workKm: 8,
    performanceBand: 3,
  }),
  12
);

// Long Run gets no extra warm-up/cool-down.
assert.equal(
  calculateLongRunKm({
    targetWeeklyKm: 100,
    weeklyShare: 0.225,
    maxDistanceKm: 30,
  }),
  23
);

assert.equal(
  calculateLongRunKm({
    targetWeeklyKm: 150,
    weeklyShare: 0.225,
    maxDistanceKm: 30,
  }),
  30
);

const tueQuality =
  qualitySessionTotalKm({
    workKm: 8,
    performanceBand: 2,
  });

const friQuality =
  qualitySessionTotalKm({
    workKm: 9,
    performanceBand: 2,
  });

const balanced =
  allocateWeeklyKmBudget({
    targetWeeklyKm: 100,
    sessions: [
      {
        id: 'tue-quality',
        type: 'quality',
        fixedKm: tueQuality,
      },
      {
        id: 'fri-quality',
        type: 'quality',
        fixedKm: friQuality,
      },
      {
        id: 'sun-long',
        type: 'long_run',
        fixedKm: 22.5,
      },
      {
        id: 'mon-aerobic',
        type: 'aerobic',
        minKm: 6,
      },
      {
        id: 'wed-recovery',
        type: 'recovery',
        minKm: 5,
      },
      {
        id: 'thu-aerobic',
        type: 'aerobic',
        minKm: 6,
      },
      {
        id: 'sat-aerobic-strides',
        type: 'aerobic',
        minKm: 6,
        addonKm: 0.6,
      },
    ],
  });

assert.equal(
  balanced.status,
  'balanced'
);

assert.equal(
  balanced.allocatedTotalKm,
  100
);

assert.equal(
  balanced.fixedSessionKm,
  44
);

assert.equal(
  balanced.flexibleAddonKm,
  0.6
);

const byId =
  Object.fromEntries(
    balanced.sessions.map(
      session => [
        session.id,
        session.plannedKm,
      ]
    )
  );

assert.ok(
  byId['mon-aerobic'] >
    byId['wed-recovery']
);

assert.ok(
  byId['sat-aerobic-strides'] >
    6
);

const overBudget =
  allocateWeeklyKmBudget({
    targetWeeklyKm: 40,
    sessions: [
      {
        id: 'quality',
        type: 'quality',
        fixedKm:
          qualitySessionTotalKm({
            workKm: 16,
            performanceBand: 2,
          }),
      },
      {
        id: 'long',
        type: 'long_run',
        fixedKm: 24,
      },
      {
        id: 'easy',
        type: 'aerobic',
        minKm: 5,
      },
    ],
  });

assert.equal(
  overBudget.status,
  'over_budget'
);

assert.equal(
  overBudget.overByKm,
  7
);

const noFlexible =
  allocateWeeklyKmBudget({
    targetWeeklyKm: 30,
    sessions: [
      {
        id: 'quality',
        type: 'quality',
        fixedKm:
          qualitySessionTotalKm({
            workKm: 10,
            performanceBand: 2,
          }),
      },
      {
        id: 'long',
        type: 'long_run',
        fixedKm: 16,
      },
    ],
  });

assert.equal(
  noFlexible.status,
  'under_budget'
);

assert.equal(
  noFlexible.remainingKm,
  2
);

console.log(
  'TATE weekly km budget tests passed'
);
