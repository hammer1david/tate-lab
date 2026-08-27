import { normalizeStimulus } from './database-library.js';

export const PROGRESSION_DECISIONS = Object.freeze([
  'recover',
  'maintain',
  'progress',
]);

export const PROGRESSION_LEVERS = Object.freeze([
  'reps',
  'pace',
  'recovery',
  'block_recovery',
]);

const STIMULUS_PROGRESS_ORDER = Object.freeze({
  Threshold: Object.freeze([
    'reps',
    'pace',
    'recovery',
    'block_recovery',
  ]),
  VO2max: Object.freeze([
    'reps',
    'recovery',
    'pace',
    'block_recovery',
  ]),
  'Race Specific': Object.freeze([
    'reps',
    'pace',
    'recovery',
    'block_recovery',
  ]),
  '10K Specific': Object.freeze([
    'reps',
    'pace',
    'recovery',
    'block_recovery',
  ]),
  'Speed Endurance': Object.freeze([
    'reps',
    'recovery',
    'pace',
    'block_recovery',
  ]),
  Speed: Object.freeze([
    'reps',
    'recovery',
    'pace',
    'block_recovery',
  ]),
});

const STIMULUS_RECOVER_ORDER = Object.freeze({
  Threshold: Object.freeze([
    'reps',
    'pace',
    'recovery',
    'block_recovery',
  ]),
  VO2max: Object.freeze([
    'reps',
    'pace',
    'recovery',
    'block_recovery',
  ]),
  'Race Specific': Object.freeze([
    'reps',
    'pace',
    'recovery',
    'block_recovery',
  ]),
  '10K Specific': Object.freeze([
    'reps',
    'pace',
    'recovery',
    'block_recovery',
  ]),
  'Speed Endurance': Object.freeze([
    'reps',
    'pace',
    'recovery',
    'block_recovery',
  ]),
  Speed: Object.freeze([
    'reps',
    'pace',
    'recovery',
    'block_recovery',
  ]),
});

function finiteNumber(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function clone(value) {
  return typeof structuredClone === 'function'
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}

function roundWorkKm(value) {
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 1000) / 1000;
}

export function normalizeProgressionDecision(value) {
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

  return aliases[key] || 'maintain';
}

export function progressionCapabilities(workout = {}) {
  return {
    reps: workout.progress_reps === true,
    pace: workout.progress_pace === true,
    recovery: workout.progress_recovery === true,
    block_recovery:
      workout.progress_block_recovery === true,
  };
}

export function progressionLeverOrder({
  workout = {},
  decision = 'maintain',
  recentLevers = [],
} = {}) {
  const normalizedDecision =
    normalizeProgressionDecision(decision);

  if (normalizedDecision === 'maintain') {
    return [];
  }

  const stimulus = normalizeStimulus(
    workout.stimulus
  );

  const baseOrder =
    normalizedDecision === 'recover'
      ? STIMULUS_RECOVER_ORDER[stimulus]
      : STIMULUS_PROGRESS_ORDER[stimulus];

  const fallbackOrder = normalizedDecision === 'recover'
    ? ['reps', 'pace', 'recovery', 'block_recovery']
    : ['reps', 'pace', 'recovery', 'block_recovery'];

  const capabilities = progressionCapabilities(workout);
  const eligible = (baseOrder || fallbackOrder)
    .filter(lever => capabilities[lever]);

  if (eligible.length <= 1 || !recentLevers.length) {
    return eligible;
  }

  const recent = new Set(
    recentLevers
      .map(value => String(value || '').trim())
      .filter(Boolean)
  );

  return [
    ...eligible.filter(lever => !recent.has(lever)),
    ...eligible.filter(lever => recent.has(lever)),
  ];
}

function workoutRecentUseCount(workoutId, recentWorkoutIds = []) {
  return recentWorkoutIds.reduce(
    (count, id) => count + (id === workoutId ? 1 : 0),
    0
  );
}

function sameStimulusCandidates(currentWorkout, candidates = []) {
  const stimulus = normalizeStimulus(
    currentWorkout?.stimulus
  );

  return candidates.filter(candidate =>
    candidate &&
    candidate.active !== false &&
    normalizeStimulus(candidate.stimulus) === stimulus
  );
}

