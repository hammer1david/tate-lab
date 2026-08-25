export const WEEKLY_KM_PHASE_RULES = Object.freeze({
  base: Object.freeze({
    mode: 'compound',
    weeklyRate: 0.01,
    label: 'Base Building',
  }),

  loading: Object.freeze({
    mode: 'band_compound',
    weeklyRatesByBand: Object.freeze({
      1: 0.05,
      2: 0.03,
      3: 0.03,
    }),
    label: 'Loading',
  }),

  sharpening: Object.freeze({
    mode: 'compound',
    weeklyRate: -0.03,
    label: 'Sharpening',
  }),

  tapering: Object.freeze({
    mode: 'peak_share',
    peakShare: 0.50,
    label: 'Tapering',
  }),
});

export function normalizeWeeklyKmPhase(value) {
  const key = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '');

  const aliases = {
    base: 'base',
    basebuilding: 'base',
    basetraining: 'base',
    loading: 'loading',
    load: 'loading',
    sharpening: 'sharpening',
    sharpen: 'sharpening',
    tapering: 'tapering',
    taper: 'tapering',
  };

  return aliases[key] || 'base';
}

export function normalizePerformanceBand(value) {
  const band = Number(value);

  if (![1, 2, 3].includes(band)) {
    throw new RangeError(
      'performanceBand must be 1, 2, or 3.'
    );
  }

  return band;
}

function positiveNumber(value, name) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new TypeError(
      `${name} must be a positive number.`
    );
  }

  return parsed;
}

export function roundWeeklyKm(value, step = 1) {
  const km = positiveNumber(value, 'weekly km');
  const roundingStep = positiveNumber(
    step,
    'rounding step'
  );

  return (
    Math.round(km / roundingStep) *
    roundingStep
  );
}

export function loadingWeeklyRateForBand(
  performanceBand
) {
  const band =
    normalizePerformanceBand(
      performanceBand
    );

  return WEEKLY_KM_PHASE_RULES.loading
    .weeklyRatesByBand[band];
}

/**
 * Calculates the target for the NEXT week.
 *
 * Base Building:
 *   previous weekly km × 1.01
 *
 * Loading:
 *   Band 1: previous weekly km × 1.05
 *   Band 2: previous weekly km × 1.03
 *   Band 3: previous weekly km × 1.03
 *
 * Sharpening:
 *   previous weekly km × 0.97
 *
 * Tapering:
 *   50% of peak weekly km.
 *
 * Taper is intentionally calculated from peak volume,
 * not from the previous already-reduced week.
 */
export function calculateNextWeeklyKm({
  previousWeeklyKm,
  phase = 'base',
  performanceBand = 2,
  peakWeeklyKm = previousWeeklyKm,
  roundingStep = 1,
} = {}) {
  const previous = positiveNumber(
    previousWeeklyKm,
    'previousWeeklyKm'
  );

  const normalizedPhase =
    normalizeWeeklyKmPhase(phase);

  const band =
    normalizePerformanceBand(
      performanceBand
    );

  const rule =
    WEEKLY_KM_PHASE_RULES[
      normalizedPhase
    ];

  let rawTargetKm;
  let calculation;

  if (rule.mode === 'peak_share') {
    const peak = positiveNumber(
      peakWeeklyKm,
      'peakWeeklyKm'
    );

    rawTargetKm =
      peak *
      rule.peakShare;

    calculation = {
      mode: 'peak_share',
      peakWeeklyKm: peak,
      peakShare: rule.peakShare,
    };
  } else {
    const weeklyRate =
      rule.mode === 'band_compound'
        ? loadingWeeklyRateForBand(
            band
          )
        : rule.weeklyRate;

    rawTargetKm =
      previous *
      (1 + weeklyRate);

    calculation = {
      mode:
        rule.mode ===
        'band_compound'
          ? 'band_compound'
          : 'compound',
      previousWeeklyKm: previous,
      weeklyRate,
      performanceBand: band,
    };
  }

  const targetWeeklyKm =
    roundWeeklyKm(
      rawTargetKm,
      roundingStep
    );

  return {
    phase: normalizedPhase,
    phaseLabel: rule.label,
    performanceBand: band,
    previousWeeklyKm: previous,
    targetWeeklyKm,
    rawTargetKm,
    changeKm:
      Math.round(
        (
          targetWeeklyKm -
          previous
        ) *
          1000
      ) / 1000,
    changePercent:
      Math.round(
        (
          (
            targetWeeklyKm /
              previous -
            1
          ) *
          100
        ) *
          100
      ) / 100,
    calculation,
  };
}

/**
 * Builds several consecutive target weeks.
 *
 * Base / Loading / Sharpening compound from the
 * previous generated week.
 *
 * Tapering always targets 50% of peak volume.
 * TWETE currently expects tapering to usually be
 * one week, but repeated calls remain deterministic.
 */
export function buildWeeklyKmBlock({
  startWeeklyKm,
  phase = 'base',
  performanceBand = 2,
  weeks = 1,
  peakWeeklyKm = startWeeklyKm,
  roundingStep = 1,
} = {}) {
  let previous = positiveNumber(
    startWeeklyKm,
    'startWeeklyKm'
  );

  const count = Math.max(
    1,
    Math.floor(
      Number(weeks) || 1
    )
  );

  const normalizedPhase =
    normalizeWeeklyKmPhase(phase);

  const band =
    normalizePerformanceBand(
      performanceBand
    );

  const output = [];

  for (
    let week = 1;
    week <= count;
    week += 1
  ) {
    const result =
      calculateNextWeeklyKm({
        previousWeeklyKm:
          previous,
        phase:
          normalizedPhase,
        performanceBand:
          band,
        peakWeeklyKm,
        roundingStep,
      });

    output.push({
      weekInPhase: week,
      ...result,
    });

    previous =
      result.targetWeeklyKm;
  }

  return output;
}
