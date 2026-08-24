import { normalizeStimulus } from './database-library.js';

export const PRIMARY_SECTIONS = Object.freeze([
  'Aerobic',
  'Threshold',
  'VO2max',
]);

// Backwards-compatible export used by the Lab UI.
export const SLOT_SECTIONS = PRIMARY_SECTIONS;

export const SECONDARY_TARGETS = Object.freeze({
  Aerobic: Object.freeze([
    'strides',
    'progressive',
    'long_run',
  ]),
  Threshold: Object.freeze([
    'race_specific',
    'durability',
  ]),
  VO2max: Object.freeze([
    'speed',
    'sprint',
    'hill_work',
  ]),
});

export const SECONDARY_TARGET_LABELS = Object.freeze({
  strides: 'Strides / Short Sprints',
  progressive: 'Progressive',
  long_run: 'Long Run',
  race_specific: 'Race Specific',
  durability: 'Durability',
  speed: 'Speed',
  sprint: 'Sprint',
  hill_work: 'Hill Work',
});

export const SECONDARY_OVERRIDE_STIMULI = Object.freeze({
  strides: 'Strides',
  progressive: 'Progressive',
  long_run: 'Long Run',
  race_specific: 'Race Specific',
  durability: 'Durability',
  speed: 'Speed',
  sprint: 'Sprint',
  hill_work: 'Hill Work',
});

export const EVENT_SLOT_PROFILES = Object.freeze({
  '10K': Object.freeze({
    Aerobic: 0.70,
    Threshold: 0.20,
    VO2max: 0.10,
  }),
});

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function profileForEvent(event) {
  return (
    EVENT_SLOT_PROFILES[event] ||
    EVENT_SLOT_PROFILES['10K']
  );
}

export function normalizeSecondaryTarget(value) {
  const key = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');

  const aliases = {
    stride: 'strides',
    strides: 'strides',
    shortsprints: 'strides',
    short_sprints: 'strides',
    progressive: 'progressive',
    progression: 'progressive',
    longrun: 'long_run',
    long_run: 'long_run',
    racespecific: 'race_specific',
    race_specific: 'race_specific',
    durability: 'durability',
    speed: 'speed',
    sprint: 'sprint',
    hillwork: 'hill_work',
    hill_work: 'hill_work',
    hills: 'hill_work',
  };

  return aliases[key] || key;
}

export function secondaryTargetsForPrimary(primary) {
  return SECONDARY_TARGETS[
    normalizeStimulus(primary)
  ] || [];
}

export function isSecondaryAllowed(
  primary,
  secondaryTarget
) {
  const target = normalizeSecondaryTarget(
    secondaryTarget
  );

  return secondaryTargetsForPrimary(primary).includes(
    target
  );
}

/**
 * 10K macro distribution is fixed at 70/20/10.
 * Athlete Scores personalize the workout inside a slot,
 * not the number of Aerobic / Threshold / VO2max slots.
 */
