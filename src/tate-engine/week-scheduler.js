import { normalizeStimulus } from './database-library.js';
import { normalizeSecondaryTarget } from './slot-planner.js';

export const WEEKDAYS = Object.freeze([
  'mon',
  'tue',
  'wed',
  'thu',
  'fri',
  'sat',
  'sun',
]);

export const WEEKDAY_LABELS = Object.freeze({
  mon: 'Mon',
  tue: 'Tue',
  wed: 'Wed',
  thu: 'Thu',
  fri: 'Fri',
  sat: 'Sat',
  sun: 'Sun',
});

export const DAY_ROLES = Object.freeze({
  UNAVAILABLE: 'unavailable',
  EASY: 'easy',
  WORKOUT: 'workout',
  LONG_RUN: 'long_run',
});

export const DAY_ROLE_LABELS = Object.freeze({
  unavailable: 'Unavailable / Rest',
  easy: 'Easy Day',
  workout: 'Workout Day',
  long_run: 'Long Run Day',
});

const SPEED_STIMULI = new Set([
  'Speed',
  'Sprint',
  'Hill Work',
]);

const WORKOUT_STIMULI = new Set([
  'Threshold',
  'VO2max',
  'Race Specific',
  'Durability',
]);

export function normalizeDayRole(value) {
  const key = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');

  const aliases = {
    unavailable: DAY_ROLES.UNAVAILABLE,
    rest: DAY_ROLES.UNAVAILABLE,
    off: DAY_ROLES.UNAVAILABLE,
    disabled: DAY_ROLES.UNAVAILABLE,
    easy: DAY_ROLES.EASY,
    easy_day: DAY_ROLES.EASY,
    workout: DAY_ROLES.WORKOUT,
    workout_day: DAY_ROLES.WORKOUT,
    speed_day: DAY_ROLES.WORKOUT,
    longrun: DAY_ROLES.LONG_RUN,
    long_run: DAY_ROLES.LONG_RUN,
    long_run_day: DAY_ROLES.LONG_RUN,
  };

  return aliases[key] || DAY_ROLES.EASY;
}

/**
 * Default Lab demo pattern: all 7 days are available, Tuesday and Friday are
 * Workout Days, Sunday is Long Run Day, and the remaining days are Easy.
 * The user can change every role or uncheck a day completely.
 */
export function blankWeekRule(week = 1) {
  return {
    week,
    days: {
      mon: DAY_ROLES.EASY,
      tue: DAY_ROLES.WORKOUT,
      wed: DAY_ROLES.EASY,
      thu: DAY_ROLES.EASY,
      fri: DAY_ROLES.WORKOUT,
      sat: DAY_ROLES.EASY,
      sun: DAY_ROLES.LONG_RUN,
    },
  };
}

export function normalizeWeekRule(rule = {}, week = 1) {
  const normalized = blankWeekRule(
    Number(rule.week) || week
  );

  for (const day of WEEKDAYS) {
    if (rule.days && day in rule.days) {
      normalized.days[day] = normalizeDayRole(
        rule.days[day]
      );
    }
  }

  return normalized;
}

export function trainingDaysInRule(rule = {}) {
  const normalized = normalizeWeekRule(rule);
  return WEEKDAYS.filter(
    day =>
      normalized.days[day] !== DAY_ROLES.UNAVAILABLE
  ).length;
}

export function sessionPlacementType(assignment = {}) {
  const primary = normalizeStimulus(
    assignment.primaryAnchor || assignment.stimulus
  );
  const selected = normalizeStimulus(
    assignment.selectedStimulus ||
      assignment.workout?.stimulus ||
      primary
  );
  const secondary = assignment.secondaryTarget
    ? normalizeSecondaryTarget(assignment.secondaryTarget)
    : null;

  if (
    secondary === 'long_run' ||
    selected === 'Long Run'
  ) {
    return 'long_run';
  }

  if (SPEED_STIMULI.has(selected)) {
    return 'speed';
  }

  if (
    WORKOUT_STIMULI.has(selected) ||
    primary === 'Threshold' ||
    primary === 'VO2max'
  ) {
    return 'workout';
  }

  return 'easy';
}

