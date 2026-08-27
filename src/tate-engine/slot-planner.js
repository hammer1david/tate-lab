import { normalizeStimulus } from './database-library.js';

export const PRIMARY_SECTIONS = Object.freeze([
  'Aerobic',
  'Threshold',
  'VO2max',
]);

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

export const TRAINING_PHASE_CONFIG =
  Object.freeze({
    loading: Object.freeze({
      status: 'active',
      rulesDefined: true,

      primaryDistribution:
        'fixed_70_20_10',

      weeklyKmPhase:
        'loading',

      longRun: Object.freeze({
        minimumPerWeek: 1,
      }),

      aerobic: Object.freeze({
        otherSecondaryShare: 0.20,

        otherTargets:
          Object.freeze([
            'strides',
            'progressive',
          ]),
      }),

      threshold: Object.freeze({
        primaryShare: 2 / 3,
        secondaryShare: 1 / 3,

        secondaryEvery: 3,

        secondaryTargets:
          Object.freeze([
            'race_specific',
            'durability',
          ]),
      }),

      vo2max: Object.freeze({
        primaryShare: 2 / 3,
        secondaryShare: 1 / 3,

        secondaryEvery: 3,

        secondaryTargets:
          Object.freeze([
            'speed',
            'sprint',
            'hill_work',
          ]),
      }),
    }),

    base: Object.freeze({
      status: 'active',
      rulesDefined: true,

      primaryDistribution:
        'fixed_70_20_10',

      weeklyKmPhase:
        'base',

      longRun: Object.freeze({
        minimumPerWeek: 1,
      }),

      aerobic: Object.freeze({
        otherSecondaryShare: 0.20,

        otherTargets:
          Object.freeze([
            'strides',
            'progressive',
          ]),
      }),

      threshold: Object.freeze({
        primaryShare: 2 / 3,
        secondaryShare: 1 / 3,

        secondaryEvery: 3,

        secondaryTargets:
          Object.freeze([
            'race_specific',
            'durability',
          ]),
      }),

      vo2max: Object.freeze({
        primaryShare: 2 / 3,
        secondaryShare: 1 / 3,

        secondaryEvery: 3,

        secondaryTargets:
          Object.freeze([
            'speed',
            'sprint',
            'hill_work',
          ]),
      }),
    }),

    sharpening: Object.freeze({
      status: 'active',
      rulesDefined: true,

      primaryDistribution:
        'fixed_70_20_10',

      weeklyKmPhase:
        'sharpening',

      longRun: Object.freeze({
        minimumPerWeek: 1,
      }),

      aerobic: Object.freeze({
        otherSecondaryShare: 0.20,

        otherTargets:
          Object.freeze([
            'strides',
            'progressive',
          ]),
      }),

      /*
       * Sharpening:
       * Threshold anchors are split
       * 50 / 50 between Threshold
       * and Race Specific.
       */
      threshold: Object.freeze({
        primaryShare: 0.50,
        secondaryShare: 0.50,

        secondaryEvery: 2,

        secondaryTargets:
          Object.freeze([
            'race_specific',
          ]),
      }),

      vo2max: Object.freeze({
        primaryShare: 2 / 3,
        secondaryShare: 1 / 3,

        secondaryEvery: 3,

        secondaryTargets:
          Object.freeze([
            'speed',
            'sprint',
            'hill_work',
          ]),
      }),
    }),

    tapering: Object.freeze({
      status: 'active',
      rulesDefined: true,

      primaryDistribution:
        'fixed_70_20_10',

      weeklyKmPhase:
        'tapering',

      longRun: Object.freeze({
        minimumPerWeek: 1,
      }),

      aerobic: Object.freeze({
        otherSecondaryShare: 0.20,

        otherTargets:
          Object.freeze([
            'strides',
            'progressive',
          ]),
      }),

      threshold: Object.freeze({
        primaryShare: 2 / 3,
        secondaryShare: 1 / 3,

        secondaryEvery: 3,

        secondaryTargets:
          Object.freeze([
            'race_specific',
            'durability',
          ]),
      }),

      vo2max: Object.freeze({
        primaryShare: 2 / 3,
        secondaryShare: 1 / 3,

        secondaryEvery: 3,

        secondaryTargets:
          Object.freeze([
            'speed',
            'sprint',
            'hill_work',
          ]),
      }),
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
  const normalized =
    normalizeTrainingPhase(phase);

  return TRAINING_PHASE_CONFIG[
    normalized
  ];
}

export const SECONDARY_TARGETS =
  Object.freeze({
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

export const SECONDARY_TARGET_LABELS =
  Object.freeze({
    strides:
      'Strides / Short Sprints',

    progressive:
      'Progressive',

    long_run:
      'Long Run',

    race_specific:
      'Race Specific',

    durability:
      'Durability',

    speed:
      'Speed',

    sprint:
      'Sprint',

    hill_work:
      'Hill Work',
  });

export const SECONDARY_OVERRIDE_STIMULI =
  Object.freeze({
    strides: 'Strides',
    progressive: 'Progressive',
    long_run: 'Long Run',
    race_specific: 'Race Specific',
    durability: 'Durability',
    speed: 'Speed',
    sprint: 'Sprint',
    hill_work: 'Hill Work',
  });

export const SECONDARY_NEED_RULES =
  Object.freeze({
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

export const EVENT_SLOT_PROFILES =
  Object.freeze({
    '10K': Object.freeze({
      Aerobic: 0.70,
      Threshold: 0.20,
      VO2max: 0.10,
    }),
  });

function clamp(
  value,
  min,
  max
) {
  return Math.min(
    max,
    Math.max(min, value)
  );
}

function profileForEvent(event) {
  return (
    EVENT_SLOT_PROFILES[event] ||
    EVENT_SLOT_PROFILES['10K']
  );
}

export function normalizeSecondaryTarget(
  value
) {
  const key = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');

  const aliases = {
    stride: 'strides',
    strides: 'strides',

    shortsprints:
      'strides',

    short_sprints:
      'strides',

    progressive:
      'progressive',

    progression:
      'progressive',

    longrun:
      'long_run',

    long_run:
      'long_run',

    racespecific:
      'race_specific',

    race_specific:
      'race_specific',

    durability:
      'durability',

    speed:
      'speed',

    sprint:
      'sprint',

    hillwork:
      'hill_work',

    hill_work:
      'hill_work',

    hills:
      'hill_work',
  };

  return aliases[key] || key;
}

export function secondaryTargetsForPrimary(
  primary
) {
  return (
    SECONDARY_TARGETS[
      normalizeStimulus(primary)
    ] || []
  );
}

export function isSecondaryAllowed(
  primary,
  secondaryTarget
) {
  const target =
    normalizeSecondaryTarget(
      secondaryTarget
    );

  return secondaryTargetsForPrimary(
    primary
  ).includes(target);
}

function evenlySpacedCandidates(
  slots,
  count,
  blocked = new Set()
) {
  if (
    !count ||
    !slots.length
  ) {
    return [];
  }

  const available =
    slots.filter(
      slot =>
        !blocked.has(slot.slot)
    );

  if (!available.length) {
    return [];
  }

  const wanted =
    Math.min(
      count,
      available.length
    );

  const chosen = [];
  const used = new Set();

  for (
    let index = 1;
    index <= wanted;
    index += 1
  ) {
    const targetPosition =
      (
        index *
        (slots.length + 1)
      ) /
      (wanted + 1);

    const candidate =
      [...available]
        .filter(
          slot =>
            !used.has(slot.slot)
        )
        .sort((a, b) => {
          const aPosition =
            slots.indexOf(a) + 1;

          const bPosition =
            slots.indexOf(b) + 1;

          return (
            Math.abs(
              aPosition -
              targetPosition
            ) -
              Math.abs(
                bPosition -
                targetPosition
              ) ||
            a.slot -
              b.slot
          );
        })[0];

    if (candidate) {
      chosen.push(candidate);
      used.add(
        candidate.slot
      );
    }
  }

  return chosen;
}

/**
 * Automatic Secondary Need Machine.
 *
 * Primary counts stay fixed.
 *
 * Example with 30 slots:
 *
 * 21 Aerobic
 * 6 Threshold
 * 3 VO2max
 *
 * Long Run stays inside Aerobic.
 */
export function buildAutomaticSecondaryPlan({
  slots = [],
  phase = 'base',
  trainingDaysPerWeek = 7,
  estimatedWeeks = null,
  hasLongRunDay = true,
  longRunAllowed = true,
} = {}) {
  const trainingPhase =
    normalizeTrainingPhase(
      phase
    );
const phaseRule =
  phaseConfigFor(
    trainingPhase
  );
  const daysPerWeek =
    clamp(
      Math.round(
        Number(
          trainingDaysPerWeek
        ) || 7
      ),
      1,
      7
    );

  const totalWeeks =
    estimatedWeeks
      ? Math.max(
          1,
          Math.round(
            Number(
              estimatedWeeks
            ) || 1
          )
        )
      : Math.max(
          1,
          Math.ceil(
            slots.length /
            daysPerWeek
          )
        );

  const secondaryPlan = {};
  const gaps = [];

  const blockedAerobic =
    new Set();

  const aerobicSlots =
    slots.filter(
      slot =>
        normalizeStimulus(
          slot.primaryAnchor
        ) === 'Aerobic'
    );

  const thresholdSlots =
    slots.filter(
      slot =>
        normalizeStimulus(
          slot.primaryAnchor
        ) === 'Threshold'
    );

  const vo2Slots =
    slots.filter(
      slot =>
        normalizeStimulus(
          slot.primaryAnchor
        ) === 'VO2max'
    );


  let longRunCount = 0;

/*
 * LONG RUN
 *
 * Minimum:
 * 1 per simulated week.
 *
 * Long Run uses an existing
 * Aerobic anchor and therefore
 * remains inside the 70% Aerobic.
 */
if (
  longRunAllowed &&
  hasLongRunDay
) {
  for (
    let week = 1;
    week <= totalWeeks;
    week += 1
  ) {
    const startIndex =
      Math.floor(
        (
          (week - 1) *
          slots.length
        ) /
        totalWeeks
      );

    const endIndex =
      Math.ceil(
        (
          week *
          slots.length
        ) /
        totalWeeks
      );

    const inWeek =
      aerobicSlots.filter(
        slot => {
          const index =
            slot.slot - 1;

          return (
            index >= startIndex &&
            index < endIndex &&
            !blockedAerobic.has(
              slot.slot
            )
          );
        }
      );

    const weekCenter =
      startIndex +
      (
        endIndex -
        startIndex -
        1
      ) /
        2;

    const candidate =
      (
        inWeek.length
          ? inWeek
          : aerobicSlots.filter(
              slot =>
                !blockedAerobic.has(
                  slot.slot
                )
            )
      )
        .sort(
          (a, b) =>
            Math.abs(
              (
                a.slot - 1
              ) -
              weekCenter
            ) -
              Math.abs(
                (
                  b.slot - 1
                ) -
                weekCenter
              ) ||
            a.slot -
              b.slot
        )[0];

    if (candidate) {
      secondaryPlan[
        candidate.slot
      ] = {
        target:
          'long_run',

        week,

        source:
          'weekly_minimum',
      };

      blockedAerobic.add(
        candidate.slot
      );

      longRunCount += 1;
    } else {
      gaps.push({
        type:
          'long_run_need_gap',

        week,

        reason:
          'No Aerobic Primary anchor is available to satisfy the weekly Long Run minimum while preserving the 70/20/10 allocation.',
      });
    }
  }
} else if (longRunAllowed) {
  gaps.push({
    type:
      'long_run_day_missing',

    week: null,

    reason:
      'No Long Run Day is selected, so the weekly Long Run minimum cannot be scheduled.',
  });
}

  /*
   * OTHER AEROBIC SECONDARIES
   *
   * Approx:
   * 1/5 of Aerobic anchors.
   *
   * Rotation:
   * Strides
   * Progressive
   */
  const aerobicOtherCount =
  Math.floor(
    aerobicSlots.length *
    phaseRule
      .aerobic
      .otherSecondaryShare
  );

  const aerobicOther =
    evenlySpacedCandidates(
      aerobicSlots,
      aerobicOtherCount,
      blockedAerobic
    );

  aerobicOther.forEach(
    (slot, index) => {
      const targets =
  phaseRule
    .aerobic
    .otherTargets;
      
      secondaryPlan[
        slot.slot
      ] = {
        target:
          targets[
            index %
            targets.length
          ],

        source:
          'aerobic_secondary_cycle',
      };

      blockedAerobic.add(
        slot.slot
      );
    }
  );

  /*
 * THRESHOLD
 *
 * Phase policy decides how often
 * a Threshold anchor becomes a
 * secondary stimulus.
 *
 * Loading / Base / Taper:
 * 2 primary : 1 secondary
 *
 * Sharpening:
 * 1 primary : 1 Race Specific
 */
{
  const rule =
    phaseRule.threshold;

  let secondaryIndex = 0;

  thresholdSlots.forEach(
    (slot, index) => {
      if (
        (index + 1) %
          rule.secondaryEvery !==
        0
      ) {
        return;
      }

      const targets =
        rule.secondaryTargets;

      const target =
        targets[
          secondaryIndex %
          targets.length
        ];

      secondaryPlan[
        slot.slot
      ] = {
        target,

        source:
          `${trainingPhase}_threshold_phase_rule`,
      };

      secondaryIndex += 1;
    }
  );
}
              

  /*
   * VO2MAX
   *
   * 2/3 VO2max
   * 1/3 Secondary.
   *
   * Rotation:
   * Speed
   * Sprint
   * Hill Work
   */
  let vo2SecondaryIndex = 0;

  vo2Slots.forEach(
    (slot, index) => {
      if (
        (index + 1) %
          3 ===
        0
      ) {
        const targets =
  phaseRule
    .vo2max
    .secondaryTargets;

        secondaryPlan[
          slot.slot
        ] = {
          target:
            targets[
              vo2SecondaryIndex %
              targets.length
            ],

          source:
            'vo2_2_of_3',
        };

        vo2SecondaryIndex += 1;
      }
    }
  );

  const countsByTarget =
    Object.values(
      secondaryPlan
    ).reduce(
      (counts, entry) => {
        const target =
          normalizeSecondaryTarget(
            typeof entry ===
              'string'
              ? entry
              : entry?.target
          );

        counts[target] =
          (
            counts[target] ||
            0
          ) + 1;

        return counts;
      },
      {}
    );

  return {
    secondaryPlan,
    totalWeeks,
    gaps,

    summary: {
      primaryCounts: {
        Aerobic:
          aerobicSlots.length,

        Threshold:
          thresholdSlots.length,

        VO2max:
          vo2Slots.length,
      },

      longRunCount,
      countsByTarget,
    },
  };
}

/**
 * Fixed 10K macro distribution.
 *
 * Athlete Scores do NOT change:
 *
 * 70% Aerobic
 * 20% Threshold
 * 10% VO2max
 */
export function calculateSlotCounts({
  event = '10K',
  slotCount = 10,
} = {}) {
  const totalSlots =
    clamp(
      Math.round(
        Number(
          slotCount
        ) || 0
      ),
      1,
      100
    );

  const profile =
    profileForEvent(event);

  const raw =
    PRIMARY_SECTIONS.map(
      section => {
        const eventWeight =
          profile[
            section
          ] || 0;

        const exact =
          eventWeight *
          totalSlots;

        return {
          section,
          eventWeight,

          adjustedWeight:
            eventWeight,

          exact,

          count:
            Math.floor(
              exact
            ),

          remainder:
            exact -
            Math.floor(
              exact
            ),
        };
      }
    );

  let assigned =
    raw.reduce(
      (
        sum,
        item
      ) =>
        sum +
        item.count,
      0
    );

  const byRemainder =
    [...raw].sort(
      (a, b) =>
        b.remainder -
          a.remainder ||
        b.eventWeight -
          a.eventWeight ||
        a.section.localeCompare(
          b.section
        )
    );

  let cursor = 0;

  while (
    assigned <
    totalSlots
  ) {
    byRemainder[
      cursor %
      byRemainder.length
    ].count += 1;

    assigned += 1;
    cursor += 1;
  }

  return raw
    .map(item => {
      const updated =
        byRemainder.find(
          candidate =>
            candidate.section ===
            item.section
        );

      return {
        section:
          item.section,

        count:
          updated?.count ??
          item.count,

        eventWeight:
          item.eventWeight,

        adjustedWeight:
          item.adjustedWeight,
      };
    })
    .filter(
      item =>
        item.count > 0
    );
}

/**
 * Creates distributed Primary sequence.
 */
export function buildSlotSequence(
  counts
) {
  const totalSlots =
    counts.reduce(
      (
        sum,
        item
      ) =>
        sum +
        item.count,
      0
    );

  const target =
    Object.fromEntries(
      counts.map(
        item => [
          item.section,
          item.count,
        ]
      )
    );

  const used =
    Object.fromEntries(
      counts.map(
        item => [
          item.section,
          0,
        ]
      )
    );

  const slots = [];
  let previous = null;

  for (
    let index = 0;
    index < totalSlots;
    index += 1
  ) {
    const progress =
      (
        index + 1
      ) /
      totalSlots;

    let candidates =
      counts
        .filter(
          item =>
            used[
              item.section
            ] <
            target[
              item.section
            ]
        )
        .map(
          item => ({
            section:
              item.section,

            deficit:
              target[
                item.section
              ] *
                progress -
              used[
                item.section
              ],

            remaining:
              target[
                item.section
              ] -
              used[
                item.section
              ],
          })
        )
        .sort(
          (a, b) =>
            b.deficit -
              a.deficit ||
            b.remaining -
              a.remaining ||
            a.section.localeCompare(
              b.section
            )
        );

    if (
      candidates.length >
        1 &&
      candidates[0]
        .section ===
        previous
    ) {
      const alternative =
        candidates.find(
          candidate =>
            candidate.section !==
            previous
        );

      if (
        alternative &&
        alternative.deficit >=
          candidates[0]
            .deficit -
            0.35
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

    const chosen =
      candidates[0];

    used[
      chosen.section
    ] += 1;

    previous =
      chosen.section;

    slots.push({
      slot:
        index + 1,

      stimulus:
        chosen.section,

      primaryAnchor:
        chosen.section,

      secondaryTarget:
        null,
    });
  }

  return slots;
}

function leastUsed(
  workouts,
  useCounts
) {
  return [...workouts].sort(
    (a, b) =>
      (
        useCounts[
          a.id
        ] || 0
      ) -
        (
          useCounts[
            b.id
          ] || 0
        ) ||
      a.id.localeCompare(
        b.id
      )
  )[0];
}

function choosePrimaryWorkout({
  eligible,
  exposure,
  useCounts,
  coverageUsed,
}) {
  const priority =
    eligible.filter(
      workout =>
        workout.role ===
        'priority'
    );

  const unusedCoverage =
    eligible.filter(
      workout =>
        workout.role ===
          'coverage' &&
        !coverageUsed.has(
          workout.id
        )
    );

  const allCoverage =
    eligible.filter(
      workout =>
        workout.role ===
        'coverage'
    );

  let chosen;
  let reason;

  if (
    exposure === 2 &&
    unusedCoverage.length
  ) {
    chosen =
      leastUsed(
        unusedCoverage,
        useCounts
      );

    reason =
      'Coverage exposure: unused coverage workout is inserted once before priority repetition.';
  } else if (
    priority.length
  ) {
    chosen =
      leastUsed(
        priority,
        useCounts
      );

    reason =
      exposure === 1
        ? 'Primary baseline: first exposure uses a priority workout.'
        : 'Primary rotation: least-used priority workout selected for repetition/progression.';
  } else if (
    unusedCoverage.length
  ) {
    chosen =
      leastUsed(
        unusedCoverage,
        useCounts
      );

    reason =
      'Coverage fallback: no priority workout exists.';
  } else {
    chosen =
      leastUsed(
        allCoverage,
        useCounts
      );

    reason =
      'Coverage repeat: database has no priority alternative.';
  }

  return {
    chosen,
    reason,
  };
}

function chooseStridesAddon(
  workouts,
  useCounts
) {
  const eligible =
    workouts.filter(
      workout =>
        workout.active !== false &&
        normalizeStimulus(
          workout.stimulus
        ) === 'Strides'
    );

  if (!eligible.length) {
    return null;
  }

  const priority =
    eligible.filter(
      workout =>
        workout.role === 'priority'
    );

  return leastUsed(
    priority.length
      ? priority
      : eligible,
    useCounts
  );
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

  const target =
    normalizeSecondaryTarget(
      secondaryTarget
    );

  // Strides are never a standalone Secondary override.
  // They are attached to the selected Aerobic Primary workout below.
  if (target === 'strides') {
    return null;
  }

  const overrideStimulus =
    SECONDARY_OVERRIDE_STIMULI[
      target
    ];

  const eligibleSecondary =
    workouts.filter(
      workout =>
        workout.active !==
          false &&
        normalizeStimulus(
          workout.stimulus
        ) ===
          normalizeStimulus(
            overrideStimulus
          )
    );

  if (
    !eligibleSecondary.length
  ) {
    return null;
  }

  const priority =
    eligibleSecondary.filter(
      workout =>
        workout.role ===
        'priority'
    );

  return {
    chosen:
      leastUsed(
        priority.length
          ? priority
          : eligibleSecondary,
        useCounts
      ),

    selectionMode:
      'secondary_override',

    selectedStimulus:
      normalizeStimulus(
        overrideStimulus
      ),

    reason:
      `Secondary override: TATE requested ${SECONDARY_TARGET_LABELS[target]} for the ${primaryAnchor} anchor and selected a dedicated ${overrideStimulus} database workout.`,
  };
}

export function assignWorkoutsToSlots(
  slots,
  workouts
) {
  const useCounts = {};

  const anchorExposures = {};

  const primaryWorkoutExposures =
    {};

  const coverageUsed =
    new Set();

  return slots.map(
    slot => {
      const primaryAnchor =
        normalizeStimulus(
          slot.primaryAnchor ||
          slot.stimulus
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
        (
          anchorExposures[
            primaryAnchor
          ] || 0
        ) + 1;

      anchorExposures[
        primaryAnchor
      ] =
        anchorExposure;

      const secondaryChoice =
        chooseSecondaryCandidate(
          workouts,
          primaryAnchor,
          requestedSecondary,
          useCounts
        );

      if (
        secondaryChoice?.chosen
      ) {
        const chosen =
          secondaryChoice.chosen;

        useCounts[
          chosen.id
        ] =
          (
            useCounts[
              chosen.id
            ] || 0
          ) + 1;

        if (
          chosen.role ===
          'coverage'
        ) {
          coverageUsed.add(
            chosen.id
          );
        }

        return {
          ...slot,

          stimulus:
            primaryAnchor,

          primaryAnchor,

          secondaryTarget:
            requestedSecondary,

          status:
            'assigned',

          workout:
            chosen,

          reason:
            secondaryChoice.reason,

          exposure:
            anchorExposure,

          anchorExposure,

          primaryExposure:
            primaryWorkoutExposures[
              primaryAnchor
            ] || 0,

          selectionMode:
            secondaryChoice
              .selectionMode,

          selectedStimulus:
            secondaryChoice
              .selectedStimulus ||
            normalizeStimulus(
              chosen.stimulus
            ),

          workoutUseCount:
            useCounts[
              chosen.id
            ],
        };
      }

      const eligiblePrimary =
        workouts.filter(
          workout =>
            workout.active !==
              false &&
            normalizeStimulus(
              workout.stimulus
            ) ===
              primaryAnchor
        );

      if (
        !eligiblePrimary.length
      ) {
        return {
          ...slot,

          stimulus:
            primaryAnchor,

          primaryAnchor,

          secondaryTarget:
            requestedSecondary,

          status:
            'missing',

          workout:
            null,

          selectionMode:
            'missing',

          selectedStimulus:
            requestedSecondary === 'strides'
              ? primaryAnchor
              : requestedSecondary
                ? normalizeStimulus(
                    SECONDARY_OVERRIDE_STIMULI[
                      requestedSecondary
                    ]
                  )
                : primaryAnchor,

          addonWorkout:
            null,

          addonStimulus:
            requestedSecondary === 'strides'
              ? 'Strides'
              : null,

          addonStatus:
            requestedSecondary === 'strides'
              ? 'blocked_primary_missing'
              : null,

          exposure:
            anchorExposure,

          anchorExposure,

          primaryExposure:
            primaryWorkoutExposures[
              primaryAnchor
            ] || 0,

          reason:
            requestedSecondary === 'strides'
              ? `No eligible ${primaryAnchor} Primary workout exists, so Strides cannot be scheduled alone.`
              : requestedSecondary
                ? `No eligible database workout exists for requested Secondary ${SECONDARY_TARGET_LABELS[requestedSecondary]} or fallback Primary ${primaryAnchor}.`
                : `No eligible database workout exists for Primary ${primaryAnchor}.`,
        };
      }

      const primaryExposure =
        (
          primaryWorkoutExposures[
            primaryAnchor
          ] || 0
        ) + 1;

      primaryWorkoutExposures[
        primaryAnchor
      ] =
        primaryExposure;

      const primaryChoice =
        choosePrimaryWorkout({
          eligible:
            eligiblePrimary,

          exposure:
            primaryExposure,

          useCounts,

          coverageUsed,
        });

      const chosen =
        primaryChoice.chosen;

      useCounts[
        chosen.id
      ] =
        (
          useCounts[
            chosen.id
          ] || 0
        ) + 1;

      const stridesAddon =
        requestedSecondary === 'strides' &&
        primaryAnchor === 'Aerobic'
          ? chooseStridesAddon(
              workouts,
              useCounts
            )
          : null;

      if (stridesAddon) {
        useCounts[
          stridesAddon.id
        ] =
          (
            useCounts[
              stridesAddon.id
            ] || 0
          ) + 1;
      }

      if (
        chosen.role ===
        'coverage'
      ) {
        coverageUsed.add(
          chosen.id
        );
      }

      return {
        ...slot,

        stimulus:
          primaryAnchor,

        primaryAnchor,

        secondaryTarget:
          requestedSecondary,

        status:
          'assigned',

        workout:
          chosen,

        selectionMode:
          requestedSecondary === 'strides'
            ? stridesAddon
              ? 'primary_with_addon'
              : 'primary_addon_gap'
            : 'primary',

        selectedStimulus:
          primaryAnchor,

        addonWorkout:
          requestedSecondary === 'strides'
            ? stridesAddon
            : null,

        addonStimulus:
          requestedSecondary === 'strides'
            ? 'Strides'
            : null,

        addonStatus:
          requestedSecondary === 'strides'
            ? stridesAddon
              ? 'assigned'
              : 'missing'
            : null,

        reason:
          requestedSecondary === 'strides'
            ? stridesAddon
              ? `${primaryChoice.reason} Strides are attached after this Aerobic run as an add-on and never occupy a separate training slot.`
              : `${primaryChoice.reason} Strides add-on requested, but no eligible Strides database workout exists. The Aerobic run remains scheduled and the add-on is marked as a database gap.`
            : requestedSecondary
              ? `${primaryChoice.reason} Requested Secondary ${SECONDARY_TARGET_LABELS[requestedSecondary]} has no matching database workout yet, so Primary ${primaryAnchor} is used as database fallback.`
              : primaryChoice.reason,

        exposure:
          primaryExposure,

        anchorExposure,

        primaryExposure,

        workoutUseCount:
          useCounts[
            chosen.id
          ],
      };
    }
  );
}

/**
 * Main plan builder.
 *
 * Supports:
 * - automatic Secondary Need Machine
 * - manual secondaryPlan overrides
 *
 * `secondaryNeedConfig` is what
 * current main.js sends.
 */
export function buildGoalPlan({
  event = '10K',
  phase = 'base',
  slotCount = 10,
  scores = {},
  workouts = [],
  secondaryPlan = {},
  secondaryContext = null,
  secondaryNeedConfig = null,
} = {}) {
  const trainingPhase =
    normalizeTrainingPhase(
      phase
    );

  const counts =
    calculateSlotCounts({
      event,
      slotCount,
      scores,
    });

  const baseSlots =
    buildSlotSequence(
      counts
    );

  const automaticSecondaryInput =
    secondaryNeedConfig
      ?.enabled
      ? {
          trainingDaysPerWeek:
            secondaryNeedConfig
              .trainingDaysPerWeek,

          estimatedWeeks:
            secondaryNeedConfig
              .estimatedWeeks,

          hasLongRunDay:
  secondaryNeedConfig
    .hasLongRunDay !==
  false,

longRunAllowed:
  secondaryNeedConfig
    .longRunAllowed !==
  false,
        }
      : secondaryContext
        ? {
            trainingDaysPerWeek:
              secondaryContext
                .trainingDaysPerWeek,

            estimatedWeeks:
              secondaryContext
                .estimatedWeeks,

            hasLongRunDay:
              secondaryContext
                .hasLongRunDay,
          }
        : null;

  const automaticSecondary =
    automaticSecondaryInput
      ? buildAutomaticSecondaryPlan({
          slots:
            baseSlots,

          phase:
            trainingPhase,

          trainingDaysPerWeek:
            automaticSecondaryInput
              .trainingDaysPerWeek,

          estimatedWeeks:
            automaticSecondaryInput
              .estimatedWeeks,

          hasLongRunDay:
            automaticSecondaryInput
              .hasLongRunDay,

        longRunAllowed:
  automaticSecondaryInput
    .longRunAllowed,
        })
      : {
          secondaryPlan: {},
          totalWeeks: null,
          gaps: [],
          summary: null,
        };

  const mergedSecondaryPlan = {
    ...automaticSecondary
      .secondaryPlan,

    ...secondaryPlan,
  };

  const slots =
    baseSlots.map(
      slot => {
        const requestedEntry =
          mergedSecondaryPlan[
            slot.slot
          ] || null;

        const requested =
          typeof requestedEntry ===
          'string'
            ? requestedEntry
            : requestedEntry
                ?.target ||
              null;

        const requestedWeek =
          typeof requestedEntry ===
          'object'
            ? Number(
                requestedEntry
                  ?.week
              ) || null
            : null;

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

          secondaryWeek:
            requestedWeek,

          secondarySource:
            typeof requestedEntry ===
            'object'
              ? requestedEntry
                  ?.source ||
                null
              : null,
        };
      }
    );

  const assignments =
    assignWorkoutsToSlots(
      slots,
      workouts
    );

  const targetCounts =
    automaticSecondary
      .summary
      ?.countsByTarget ||
    {};

  const primaryCounts =
    automaticSecondary
      .summary
      ?.primaryCounts ||
    {
      Aerobic:
        counts.find(
          item =>
            item.section ===
            'Aerobic'
        )?.count || 0,

      Threshold:
        counts.find(
          item =>
            item.section ===
            'Threshold'
        )?.count || 0,

      VO2max:
        counts.find(
          item =>
            item.section ===
            'VO2max'
        )?.count || 0,
    };

  const secondarySummary = {
    normalAerobic:
      Math.max(
        0,

        primaryCounts
          .Aerobic -

          (
            targetCounts
              .long_run ||
            0
          ) -

          (
            targetCounts
              .strides ||
            0
          ) -

          (
            targetCounts
              .progressive ||
            0
          )
      ),

    longRun:
      targetCounts
        .long_run ||
      0,

    strides:
      targetCounts
        .strides ||
      0,

    progressive:
      targetCounts
        .progressive ||
      0,

    threshold:
      Math.max(
        0,

        primaryCounts
          .Threshold -

          (
            targetCounts
              .race_specific ||
            0
          ) -

          (
            targetCounts
              .durability ||
            0
          )
      ),

    raceSpecific:
      targetCounts
        .race_specific ||
      0,

    durability:
      targetCounts
        .durability ||
      0,

    vo2max:
      Math.max(
        0,

        primaryCounts
          .VO2max -

          (
            targetCounts
              .speed ||
            0
          ) -

          (
            targetCounts
              .sprint ||
            0
          ) -

          (
            targetCounts
              .hill_work ||
            0
          )
      ),

    speed:
      targetCounts
        .speed ||
      0,

    sprint:
      targetCounts
        .sprint ||
      0,

    hillWork:
      targetCounts
        .hill_work ||
      0,
  };

  return {
    event,

    phase:
      trainingPhase,

    phaseConfig:
      phaseConfigFor(
        trainingPhase
      ),

    slotCount:
      assignments.length,

    counts,

    secondaryPlan:
      mergedSecondaryPlan,

    secondaryNeedSummary:
      automaticSecondary
        .summary,

    secondaryNeedGaps:
      automaticSecondary
        .gaps,

    secondarySummary,

    assignments,
  };
              }
