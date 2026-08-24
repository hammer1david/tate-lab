import {
  parseWorkoutText,
} from './parser.js';

import {
  clamp,
} from './utils.js';

function workBlocks(parsed) {
  return parsed.blocks.filter(
    b => b.kind === 'work'
  );
}

function firstWorkBlock(parsed) {
  return (
    workBlocks(parsed)[0] ||
    null
  );
}

function isDurationBlock(block) {
  return (
    Boolean(block) &&
    block.distanceMeters === 0
  );
}

export function normalizeWorkoutHistory(
  athlete = {}
) {
  const fromList =
    Array.isArray(
      athlete.recentWorkouts
    )
      ? athlete.recentWorkouts
          .map(item => ({
            daysAgo: Math.max(
              0,
              Number(
                item?.daysAgo ??
                0
              )
            ),

            workout:
              String(
                item?.workout ||
                ''
              ).trim(),
          }))
          .filter(
            item =>
              item.workout
          )
      : [];

  if (fromList.length) {
    return fromList.sort(
      (a, b) =>
        a.daysAgo -
        b.daysAgo
    );
  }

  // Compatibility with v0.1.1
  const fallback =
    String(
      athlete.recentWorkout ||
      ''
    ).trim();

  if (!fallback) {
    return [];
  }

  return [
    {
      daysAgo: 7,
      workout: fallback,
    },
  ];
}

export function compareWorkoutSimilarity(
  candidate,
  recentWorkoutText
) {
  if (!recentWorkoutText) {
    return 0;
  }

  const recentParsed =
    parseWorkoutText(
      recentWorkoutText
    );

  const recentBlocks =
    workBlocks(
      recentParsed
    );

  const currentBlocks =
    (
      candidate.blocks ||
      []
    ).filter(
      b =>
        b.kind === 'work'
    );

  const recent =
    recentBlocks[0] ||
    null;

  const current =
    currentBlocks[0] ||
    null;

  if (!recent || !current) {
    return 0;
  }

  let similarity = 0;

  const recentDuration =
    isDurationBlock(
      recent
    );

  const currentDuration =
    isDurationBlock(
      current
    );

  if (
    recentDuration &&
    currentDuration
  ) {
    const workDurationDelta =
      Math.abs(
        (
          recent
            .targetSecondsPerRep ??
          0
        ) -
        (
          current
            .targetSecondsPerRep ??
          0
        )
      );

    if (
      workDurationDelta <= 15
    ) {
      similarity += 0.65;
    } else if (
      workDurationDelta <= 60
    ) {
      similarity += 0.42;
    } else if (
      workDurationDelta <= 120
    ) {
      similarity += 0.2;
    }
  } else if (
    !recentDuration &&
    !currentDuration
  ) {
    const distanceDelta =
      Math.abs(
        recent.distanceMeters -
        current.distanceMeters
      );

    if (
      distanceDelta <= 10
    ) {
      similarity += 0.45;
    } else if (
      distanceDelta /
        Math.max(
          1,
          current.distanceMeters
        ) <=
      0.05
    ) {
      similarity += 0.2;
    }

    if (
      recent
        .targetSecondsPerRep !=
        null &&
      current
        .targetSecondsPerRep !=
        null
    ) {
      const paceDelta =
        Math.abs(
          recent
            .targetSecondsPerRep -
          current
            .targetSecondsPerRep
        );

      if (
        paceDelta <= 1
      ) {
        similarity += 0.2;
      } else if (
        paceDelta <= 5
      ) {
        similarity += 0.14;
      } else if (
        paceDelta <= 10
      ) {
        similarity += 0.07;
      }
    }
  }

  const repDelta =
    Math.abs(
      recent.reps -
      current.reps
    );

  if (
    repDelta === 0
  ) {
    similarity += 0.25;
  } else if (
    repDelta === 1
  ) {
    similarity += 0.18;
  } else if (
    repDelta === 2
  ) {
    similarity += 0.08;
  }

  if (
    recent.recoverySeconds !=
      null &&
    current.recoverySeconds !=
      null
  ) {
    const recoveryDelta =
      Math.abs(
        recent.recoverySeconds -
        current.recoverySeconds
      );

    if (
      recoveryDelta <= 5
    ) {
      similarity += 0.1;
    } else if (
      recoveryDelta <= 30
    ) {
      similarity += 0.06;
    }
  }

  if (
    recentBlocks.length !==
    currentBlocks.length
  ) {
    similarity *= 0.75;
  }

  return clamp(
    similarity,
    0,
    1
  );
}