function candidateSort(a, b, recentWorkoutIds) {
  const aRecent = workoutRecentUseCount(
    a.id,
    recentWorkoutIds
  );
  const bRecent = workoutRecentUseCount(
    b.id,
    recentWorkoutIds
  );

  if (aRecent !== bRecent) {
    return aRecent - bRecent;
  }

  if (a.role !== b.role) {
    return a.role === 'priority' ? -1 : 1;
  }

  return String(a.id).localeCompare(String(b.id));
}

/**
 * History-aware family selector.
 *
 * Maintain/Recover stay on the current family so TATE changes only the
 * prescribed load, not the workout identity at the same time.
 *
 * Progress normally stays on the current family while it has progression
 * levers. If the family has been used repeatedly in the recent quality
 * history, or has no progression lever at all, TATE rotates to the least
 * recently used same-stimulus family.
 */
export function selectProgressionFamily({
  currentWorkout,
  candidates = [],
  decision = 'maintain',
  recentWorkoutIds = [],
  repeatLimit = 2,
} = {}) {
  if (!currentWorkout) {
    return {
      workout: null,
      switched: false,
      reason: 'No current workout family was supplied.',
    };
  }

  const normalizedDecision =
    normalizeProgressionDecision(decision);

  if (normalizedDecision !== 'progress') {
    return {
      workout: currentWorkout,
      switched: false,
      reason:
        normalizedDecision === 'recover'
          ? 'Recover keeps the current workout family and reduces one allowed load variable.'
          : 'Maintain keeps the current workout family unchanged.',
    };
  }

  const currentLevers = progressionLeverOrder({
    workout: currentWorkout,
    decision: normalizedDecision,
  });

  const recentUses = workoutRecentUseCount(
    currentWorkout.id,
    recentWorkoutIds
  );

  const shouldRotate =
    currentLevers.length === 0 ||
    recentUses >= Math.max(1, Number(repeatLimit) || 2);

  if (!shouldRotate) {
    return {
      workout: currentWorkout,
      switched: false,
      reason:
        'Progress stays in the current family because an allowed progression lever is still available and recent-use rotation is not required.',
    };
  }

  const alternatives = sameStimulusCandidates(
    currentWorkout,
    candidates
  )
    .filter(candidate => candidate.id !== currentWorkout.id)
    .filter(candidate =>
      progressionLeverOrder({
        workout: candidate,
        decision: normalizedDecision,
      }).length > 0 || currentLevers.length === 0
    )
    .sort((a, b) =>
      candidateSort(a, b, recentWorkoutIds)
    );

  if (!alternatives.length) {
    return {
      workout: currentWorkout,
      switched: false,
      reason:
        'No eligible same-stimulus alternative exists, so TATE keeps the current family.',
    };
  }

  return {
    workout: alternatives[0],
    switched: true,
    reason:
      recentUses >= repeatLimit
        ? 'Recent-use rotation: the current family reached the repeat limit, so TATE selected the least-recent same-stimulus alternative.'
        : 'The current family has no usable progression lever, so TATE selected a same-stimulus alternative.',
  };
}

function bandDefault(workout, performanceBand, blockNumber) {
  return (workout.bandDefaults || []).find(row =>
    Number(row.performance_band) === Number(performanceBand) &&
    Number(row.block_number) === Number(blockNumber)
  ) || null;
}

function paceDefault(
  workout,
  blockNumber,
  scoreGroup
) {
  return (workout.paceDefaults || []).find(row =>
    Number(row.block_number) === Number(blockNumber) &&
    Number(row.score_group) === Number(scoreGroup)
  ) || null;
}

function stepPaceDefault(
  workout,
  performanceBand,
  stepNumber,
  scoreGroup
) {
  return (workout.stepPaceDefaults || []).find(row =>
    Number(row.performance_band) === Number(performanceBand) &&
    Number(row.step_number) === Number(stepNumber) &&
    Number(row.score_group) === Number(scoreGroup)
  ) || null;
}

