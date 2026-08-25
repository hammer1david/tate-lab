import assert from 'node:assert/strict';

import {
  WEEKLY_KM_PHASE_RULES,
  buildWeeklyKmBlock,
  calculateNextWeeklyKm,
  loadingWeeklyRateForBand,
  normalizePerformanceBand,
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
  roundWeeklyKm(101.26),
  101.5
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
  [105, 110.5, 116, 122]
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
  [103, 106, 109, 112.5]
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

console.log(
  'TATE weekly km calculator tests passed'
);
