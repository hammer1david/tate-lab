const PHASE_ALIASES = Object.freeze({
  base: 'base',
  basebuilding: 'base',
  loading: 'loading',
  sharpening: 'sharpening',
  specific: 'specific',
  taper: 'taper',
  tapering: 'taper',
});

export const LONG_RUN_SHARE_PATTERN = Object.freeze([
  'default',
  'max',
  'default',
  'min',
]);

export const FORCED_SHORT_DISTRIBUTION_PATTERN =
  Object.freeze([
    1.15,
    0.85,
    1.15,
    1.00,
  ]);

function numberOrNull(value) {
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

function normalizePhase(value) {
  const key = String(value || 'base')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '');

  return PHASE_ALIASES[key] || 'base';
}

function phaseRule(
  workout,
  phase
) {
  const rules =
    workout?.dynamicConfig?.phaseRules ||
    [];

  const key =
    normalizePhase(phase);

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

function distanceProfile(
  workout,
  mode
) {
  const profiles =
    workout?.dynamicConfig
      ?.distanceProfiles || [];

  return (
    profiles.find(
      profile =>
        profile.active !== false &&
        profile.distance_mode === mode
    ) ||
    profiles.find(
      profile =>
        profile.active !== false &&
        profile.distance_mode ===
          'normal'
    ) ||
    profiles.find(
      profile =>
        profile.active !== false
    ) ||
    null
  );
}

function profileMultiplier(
  profile,
  position = 'default'
) {
  const key =
    position === 'min'
      ? 'multiplier_min'
      : position === 'max'
        ? 'multiplier_max'
        : 'multiplier_default';

  return (
    numberOrNull(profile?.[key]) ??
    numberOrNull(
      profile?.multiplier_default
    ) ??
    1
  );
}

function isAerobicDistanceSession(day) {
  const type =
    day?.assignment?.workout
      ?.dynamicType;

  return (
    type === 'aerobic' ||
    type === 'progressive'
  );
}

function isLongRun(day) {
  return (
    day?.assignment?.workout
      ?.dynamicType === 'long_run'
  );
}

function isQuality(day) {
  if (!day?.assignment) {
    return false;
  }

  if (
    day.placementType === 'workout' ||
    day.placementType === 'speed'
  ) {
    return true;
  }

  const type =
    day.assignment.workout
      ?.dynamicType;

  if (
    [
      'aerobic',
      'recovery',
      'progressive',
      'long_run',
      'strides',
    ].includes(type)
  ) {
    return false;
  }

  return (
    day.assignment.primaryAnchor !==
    'Aerobic'
  );
}

function flattenSchedule(schedule) {
  return (
    schedule?.weeks || []
  ).flatMap(
    (week, weekIndex) =>
      (week.days || []).map(
        (day, dayIndex) => ({
          week,
          day,
          weekIndex,
          dayIndex,
          calendarIndex:
            weekIndex * 7 +
            dayIndex,
        })
      )
  );
}

function repeatedModePosition(
  streakLength
) {
  return [
    'min',
    'default',
    'max',
  ][
    (streakLength - 1) % 3
  ];
}

function freeAerobicMode({
  previousMode,
  longerUsed,
  longerLimit,
  preferVariation,
}) {
  if (!preferVariation) {
    return 'normal';
  }

  const candidates = [
    'normal',
    'longer',
    'short',
  ].filter(
    mode =>
      mode !== 'longer' ||
      longerUsed < longerLimit
  );

  return (
    candidates.find(
      mode =>
        mode !== previousMode
    ) ||
    candidates[0] ||
    'normal'
  );
}

function selectAerobicWeek({
  allEntries,
  weekEntries,
  phase,
  previousMode,
}) {
  const entries =
    weekEntries.filter(
      entry =>
        isAerobic(entry.day) &&
        entry.day.simulated !== true
    );

  if (!entries.length) {
    return {
      selections: [],
      lastMode: previousMode,
    };
  }

  const firstWorkout =
    entries[0]
      .day
      .assignment
      .workout;

  const rule =
    phaseRule(
      firstWorkout,
      phase
    );

  const generationRule =
    firstWorkout
      .dynamicConfig
      ?.generationRule || {};

  const preferVariation =
    generationRule
      .prefer_distance_variation !==
    false;

  const avoidStreak =
    generationRule
      .avoid_same_distance_mode_streak !==
    false;

  const longerLimit =
    Math.max(
      0,
      Number(
        rule
          ?.longer_max_sessions_per_week ??
          entries.length
      ) || 0
    );

  let lastMode =
    previousMode;

  let sameModeStreak = 0;
  let longerUsed = 0;

  const selections = [];

  for (const entry of entries) {
    const previous =
      allEntries.find(
        item =>
          item.calendarIndex ===
          entry.calendarIndex - 1
      );

    const next =
      allEntries.find(
        item =>
          item.calendarIndex ===
          entry.calendarIndex + 1
      );

    const preQuality =
      isQuality(next?.day);

    const postQuality =
      isQuality(previous?.day);

    let mode;
    let paceLevel = 'normal';
    let reason;

    if (preQuality) {
      mode =
        rule
          ?.pre_quality_distance_mode ||
        'short';

      paceLevel =
        rule
          ?.pre_quality_pace_level ||
        'easy';

      reason =
        'pre_quality';
    } else if (postQuality) {
      mode =
        rule
          ?.post_quality_distance_mode ||
        'short';

      paceLevel =
        rule
          ?.post_quality_pace_level ||
        'easy';

      reason =
        'post_quality';
    } else {
      mode =
        freeAerobicMode({
          previousMode:
            avoidStreak
              ? lastMode
              : null,
          longerUsed,
          longerLimit,
          preferVariation,
        });

      reason =
        'distance_variation';
    }

    if (mode === 'longer') {
      longerUsed += 1;
    }

    if (mode === lastMode) {
      sameModeStreak += 1;
    } else {
      sameModeStreak = 0;
    }

    const profile =
      distanceProfile(
        entry
          .day
          .assignment
          .workout,
        mode
      );

    const multiplierPosition =
      avoidStreak &&
      mode === lastMode
        ? repeatedModePosition(
            sameModeStreak
          )
        : 'default';

    const multiplier =
      profileMultiplier(
        profile,
        multiplierPosition
      );

    Object.assign(
      entry.day.assignment,
      {
        aerobicDistanceMode:
          mode,

        aerobicPaceLevel:
          paceLevel,

        aerobicDistanceMultiplier:
          multiplier,

        distanceSelectionReason:
          reason,
      }
    );

    selections.push({
      week:
        entry.week.week,

      day:
        entry.day.day,

      slot:
        entry.day.assignment.slot,

      mode,
      paceLevel,
      multiplier,
      multiplierPosition,
      reason,
    });

    lastMode = mode;
  }

  return {
    selections,
    lastMode,
  };
}

function longRunShare(
  rule,
  mode
) {
  const key =
    mode === 'min'
      ? 'weekly_km_share_min'
      : mode === 'max'
        ? 'weekly_km_share_max'
        : 'weekly_km_share_default';

  return (
    numberOrNull(rule?.[key]) ??
    numberOrNull(
      rule?.weekly_km_share_default
    )
  );
}

function selectLongRunWeek(
  week,
  phase
) {
  const day =
    (week.days || []).find(
      item =>
        isLongRun(item) &&
        item.simulated !== true
    );

  if (!day) {
    return null;
  }

  const rule =
    phaseRule(
      day.assignment.workout,
      phase
    );

  if (
    rule?.long_run_allowed ===
      false ||
    Number(
      rule?.sessions_per_week ?? 1
    ) === 0
  ) {
    return {
      week: week.week,
      day: day.day,
      slot:
        day.assignment.slot,

      allowed: false,
      mode: null,
      weeklyShare: null,

      reason:
        'long_run_not_allowed_in_phase',
    };
  }

  const index =
    Math.max(
      0,
      Number(week.week || 1) - 1
    ) %
    LONG_RUN_SHARE_PATTERN.length;

  const mode =
    LONG_RUN_SHARE_PATTERN[
      index
    ];

  const weeklyShare =
    longRunShare(
      rule,
      mode
    );

  Object.assign(
    day.assignment,
    {
      longRunShareMode:
        mode,

      longRunWeeklyShare:
        weeklyShare,

      longRunDistanceSelectionReason:
        'weekly_share_wave',
    }
  );

  return {
    week: week.week,
    day: day.day,

    slot:
      day.assignment.slot,

    allowed: true,
    mode,
    weeklyShare,

    reason:
      'weekly_share_wave',
  };
}

/**
 * Executes the existing
 * Supabase-backed distance policy.
 *
 * Aerobic:
 * - short / normal / longer
 * - pre/post Quality overrides
 * - prefer_distance_variation
 * - avoid_same_distance_mode_streak
 * - longer_max_sessions_per_week
 *
 * Long Run:
 * - weekly_km_share_min
 * - weekly_km_share_default
 * - weekly_km_share_max
 * - phase allow/deny rules
 *
 * No new distance percentages
 * are invented here.
 */
export function applyDistanceSelectionLayer({
  schedule,
  phase = 'base',
} = {}) {
  if (!schedule?.weeks?.length) {
    return {
      aerobic: [],
      longRun: [],
    };
  }

  const allEntries =
    flattenSchedule(schedule);

  const aerobic = [];
  const longRun = [];

  let previousMode = null;

  for (
    const week of schedule.weeks
  ) {
    const weekEntries =
      allEntries.filter(
        entry =>
          entry.week === week
      );

    const result =
      selectAerobicWeek({
        allEntries,
        weekEntries,
        phase,
        previousMode,
      });

    aerobic.push(
      ...result.selections
    );

    previousMode =
      result.lastMode;

    const longRunSelection =
      selectLongRunWeek(
        week,
        phase
      );

    if (longRunSelection) {
      longRun.push(
        longRunSelection
      );
    }
  }

  return {
    aerobic,
    longRun,
  };
     }
