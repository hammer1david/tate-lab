import {
  thresholdDoseByTolerance,
  eventCompositeRules,
  racePhaseBias,
} from './config.js';

import {
  compareProgression,
  compareWorkoutSimilarity,
} from './progression.js';

import {
  scoreCandidate,
} from './scoring.js';

import {
  stableHash,
  parseTimeToSeconds,
  secondsToClock,
  clamp,
} from './utils.js';

function paceFrom5k(
  athlete,
  factor
) {
  const t =
    parseTimeToSeconds(
      athlete.current5k
    ) || 900;

  return (t / 5) * factor;
}

function workoutBlock(
  reps,
  distanceMeters,
  targetSecondsPerRep,
  recoverySeconds,
  recoveryType = 'jog'
) {
  return {
    kind: 'work',
    reps,
    distanceMeters,
    targetSecondsPerRep,
    recoverySeconds,
    recoveryType,
  };
}

function interBlock(
  durationSeconds,
  type = 'jog'
) {
  return {
    kind: 'inter_block_rest',
    durationSeconds,
    type,
  };
}

function signature(candidate) {
  return stableHash(
    JSON.stringify(
      candidate.blocks.map(
        b => ({
          kind: b.kind,
          reps: b.reps,
          distanceMeters:
            b.distanceMeters,
          targetSecondsPerRep:
            b.targetSecondsPerRep,
          recoverySeconds:
            b.recoverySeconds,
        })
      )
    )
  );
}

function thresholdCandidates(
  athlete
) {
  const dose =
    thresholdDoseByTolerance[
      athlete.tolerance
    ] ||
    thresholdDoseByTolerance
      .established;

  const threshold1k =
    paceFrom5k(
      athlete,
      1.08
    );

  const defaultReps =
    dose.defaultReps1000;

  const candidates = [
    {
      family:
        'ThresholdIntervals',

      label:
        `${defaultReps}×1000m Threshold`,

      blocks: [
        workoutBlock(
          defaultReps,
          1000,
          threshold1k,
          60
        ),
      ],

      complexity: 0,

      secondary: [
        'Aerobic',
      ],
    },

    {
      family:
        'ThresholdIntervals',

      label:
        `${Math.max(
          4,
          defaultReps - 1
        )}×1000m Threshold`,

      blocks: [
        workoutBlock(
          Math.max(
            4,
            defaultReps - 1
          ),
          1000,
          threshold1k,
          60
        ),
      ],

      complexity: 0,

      secondary: [
        'Aerobic',
      ],
    },

    {
      family:
        'ThresholdIntervals',

      label:
        `${defaultReps + 1}×1000m Threshold`,

      blocks: [
        workoutBlock(
          defaultReps + 1,
          1000,
          threshold1k,
          60
        ),
      ],

      complexity: 0,

      secondary: [
        'Aerobic',
      ],
    },

    {
      family:
        'ThresholdLongReps',

      label:
        '3×10min Threshold',

      blocks: [
        workoutBlock(
          3,
          0,
          600,
          120
        ),
      ],

      complexity: 0.05,

      secondary: [
        'Aerobic',
      ],
    },
  ];

  const allowComposite =
    eventCompositeRules[
      athlete.goalEvent
    ]?.thresholdPlusSpeedDefault;

  if (allowComposite) {
    const fast200 =
      paceFrom5k(
        athlete,
        0.92
      ) * 0.2;

    candidates.push({
      family:
        'ThresholdPlusSpeedMaintenance',

      label:
        `${Math.max(
          4,
          defaultReps - 1
        )}×1000m Threshold + 6×200m fast relaxed`,

      blocks: [
        workoutBlock(
          Math.max(
            4,
            defaultReps - 1
          ),
          1000,
          threshold1k,
          60
        ),

        interBlock(
          300,
          'jog'
        ),

        workoutBlock(
          6,
          200,
          fast200,
          60
        ),
      ],

      complexity: 0.42,

      secondary: [
        'Speed',
      ],
    });
  }

  candidates.push({
    family:
      'OnOffFartlek',

    label:
      '10×2min fast / 1min easy',

    blocks: [
      workoutBlock(
        10,
        0,
        120,
        60,
        'jog'
      ),
    ],

    complexity: 0.12,

    secondary: [
      'VO2max',
    ],
  });

  return candidates;
}

function genericCandidates(
  athlete
) {
  const pace1k =
    paceFrom5k(
      athlete,
      athlete.primaryNeed ===
        'VO2max'
        ? 0.96
        : 1.0
    );

  return [
    {
      family:
        athlete.primaryNeed,

      label:
        `5×1000m ${athlete.primaryNeed}`,

      blocks: [
        workoutBlock(
          5,
          1000,
          pace1k,
          120
        ),
      ],

      complexity: 0.0,

      secondary: [],
    },

    {
      family:
        `${athlete.primaryNeed}Short`,

      label:
        `10×400m ${athlete.primaryNeed}`,

      blocks: [
        workoutBlock(
          10,
          400,
          pace1k *
            0.4 *
            0.96,
          60
        ),
      ],

      complexity: 0.05,

      secondary: [
        'Speed',
      ],
    },
  ];
}

