import assert from 'node:assert/strict';

import {
  WEEKLY_KM_DECISIONS,
  WEEKLY_KM_PHASE_RULES,
  WEEKLY_KM_RECOVER_RATE,
  buildAdaptiveWeeklyKmBlock,
  buildWeeklyKmBlock,
  calculateAdaptiveNextWeeklyKm,
  calculateNextWeeklyKm,
  loadingWeeklyRateForBand,
  normalizePerformanceBand,
  normalizeWeeklyKmDecision,
  normalizeWeeklyKmPhase,
  roundWeeklyKm,
} from '../src/tate-engine/weekly-km-calculator.js';

assert.equal(
  normalizeWeeklyKmPhase(
    'Base Building'
  ),
  'base'
);

assert.equal(
  normalizeWeeklyKmPhase(
    'Loading'
  ),
  'loading'
);

assert.equal(
  normalizeWeeklyKmPhase(
    'Sharpening'
  ),
  'sharpening'
);

assert.equal(
  normalizeWeeklyKmPhase(
    'Taper'
  ),
  'tapering'
);

assert.equal(
  normalizePerformanceBand(1),
  1
);

assert.equal(
  normalizePerformanceBand('2'),
  2
);

assert.throws(
  () =>
    normalizePerformanceBand(4),
  /performanceBand/
);

assert.equal(
  WEEKLY_KM_PHASE_RULES.base
    .weeklyRate,
  0.01
);

assert.equal(
  loadingWeeklyRateForBand(1),
  0.05
);

assert.equal(
  loadingWeeklyRateForBand(2),
  0.03
);

assert.equal(
  loadingWeeklyRateForBand(3),
  0.03
);

assert.equal(
  WEEKLY_KM_PHASE_RULES.sharpening
    .weeklyRate,
  -0.03
);

assert.equal(
  WEEKLY_KM_PHASE_RULES.tapering
    .peakShare,
  0.50
);

assert.equal(
  roundWeeklyKm(101.24),
  101
);

assert.equal(
  roundWeeklyKm(101.51),
  102
);

const base = calculateNextWeeklyKm({
  previousWeeklyKm: 100,
  phase: 'base',
  performanceBand: 1,
});

assert.equal(
  base.targetWeeklyKm,
  101
);

assert.equal(
  base.changePercent,
  1
);

const loadingBand1 =
  calculateNextWeeklyKm({
    previousWeeklyKm: 100,
    phase: 'loading',
    performanceBand: 1,
  });

assert.equal(
  loadingBand1.targetWeeklyKm,
  105
);

assert.equal(
  loadingBand1.changePercent,
  5
);

const loadingBand2 =
  calculateNextWeeklyKm({
    previousWeeklyKm: 100,
    phase: 'loading',
    performanceBand: 2,
  });

assert.equal(
  loadingBand2.targetWeeklyKm,
  103
);

assert.equal(
  loadingBand2.changePercent,
  3
);

const loadingBand3 =
  calculateNextWeeklyKm({
    previousWeeklyKm: 100,
    phase: 'loading',
    performanceBand: 3,
  });

assert.equal(
  loadingBand3.targetWeeklyKm,
  103
);

assert.equal(
  loadingBand3.changePercent,
  3
);

const sharpening =
  calculateNextWeeklyKm({
    previousWeeklyKm: 100,
    phase: 'sharpening',
    performanceBand: 3,
  });

assert.equal(
  sharpening.targetWeeklyKm,
  97
);

assert.equal(
  sharpening.changePercent,
  -3
);

const taper =
  calculateNextWeeklyKm({
    previousWeeklyKm: 110,
    phase: 'tapering',
    performanceBand: 3,
    peakWeeklyKm: 120,
  });

assert.equal(
  taper.targetWeeklyKm,
  60
);

assert.equal(
  taper.calculation.peakShare,
  0.50
);

const band1LoadingBlock =
  buildWeeklyKmBlock({
    startWeeklyKm: 100,
    phase: 'loading',
    performanceBand: 1,
    weeks: 4,
  });

assert.deepEqual(
  band1LoadingBlock.map(
    week =>
      week.targetWeeklyKm
  ),
  [105, 110, 116, 122]
);