function recomputeBlockWorkDistance(block) {
  const reps = finiteNumber(block.reps) ?? 1;
  const distanceMeters = finiteNumber(block.distanceMeters);
  const durationSeconds = finiteNumber(block.durationSeconds);
  const paceSecondsPerKm = finiteNumber(block.paceSecondsPerKm);

  const perRepKm = Number.isFinite(distanceMeters)
    ? distanceMeters / 1000
    : (
        Number.isFinite(durationSeconds) &&
        Number.isFinite(paceSecondsPerKm) &&
        paceSecondsPerKm > 0
          ? durationSeconds / paceSecondsPerKm
          : null
      );

  block.repWorkDistanceKm = roundWorkKm(perRepKm);
  block.workDistanceKm = roundWorkKm(
    Number.isFinite(perRepKm)
      ? perRepKm * reps
      : null
  );
}

function recomputeStepWorkDistance(step) {
  const reps = finiteNumber(step.reps) ?? 1;
  const distanceMeters = finiteNumber(step.distanceMeters);
  const perRepKm = Number.isFinite(distanceMeters)
    ? distanceMeters / 1000
    : null;

  step.repWorkDistanceKm = roundWorkKm(perRepKm);
  step.workDistanceKm = roundWorkKm(
    Number.isFinite(perRepKm)
      ? perRepKm * reps
      : null
  );
}

function recomputeWorkoutWorkDistance(materialized) {
  const items = materialized.kind === 'steps'
    ? materialized.steps || []
    : materialized.blocks || [];

  const distances = items
    .map(item => finiteNumber(item.workDistanceKm))
    .filter(Number.isFinite);

  if (distances.length) {
    materialized.workDistanceKm = roundWorkKm(
      distances.reduce((sum, value) => sum + value, 0)
    );
  }
}

function adjustReps({
  workout,
  materialized,
  direction,
}) {
  const items = materialized.kind === 'steps'
    ? materialized.steps || []
    : materialized.blocks || [];

  for (const item of items) {
    const numberKey = materialized.kind === 'steps'
      ? item.stepNumber
      : item.blockNumber;

    const source = materialized.kind === 'steps'
      ? (workout.steps || []).find(row =>
          Number(row.performance_band) ===
            Number(materialized.performanceBand) &&
          Number(row.step_number) === Number(numberKey)
        )
      : bandDefault(
          workout,
          materialized.performanceBand,
          numberKey
        );

    const current = finiteNumber(item.reps);
    if (!Number.isFinite(current)) continue;

    const min = finiteNumber(source?.reps_min);
    const max = finiteNumber(source?.reps_max);
    const next = current + direction;

    if (direction > 0 && Number.isFinite(max) && next > max) {
      continue;
    }

    if (direction < 0 && Number.isFinite(min) && next < min) {
      continue;
    }

    if (direction > 0 && !Number.isFinite(max)) {
      continue;
    }

    if (direction < 0 && !Number.isFinite(min)) {
      continue;
    }

    item.reps = next;

    if (materialized.kind === 'steps') {
      recomputeStepWorkDistance(item);
    } else {
      recomputeBlockWorkDistance(item);
    }

    recomputeWorkoutWorkDistance(materialized);

    return {
      changed: true,
      detail: `${direction > 0 ? 'increased' : 'reduced'} reps on ${materialized.kind === 'steps' ? 'step' : 'block'} ${numberKey} from ${current} to ${next}`,
    };
  }

  return {
    changed: false,
    detail: 'reps are already at the configured bound',
  };
}

function recoveryBounds(row, blockRecovery = false) {
  if (!row) {
    return { min: null, max: null };
  }

  if (blockRecovery) {
    return {
      min:
        finiteNumber(row.block_recovery_min_sec) ??
        finiteNumber(row.block_recovery_min),
      max:
        finiteNumber(row.block_recovery_max_sec) ??
        finiteNumber(row.block_recovery_max),
    };
  }

  return {
    min:
      finiteNumber(row.recovery_min_sec) ??
      finiteNumber(row.recovery_min),
    max:
      finiteNumber(row.recovery_max_sec) ??
      finiteNumber(row.recovery_max),
  };
}

function adjustedRecoverySeconds(
  current,
  direction,
  min,
  max,
  stepSeconds
) {
  const step = Math.max(5, finiteNumber(stepSeconds) ?? 15);
  const desired = current + (direction > 0 ? -step : step);

  if (direction > 0) {
    if (!Number.isFinite(min)) return null;
    return Math.max(min, desired);
  }

  if (!Number.isFinite(max)) return null;
  return Math.min(max, desired);
}

