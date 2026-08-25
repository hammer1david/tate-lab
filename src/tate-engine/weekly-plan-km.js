import {
  materializeWorkout,
  performanceBandForScore,
} from './database-library.js';
import {
  applyDistanceSelectionLayer,
} from './distance-selection.js';

import {
  buildWeeklyKmBlock,
} from './weekly-km-calculator.js';

import {
  allocateWeeklyKmBudget,
  calculateLongRunKm,
  qualitySessionTotalKm,
  roundKm,
} from './weekly-km-budget.js';

function finiteNumber(value) {
  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? parsed
    : null;
}

function phaseKey(value) {
  return value === 'tapering'
    ? 'taper'
    : value;
}

function longRunPhaseRule(
  workout,
  phase
) {
  const rules =
    workout?.dynamicConfig?.phaseRules ||
    [];

  const key = phaseKey(phase);

  return (
    rules.find(
      rule =>
        rule.active !== false &&
        rule.phase === key
    ) ||
    rules.find(
      rule =>
        rule.active !== false &&
        rule.phase === 'base'
    ) ||
    rules[0] ||
    null
  );
}

export function stridesAddonKm(
  assignment
) {
  if (
    assignment?.addonStatus !==
      'assigned' ||
    assignment?.addonWorkout
      ?.dynamicType !== 'strides'
  ) {
    return 0;
  }

  const variant =
    assignment.addonWorkout
      .dynamicConfig?.variant || {};

  const reps =
    finiteNumber(variant.reps) ??
    finiteNumber(
      variant.reps_default
    );

  const distanceM =
    finiteNumber(
      variant.distance_m
    );

  if (
    !Number.isFinite(reps) ||
    !Number.isFinite(distanceM)
  ) {
    return 0;
  }

  return Math.round(
    (
      reps *
      distanceM /
      1000
    ) *
      1000
  ) / 1000;
}

function assignmentAthlete({
  assignment,
  scores,
  current10k,
  phase,
  progressiveSlots,
}) {
  return {
    score:
      scores?.[
        assignment.primaryAnchor
      ] ?? 50,
    current10k,
    phase,
    longRunProgressive:
      progressiveSlots?.has(
        assignment.slot
      ) === true,
  };
}

function flexibleTypeForWorkout(
  workout
) {
  if (
    workout?.dynamicType ===
    'recovery'
  ) {
    return 'recovery';
  }

  if (
    workout?.dynamicType ===
    'progressive'
  ) {
    return 'progressive';
  }

  if (
    workout?.dynamicType ===
    'aerobic'
  ) {
    return 'aerobic';
  }

  return null;
}

function duplicateSlotCounts(
  schedule
) {
  const counts = new Map();

  for (
    const week of schedule.weeks || []
  ) {
    for (
      const day of week.days || []
    ) {
      const slot =
        day.assignment?.slot;

      if (!slot) continue;

      counts.set(
        slot,
        (counts.get(slot) || 0) +
          1
      );
    }
  }

  return counts;
}

function isPastMissedMakeupCopy(
  day,
  duplicateCounts
) {
  const slot =
    day.assignment?.slot;

  if (
    !day.simulated ||
    day.missed !== true ||
    !slot
  ) {
    return false;
  }

  return (
    (duplicateCounts.get(slot) || 0) >
    1
  );
}

function sessionId(
  weekNumber,
  day
) {
  return `${weekNumber}:${day.day}`;
}

function qualitySessionBudget({
  assignment,
  materialized,
  addonKm,
}) {
  const workKm =
    finiteNumber(
      materialized?.workDistanceKm
    );

  if (!Number.isFinite(workKm)) {
    const warmupOnly =
      qualitySessionTotalKm({
        workKm: 0,
        performanceBand:
          materialized
            ?.performanceBand ?? 2,
      });

    return {
      session: {
        type: 'quality',
        fixedKm:
          warmupOnly,
        addonKm,
      },
      exact: false,
      issue:
        `${assignment.workout?.id || assignment.slot}: ` +
        'quality work distance is unresolved',
    };
  }

  return {
    session: {
      type: 'quality',
      fixedKm:
        qualitySessionTotalKm({
          workKm,
          performanceBand:
            materialized
              .performanceBand,
        }),
      addonKm,
    },
    exact: true,
    issue: null,
  };
}