function estimateStressFit(
  candidate,
  athlete
) {
  const work =
    candidate.blocks.filter(
      b => b.kind === 'work'
    );

  const totalWorkSeconds =
    work.reduce(
      (sum, b) =>
        sum +
        (
          b.targetSecondsPerRep ||
          120
        ) *
          b.reps,
      0
    );

  const readiness =
    Number(
      athlete.readiness ||
      75
    );

  const toleranceBoost =
    ({
      low: 0.78,
      established: 0.9,
      high: 1.0,
      very_high: 1.07,
    })[
      athlete.tolerance
    ] || 0.9;

  const load =
    totalWorkSeconds /
      1800 +
    candidate.complexity *
      0.3;

  return clamp(
    (
      readiness /
      100
    ) *
      toleranceBoost -
      Math.max(
        0,
        load - 1.0
      ) *
        0.15 +
      0.2,
    0,
    1
  );
}

function contextKey(
  athlete,
  candidate
) {
  return [
    athlete.goalEvent,
    athlete.phase,
    athlete.tolerance,
    athlete.primaryNeed,
    candidate.family,
  ].join('|');
}

export function generateCandidates(
  athlete,
  learningState = {}
) {
  const raw =
    athlete.primaryNeed ===
    'Threshold'
      ? thresholdCandidates(
          athlete
        )
      : genericCandidates(
          athlete
        );

  const phaseBias =
    racePhaseBias[
      athlete.phase
    ] ||
    racePhaseBias.Loading;

  const daysSinceSimilar = 7;

  const candidates =
    raw.map(
      (
        candidate,
        index
      ) => {
        const progression =
          compareProgression(
            candidate,
            athlete.recentWorkout
          );

        const key =
          contextKey(
            athlete,
            candidate
          );

        const learnedModifier =
          learningState[key]
            ?.modifier ?? 1;

        const primaryMatch =
          candidate.family
            .toLowerCase()
            .includes(
              athlete.primaryNeed
                .toLowerCase()
            )
            ? 1
            : 0.72;

        const hasUsefulSecondary =
          candidate.secondary.includes(
            'Speed'
          ) &&
          [
            '5K',
            '10K',
            'HM',
            'Marathon',
            '3000m',
          ].includes(
            athlete.goalEvent
          );

        // v0.1.1:
        // compare actual workout
        // structure instead of
        // label text.
        const workoutSimilarity =
          compareWorkoutSimilarity(
            candidate,
            athlete.recentWorkout
          );

        candidate.signature =
          signature(candidate);

        candidate.learningKey =
          key;

        candidate.fit = {
          needMatch:
            primaryMatch,

          eventPhaseFit:
            clamp(
              0.74 +
                phaseBias
                  .specificity *
                  0.18 -
                candidate
                  .complexity *
                  0.05,
              0,
              1
            ),

          progressionFit:
            progression
              .progressionFit,

          toleranceFit:
            clamp(
              ({
                low: 0.72,
                established:
                  0.88,
                high: 0.95,
                very_high:
                  1.0,
              })[
                athlete
                  .tolerance
              ] -
                Math.max(
                  0,
                  candidate
                    .blocks
                    .filter(
                      b =>
                        b.kind ===
                        'work'
                    )[0]
                    ?.reps -
                    8
                ) *
                  0.04,
              0,
              1
            ),

          stressFit:
            estimateStressFit(
              candidate,
              athlete
            ),

          scheduleFit:
            0.9,

          secondaryCoverage:
            hasUsefulSecondary
              ? 1
              : candidate
                    .secondary
                    .length
                ? 0.55
                : 0.3,

          practicalityFit:
            clamp(
              0.98 -
                candidate
                  .complexity *
                  0.28,
              0,
              1
            ),

          workoutSimilarity,

          progressionLink:
            progression
              .progressionLink,

          complexity:
            candidate
              .complexity,

          novelty:
            index > 3
              ? 0.18
              : 0.05,
        };

        candidate
          .progressionReason =
          progression.reason;

        const scored =
          scoreCandidate(
            candidate,
            {
              daysSinceSimilar,
            },
            learnedModifier
          );

        return {
          ...candidate,
          ...scored,
          learnedModifier,
        };
      }
    );

  return candidates.sort(
    (a, b) =>
      b.score - a.score
  );
}

export function formatCandidate(
  candidate
) {
  const parts = [];

  for (
    const block
    of candidate.blocks
  ) {
    if (
      block.kind ===
      'inter_block_rest'
    ) {
      parts.push(
        `${secondsToClock(
          block.durationSeconds
        )} ${block.type} between blocks`
      );

      continue;
    }

    const target =
      secondsToClock(
        block.targetSecondsPerRep
      );

    const distance =
      block.distanceMeters > 0
        ? `${block.distanceMeters}m`
        : 'work';

    const recovery =
      block.recoverySeconds
        ? `${secondsToClock(
            block.recoverySeconds
          )} ${block.recoveryType}`
        : 'recovery unknown';

    parts.push(
      `${block.reps}×${distance} @ ${target} · ${recovery}`
    );
  }

  return parts;
}