function createWeekState(rule) {
  const days = WEEKDAYS.map((day, dayIndex) => {
    const configuredRole = normalizeDayRole(
      rule.days[day]
    );

    return {
      day,
      dayIndex,
      configuredRole,
      effectiveRole: configuredRole,
      available:
        configuredRole !== DAY_ROLES.UNAVAILABLE,
      assignment: null,
      placementType: null,
      placementReason: null,
    };
  });

  return {
    week: rule.week,
    rule,
    trainingDays: days.filter(day => day.available).length,
    scheduledTrainingDays: 0,
    hasLongRun: false,
    hasSpeed: false,
    days,
    unscheduled: [],
  };
}

function flattenDays(weeks) {
  return weeks.flatMap(week =>
    week.days.map(day => ({ week, day }))
  );
}

function firstFreeCalendarDay(weeks, predicate) {
  return flattenDays(weeks).find(
    item =>
      item.day.available &&
      !item.day.assignment &&
      predicate(item.week, item.day)
  );
}

function place(item, assignment, placementType, reason) {
  if (!item) return false;

  item.day.assignment = assignment;
  item.week.scheduledTrainingDays += 1;
  item.day.placementType = placementType;
  item.day.placementReason = reason;

  if (placementType === 'long_run') {
    item.week.hasLongRun = true;
  }

  if (placementType === 'speed') {
    item.week.hasSpeed = true;
  }

  return true;
}

function pushUnscheduled(unscheduled, assignment, placementType, reason) {
  const item = {
    assignment,
    placementType,
    reason,
  };
  unscheduled.push(item);
  return item;
}

function repeatRuleForWeeks(rule, totalWeeks) {
  const normalized = normalizeWeekRule(rule, 1);

  return Array.from({ length: totalWeeks }, (_, index) => ({
    week: index + 1,
    days: { ...normalized.days },
  }));
}

/**
 * `weekRule` is the athlete's recurring weekly availability pattern in the
 * Lab. Checked days are represented by Easy / Workout / Long Run roles.
 * Unchecked days are `unavailable` and can never receive training.
 */