function longRunSessionBudget({
  assignment,
  targetWeeklyKm,
  phase,
  addonKm,
}) {
  const rule =
    longRunPhaseRule(
      assignment.workout,
      phase
    );

 const selectedShare =
  finiteNumber(
    assignment.longRunWeeklyShare
  );

const share =
  Number.isFinite(selectedShare)
    ? selectedShare
    : finiteNumber(
        rule?.weekly_km_share_default
      );

  if (
    !Number.isFinite(share) ||
    share <= 0 ||
    share >= 1
  ) {
    return {
      session: {
        type: 'long_run',
        fixedKm: 0,
        addonKm,
      },
      exact: false,
      issue:
        `${assignment.workout?.id || assignment.slot}: ` +
        'Long Run weekly-km share is unresolved',
    };
  }

  const maxDistanceKm =
    finiteNumber(
      rule?.max_distance_km
    );

  const distanceKm =
    calculateLongRunKm({
      targetWeeklyKm,
      weeklyShare: share,
      maxDistanceKm:
        Number.isFinite(
          maxDistanceKm
        )
          ? maxDistanceKm
          : Infinity,
    });

  return {
    session: {
      type: 'long_run',
      fixedKm: distanceKm,
      addonKm,
    },
    exact: true,
    issue: null,
  };
}

function budgetSessionForDay({
  weekNumber,
  day,
  targetWeeklyKm,
  phase,
  scores,
  current10k,
  progressiveSlots,
  materializeWorkoutFn,
  duplicateCounts,
}) {
  const assignment =
    day.assignment;

  if (
    !assignment ||
    assignment.status === 'missing' ||
    !assignment.workout
  ) {
    return null;
  }

  const id =
    sessionId(
      weekNumber,
      day
    );

  if (
    day.simulated &&
    Number.isFinite(
      finiteNumber(day.plannedKm)
    )
  ) {
    if (
      isPastMissedMakeupCopy(
        day,
        duplicateCounts
      )
    ) {
      return {
        id,
        skipBudget: true,
        frozenDisplayKm:
          finiteNumber(
            day.plannedKm
          ),
        slot:
          assignment.slot,
        exact: true,
        issue: null,
      };
    }

    return {
      id,
      slot:
        assignment.slot,
      exact: true,
      issue: null,
      session: {
        id,
        type: 'quality',
        fixedKm:
          finiteNumber(
            day.plannedKm
          ),
        addonKm: 0,
      },
    };
  }

  const athlete =
    assignmentAthlete({
      assignment,
      scores,
      current10k,
      phase,
      progressiveSlots,
    });

  const materialized =
    materializeWorkoutFn(
      assignment.workout,
      athlete
    );

  const addonKm =
    stridesAddonKm(
      assignment
    );

  if (
    assignment.workout
      .dynamicType === 'long_run'
  ) {
    const result =
      longRunSessionBudget({
        assignment,
        targetWeeklyKm,
        phase,
        addonKm,
      });

    return {
      id,
      slot:
        assignment.slot,
      materialized,
      ...result,
      session: {
        id,
        ...result.session,
      },
    };
  }

  const flexibleType =
    flexibleTypeForWorkout(
      assignment.workout
    );

  if (flexibleType) {
  const selectedWeight =
  (
    flexibleType === 'aerobic' ||
    flexibleType === 'progressive'
  )
    ? (
        finiteNumber(
          assignment
            .distanceBudgetWeight
        ) ??
        finiteNumber(
          assignment
            .aerobicDistanceMultiplier
        )
      )
    : null;

  return {
    id,
    slot:
      assignment.slot,
    materialized,
    exact: true,
    issue: null,
    session: {
      id,
      type:
        flexibleType,
      minKm: 0,
      addonKm,

      ...(
        Number.isFinite(
          selectedWeight
        ) &&
        selectedWeight > 0
          ? {
              weight:
                selectedWeight,
            }
          : {}
      ),
    },
  };
}

  const quality =
    qualitySessionBudget({
      assignment,
      materialized,
      addonKm,
    });

  return {
    id,
    slot:
      assignment.slot,
    materialized,
    ...quality,
    session: {
      id,
      ...quality.session,
    },
  };
}

/**
 * Applies the real TWETE weekly-km budget to a scheduled plan.
 *
 * `startWeeklyKm` is the athlete's current/starting weekly mileage.
 * The phase calculator creates each calendar week's target:
 *
 * Base Building: +1%
 * Loading: Band 1 +5%, Bands 2/3 +3%
 * Sharpening: -3%
 * Tapering: 50% of peak/start km
 *
 * Weekly progression uses the Aerobic score's performance band.
 *
 * Partial final weeks are scaled by the fraction of selected
 * training days actually used, so a 3-day tail does not receive
 * a full weekly mileage target.
 */
