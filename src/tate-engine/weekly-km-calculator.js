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
export const WEEKLY_KM_DECISIONS = Object.freeze([
  'recover',
  'maintain',
  'progress',
]);

export const WEEKLY_KM_RECOVER_RATE = 0.05;

export function normalizeWeeklyKmDecision(value) {
  const key = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '');

  const aliases = {
    recover: 'recover',
    recovery: 'recover',
    reduce: 'recover',
    deload: 'recover',

    maintain: 'maintain',
    hold: 'maintain',
    stable: 'maintain',

    progress: 'progress',
    progression: 'progress',
    advance: 'progress',
  };

  return aliases[key] || 'progress';
}
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
export function calculateAdaptiveNextWeeklyKm({
  previousWeeklyKm,
  phase = 'base',
  performanceBand = 2,
  peakWeeklyKm = previousWeeklyKm,
  decision = 'progress',
  recoverRate = WEEKLY_KM_RECOVER_RATE,
  roundingStep = 1,
} = {}) {
  const previous = positiveNumber(
    previousWeeklyKm,
    'previousWeeklyKm'
  );

  const normalizedDecision =
    normalizeWeeklyKmDecision(decision);

  const phaseResult =
    calculateNextWeeklyKm({
      previousWeeklyKm: previous,
      phase,
      performanceBand,
      peakWeeklyKm,
      roundingStep,
    });

  const phaseTarget =
    phaseResult.targetWeeklyKm;

  let targetWeeklyKm;
  let decisionCalculation;

  if (normalizedDecision === 'progress') {
    targetWeeklyKm = phaseTarget;

    decisionCalculation = {
      mode: 'follow_phase',
      phaseTargetWeeklyKm: phaseTarget,
    };
  } else if (
    normalizedDecision === 'maintain'
  ) {
    /*
     * Maintain blocks an increase,
     * but it must never cancel a planned
     * phase reduction such as Sharpening
     * or Tapering.
     */
    targetWeeklyKm = Math.min(
      previous,
      phaseTarget
    );

    targetWeeklyKm = roundWeeklyKm(
      targetWeeklyKm,
      roundingStep
    );

    decisionCalculation = {
      mode: 'hold_or_phase_reduce',
      previousWeeklyKm: previous,
      phaseTargetWeeklyKm: phaseTarget,
    };
  } else {
    const rate = Math.max(
      0,
      Number(recoverRate) ||
        WEEKLY_KM_RECOVER_RATE
    );

    const recoveryTarget =
      roundWeeklyKm(
        previous * (1 - rate),
        roundingStep
      );

    /*
     * Recover reduces volume,
     * but if the phase already prescribes
     * an even larger reduction
     * (for example Taper),
     * the lower phase target wins.
     */
    targetWeeklyKm = Math.min(
      phaseTarget,
      recoveryTarget
    );

    decisionCalculation = {
      mode: 'recover',
      previousWeeklyKm: previous,
      recoverRate: rate,
      recoveryTargetWeeklyKm:
        recoveryTarget,
      phaseTargetWeeklyKm:
        phaseTarget,
    };
  }

  return {
    ...phaseResult,

    decision: normalizedDecision,

    phaseTargetWeeklyKm:
      phaseTarget,

    targetWeeklyKm,

    changeKm:
      Math.round(
        (
          targetWeeklyKm -
          previous
        ) * 1000
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

    decisionCalculation,
  };
}

export function buildAdaptiveWeeklyKmBlock({
  startWeeklyKm,
  phase = 'base',
  performanceBand = 2,
  weeks = 1,
  peakWeeklyKm = startWeeklyKm,
  decisions = [],
  recoverRate = WEEKLY_KM_RECOVER_RATE,
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

  const output = [];

  for (
    let week = 1;
    week <= count;
    week += 1
  ) {
    const decision =
      decisions[week - 1] ??
      'progress';

    const result =
      calculateAdaptiveNextWeeklyKm({
        previousWeeklyKm:
          previous,

        phase,

        performanceBand,

        peakWeeklyKm,

        decision,

        recoverRate,

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