const band2LoadingBlock =
  buildWeeklyKmBlock({
    startWeeklyKm: 100,
    phase: 'loading',
    performanceBand: 2,
    weeks: 4,
  });

assert.deepEqual(
  band2LoadingBlock.map(
    week =>
      week.targetWeeklyKm
  ),
  [103, 106, 109, 112]
);

const taperBlock =
  buildWeeklyKmBlock({
    startWeeklyKm: 110,
    phase: 'tapering',
    performanceBand: 3,
    weeks: 1,
    peakWeeklyKm: 120,
  });

assert.deepEqual(
  taperBlock.map(
    week =>
      week.targetWeeklyKm
  ),
  [60]
);
assert.deepEqual(
  WEEKLY_KM_DECISIONS,
  [
    'recover',
    'maintain',
    'progress',
  ]
);

assert.equal(
  WEEKLY_KM_RECOVER_RATE,
  0.05
);

assert.equal(
  normalizeWeeklyKmDecision(
    'PROGRESS'
  ),
  'progress'
);

assert.equal(
  normalizeWeeklyKmDecision(
    'hold'
  ),
  'maintain'
);

assert.equal(
  normalizeWeeklyKmDecision(
    'deload'
  ),
  'recover'
);


const adaptiveProgress =
  calculateAdaptiveNextWeeklyKm({
    previousWeeklyKm: 100,
    phase: 'loading',
    performanceBand: 3,
    decision: 'progress',
  });

assert.equal(
  adaptiveProgress.targetWeeklyKm,
  103
);

assert.equal(
  adaptiveProgress.decision,
  'progress'
);


const adaptiveMaintain =
  calculateAdaptiveNextWeeklyKm({
    previousWeeklyKm: 100,
    phase: 'loading',
    performanceBand: 3,
    decision: 'maintain',
  });

assert.equal(
  adaptiveMaintain.targetWeeklyKm,
  100
);


const adaptiveRecover =
  calculateAdaptiveNextWeeklyKm({
    previousWeeklyKm: 100,
    phase: 'loading',
    performanceBand: 3,
    decision: 'recover',
  });

assert.equal(
  adaptiveRecover.targetWeeklyKm,
  95
);


const sharpeningMaintain =
  calculateAdaptiveNextWeeklyKm({
    previousWeeklyKm: 100,
    phase: 'sharpening',
    performanceBand: 3,
    decision: 'maintain',
  });

assert.equal(
  sharpeningMaintain.targetWeeklyKm,
  97
);


const sharpeningRecover =
  calculateAdaptiveNextWeeklyKm({
    previousWeeklyKm: 100,
    phase: 'sharpening',
    performanceBand: 3,
    decision: 'recover',
  });

assert.equal(
  sharpeningRecover.targetWeeklyKm,
  95
);


const taperMaintain =
  calculateAdaptiveNextWeeklyKm({
    previousWeeklyKm: 110,
    phase: 'tapering',
    performanceBand: 3,
    peakWeeklyKm: 120,
    decision: 'maintain',
  });

assert.equal(
  taperMaintain.targetWeeklyKm,
  60
);


const taperRecover =
  calculateAdaptiveNextWeeklyKm({
    previousWeeklyKm: 110,
    phase: 'tapering',
    performanceBand: 3,
    peakWeeklyKm: 120,
    decision: 'recover',
  });

assert.equal(
  taperRecover.targetWeeklyKm,
  60
);


const adaptiveBlock =
  buildAdaptiveWeeklyKmBlock({
    startWeeklyKm: 100,
    phase: 'loading',
    performanceBand: 3,
    weeks: 4,
    decisions: [
      'progress',
      'maintain',
      'recover',
      'progress',
    ],
  });

assert.deepEqual(
  adaptiveBlock.map(
    week =>
      week.targetWeeklyKm
  ),
  [
    103,
    103,
    98,
    101,
  ]
);

assert.deepEqual(
  adaptiveBlock.map(
    week =>
      week.decision
  ),
  [
    'progress',
    'maintain',
    'recover',
    'progress',
  ]
);
console.log(
  'TATE weekly km calculator tests passed'
);