export function schedulePlanIntoWeeks(
  assignments = [],
  weekRule = blankWeekRule(1)
) {
  const normalizedRule = Array.isArray(weekRule)
    ? normalizeWeekRule(weekRule[0] || {}, 1)
    : normalizeWeekRule(weekRule, 1);

  const trainingDaysPerWeek = trainingDaysInRule(
    normalizedRule
  );

  const totalWeeks = trainingDaysPerWeek > 0
    ? Math.max(
        1,
        Math.ceil(assignments.length / trainingDaysPerWeek)
      )
    : 1;

  const weeks = repeatRuleForWeeks(
    normalizedRule,
    totalWeeks
  ).map(rule => createWeekState(rule));

  const typed = assignments.map((assignment, index) => ({
    assignment,
    type: sessionPlacementType(assignment),
    originalIndex: index,
  }));

  const unscheduled = [];

  if (trainingDaysPerWeek === 0) {
    for (const item of typed) {
      pushUnscheduled(
        unscheduled,
        item.assignment,
        item.type,
        'The athlete has no available training days selected.'
      );
    }

    return {
      weeks,
      trainingDaysPerWeek: 0,
      unscheduled,
      unscheduledCount: unscheduled.length,
    };
  }

  const calendar = flattenDays(weeks).filter(
    item => item.day.available
  );

  const remaining = [...typed];

  function removeRemaining(item) {
    const index = remaining.indexOf(item);
    if (index >= 0) remaining.splice(index, 1);
  }

  function calendarIndexForWeek(weekNumber) {
    return Math.max(
      0,
      (weekNumber - 1) * trainingDaysPerWeek
    );
  }

  function candidateDistance(item, targetIndex) {
    const calendarIndex = calendar.indexOf(item);
    return Math.abs(calendarIndex - targetIndex);
  }

  // Reserve real Long Runs first so a Long Run Day is only allowed to fall
  // back to Aerobic when that week truly has no Long Run planned.
  for (const item of typed.filter(entry => entry.type === 'long_run')) {
    const nominalWeek = Math.min(
      totalWeeks,
      Number(item.assignment.secondaryWeek) ||
        Math.floor(item.originalIndex / trainingDaysPerWeek) + 1
    );
    const targetIndex = calendarIndexForWeek(nominalWeek);

    const sameWeekCandidates = calendar
      .filter(candidate =>
        candidate.week.week === nominalWeek &&
        !candidate.day.assignment &&
        candidate.day.effectiveRole === DAY_ROLES.LONG_RUN
      );

    const candidates = (
      sameWeekCandidates.length
        ? sameWeekCandidates
        : calendar.filter(candidate =>
            !candidate.day.assignment &&
            candidate.day.effectiveRole === DAY_ROLES.LONG_RUN
          )
    )
      .sort((a, b) =>
        candidateDistance(a, targetIndex) -
        candidateDistance(b, targetIndex)
      );

    const day = candidates[0];

    if (
      place(
        day,
        item.assignment,
        item.type,
        'Long Run placed on a designated Long Run Day.'
      )
    ) {
      removeRemaining(item);
    } else {
      pushUnscheduled(
        unscheduled,
        item.assignment,
        item.type,
        'No eligible Long Run Day exists. Long Run is never allowed on Workout Day, Easy Day, or an unavailable day.'
      );
      removeRemaining(item);
    }
  }

  function isCompatible(item, week, day) {
    if (!day.available || day.assignment) return false;

    if (item.type === 'easy') {
      // Aerobic/Easy is always allowed on every selected training day.
      // Workout Day and Long Run Day are permissions, not forced session types.
      return true;
    }

    if (item.type === 'workout') {
      return day.effectiveRole === DAY_ROLES.WORKOUT;
    }

    if (item.type === 'speed') {
      if (day.effectiveRole === DAY_ROLES.WORKOUT) {
        return true;
      }

      return (
        day.effectiveRole === DAY_ROLES.LONG_RUN &&
        !week.hasLongRun
      );
    }

    return false;
  }

  function placementReason(item, week, day) {
    if (item.type === 'workout') {
      return 'Threshold / VO2 workout placed on a designated Workout Day.';
    }

    if (item.type === 'speed') {
      return day.effectiveRole === DAY_ROLES.LONG_RUN
        ? 'Speed work used a Long Run Day because this week has no Long Run.'
        : 'Speed work placed on a designated Workout Day.';
    }

    if (day.effectiveRole === DAY_ROLES.WORKOUT) {
      return 'Aerobic session kept from the 70/20/10 sequence; Workout Day only means quality is allowed here.';
    }

    if (day.effectiveRole === DAY_ROLES.LONG_RUN) {
      return 'No Long Run is planned in this week, so the Long Run Day falls back to Aerobic.';
    }

    return 'Aerobic session placed on an Easy Day.';
  }

  // Fill the calendar chronologically while preserving the original TATE
  // slot sequence as closely as possible. On each day, take the earliest
  // remaining compatible slot. This prevents Workout Days from pulling all
  // Threshold / VO2 sessions to the front of the plan.
  for (const calendarItem of calendar) {
    if (calendarItem.day.assignment) continue;

    const nextIndex = remaining.findIndex(item =>
      isCompatible(
        item,
        calendarItem.week,
        calendarItem.day
      )
    );

    if (nextIndex < 0) continue;

    const [item] = remaining.splice(nextIndex, 1);

    place(
      calendarItem,
      item.assignment,
      item.type,
      placementReason(
        item,
        calendarItem.week,
        calendarItem.day
      )
    );
  }

  for (const item of remaining) {
    const reason = item.type === 'workout'
      ? 'No eligible Workout Day remains for this Threshold / VO2 workout.'
      : item.type === 'speed'
        ? 'No eligible Workout Day remains, and no Long Run Day without a Long Run is available for Speed.'
        : 'No selected training day remains for this Aerobic session.';

    pushUnscheduled(
      unscheduled,
      item.assignment,
      item.type,
      reason
    );
  }

  return {
    weeks,
    trainingDaysPerWeek,
    unscheduled,
    unscheduledCount: unscheduled.length,
  };
}
