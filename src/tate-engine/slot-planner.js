import { normalizeStimulus } from './database-library.js';

export const PRIMARY_SECTIONS = Object.freeze([
  'Aerobic',
  'Threshold',
  'VO2max',
]);

// Backwards-compatible export used by the Lab UI.
export const SLOT_SECTIONS = PRIMARY_SECTIONS;

export const TRAINING_PHASES = Object.freeze([
  'loading',
  'base',
  'sharpening',
  'tapering',
]);

export const TRAINING_PHASE_LABELS = Object.freeze({
  loading: 'Loading',
  base: 'Base',
  sharpening: 'Sharpening',
  tapering: 'Tapering',
});

// Phase-specific training rules are intentionally not active yet.
// The four periods exist as stable placeholders so Loading and Base
// can be defined first without hard-coding unfinished later phases.
export const TRAINING_PHASE_CONFIG = Object.freeze({
  loading: Object.freeze({
    status: 'placeholder',
    rulesDefined: false,
  }),
  base: Object.freeze({
    status: 'placeholder',
    rulesDefined: false,
  }),
  sharpening: Object.freeze({
    status: 'placeholder',
    rulesDefined: false,
  }),
  tapering: Object.freeze({
    status: 'placeholder',
    rulesDefined: false,
  }),
});

export function normalizeTrainingPhase(value) {
  const key = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '');

  const aliases = {
    loading: 'loading',
    load: 'loading',
    base: 'base',
    basetraining: 'base',
    sharpening: 'sharpening',
    sharpen: 'sharpening',
    tapering: 'tapering',
    taper: 'tapering',
  };

  return aliases[key] || 'base';
}

export function phaseConfigFor(phase) {
  const normalized = normalizeTrainingPhase(phase);
  return TRAINING_PHASE_CONFIG[normalized];
}

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