function adjustRecovery({
  workout,
  materialized,
  direction,
  blockRecovery = false,
  stepSeconds = 15,
}) {
  if (materialized.kind === 'steps' && blockRecovery) {
    return {
      changed: false,
      detail: 'step workouts do not expose inter-block recovery',
    };
  }

  const items = materialized.kind === 'steps'
    ? materialized.steps || []
    : materialized.blocks || [];

  for (const item of items) {
    const numberKey = materialized.kind === 'steps'
      ? item.stepNumber
      : item.blockNumber;

    const source = materialized.kind === 'steps'
      ? (workout.steps || []).find(row =>
          Number(row.performance_band) ===
            Number(materialized.performanceBand) &&
          Number(row.step_number) === Number(numberKey)
        )
      : bandDefault(
          workout,
          materialized.performanceBand,
          numberKey
        );

    const field = blockRecovery
      ? 'blockRecoverySeconds'
      : 'recoverySeconds';

    const current = finiteNumber(item[field]);
    if (!Number.isFinite(current)) continue;

    const bounds = recoveryBounds(
      source,
      blockRecovery
    );

    const next = adjustedRecoverySeconds(
      current,
      direction,
      bounds.min,
      bounds.max,
      stepSeconds
    );

    if (!Number.isFinite(next) || next === current) {
      continue;
    }

    item[field] = next;

    return {
      changed: true,
      detail:
        `${direction > 0 ? 'reduced' : 'increased'} ` +
        `${blockRecovery ? 'block recovery' : 'recovery'} on ` +
        `${materialized.kind === 'steps' ? 'step' : 'block'} ${numberKey} ` +
        `from ${current}s to ${next}s`,
    };
  }

  return {
    changed: false,
    detail:
      `${blockRecovery ? 'block recovery' : 'recovery'} is already at the configured bound or has no configured range`,
  };
}

function applyPaceFactorToItem(item, nextFactor) {
  const currentFactor = finiteNumber(item.paceFactor);
  const currentPace = finiteNumber(item.paceSecondsPerKm);

  if (
    !Number.isFinite(currentFactor) ||
    currentFactor <= 0 ||
    !Number.isFinite(nextFactor) ||
    nextFactor <= 0 ||
    !Number.isFinite(currentPace)
  ) {
    return false;
  }

  const nextPace =
    currentPace * currentFactor / nextFactor;

  item.paceFactor = nextFactor;
  item.paceSecondsPerKm = nextPace;

  const distanceMeters = finiteNumber(item.distanceMeters);
  if (Number.isFinite(distanceMeters)) {
    item.targetSeconds =
      nextPace * distanceMeters / 1000;
  }

  if ('durationSeconds' in item) {
    recomputeBlockWorkDistance(item);
  }

  return true;
}

function adjustPace({
  workout,
  materialized,
  direction,
}) {
  const currentGroup = finiteNumber(
    materialized.scoreGroup
  );

  if (!Number.isFinite(currentGroup)) {
    return {
      changed: false,
      detail: 'score group is unavailable',
    };
  }

  const targetGroup = currentGroup + direction;
  if (targetGroup < 1 || targetGroup > 10) {
    return {
      changed: false,
      detail: 'pace is already at the score-group boundary',
    };
  }

  const items = materialized.kind === 'steps'
    ? materialized.steps || []
    : materialized.blocks || [];

  let changed = 0;

  for (const item of items) {
    const nextRow = materialized.kind === 'steps'
      ? stepPaceDefault(
          workout,
          materialized.performanceBand,
          item.stepNumber,
          targetGroup
        )
      : paceDefault(
          workout,
          item.blockNumber,
          targetGroup
        );

    const nextFactor = finiteNumber(
      nextRow?.pace_factor_default
    );

    if (applyPaceFactorToItem(item, nextFactor)) {
      changed += 1;
    }
  }

  if (!changed) {
    return {
      changed: false,
      detail: `no pace defaults exist for score group ${targetGroup}`,
    };
  }

  materialized.progressionPaceGroup = targetGroup;
  recomputeWorkoutWorkDistance(materialized);

  return {
    changed: true,
    detail:
      `${direction > 0 ? 'advanced' : 'reduced'} pace one database score group (${currentGroup} → ${targetGroup}) across ${changed} ${materialized.kind === 'steps' ? 'step(s)' : 'block(s)'}`,
  };
}