export function compareProgression(
  candidate,
  recentWorkoutText
) {
  if (!recentWorkoutText) {
    return {
      progressionFit: 0.72,
      progressionLink: 0,
      reason:
        'No comparable history.',
    };
  }

  const recent =
    firstWorkBlock(
      parseWorkoutText(
        recentWorkoutText
      )
    );

  const current =
    candidate.blocks?.find(
      b =>
        b.kind === 'work'
    ) || null;

  if (!recent || !current) {
    return {
      progressionFit: 0.65,
      progressionLink: 0,
      reason:
        'History could not be compared.',
    };
  }

  const recentDuration =
    isDurationBlock(
      recent
    );

  const currentDuration =
    isDurationBlock(
      current
    );

  if (
    recentDuration &&
    currentDuration
  ) {
    const repDelta =
      current.reps -
      recent.reps;

    const durationDelta =
      (
        current
          .targetSecondsPerRep ??
        0
      ) -
      (
        recent
          .targetSecondsPerRep ??
        0
      );

    if (
      repDelta === 0 &&
      Math.abs(
        durationDelta
      ) <= 15
    ) {
      return {
        progressionFit: 0.66,
        progressionLink: 0.2,
        reason:
          'Near-repeat; variation may be preferable.',
      };
    }

    if (
      repDelta === 0 &&
      durationDelta > 15 &&
      durationDelta <= 120
    ) {
      return {
        progressionFit: 0.95,
        progressionLink: 1,
        reason:
          'Safe duration progression.',
      };
    }

    if (
      repDelta === 1 &&
      Math.abs(
        durationDelta
      ) <= 30
    ) {
      return {
        progressionFit: 1,
        progressionLink: 1,
        reason:
          'Safe volume progression.',
      };
    }
  }

  if (
    !recentDuration &&
    !currentDuration
  ) {
    const sameDistance =
      Math.abs(
        recent.distanceMeters -
        current.distanceMeters
      ) < 10;

    const repDelta =
      current.reps -
      recent.reps;

    const paceDelta =
      (
        recent
          .targetSecondsPerRep ??
        0
      ) -
      (
        current
          .targetSecondsPerRep ??
        0
      );

    if (
      sameDistance &&
      repDelta === 1 &&
      Math.abs(
        paceDelta
      ) < 2
    ) {
      return {
        progressionFit: 1,
        progressionLink: 1,
        reason:
          'Safe volume progression.',
      };
    }

    if (
      sameDistance &&
      repDelta === 0 &&
      paceDelta > 0 &&
      paceDelta <= 5
    ) {
      return {
        progressionFit: 0.95,
        progressionLink: 1,
        reason:
          'Safe intensity progression.',
      };
    }

    if (
      sameDistance &&
      repDelta === 0 &&
      Math.abs(
        paceDelta
      ) <= 1
    ) {
      return {
        progressionFit: 0.66,
        progressionLink: 0.2,
        reason:
          'Near-repeat; variation may be preferable.',
      };
    }

    if (
      sameDistance &&
      repDelta >= 2
    ) {
      return {
        progressionFit: 0.48,
        progressionLink: 0.8,
        reason:
          'Progression step may be too large.',
      };
    }
  }

  return {
    progressionFit: 0.78,
    progressionLink: 0.35,
    reason:
      'Different structure with plausible progression.',
  };
}
