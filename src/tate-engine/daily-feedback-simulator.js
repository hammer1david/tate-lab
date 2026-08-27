export const TWETE_DAILY_FEEDBACK_OPTIONS = Object.freeze({
  feeling: Object.freeze([
    'great',
    'good',
    'tired',
    'very_tired',
  ]),
  training_difficulty: Object.freeze([
    'easy',
    'as_expected',
    'hard',
    'very_hard',
  ]),
  completion_status: Object.freeze([
    'completed',
    'partial',
    'skipped',
  ]),
});

export const TWETE_DAILY_FEEDBACK_LABELS = Object.freeze({
  feeling: Object.freeze({
    great: 'Great',
    good: 'Good',
    tired: 'Tired',
    very_tired: 'Very tired',
  }),
  training_difficulty: Object.freeze({
    easy: 'Easy',
    as_expected: 'As expected',
    hard: 'Hard',
    very_hard: 'Very hard',
  }),
  completion_status: Object.freeze({
    completed: 'Yes',
    partial: 'Partly',
    skipped: 'Skipped',
  }),
});

const WEEKDAYS = Object.freeze([
  'mon',
  'tue',
  'wed',
  'thu',
  'fri',
  'sat',
  'sun',
]);

const ROLES = Object.freeze({
  UNAVAILABLE: 'unavailable',
  EASY: 'easy',
  WORKOUT: 'workout',
  LONG_RUN: 'long_run',
});