export function applyProgressionLever({
  workout,
  materialized,
  decision = 'maintain',
  lever,
  recoveryStepSeconds = 15,
} = {}) {
  const normalizedDecision =
    normalizeProgressionDecision(decision);

  const output = clone(materialized);

  if (
    normalizedDecision === 'maintain' ||
    !lever
  ) {
    return {
      changed: false,
      materialized: output,
      lever: null,
      detail: 'maintain leaves the materialized workout unchanged',
    };
  }

  const direction =
    normalizedDecision === 'progress'
      ? 1
      : -1;

  let result;

  if (lever === 'reps') {
    result = adjustReps({
      workout,
      materialized: output,
      direction,
    });
  } else if (lever === 'pace') {
    result = adjustPace({
      workout,
      materialized: output,
      direction,
    });
  } else if (lever === 'recovery') {
    result = adjustRecovery({
      workout,
      materialized: output,
      direction,
      blockRecovery: false,
      stepSeconds: recoveryStepSeconds,
    });
  } else if (lever === 'block_recovery') {
    result = adjustRecovery({
      workout,
      materialized: output,
      direction,
      blockRecovery: true,
      stepSeconds: recoveryStepSeconds,
    });
  } else {
    result = {
      changed: false,
      detail: `unknown progression lever: ${lever}`,
    };
  }

  return {
    ...result,
    materialized: output,
    lever,
  };
}

/**
 * Applies exactly one load variable. If the preferred lever is already at its
 * configured bound, TATE tries the next permitted lever. It never increases
 * reps + pace + recovery difficulty simultaneously.
 */
export function progressMaterializedWorkout({
  workout,
  materialized,
  decision = 'maintain',
  recentLevers = [],
  recoveryStepSeconds = 15,
} = {}) {
  const normalizedDecision =
    normalizeProgressionDecision(decision);

  if (!workout || !materialized) {
    return {
      decision: normalizedDecision,
      changed: false,
      exhausted: true,
      lever: null,
      materialized: materialized ? clone(materialized) : null,
      attempts: [],
      reason: 'Workout configuration or materialized workout is missing.',
    };
  }

  if (normalizedDecision === 'maintain') {
    return {
      decision: normalizedDecision,
      changed: false,
      exhausted: false,
      lever: null,
      materialized: clone(materialized),
      attempts: [],
      reason: 'Maintain: no workout load variable is changed.',
    };
  }

  const levers = progressionLeverOrder({
    workout,
    decision: normalizedDecision,
    recentLevers,
  });

  const attempts = [];

  for (const lever of levers) {
    const result = applyProgressionLever({
      workout,
      materialized,
      decision: normalizedDecision,
      lever,
      recoveryStepSeconds,
    });

    attempts.push({
      lever,
      changed: result.changed,
      detail: result.detail,
    });

    if (result.changed) {
      return {
        decision: normalizedDecision,
        changed: true,
        exhausted: false,
        lever,
        materialized: result.materialized,
        attempts,
        reason:
          `${normalizedDecision}: TATE changed one allowed variable only — ${result.detail}.`,
      };
    }
  }

  return {
    decision: normalizedDecision,
    changed: false,
    exhausted: true,
    lever: null,
    materialized: clone(materialized),
    attempts,
    reason:
      levers.length
        ? 'All allowed progression variables are already at their configured bounds or lack the required database range.'
        : 'This workout family has no allowed progression variables.',
  };
}

export function buildProgressionPlan({
  currentWorkout,
  candidates = [],
  decision = 'maintain',
  recentWorkoutIds = [],
  recentLevers = [],
  repeatLimit = 2,
} = {}) {
  const normalizedDecision =
    normalizeProgressionDecision(decision);

  const family = selectProgressionFamily({
    currentWorkout,
    candidates,
    decision: normalizedDecision,
    recentWorkoutIds,
    repeatLimit,
  });

  const leverOrder = family.workout
    ? progressionLeverOrder({
        workout: family.workout,
        decision: normalizedDecision,
        recentLevers,
      })
    : [];

  return {
    decision: normalizedDecision,
    workout: family.workout,
    switchedFamily: family.switched,
    familyReason: family.reason,
    leverOrder,
    preferredLever: leverOrder[0] || null,
  };
}
