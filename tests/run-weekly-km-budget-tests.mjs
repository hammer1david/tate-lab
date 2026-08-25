import assert from 'node:assert/strict';

import {
  allocateWeeklyKmBudget,
  calculateLongRunKm,
  qualitySessionTotalKm,
} from '../src/tate-engine/weekly-km-budget.js';

assert.equal(
  qualitySessionTotalKm({
    workKm: 8,
    warmupKm: 3,
    cooldownKm: 2,
  }),
  13
);

assert.equal(
  calculateLongRunKm({
    targetWeeklyKm: 100,
    weeklyShare: 0.225,
    maxDistanceKm: 30,
  }),
  22.5
);

assert.equal(
  calculateLongRunKm({
    targetWeeklyKm: 150,
    weeklyShare: 0.225,
    maxDistanceKm: 30,
  }),
  30
);

const balanced =
  allocateWeeklyKmBudget({
    targetWeeklyKm: 100,
    sessions: [
      {
        id: 'tue-quality',
        type: 'quality',
        fixedKm: 13,
      },
      {
        id: 'fri-quality',
        type: 'quality',
        fixedKm: 14,
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
  49.5
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
        fixedKm: 18,
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
        fixedKm: 12,
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