export const SECONDARY_NEED_RULES = Object.freeze({
  Aerobic: Object.freeze({
    normalShare: 0.60,
    longRunShare: 0.20,
    otherSecondaryShare: 0.20,
    otherTargets: Object.freeze([
      'strides',
      'progressive',
    ]),
    longRunMinimumPerWeek: 1,
  }),
  Threshold: Object.freeze({
    primaryShare: 2 / 3,
    secondaryShare: 1 / 3,
    targets: Object.freeze([
      'race_specific',
      'durability',
    ]),
  }),
  VO2max: Object.freeze({
    primaryShare: 2 / 3,
    secondaryShare: 1 / 3,
    targets: Object.freeze([
      'speed',
      'sprint',
      'hill_work',
    ]),
  }),
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


function evenlySpacedCandidates(slots, count, blocked = new Set()) {
  if (!count || !slots.length) return [];

  const available = slots.filter(
    slot => !blocked.has(slot.slot)
  );

  if (!available.length) return [];

  const wanted = Math.min(count, available.length);
  const chosen = [];
  const used = new Set();

  for (let index = 1; index <= wanted; index += 1) {
    const targetPosition =
      (index * (slots.length + 1)) / (wanted + 1);

    const candidate = [...available]
      .filter(slot => !used.has(slot.slot))
      .sort((a, b) => {
        const aPosition = slots.indexOf(a) + 1;
        const bPosition = slots.indexOf(b) + 1;

        return (
          Math.abs(aPosition - targetPosition) -
            Math.abs(bPosition - targetPosition) ||
          a.slot - b.slot
        );
      })[0];

    if (candidate) {
      chosen.push(candidate);
      used.add(candidate.slot);
    }
  }

  return chosen;
}

/**
 * Builds TATE's automatic Secondary Need plan while preserving the fixed
 * Primary allocation. Secondary sessions never change the 70/20/10 anchor
 * counts; they replace the workout used inside an existing Primary anchor.
 *
 * `trainingDaysPerWeek` and `hasLongRunDay` come from the Lab/week-card
 * availability layer. Long Run is an Aerobic Secondary and therefore remains
 * inside the 70% Aerobic allocation.
 */
export function buildAutomaticSecondaryPlan({
  slots = [],
  phase = 'base',
  trainingDaysPerWeek = 7,
  hasLongRunDay = true,
} = {}) {
  const trainingPhase = normalizeTrainingPhase(phase);
  const daysPerWeek = clamp(
    Math.round(Number(trainingDaysPerWeek) || 0),
    1,
    7
  );
  const totalWeeks = Math.max(
    1,
    Math.ceil(slots.length / daysPerWeek)
  );

  const secondaryPlan = {};
  const gaps = [];
  const blockedAerobic = new Set();

  const aerobicSlots = slots.filter(
    slot =>
      normalizeStimulus(slot.primaryAnchor) === 'Aerobic'
  );
  const thresholdSlots = slots.filter(
    slot =>
      normalizeStimulus(slot.primaryAnchor) === 'Threshold'
  );
  const vo2Slots = slots.filter(
    slot =>
      normalizeStimulus(slot.primaryAnchor) === 'VO2max'
  );

  let longRunCount = 0;

  if (hasLongRunDay) {
    for (let week = 1; week <= totalWeeks; week += 1) {
      const startIndex = (week - 1) * daysPerWeek;
      const endIndex = Math.min(
        slots.length,
        startIndex + daysPerWeek
      );

      const inWeek = aerobicSlots.filter(slot => {
        const index = slot.slot - 1;
        return (
          index >= startIndex &&
          index < endIndex &&
          !blockedAerobic.has(slot.slot)
        );
      });

      const weekCenter =
        startIndex + (endIndex - startIndex - 1) / 2;

      const candidate = (
        inWeek.length
          ? inWeek
          : aerobicSlots.filter(
              slot => !blockedAerobic.has(slot.slot)
            )
      )
        .sort((a, b) =>
          Math.abs((a.slot - 1) - weekCenter) -
            Math.abs((b.slot - 1) - weekCenter) ||
          a.slot - b.slot
        )[0];

      if (candidate) {
        secondaryPlan[candidate.slot] = {
          target: 'long_run',
          week,
          source: 'weekly_minimum',
        };
        blockedAerobic.add(candidate.slot);
        longRunCount += 1;
      } else {
        gaps.push({
          type: 'long_run_need_gap',
          week,
          reason:
            'No Aerobic Primary anchor is available to satisfy the weekly Long Run minimum while preserving the 70/20/10 allocation.',
        });
      }
    }
  } else {
    gaps.push({
      type: 'long_run_day_missing',
      week: null,
      reason:
        'No Long Run Day is selected, so the weekly Long Run minimum cannot be scheduled.',
    });
  }

  const aerobicOtherCount = Math.floor(
    aerobicSlots.length *
      SECONDARY_NEED_RULES.Aerobic.otherSecondaryShare
  );
  const aerobicOther = evenlySpacedCandidates(
    aerobicSlots,
    aerobicOtherCount,
    blockedAerobic
  );

  aerobicOther.forEach((slot, index) => {
    const targets =
      SECONDARY_NEED_RULES.Aerobic.otherTargets;
    secondaryPlan[slot.slot] = {
      target: targets[index % targets.length],
      source: 'aerobic_secondary_cycle',
    };
    blockedAerobic.add(slot.slot);
  });

  if (trainingPhase === 'sharpening') {
    thresholdSlots.forEach((slot, index) => {
      if ((index + 1) % 2 === 0) {
        secondaryPlan[slot.slot] = {
          target: 'race_specific',
          source: 'sharpening_threshold_50_50',
        };
      }
    });
  } else {
    let secondaryIndex = 0;
    thresholdSlots.forEach((slot, index) => {
      if ((index + 1) % 3 === 0) {
        const targets =
          SECONDARY_NEED_RULES.Threshold.targets;
        secondaryPlan[slot.slot] = {
          target:
            targets[secondaryIndex % targets.length],
          source: 'threshold_2_of_3',
        };
        secondaryIndex += 1;
      }
    });
  }

  let vo2SecondaryIndex = 0;
  vo2Slots.forEach((slot, index) => {
    if ((index + 1) % 3 === 0) {
      const targets = SECONDARY_NEED_RULES.VO2max.targets;
      secondaryPlan[slot.slot] = {
        target:
          targets[vo2SecondaryIndex % targets.length],
        source: 'vo2_2_of_3',
      };
      vo2SecondaryIndex += 1;
    }
  });

  const countsByTarget = Object.values(secondaryPlan)
    .reduce((counts, entry) => {
      const target = normalizeSecondaryTarget(
        typeof entry === 'string'
          ? entry
          : entry?.target
      );
      counts[target] = (counts[target] || 0) + 1;
      return counts;
    }, {});

  return {
    secondaryPlan,
    totalWeeks,
    gaps,
    summary: {
      primaryCounts: {
        Aerobic: aerobicSlots.length,
        Threshold: thresholdSlots.length,
        VO2max: vo2Slots.length,
      },
      longRunCount,
      countsByTarget,
    },
  };
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
  phase = 'base',
  slotCount = 10,
  scores = {},
  workouts = [],
  secondaryPlan = {},
  secondaryContext = null,
} = {}) {
  const trainingPhase = normalizeTrainingPhase(phase);
  const counts = calculateSlotCounts({
    event,
    slotCount,
    scores,
  });

  const baseSlots = buildSlotSequence(counts);
  const automaticSecondary = secondaryContext
    ? buildAutomaticSecondaryPlan({
        slots: baseSlots,
        phase: trainingPhase,
        trainingDaysPerWeek:
          secondaryContext.trainingDaysPerWeek,
        hasLongRunDay:
          secondaryContext.hasLongRunDay,
      })
    : {
        secondaryPlan: {},
        totalWeeks: null,
        gaps: [],
        summary: null,
      };

  const mergedSecondaryPlan = {
    ...automaticSecondary.secondaryPlan,
    ...secondaryPlan,
  };

  const slots = baseSlots.map(slot => {
    const requestedEntry =
      mergedSecondaryPlan[slot.slot] || null;
    const requested =
      typeof requestedEntry === 'string'
        ? requestedEntry
        : requestedEntry?.target || null;
    const requestedWeek =
      typeof requestedEntry === 'object'
        ? Number(requestedEntry?.week) || null
        : null;

    return {
      ...slot,
      secondaryTarget:
        requested &&
        isSecondaryAllowed(
          slot.primaryAnchor,
          requested
        )
          ? normalizeSecondaryTarget(requested)
          : null,
      secondaryWeek: requestedWeek,
      secondarySource:
        typeof requestedEntry === 'object'
          ? requestedEntry?.source || null
          : null,
    };
  });

  const assignments = assignWorkoutsToSlots(
    slots,
    workouts
  );

  return {
    event,
    phase: trainingPhase,
    phaseConfig: phaseConfigFor(trainingPhase),
    slotCount: assignments.length,
    counts,
    secondaryPlan: mergedSecondaryPlan,
    secondaryNeedSummary: automaticSecondary.summary,
    secondaryNeedGaps: automaticSecondary.gaps,
    assignments,
  };
}