function oneOf(value, allowed, fallback = null) {
  return allowed.includes(value) ? value : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function calendarDayKey(week, day) {
  return `${Number(week)}:${String(day)}`;
}

export function cloneWeekRules(baseWeekRule, totalWeeks) {
  const baseDays = baseWeekRule?.days || {};

  return Array.from(
    { length: Math.max(1, Number(totalWeeks) || 1) },
    (_, index) => ({
      week: index + 1,
      days: Object.fromEntries(
        WEEKDAYS.map(day => [
          day,
          baseDays[day] || ROLES.EASY,
        ])
      ),
    })
  );
}

export function flattenRuleCalendar(weekRules) {
  return (weekRules || []).flatMap(rule =>
    WEEKDAYS.map((day, dayIndex) => ({
      week: Number(rule.week),
      day,
      dayIndex,
      key: calendarDayKey(rule.week, day),
      role: rule.days[day],
      calendarIndex:
        (Number(rule.week) - 1) * WEEKDAYS.length + dayIndex,
    }))
  );
}

export function normalizeTweteDailyFeedback(entry = {}) {
  const completionStatus = oneOf(
    entry.completion_status,
    TWETE_DAILY_FEEDBACK_OPTIONS.completion_status,
    'skipped'
  );

  const painSeverity = clamp(
    Math.round(Number(entry.pain_severity) || 0),
    0,
    10
  );

  return {
    feeling: oneOf(
      entry.feeling,
      TWETE_DAILY_FEEDBACK_OPTIONS.feeling,
      'good'
    ),
    training_difficulty:
      completionStatus === 'skipped'
        ? null
        : oneOf(
            entry.training_difficulty,
            TWETE_DAILY_FEEDBACK_OPTIONS.training_difficulty,
            'as_expected'
          ),
    completion_status: completionStatus,
    pain_present: painSeverity > 0,
    pain_area:
      painSeverity > 0
        ? String(entry.pain_area || '').trim() || null
        : null,
    pain_severity: painSeverity,
    optional_comment:
      String(entry.optional_comment || '').trim() || null,
    planned_workout_count:
      Math.max(0, Math.round(Number(entry.planned_workout_count) || 0)),
    completed_workout_count:
      Math.max(0, Math.round(Number(entry.completed_workout_count) || 0)),
  };
}

export function validateTweteDailyFeedback(entry = {}) {
  const errors = [];

  if (!TWETE_DAILY_FEEDBACK_OPTIONS.feeling.includes(entry.feeling)) {
    errors.push('feeling');
  }

  if (
    !TWETE_DAILY_FEEDBACK_OPTIONS.completion_status.includes(
      entry.completion_status
    )
  ) {
    errors.push('completion_status');
  }

  if (
    entry.completion_status !== 'skipped' &&
    !TWETE_DAILY_FEEDBACK_OPTIONS.training_difficulty.includes(
      entry.training_difficulty
    )
  ) {
    errors.push('training_difficulty');
  }

  const painSeverity = Number(entry.pain_severity);
  if (
    !Number.isFinite(painSeverity) ||
    painSeverity < 0 ||
    painSeverity > 10
  ) {
    errors.push('pain_severity');
  }

  if (
    Number(entry.pain_severity) > 0 &&
    !String(entry.pain_area || '').trim()
  ) {
    errors.push('pain_area');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}


export function missedSessionPolicy({
  placementType = null,
  completionStatus = null,
} = {}) {
  if (completionStatus !== 'skipped') {
    return {
      missed: false,
      action: 'consumed',
      carryForward: false,
      ignoredForFuturePlan: false,
    };
  }

  const type = String(placementType || '').trim().toLowerCase();
  const carryForward = type === 'workout' || type === 'speed';

  return {
    missed: true,
    action: carryForward ? 'make_up' : 'ignored',
    carryForward,
    ignoredForFuturePlan: !carryForward,
  };
}

export function feedbackBalance(feedbackHistory = []) {
  const feelingWeights = {
    great: 1,
    good: 0,
    tired: -1,
    very_tired: -2,
  };

  const difficultyWeights = {
    easy: 1,
    as_expected: 0,
    hard: -1,
    very_hard: -2,
  };

  return clamp(
    feedbackHistory.reduce((sum, rawEntry) => {
      const entry = normalizeTweteDailyFeedback(rawEntry);
      const painPenalty =
        entry.pain_severity >= 7
          ? -3
          : entry.pain_severity >= 4
            ? -2
            : entry.pain_severity > 0
              ? -1
              : 0;
      const completionPenalty =
        entry.completion_status === 'partial'
          ? -1
          : 0;

      return (
        sum +
        (feelingWeights[entry.feeling] || 0) +
        (difficultyWeights[entry.training_difficulty] || 0) +
        painPenalty +
        completionPenalty
      );
    }, 0),
    -6,
    4
  );
}
export function progressionDecisionFromFeedback(
  feedbackHistory = []
) {
  const entries = feedbackHistory.map(
    entry =>
      normalizeTweteDailyFeedback(entry)
  );

  /*
   * No feedback means TATE follows
   * the normal planned phase progression.
   */
  if (!entries.length) {
    return 'progress';
  }

  const recoverSignal = entries.some(
    entry =>
      entry.pain_severity >= 4 ||
      entry.feeling === 'very_tired' ||
      entry.training_difficulty ===
        'very_hard' ||
      (
        entry.completion_status ===
          'partial' &&
        (
          entry.training_difficulty ===
            'hard' ||
          entry.training_difficulty ===
            'very_hard'
        )
      )
  );

  if (recoverSignal) {
    return 'recover';
  }

  const maintainSignal = entries.some(
    entry =>
      entry.pain_severity > 0 ||
      entry.feeling === 'tired' ||
      entry.training_difficulty ===
        'hard' ||
      entry.completion_status ===
        'partial' ||
      entry.completion_status ===
        'skipped'
  );

  if (maintainSignal) {
    return 'maintain';
  }

  const allPositive = entries.every(
    entry =>
      entry.completion_status ===
        'completed' &&
      entry.pain_severity === 0 &&
      (
        entry.feeling === 'great' ||
        entry.feeling === 'good'
      ) &&
      (
        entry.training_difficulty ===
          'easy' ||
        entry.training_difficulty ===
          'as_expected'
      )
  );

  return allPositive
    ? 'progress'
    : 'maintain';
}


export function buildWeeklyProgressionDecisions({
  totalWeeks = 1,
  feedbackHistory = [],
} = {}) {
  const count = Math.max(
    1,
    Number(totalWeeks) || 1
  );

  const history = feedbackHistory
    .map(entry => {
      const explicitWeek =
        Number(entry.week);

      const calendarIndex =
        Number(entry.calendarIndex);

      const week =
        Number.isFinite(explicitWeek) &&
        explicitWeek > 0
          ? explicitWeek
          : Number.isFinite(
              calendarIndex
            )
            ? Math.floor(
                calendarIndex / 7
              ) + 1
            : null;

      return {
        ...entry,
        resolvedWeek: week,
      };
    })
    .filter(
      entry =>
        Number.isFinite(
          entry.resolvedWeek
        )
    );

  return Array.from(
    { length: count },
    (_, index) => {
      const targetWeek =
        index + 1;

      /*
       * Week 1 starts from the normal
       * planned phase progression.
       *
       * Every later week reads feedback
       * from the previous week.
       */
      if (targetWeek === 1) {
        return 'progress';
      }

      const sourceWeek =
        targetWeek - 1;

      const sourceFeedback =
        history.filter(
          entry =>
            entry.resolvedWeek ===
            sourceWeek
        );

      return sourceFeedback.length
        ? progressionDecisionFromFeedback(
            sourceFeedback
          )
        : 'progress';
    }
  );
}

export function buildWeeklyWorkoutProgressionDecisions({
  totalWeeks = 1,
  feedbackHistory = [],
} = {}) {
  const decisions =
    buildWeeklyProgressionDecisions({
      totalWeeks,
      feedbackHistory,
    });

  const feedbackWeeks = new Set(
    feedbackHistory
      .map(entry => {
        const explicitWeek =
          Number(entry.week);

        const calendarIndex =
          Number(entry.calendarIndex);

        if (
          Number.isFinite(explicitWeek) &&
          explicitWeek > 0
        ) {
          return explicitWeek;
        }

        if (
          Number.isFinite(calendarIndex)
        ) {
          return (
            Math.floor(
              calendarIndex / 7
            ) + 1
          );
        }

        return null;
      })
      .filter(Number.isFinite)
  );

  return decisions.map(
    (decision, index) => {
      const targetWeek =
        index + 1;

      if (targetWeek === 1) {
        return null;
      }

      const sourceWeek =
        targetWeek - 1;

      return feedbackWeeks.has(
        sourceWeek
      )
        ? decision
        : null;
    }
  );
}
function nextCandidate(calendar, afterIndex, predicate, usedKeys) {
  return calendar.find(item =>
    item.calendarIndex > afterIndex &&
    !usedKeys.has(item.key) &&
    predicate(item)
  );
}

function feedbackSignals(rawEntry) {
  const entry = normalizeTweteDailyFeedback(rawEntry);

  const severePain = entry.pain_severity >= 7;
  const meaningfulPain = entry.pain_severity >= 4;
  const veryTired = entry.feeling === 'very_tired';
  const tired = entry.feeling === 'tired';
  const veryHard = entry.training_difficulty === 'very_hard';
  const hard = entry.training_difficulty === 'hard';
  const partial = entry.completion_status === 'partial';

  // Lab-only adaptation policy. The real TWETE fields are preserved exactly;
  // these booleans only control how the simulator stress-tests future planning.
  const holdNextWorkout =
    severePain ||
    meaningfulPain ||
    veryTired ||
    veryHard ||
    (tired && hard) ||
    (partial && (hard || veryHard));

  const forceRecovery =
    meaningfulPain ||
    veryTired ||
    veryHard ||
    partial;

  const positiveLongRunSignal =
    entry.completion_status === 'completed' &&
    entry.pain_severity === 0 &&
    (entry.feeling === 'great' || entry.feeling === 'good') &&
    (entry.training_difficulty === 'easy' ||
      entry.training_difficulty === 'as_expected');

  return {
    entry,
    holdNextWorkout,
    forceRecovery,
    positiveLongRunSignal,
  };
}

export function buildFeedbackAdaptation({
  baseWeekRule,
  totalWeeks,
  completedThroughIndex = -1,
  feedbackHistory = [],
  phase = 'base',
} = {}) {
  const weekRules = cloneWeekRules(baseWeekRule, totalWeeks);
  const baseCalendar = flattenRuleCalendar(weekRules);
  const adaptationReasons = {};
  const heldWorkoutKeys = new Set();
  const forceRecoveryKeys = new Set();
  const progressiveLongRunKeys = new Set();

  // Past calendar days are immutable in the day-by-day simulation.
  for (const item of baseCalendar) {
    if (item.calendarIndex <= completedThroughIndex) {
      weekRules[item.week - 1].days[item.day] = ROLES.UNAVAILABLE;
    }
  }

  const orderedHistory = [...feedbackHistory]
    .map(entry => ({
      ...entry,
      calendarIndex: Number(entry.calendarIndex),
      normalized: normalizeTweteDailyFeedback(entry),
    }))
    .filter(entry => Number.isFinite(entry.calendarIndex))
    .sort((a, b) => a.calendarIndex - b.calendarIndex);

  for (const historyEntry of orderedHistory) {
    const signals = feedbackSignals(historyEntry);

    if (signals.holdNextWorkout) {
      const nextWorkout = nextCandidate(
        baseCalendar,
        historyEntry.calendarIndex,
        item => item.role === ROLES.WORKOUT,
        heldWorkoutKeys
      );

      if (nextWorkout) {
        heldWorkoutKeys.add(nextWorkout.key);
        weekRules[nextWorkout.week - 1].days[nextWorkout.day] = ROLES.EASY;
        adaptationReasons[nextWorkout.key] =
          `TWETE Daily Feedback reduced readiness (${signals.entry.feeling}` +
          `${signals.entry.training_difficulty ? ` / ${signals.entry.training_difficulty}` : ''}` +
          `${signals.entry.pain_severity ? ` / pain ${signals.entry.pain_severity}/10` : ''}). ` +
          'The next Workout Day is temporarily downgraded to Easy so quality can be re-scheduled.';
      }
    }

    if (signals.forceRecovery) {
      const nextEasy = nextCandidate(
        baseCalendar,
        historyEntry.calendarIndex,
        item => item.role === ROLES.EASY,
        forceRecoveryKeys
      );

      if (nextEasy) {
        forceRecoveryKeys.add(nextEasy.key);
        adaptationReasons[nextEasy.key] =
          'TWETE Daily Feedback indicates elevated recovery need. The next Easy slot is converted to Recovery in the Lab simulation.';
      }
    }

    if (signals.positiveLongRunSignal) {
      const nextLongRun = nextCandidate(
        baseCalendar,
        historyEntry.calendarIndex,
        item => item.role === ROLES.LONG_RUN,
        progressiveLongRunKeys
      );

      if (nextLongRun && phase === 'loading') {
        progressiveLongRunKeys.add(nextLongRun.key);
        adaptationReasons[nextLongRun.key] =
          'Positive TWETE Daily Feedback in Loading: the next Long Run may use the progressive variant.';
      }

      if (nextLongRun && phase === 'sharpening') {
        const previousWeekHadProgressive = WEEKDAYS.some(day =>
          progressiveLongRunKeys.has(
            calendarDayKey(nextLongRun.week - 1, day)
          )
        );

        if (!previousWeekHadProgressive) {
          progressiveLongRunKeys.add(nextLongRun.key);
          adaptationReasons[nextLongRun.key] =
            'Positive TWETE Daily Feedback in Sharpening: progressive Long Run is permitted, with the current Lab interpretation of reduced usage preventing consecutive progressive weeks.';
        }
      }
    }
  }
  const weeklyProgressionDecisions =
    buildWeeklyProgressionDecisions({
      totalWeeks,
      feedbackHistory:
        orderedHistory,
    });
return {
  weekRules,
  adaptationReasons,
  heldWorkoutKeys,
  forceRecoveryKeys,
  progressiveLongRunKeys,

  weeklyProgressionDecisions,

  feedbackBalance:
    feedbackBalance(
      orderedHistory
    ),
};
}