export function calculateSlotCounts({
  event = '10K',
  slotCount = 10,
} = {}) {
  const totalSlots = clamp(
    Math.round(Number(slotCount) || 0),
    1,
    100
  );
  const profile = profileForEvent(event);

  const raw = PRIMARY_SECTIONS.map(section => {
    const eventWeight = profile[section] || 0;
    const exact = eventWeight * totalSlots;

    return {
      section,
      eventWeight,
      adjustedWeight: eventWeight,
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
      b.eventWeight - a.eventWeight ||
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
        candidate =>
          candidate.section === item.section
      );

      return {
        section: item.section,
        count: updated?.count ?? item.count,
        eventWeight: item.eventWeight,
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

  for (
    let index = 0;
    index < totalSlots;
    index += 1
  ) {
    const progress = (index + 1) / totalSlots;

    let candidates = counts
      .filter(
        item =>
          used[item.section] < target[item.section]
      )
      .map(item => ({
        section: item.section,
        deficit:
          target[item.section] * progress -
          used[item.section],
        remaining:
          target[item.section] -
          used[item.section],
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
        candidate =>
          candidate.section !== previous
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
      primaryAnchor: chosen.section,
      secondaryTarget: null,
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


function choosePrimaryWorkout({
  eligible,
  exposure,
  useCounts,
  coverageUsed,
}) {
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
        ? 'Primary baseline: first exposure uses a priority workout.'
        : 'Primary rotation: least-used priority workout selected for repetition/progression.';
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

  return { chosen, reason };
}

function chooseSecondaryCandidate(
  workouts,
  primaryAnchor,
  secondaryTarget,
  useCounts
) {
  if (
    !secondaryTarget ||
    !isSecondaryAllowed(
      primaryAnchor,
      secondaryTarget
    )
  ) {
    return null;
  }

  const target = normalizeSecondaryTarget(
    secondaryTarget
  );
  const overrideStimulus =
    SECONDARY_OVERRIDE_STIMULI[target];

  const eligibleSecondary = workouts.filter(
    workout =>
      workout.active !== false &&
      normalizeStimulus(workout.stimulus) ===
        normalizeStimulus(overrideStimulus)
  );

  if (!eligibleSecondary.length) {
    return null;
  }

  const priority = eligibleSecondary.filter(
    workout => workout.role === 'priority'
  );

  return {
    chosen: leastUsed(
      priority.length
        ? priority
        : eligibleSecondary,
      useCounts
    ),
    selectionMode: 'secondary_override',
    selectedStimulus: normalizeStimulus(
      overrideStimulus
    ),
    reason:
      `Secondary override: TATE requested ${SECONDARY_TARGET_LABELS[target]} for the ${primaryAnchor} anchor and selected a dedicated ${overrideStimulus} database workout.`,
  };
}

/**
 * Slots may optionally carry `secondaryTarget`.
 * This function does NOT decide how often an override happens.
 * It only enforces the fixed hierarchy and safely resolves
 * a requested Secondary to its own database stimulus.
 * Supabase does not store Secondary metadata.
 */
export function assignWorkoutsToSlots(
  slots,
  workouts
) {
  const useCounts = {};
  const anchorExposures = {};
  const primaryWorkoutExposures = {};
  const coverageUsed = new Set();

  return slots.map(slot => {
    const primaryAnchor = normalizeStimulus(
      slot.primaryAnchor || slot.stimulus
    );

    const requestedSecondary =
      slot.secondaryTarget &&
      isSecondaryAllowed(
        primaryAnchor,
        slot.secondaryTarget
      )
        ? normalizeSecondaryTarget(
            slot.secondaryTarget
          )
        : null;

    const anchorExposure =
      (anchorExposures[primaryAnchor] || 0) + 1;
    anchorExposures[primaryAnchor] = anchorExposure;

    const secondaryChoice =
      chooseSecondaryCandidate(
        workouts,
        primaryAnchor,
        requestedSecondary,
        useCounts
      );

    if (secondaryChoice?.chosen) {
      const chosen = secondaryChoice.chosen;

      useCounts[chosen.id] =
        (useCounts[chosen.id] || 0) + 1;

      if (chosen.role === 'coverage') {
        coverageUsed.add(chosen.id);
      }

      return {
        ...slot,
        stimulus: primaryAnchor,
        primaryAnchor,
        secondaryTarget: requestedSecondary,
        status: 'assigned',
        workout: chosen,
        reason: secondaryChoice.reason,
        exposure: anchorExposure,
        anchorExposure,
        primaryExposure:
          primaryWorkoutExposures[primaryAnchor] || 0,
        selectionMode:
          secondaryChoice.selectionMode,
        selectedStimulus:
          secondaryChoice.selectedStimulus ||
          normalizeStimulus(chosen.stimulus),
        workoutUseCount: useCounts[chosen.id],
      };
    }

    const eligiblePrimary = workouts.filter(
      workout =>
        workout.active !== false &&
        normalizeStimulus(workout.stimulus) ===
          primaryAnchor
    );

    if (!eligiblePrimary.length) {
      return {
        ...slot,
        stimulus: primaryAnchor,
        primaryAnchor,
        secondaryTarget: requestedSecondary,
        status: 'missing',
        workout: null,
        selectionMode: 'missing',
        selectedStimulus: null,
        exposure: anchorExposure,
        anchorExposure,
        primaryExposure:
          primaryWorkoutExposures[primaryAnchor] || 0,
        reason:
          requestedSecondary
            ? `No eligible database workout exists for Primary ${primaryAnchor} or requested Secondary ${SECONDARY_TARGET_LABELS[requestedSecondary]}.`
            : `No eligible database workout exists for Primary ${primaryAnchor}.`,
      };
    }

    const primaryExposure =
      (primaryWorkoutExposures[primaryAnchor] || 0) + 1;
    primaryWorkoutExposures[primaryAnchor] =
      primaryExposure;

    const primaryChoice = choosePrimaryWorkout({
      eligible: eligiblePrimary,
      exposure: primaryExposure,
      useCounts,
      coverageUsed,
    });

    const chosen = primaryChoice.chosen;

    useCounts[chosen.id] =
      (useCounts[chosen.id] || 0) + 1;

    if (chosen.role === 'coverage') {
      coverageUsed.add(chosen.id);
    }

    return {
      ...slot,
      stimulus: primaryAnchor,
      primaryAnchor,
      secondaryTarget: requestedSecondary,
      status: 'assigned',
      workout: chosen,
      selectionMode: 'primary',
      selectedStimulus: primaryAnchor,
      reason:
        requestedSecondary
          ? `${primaryChoice.reason} Requested Secondary ${SECONDARY_TARGET_LABELS[requestedSecondary]} has no matching database workout yet, so Primary ${primaryAnchor} is preserved.`
          : primaryChoice.reason,
      exposure: primaryExposure,
      anchorExposure,
      primaryExposure,
      workoutUseCount: useCounts[chosen.id],
    };
  });
}

/**
 * `secondaryPlan` is optional and keyed by slot number:
 *   { 5: 'speed', 8: 'durability' }
 *
 * TATE's future exposure/need layer will create this map.
 * Keeping it external prevents an arbitrary override cadence
 * from being hard-coded here.
 */
export function buildGoalPlan({
  event = '10K',
  slotCount = 10,
  scores = {},
  workouts = [],
  secondaryPlan = {},
} = {}) {
  const counts = calculateSlotCounts({
    event,
    slotCount,
    scores,
  });

  const slots = buildSlotSequence(counts).map(
    slot => {
      const requested =
        secondaryPlan[slot.slot] || null;

      return {
        ...slot,
        secondaryTarget:
          requested &&
          isSecondaryAllowed(
            slot.primaryAnchor,
            requested
          )
            ? normalizeSecondaryTarget(
                requested
              )
            : null,
      };
    }
  );

  const assignments = assignWorkoutsToSlots(
    slots,
    workouts
  );

  return {
    event,
    slotCount: assignments.length,
    counts,
    secondaryPlan,
    assignments,
  };
}
