import { normalizeStimulus } from './database-library.js';

export const SLOT_SECTIONS = Object.freeze([
  'VO2max',
  'Threshold',
  '10K Specific',
  'Aerobic',
  'Speed Endurance',
  'Speed',
]);

export const EVENT_SLOT_PROFILES = Object.freeze({
  '10K': Object.freeze({
    VO2max: 0.22,
    Threshold: 0.32,
    '10K Specific': 0.25,
    Aerobic: 0.10,
    'Speed Endurance': 0.07,
    Speed: 0.04,
  }),
});

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function scoreNeedMultiplier(score) {
  const value = clamp(Number(score) || 50, 1, 100);
  return 0.8 + ((100 - value) / 100) * 0.4;
}

function profileForEvent(event) {
  return (
    EVENT_SLOT_PROFILES[event] ||
    EVENT_SLOT_PROFILES['10K']
  );
}

export function calculateSlotCounts({
  event = '10K',
  slotCount = 10,
  scores = {},
} = {}) {
  const totalSlots = clamp(
    Math.round(Number(slotCount) || 0),
    1,
    100
  );
  const profile = profileForEvent(event);

  const weighted = SLOT_SECTIONS.map(section => {
    const eventWeight = profile[section] || 0;
    const needMultiplier = scoreNeedMultiplier(
      scores[section]
    );

    return {
      section,
      eventWeight,
      needMultiplier,
      adjustedWeight: eventWeight * needMultiplier,
    };
  });

  const weightTotal = weighted.reduce(
    (sum, item) => sum + item.adjustedWeight,
    0
  );

  const raw = weighted.map(item => {
    const exact =
      weightTotal > 0
        ? (item.adjustedWeight / weightTotal) *
          totalSlots
        : 0;

    return {
      ...item,
      exact,
      count: Math.floor(exact),
      remainder: exact - Math.floor(exact),
    };
  });

  let assigned = raw.reduce(
    (sum, item) => sum + item.count,
    0
  );

  const byRemainder = [...raw].sort(
    (a, b) =>
      b.remainder - a.remainder ||
      b.adjustedWeight - a.adjustedWeight ||
      a.section.localeCompare(b.section)
  );

  let cursor = 0;

  while (assigned < totalSlots) {
    byRemainder[cursor % byRemainder.length].count += 1;
    assigned += 1;
    cursor += 1;
  }

  return raw
    .map(item => {
      const updated = byRemainder.find(
        candidate => candidate.section === item.section
      );

      return {
        section: item.section,
        count: updated?.count ?? item.count,
        eventWeight: item.eventWeight,
        needMultiplier: item.needMultiplier,
        adjustedWeight: item.adjustedWeight,
      };
    })
    .filter(item => item.count > 0);
}

export function buildSlotSequence(counts) {
  const totalSlots = counts.reduce(
    (sum, item) => sum + item.count,
    0
  );

  const target = Object.fromEntries(
    counts.map(item => [item.section, item.count])
  );
  const used = Object.fromEntries(
    counts.map(item => [item.section, 0])
  );

  const slots = [];
  let previous = null;

  for (let index = 0; index < totalSlots; index += 1) {
    const progress = (index + 1) / totalSlots;

    let candidates = counts
      .filter(
        item => used[item.section] < target[item.section]
      )
      .map(item => ({
        section: item.section,
        deficit:
          target[item.section] * progress -
          used[item.section],
        remaining:
          target[item.section] - used[item.section],
      }))
      .sort(
        (a, b) =>
          b.deficit - a.deficit ||
          b.remaining - a.remaining ||
          a.section.localeCompare(b.section)
      );

    if (
      candidates.length > 1 &&
      candidates[0].section === previous
    ) {
      const alternative = candidates.find(
        candidate => candidate.section !== previous
      );

      if (
        alternative &&
        alternative.deficit >=
          candidates[0].deficit - 0.35
      ) {
        candidates = [
          alternative,
          ...candidates.filter(
            candidate =>
              candidate.section !==
              alternative.section
          ),
        ];
      }
    }

    const chosen = candidates[0];
    used[chosen.section] += 1;
    previous = chosen.section;

    slots.push({
      slot: index + 1,
      stimulus: chosen.section,
    });
  }

  return slots;
}

function leastUsed(workouts, useCounts) {
  return [...workouts].sort(
    (a, b) =>
      (useCounts[a.id] || 0) -
        (useCounts[b.id] || 0) ||
      a.id.localeCompare(b.id)
  )[0];
}

export function assignWorkoutsToSlots(
  slots,
  workouts
) {
  const useCounts = {};
  const stimulusExposures = {};
  const coverageUsed = new Set();

  return slots.map(slot => {
    const stimulus = normalizeStimulus(
      slot.stimulus
    );
    const eligible = workouts.filter(
      workout =>
        workout.active !== false &&
        normalizeStimulus(workout.stimulus) ===
          stimulus
    );

    if (!eligible.length) {
      return {
        ...slot,
        stimulus,
        status: 'missing',
        workout: null,
        reason:
          'No eligible database workout exists for this stimulus.',
      };
    }

    const priority = eligible.filter(
      workout => workout.role === 'priority'
    );
    const unusedCoverage = eligible.filter(
      workout =>
        workout.role === 'coverage' &&
        !coverageUsed.has(workout.id)
    );
    const allCoverage = eligible.filter(
      workout => workout.role === 'coverage'
    );

    const exposure =
      (stimulusExposures[stimulus] || 0) + 1;

    let chosen;
    let reason;

    if (
      exposure === 2 &&
      unusedCoverage.length
    ) {
      chosen = leastUsed(
        unusedCoverage,
        useCounts
      );
      reason =
        'Coverage exposure: unused coverage workout is inserted once before priority repetition.';
    } else if (priority.length) {
      chosen = leastUsed(priority, useCounts);
      reason =
        exposure === 1
          ? 'Priority baseline: first exposure uses a priority workout.'
          : 'Priority rotation: least-used priority workout selected for repetition/progression.';
    } else if (unusedCoverage.length) {
      chosen = leastUsed(
        unusedCoverage,
        useCounts
      );
      reason =
        'Coverage fallback: no priority workout exists.';
    } else {
      chosen = leastUsed(allCoverage, useCounts);
      reason =
        'Coverage repeat: database has no priority alternative.';
    }

    useCounts[chosen.id] =
      (useCounts[chosen.id] || 0) + 1;
    stimulusExposures[stimulus] = exposure;

    if (chosen.role === 'coverage') {
      coverageUsed.add(chosen.id);
    }

    return {
      ...slot,
      stimulus,
      status: 'assigned',
      workout: chosen,
      reason,
      exposure,
      workoutUseCount: useCounts[chosen.id],
    };
  });
}

export function buildGoalPlan({
  event = '10K',
  slotCount = 10,
  scores = {},
  workouts = [],
} = {}) {
  const counts = calculateSlotCounts({
    event,
    slotCount,
    scores,
  });

  const slots = buildSlotSequence(counts);
  const assignments = assignWorkoutsToSlots(
    slots,
    workouts
  );

  return {
    event,
    slotCount: assignments.length,
    counts,
    assignments,
  };
}