export function applyWeeklyKmPlanToSchedule({
  schedule,
  phase = 'base',
  scores = {},
  current10k,
  startWeeklyKm,
  progressiveSlots =
    new Set(),
  materializeWorkoutFn =
    materializeWorkout,
} = {}) {
  const startKm =
    finiteNumber(
      startWeeklyKm
    );

  if (
    !schedule?.weeks?.length ||
    !Number.isFinite(startKm) ||
    startKm <= 0
  ) {
    return null;
  }
  const distanceSelection =
  applyDistanceSelectionLayer({
    schedule,
    phase,
  });

  const volumeBand =
    performanceBandForScore(
      scores.Aerobic ?? 50
    );

  const weeklyTargets =
    buildWeeklyKmBlock({
      startWeeklyKm:
        startKm,
      phase,
      performanceBand:
        volumeBand,
      weeks:
        schedule.weeks.length,
      peakWeeklyKm:
        startKm,
    });

  const duplicateCounts =
    duplicateSlotCounts(
      schedule
    );

  const plannedKmBySlot =
    new Map();
  const weeks = [];

  for (
    let index = 0;
    index <
      schedule.weeks.length;
    index += 1
  ) {
    const week =
      schedule.weeks[index];

    const fullWeekTargetKm =
      weeklyTargets[index]
        .targetWeeklyKm;

    const denominator =
      Math.max(
        1,
        Number(
          week.trainingDays ??
            schedule
              .trainingDaysPerWeek ??
            1
        )
      );

    const numerator =
      Math.max(
        0,
        Number(
          week.scheduledTrainingDays ??
            week.days.filter(
              day =>
                day.assignment
            ).length
        )
      );

    const completionShare =
      Math.min(
        1,
        numerator /
          denominator
      );

    const targetWeeklyKm =
      completionShare < 1
        ? roundKm(
            fullWeekTargetKm *
              completionShare
          )
        : fullWeekTargetKm;

    const items = [];
    const issues = [];

    for (
      const day of week.days
    ) {
      const item =
        budgetSessionForDay({
          weekNumber:
            week.week,
          day,
          targetWeeklyKm,
          phase,
          scores,
          current10k,
          progressiveSlots,
          materializeWorkoutFn,
          duplicateCounts,
        });

      if (!item) continue;

      items.push(item);

      if (item.issue) {
        issues.push(
          item.issue
        );
      }
    }

    const budgetItems =
      items.filter(
        item =>
          !item.skipBudget &&
          item.session
      );

    const budget =
      allocateWeeklyKmBudget({
        targetWeeklyKm,
        sessions:
          budgetItems.map(
            item =>
              item.session
          ),
      });

    const budgetById =
      new Map(
        budget.sessions.map(
          session => [
            session.id,
            session,
          ]
        )
      );

    for (
      const day of week.days
    ) {
      if (!day.assignment) {
        continue;
      }

      const id =
        sessionId(
          week.week,
          day
        );

      const item =
        items.find(
          candidate =>
            candidate.id === id
        );

      if (
        item?.skipBudget
      ) {
        continue;
      }

      const budgetSession =
        budgetById.get(id);

      if (
        Number.isFinite(
          budgetSession
            ?.plannedKm
        )
      ) {
        day.plannedKm =
          budgetSession
            .plannedKm;

        day.kmBudgetExact =
          item?.exact !== false;

        if (
          day.assignment?.slot
        ) {
          plannedKmBySlot.set(
            day.assignment.slot,
            day.plannedKm
          );
        }
      }
    }

    const status =
      issues.length
        ? 'incomplete'
        : budget.status;

    weeks.push({
      week:
        week.week,
      performanceBand:
        volumeBand,
      fullWeekTargetKm,
      completionShare,
      targetWeeklyKm,
      plannedKm:
        budget
          .allocatedTotalKm ??
        (
          targetWeeklyKm -
          (budget.remainingKm || 0)
        ),
      status,
      issues,
      budget,
    });
  }

  return {
  performanceBand:
    volumeBand,
  phase,
  startWeeklyKm:
    startKm,

  distanceSelection,

  weeks,
  plannedKmBySlot,
    hasIncompleteWeeks:
      weeks.some(
        week =>
          week.status ===
          'incomplete'
      ),
  };
}
