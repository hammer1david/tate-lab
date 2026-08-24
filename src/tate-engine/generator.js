import {
  thresholdDoseModel,
  eventCompositeRules,
  racePhaseBias,
  penalties,
  sessionResponseModel,
  vo2Model,
} from './config.js';

import {
  compareProgression,
  compareWorkoutSimilarity,
  normalizeWorkoutHistory,
} from './progression.js';

import { parseWorkoutText } from './parser.js';
import { scoreCandidate } from './scoring.js';

import {
  stableHash,
  parseTimeToSeconds,
  secondsToClock,
  clamp,
} from './utils.js';

function athlete5kSeconds(athlete) {
  return parseTimeToSeconds(athlete.current5k) || 900;
}

function paceFrom5k(athlete, factor) {
  return athlete5kSeconds(athlete) / 5 * factor;
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

function interBlock(durationSeconds, type = 'jog') {
  return {
    kind: 'inter_block_rest',
    durationSeconds,
    type,
  };
}

function signature(candidate) {
  return stableHash(
    JSON.stringify(
      candidate.blocks.map(b => ({
        kind: b.kind,
        reps: b.reps,
        distanceMeters: b.distanceMeters,
        targetSecondsPerRep: b.targetSecondsPerRep,
        recoverySeconds: b.recoverySeconds,
      }))
    )
  );
}

function performanceBandForAthlete(athlete) {
  const seconds = athlete5kSeconds(athlete);

  return thresholdDoseModel.performanceBands.find(
    band => seconds <= band.max5kSeconds
  );
}

function normalizedTrainingExperience(athlete = {}) {
  const value = String(
    athlete.trainingExperience || ''
  )
    .trim()
    .toLowerCase();

  if (
    Object.prototype.hasOwnProperty.call(
      thresholdDoseModel.trainingExperience,
      value
    )
  ) {
    return value;
  }

  // Backward compatibility for pre-v0.1.8 scenarios:
  // low tolerance previously also implied the novice cap.
  return athlete.tolerance === 'low'
    ? 'beginner'
    : 'experienced';
}

function trainingExperienceProfile(athlete = {}) {
  const level =
    normalizedTrainingExperience(athlete);

  return {
    level,
    ...thresholdDoseModel
      .trainingExperience[level],
  };
}

function readinessMinuteAdjustment(readiness) {
  const value = Number(readiness ?? 75);

  if (value < 55) return -4;
  if (value < 70) return -2;
  if (value > 92) return 2;
  return 0;
}

function normalizeSessionFeedback(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');

  const labels = Object.keys(
    sessionResponseModel.responses
  );

  return (
    labels.find(
      label =>
        label.toLowerCase() ===
        normalized
    ) || null
  );
}

function rawWorkoutHistory(athlete = {}) {
  return Array.isArray(
    athlete.recentWorkouts
  )
    ? athlete.recentWorkouts
        .map(item => ({
          daysAgo: Math.max(
            0,
            Number(
              item?.daysAgo ?? 0
            )
          ),
          workout: String(
            item?.workout || ''
          ).trim(),
          feedback:
            normalizeSessionFeedback(
              item?.feedback ??
              item?.sessionFeedback ??
              item?.response
            ),
        }))
        .filter(item => item.workout)
        .sort(
          (a, b) =>
            a.daysAgo - b.daysAgo
        )
    : [];
}

function isThresholdHistorySession(
  session
) {
  if (!session?.workout) {
    return false;
  }

  const parsed =
    parseWorkoutText(
      session.workout
    );

  const work =
    parsed.blocks.filter(
      block => block.kind === 'work'
    );

  if (!work.length) {
    return false;
  }

  const formKey =
    inferFormKeyFromWorkoutText(
      session.workout
    );

  if (formKey === 'ThresholdComposite') {
    return true;
  }

  if (
    ['Threshold10min', 'Threshold8min', 'Threshold6min']
      .includes(formKey)
  ) {
    return true;
  }

  const first = work[0];

  return (
    String(formKey)
      .startsWith('Threshold') &&
    Number(first.distanceMeters) >= 800
  );
}

function paceSecondsPerKmFromWorkoutText(
  workoutText
) {
  const parsed =
    parseWorkoutText(
      workoutText
    );

  const work =
    parsed.blocks.filter(
      block => block.kind === 'work'
    );

  if (work.length !== 1) {
    return null;
  }

  const block = work[0];

  if (
    !Number.isFinite(
      block.distanceMeters
    ) ||
    block.distanceMeters <= 0 ||
    !Number.isFinite(
      block.targetSecondsPerRep
    )
  ) {
    return null;
  }

  const formKey =
    inferFormKeyFromWorkoutText(
      workoutText
    );

  if (
    !String(formKey)
      .startsWith('Threshold') ||
    formKey === 'ThresholdComposite'
  ) {
    return null;
  }

  return (
    block.targetSecondsPerRep /
    (block.distanceMeters / 1000)
  );
}

function establishedThresholdPace(
  athlete
) {
  const successfulFeedback =
    new Set([
      'Doable',
      'Comfortable',
      'Too easy',
    ]);

  for (
    const session of
      rawWorkoutHistory(athlete)
  ) {
    if (
      !isThresholdHistorySession(
        session
      ) ||
      !successfulFeedback.has(
        session.feedback
      )
    ) {
      continue;
    }

    const paceSecondsPerKm =
      paceSecondsPerKmFromWorkoutText(
        session.workout
      );

    if (
      Number.isFinite(
        paceSecondsPerKm
      )
    ) {
      return {
        ...session,
        paceSecondsPerKm,
      };
    }
  }

  return null;
}

function latestSessionResponse(
  athlete
) {
  const latest =
    rawWorkoutHistory(athlete)
      .find(
        isThresholdHistorySession
      );

  if (!latest?.feedback) {
    return null;
  }

  return {
    ...latest,
    paceSecondsPerKm:
      paceSecondsPerKmFromWorkoutText(
        latest.workout
      ),
    profile:
      sessionResponseModel.responses[
        latest.feedback
      ],
  };
}

function consecutiveFeedbackCount(
  athlete,
  feedback
) {
  const rated =
    rawWorkoutHistory(athlete)
      .filter(
        session =>
          isThresholdHistorySession(
            session
          ) &&
          session.feedback
      );

  let count = 0;

  for (const session of rated) {
    if (session.feedback !== feedback) {
      break;
    }

    count += 1;
  }

  return count;
}

export function resolveThresholdIntensity(athlete) {
  const baselinePaceSecondsPerKm =
    paceFrom5k(athlete, 1.08);

  const latestResponse =
    latestSessionResponse(athlete);

  const establishedPace =
    establishedThresholdPace(
      athlete
    );

  const latestSessionPaceSecondsPerKm =
    Number.isFinite(
      latestResponse?.paceSecondsPerKm
    )
      ? latestResponse.paceSecondsPerKm
      : null;

  const establishedPaceSecondsPerKm =
    Number.isFinite(
      establishedPace?.paceSecondsPerKm
    )
      ? establishedPace.paceSecondsPerKm
      : null;

  let anchorPaceSecondsPerKm =
    latestSessionPaceSecondsPerKm ??
    establishedPaceSecondsPerKm ??
    baselinePaceSecondsPerKm;

  let anchorSource =
    latestSessionPaceSecondsPerKm != null
      ? 'latest-session'
      : establishedPaceSecondsPerKm != null
        ? 'established-pace'
        : '5k-baseline';

  let adjustmentSecondsPerKm = 0;
  let repeatedTooMuch = false;

  if (latestResponse) {
    adjustmentSecondsPerKm =
      latestResponse.profile
        .paceAdjustmentSecondsPerKm || 0;

    if (
      latestResponse.feedback === 'Too much' &&
      consecutiveFeedbackCount(athlete, 'Too much') >= 2
    ) {
      repeatedTooMuch = true;

      // Repeated Too much keeps the v0.1.6 safety behavior:
      // use the configured total easing from the model baseline,
      // rather than compounding another full step on the last attempt.
      adjustmentSecondsPerKm =
        latestResponse.profile
          .repeatedPaceAdjustmentSecondsPerKm ??
        adjustmentSecondsPerKm;

      anchorPaceSecondsPerKm =
        baselinePaceSecondsPerKm;
      anchorSource =
        '5k-baseline-repeated-response';
    }
  }

  const targetPaceSecondsPerKm =
    Math.max(
      1,
      anchorPaceSecondsPerKm +
        adjustmentSecondsPerKm
    );

  let reason =
    establishedPaceSecondsPerKm != null
      ? `Established threshold pace memory: ${secondsToClock(establishedPaceSecondsPerKm)}/km remains the working anchor.`
      : 'No session-response pace adjustment.';

  if (latestResponse) {
    const anchorText =
      anchorSource === 'latest-session'
        ? `the latest relevant session (${secondsToClock(anchorPaceSecondsPerKm)}/km)`
        : anchorSource === 'established-pace'
          ? `the established threshold pace (${secondsToClock(anchorPaceSecondsPerKm)}/km)`
          : 'the 5K-derived threshold baseline';

    if (adjustmentSecondsPerKm > 0) {
      reason =
        `Session response ${latestResponse.feedback}: use ${anchorText} as the anchor and ease threshold pace by ${adjustmentSecondsPerKm}s/km before cutting threshold time${repeatedTooMuch ? '; repeated Too much also allows dose reduction' : ''}.`;
    } else if (adjustmentSecondsPerKm < 0) {
      reason =
        `Session response ${latestResponse.feedback}: use ${anchorText} as the anchor and increase threshold pace by ${Math.abs(adjustmentSecondsPerKm)}s/km before adding threshold time.`;
    } else {
      reason =
        `Session response ${latestResponse.feedback}: keep ${anchorText} unchanged. Progression may change dose, but not pace at the same time.`;
    }
  }

  return {
    baselinePaceSecondsPerKm,
    establishedPaceSecondsPerKm,
    establishedPaceDaysAgo:
      establishedPace?.daysAgo ?? null,
    latestSessionPaceSecondsPerKm,
    anchorPaceSecondsPerKm,
    anchorSource,
    targetPaceSecondsPerKm,
    adjustmentSecondsPerKm,
    feedback: latestResponse?.feedback || null,
    repeatedTooMuch,
    reason,
  };
}

function feedbackForHistorySession(
  athlete,
  session
) {
  if (!session) return null;

  const match =
    rawWorkoutHistory(athlete).find(
      item =>
        item.daysAgo ===
          session.daysAgo &&
        item.workout ===
          session.workout
    );

  if (!match?.feedback) {
    return null;
  }

  return {
    feedback: match.feedback,
    profile:
      sessionResponseModel.responses[
        match.feedback
      ],
  };
}

export function resolveThresholdDoseRange(athlete) {
  const band = performanceBandForAthlete(athlete);
  const phaseRange =
    band.phases[athlete.phase] ||
    band.phases.Loading;

  const experience =
    trainingExperienceProfile(athlete);

  const toleranceAdjustment =
    thresholdDoseModel
      .toleranceMinuteAdjustment[
        athlete.tolerance
      ] ?? 0;

  const readinessAdjustment =
    readinessMinuteAdjustment(
      athlete.readiness
    );

  const latestResponse =
    latestSessionResponse(
      athlete
    );

  let responseAdjustment =
    latestResponse
      ? latestResponse.profile
          .doseMinuteAdjustment
      : 0;

  const repeatedTooMuch =
    latestResponse?.feedback ===
      'Too much' &&
    consecutiveFeedbackCount(
      athlete,
      'Too much'
    ) >= 2;

  if (repeatedTooMuch) {
    responseAdjustment +=
      sessionResponseModel
        .repeatedTooMuchDoseMinuteAdjustment;
  }

  let minMinutes =
    phaseRange[0] +
    toleranceAdjustment +
    readinessAdjustment +
    responseAdjustment;

  let maxMinutes =
    phaseRange[1] +
    toleranceAdjustment +
    readinessAdjustment +
    responseAdjustment;

  const hardMaxMinutes =
    Math.min(
      thresholdDoseModel.globalMaxMinutes,
      experience.hardMaxMinutes ??
        thresholdDoseModel.globalMaxMinutes
    );

  maxMinutes = Math.min(
    maxMinutes,
    hardMaxMinutes
  );

  minMinutes = Math.min(
    minMinutes,
    maxMinutes
  );

  minMinutes = clamp(
    minMinutes,
    8,
    maxMinutes
  );

  return {
    performanceLevel: band.id,
    trainingExperience:
      experience.level,
    minMinutes,
    maxMinutes,
    hardMaxMinutes,
    targetMinutes:
      (minMinutes + maxMinutes) / 2,
    sessionResponseFeedback:
      latestResponse?.feedback || null,
    sessionResponseAdjustmentMinutes:
      responseAdjustment,
    repeatedTooMuch,
  };
}

function qualityMinutesForBlock(block) {
  if (block.kind !== 'work') return 0;

  return (
    (
      block.targetSecondsPerRep ||
      0
    ) *
    block.reps
  ) / 60;
}

function thresholdDoseMinutes(candidate) {
  if (
    Number.isFinite(
      candidate.thresholdDoseMinutes
    )
  ) {
    return candidate.thresholdDoseMinutes;
  }

  return candidate.blocks
    .filter(
      block =>
        block.kind === 'work'
    )
    .reduce(
      (sum, block) =>
        sum +
        qualityMinutesForBlock(
          block
        ),
      0
    );
}


function progressionDirectionFromWorkout(
  candidate,
  recentWorkoutText
) {
  if (!recentWorkoutText) {
    return 'different';
  }

  const recentParsed =
    parseWorkoutText(
      recentWorkoutText
    );

  const recentWorkBlocks =
    recentParsed.blocks.filter(
      block => block.kind === 'work'
    );

  const currentWorkBlocks =
    candidate.blocks?.filter(
      block => block.kind === 'work'
    ) || [];

  const recent =
    recentWorkBlocks[0];

  const current =
    currentWorkBlocks[0];

  if (!recent || !current) {
    return 'different';
  }

  const recentIsDuration =
    recent.distanceMeters === 0;

  const currentIsDuration =
    current.distanceMeters === 0;

  if (
    recentWorkBlocks.length === 1 &&
    currentWorkBlocks.length === 1 &&
    !recentIsDuration &&
    Math.abs(
      recent.distanceMeters -
      current.distanceMeters
    ) <= 10
  ) {
    if (current.reps > recent.reps) {
      return 'progress';
    }

    if (current.reps < recent.reps) {
      return 'regress';
    }

    const recentPace =
      recent.targetSecondsPerRep;

    const currentPace =
      current.targetSecondsPerRep;

    if (
      Number.isFinite(recentPace) &&
      Number.isFinite(currentPace)
    ) {
      if (currentPace < recentPace - 1) {
        return 'progress';
      }

      if (currentPace > recentPace + 1) {
        return 'regress';
      }
    }

    return 'hold';
  }

  if (
    recentWorkBlocks.length === 1 &&
    currentWorkBlocks.length === 1 &&
    recentIsDuration &&
    currentIsDuration
  ) {
    const recentTotal =
      recent.reps *
      (recent.targetSecondsPerRep || 0);

    const currentTotal =
      current.reps *
      (current.targetSecondsPerRep || 0);

    const sameRepDuration =
      Math.abs(
        (recent.targetSecondsPerRep || 0) -
        (current.targetSecondsPerRep || 0)
      ) <= 15;

    if (sameRepDuration) {
      if (currentTotal > recentTotal + 15) {
        return 'progress';
      }

      if (currentTotal < recentTotal - 15) {
        return 'regress';
      }

      return 'hold';
    }
  }

  const recentTotalSeconds =
    recentParsed.blocks
      .filter(
        block =>
          block.kind === 'work' &&
          Number.isFinite(
            block.targetSecondsPerRep
          )
      )
      .reduce(
        (sum, block) =>
          sum +
          block.targetSecondsPerRep *
            block.reps,
        0
      );

  const currentTotalSeconds =
    Number.isFinite(
      candidate.thresholdDoseMinutes
    )
      ? candidate.thresholdDoseMinutes *
          60
      : candidate.blocks
          .filter(
            block =>
              block.kind === 'work' &&
              Number.isFinite(
                block.targetSecondsPerRep
              )
          )
          .reduce(
            (sum, block) =>
              sum +
              block.targetSecondsPerRep *
                block.reps,
            0
          );

  if (
    recentTotalSeconds > 0 &&
    currentTotalSeconds > 0
  ) {
    const delta =
      currentTotalSeconds -
      recentTotalSeconds;

    if (delta > 60) {
      return 'progress';
    }

    if (delta < -60) {
      return 'regress';
    }

    return 'hold';
  }

  return 'different';
}

function isResponseDrivenPaceAdaptation(
  candidate,
  referenceSession,
  feedback
) {
  if (
    !referenceSession?.workout ||
    !['Too much', 'A little hard', 'Too easy']
      .includes(feedback)
  ) {
    return false;
  }

  const recentWork =
    parseWorkoutText(
      referenceSession.workout
    ).blocks.filter(
      block => block.kind === 'work'
    );

  const currentWork =
    candidate.blocks?.filter(
      block => block.kind === 'work'
    ) || [];

  const recent = recentWork[0];
  const current = currentWork[0];

  if (
    recentWork.length !== 1 ||
    currentWork.length !== 1 ||
    !recent ||
    !current ||
    recent.distanceMeters <= 0 ||
    current.distanceMeters <= 0 ||
    Math.abs(
      recent.distanceMeters -
      current.distanceMeters
    ) > 10 ||
    recent.reps !== current.reps ||
    !Number.isFinite(
      recent.targetSecondsPerRep
    ) ||
    !Number.isFinite(
      current.targetSecondsPerRep
    )
  ) {
    return false;
  }

  const recentPace =
    recent.targetSecondsPerRep /
    (recent.distanceMeters / 1000);

  const currentPace =
    current.targetSecondsPerRep /
    (current.distanceMeters / 1000);

  if (feedback === 'Too easy') {
    return currentPace < recentPace - 1;
  }

  return currentPace > recentPace + 1;
}

function evaluateSessionResponse(
  candidate,
  athlete,
  referenceSession
) {
  const response =
    feedbackForHistorySession(
      athlete,
      referenceSession
    );

  if (!response) {
    return {
      fit:
        sessionResponseModel
          .neutralFit,
      feedback: null,
      permission: 'Unknown',
      direction: 'different',
      progressionMultiplier: 1,
      intensityAdaptation: false,
      reason:
        'No session feedback attached to the comparable workout.',
    };
  }

  const direction =
    progressionDirectionFromWorkout(
      candidate,
      referenceSession.workout
    );

  const fitKey =
    direction === 'progress'
      ? 'progressFit'
      : direction === 'hold'
        ? 'holdFit'
        : direction === 'regress'
          ? 'regressFit'
          : 'differentFit';

  const intensityAdaptation =
    isResponseDrivenPaceAdaptation(
      candidate,
      referenceSession,
      response.feedback
    );

  const paceFirstRequired =
    ['Too much', 'A little hard', 'Too easy']
      .includes(
        response.feedback
      );

  const singleAxisConflict =
    paceFirstRequired &&
    direction === 'progress' &&
    !intensityAdaptation;

  const singleAxisProgressFit =
    response.profile
      .singleAxisProgressFit ??
    0.35;

  const responseFit =
    intensityAdaptation
      ? 1
      : singleAxisConflict
        ? Math.min(
            response.profile[fitKey],
            singleAxisProgressFit
          )
        : response.profile[fitKey];

  const progressionMultiplier =
    singleAxisConflict
      ? Math.min(
          response.profile
            .progressionMultiplier,
          singleAxisProgressFit
        )
      : response.profile
          .progressionMultiplier;

  const responseDomain =
    candidate.trainingDomain === 'VO2max'
      ? 'VO2'
      : 'threshold';

  return {
    fit: responseFit,
    feedback:
      response.feedback,
    permission:
      response.profile.permission,
    direction,
    progressionMultiplier,
    intensityAdaptation,
    singleAxisConflict,
    reason: intensityAdaptation
      ? `Session response: ${response.feedback}. Pace-first adaptation keeps the same work structure while adjusting ${responseDomain} intensity.`
      : singleAxisConflict
        ? `Session response: ${response.feedback}. Single-axis progression delays extra ${responseDomain} dose while pace is being adjusted.`
        : `Session response: ${response.feedback}. Permission: ${response.profile.permission}. Candidate direction: ${direction}.`,
  };
}

function doseFitForMinutes(
  minutes,
  doseRange
) {
  if (
    minutes >= doseRange.minMinutes &&
    minutes <= doseRange.maxMinutes
  ) {
    return 1;
  }

  if (minutes < doseRange.minMinutes) {
    return clamp(
      1 -
        (
          doseRange.minMinutes -
          minutes
        ) /
          10,
      0.35,
      1
    );
  }

  // v0.1.8: the normal max is a strong coaching boundary,
  // while hardMaxMinutes remains the absolute safety cap.
  return clamp(
    1 -
      (
        minutes -
        doseRange.maxMinutes
      ) /
        5,
    0,
    1
  );
}

function formKeyFromWorkBlock(
  block,
  blockCount = 1
) {
  if (!block) return 'Unknown';

  if (blockCount > 1) {
    return 'ThresholdComposite';
  }

  if (block.distanceMeters > 0) {
    const d = block.distanceMeters;

    if (
      d >= 950 &&
      d <= 1050
    ) {
      return 'Threshold1000';
    }

    if (
      d >= 1500 &&
      d <= 1700
    ) {
      return 'Threshold1600';
    }

    if (
      d >= 1900 &&
      d <= 2100
    ) {
      return 'Threshold2000';
    }

    return `ThresholdDistance${Math.round(
      d / 100
    ) * 100}`;
  }

  const duration =
    block.targetSecondsPerRep || 0;

  if (
    duration >= 570 &&
    duration <= 630
  ) {
    return 'Threshold10min';
  }

  if (
    duration >= 450 &&
    duration <= 510
  ) {
    return 'Threshold8min';
  }

  if (
    duration >= 330 &&
    duration <= 390
  ) {
    return 'Threshold6min';
  }

  if (
    duration >= 100 &&
    duration <= 140
  ) {
    return 'OnOff2min';
  }

  return `ThresholdDuration${Math.round(
    duration / 30
  ) * 30}`;
}

function inferFormKeyFromWorkoutText(text) {
  const parsed =
    parseWorkoutText(text);

  const work =
    parsed.blocks.filter(
      block =>
        block.kind === 'work'
    );

  return formKeyFromWorkBlock(
    work[0],
    work.length
  );
}

function structureKeyFromWorkBlock(
  block,
  blockCount = 1
) {
  if (!block) return 'Unknown';

  if (blockCount > 1) {
    return 'Mixed';
  }

  const seconds =
    block.targetSecondsPerRep;

  if (
    Number.isFinite(seconds) &&
    seconds > 0
  ) {
    if (seconds <= 270) {
      return 'Short';
    }

    if (seconds < 375) {
      return 'Medium';
    }

    return 'Long';
  }

  const distance =
    block.distanceMeters || 0;

  if (distance > 0) {
    if (distance <= 1200) {
      return 'Short';
    }

    if (distance < 1900) {
      return 'Medium';
    }

    return 'Long';
  }

  return 'Unknown';
}

function inferStructureKeyFromWorkoutText(text) {
  const parsed =
    parseWorkoutText(text);

  const work =
    parsed.blocks.filter(
      block =>
        block.kind === 'work'
    );

  return structureKeyFromWorkBlock(
    work[0],
    work.length
  );
}

function candidateRepDurationSeconds(candidate) {
  const block =
    candidate.blocks?.find(
      item =>
        item.kind === 'work'
    );

  return Number(
    block?.targetSecondsPerRep ||
    0
  );
}

function longStructurePreference(candidate) {
  const seconds =
    candidateRepDurationSeconds(
      candidate
    );

  if (
    candidate.formKey ===
    'Threshold8min'
  ) {
    return 1;
  }

  if (
    candidate.formKey ===
    'Threshold10min'
  ) {
    return 0.98;
  }

  if (
    candidate.formKey ===
    'Threshold2000'
  ) {
    return 0.72;
  }

  if (seconds >= 450) {
    return 0.9;
  }

  return 0.78;
}

function evaluateStructuralRotation(
  candidate,
  history
) {
  const candidateStructure =
    structureKeyFromWorkBlock(
      candidate.blocks?.find(
        block =>
          block.kind === 'work'
      ),
      candidate.blocks?.filter(
        block =>
          block.kind === 'work'
      ).length || 0
    );

  if (
    candidate.formKey ===
      'OnOff2min' ||
    candidateStructure ===
      'Mixed'
  ) {
    return {
      fit: 0.72,
      candidateStructure,
      targetStructure: null,
      reason:
        'Structural rotation neutral for mixed or on/off work.',
    };
  }

  const recent =
    history
      .map(
        session => ({
          ...session,
          structureKey:
            inferStructureKeyFromWorkoutText(
              session.workout
            ),
        })
      )
      .filter(
        session =>
          ['Short', 'Medium', 'Long']
            .includes(
              session.structureKey
            )
      )
      .slice(0, 3);

  if (recent.length < 2) {
    return {
      fit: 0.9,
      candidateStructure,
      targetStructure: null,
      reason:
        'Not enough recent structure history for a strong rotation preference.',
    };
  }

  const counts = {
    Short: 0,
    Medium: 0,
    Long: 0,
  };

  recent.forEach(
    session => {
      counts[
        session.structureKey
      ] += 1;
    }
  );

  let targetStructure = null;

  if (
    counts.Short >= 2 &&
    counts.Short > counts.Long
  ) {
    targetStructure = 'Long';
  } else if (
    counts.Long >= 2 &&
    counts.Long > counts.Short
  ) {
    targetStructure = 'Short';
  }

  if (!targetStructure) {
    return {
      fit: 0.88,
      candidateStructure,
      targetStructure: null,
      reason:
        `Structural history is mixed (${counts.Short} short, ${counts.Medium} medium, ${counts.Long} long); no strong direction.`,
    };
  }

  let fit;

  if (targetStructure === 'Long') {
    if (candidateStructure === 'Long') {
      fit =
        longStructurePreference(
          candidate
        );
    } else if (
      candidateStructure ===
      'Medium'
    ) {
      fit = 0.62;
    } else {
      fit = 0.42;
    }
  } else {
    if (candidateStructure === 'Short') {
      fit = 1;
    } else if (
      candidateStructure ===
      'Medium'
    ) {
      fit = 0.7;
    } else {
      fit = 0.48;
    }
  }

  return {
    fit,
    candidateStructure,
    targetStructure,
    reason:
      `Structural rotation targets ${targetStructure.toLowerCase()} reps after recent ${targetStructure === 'Long' ? 'short' : 'long'}-rep emphasis (${counts.Short} short, ${counts.Medium} medium, ${counts.Long} long).`,
  };
}

function evaluateRotation(
  candidate,
  history
) {
  if (!history.length) {
    return {
      fit: 1,
      otherFormsSince: 0,
      lastSameDaysAgo: null,
      reason:
        'Fresh form: no comparable threshold history.',
    };
  }

  const historyWithForms =
    history.map(
      session => ({
        ...session,
        formKey:
          inferFormKeyFromWorkoutText(
            session.workout
          ),
      })
    );

  const sameForm =
    historyWithForms
      .filter(
        session =>
          session.formKey ===
          candidate.formKey
      )
      .sort(
        (a, b) =>
          a.daysAgo -
          b.daysAgo
      );

  if (!sameForm.length) {
    return {
      fit: 1,
      otherFormsSince:
        new Set(
          historyWithForms.map(
            session =>
              session.formKey
          )
        ).size,
      lastSameDaysAgo: null,
      reason:
        'Fresh form: not used in recent history.',
    };
  }

  const lastSame =
    sameForm[0];

  const intervening =
    historyWithForms.filter(
      session =>
        session.daysAgo <
          lastSame.daysAgo &&
        session.formKey !==
          candidate.formKey
    );

  const distinctOtherForms =
    new Set(
      intervening.map(
        session =>
          session.formKey
      )
    );

  const ageRelief =
    clamp(
      lastSame.daysAgo / 28,
      0,
      1
    ) * 0.25;

  const varietyRelief =
    Math.min(
      0.4,
      distinctOtherForms.size *
        0.2
    );

  let fit =
    0.35 +
    ageRelief +
    varietyRelief;

  if (
    lastSame.daysAgo <= 4 &&
    distinctOtherForms.size === 0
  ) {
    fit -= 0.1;
  }

  fit = clamp(
    fit,
    0.2,
    1
  );

  let reason;

  if (
    distinctOtherForms.size >= 2 ||
    lastSame.daysAgo >= 21
  ) {
    reason =
      `Rotation ready: ${distinctOtherForms.size} other threshold forms since this form, last used ${lastSame.daysAgo}d ago.`;
  } else if (
    distinctOtherForms.size === 1
  ) {
    reason =
      `Rotation building: 1 other threshold form since this form, last used ${lastSame.daysAgo}d ago.`;
  } else {
    reason =
      `Rotation hold: this form was used ${lastSame.daysAgo}d ago with no other threshold form since.`;
  }

  return {
    fit,
    otherFormsSince:
      distinctOtherForms.size,
    lastSameDaysAgo:
      lastSame.daysAgo,
    reason,
  };
}

function dynamic1000RepRange(
  athlete,
  threshold1k,
  doseRange
) {
  let minReps =
    Math.max(
      2,
      Math.ceil(
        doseRange.minMinutes *
          60 /
          threshold1k
      )
    );

  let maxReps =
    Math.max(
      minReps,
      Math.floor(
        doseRange.maxMinutes *
          60 /
          threshold1k
      )
    );

  if (
    athlete.goalEvent === '5K' &&
    doseRange.performanceLevel ===
      'competitive'
  ) {
    const guardrail =
      thresholdDoseModel
        .competitive5k1000Progression[
          athlete.phase
        ] ||
      thresholdDoseModel
        .competitive5k1000Progression
        .Loading;

    minReps = Math.max(
      minReps,
      guardrail[0]
    );

    maxReps = Math.min(
      maxReps,
      guardrail[1]
    );

    if (
      athlete.phase === 'Base'
    ) {
      minReps = 10;
      maxReps = 10;
    }
  }

  while (
    maxReps *
      threshold1k /
      60 >
      doseRange.hardMaxMinutes &&
    maxReps > 1
  ) {
    maxReps -= 1;
  }

  minReps = Math.min(
    minReps,
    maxReps
  );

  return {
    minReps,
    maxReps,
  };
}

function nearestValidReps(
  targetMinutes,
  secondsPerRep,
  minReps,
  maxReps,
  hardMaxMinutes
) {
  let reps = clamp(
    Math.round(
      targetMinutes *
        60 /
        secondsPerRep
    ),
    minReps,
    maxReps
  );

  while (
    reps >
      minReps &&
    reps *
      secondsPerRep /
      60 >
      hardMaxMinutes
  ) {
    reps -= 1;
  }

  return reps;
}

function makeThresholdDistanceCandidate({
  reps,
  distanceMeters,
  threshold1k,
  recoverySeconds,
  formKey,
  complexity = 0,
}) {
  const targetSecondsPerRep =
    threshold1k *
    (
      distanceMeters /
      1000
    );

  const minutes =
    reps *
    targetSecondsPerRep /
    60;

  return {
    family: formKey,
    formKey,
    label:
      `${reps}×${distanceMeters}m Threshold`,
    blocks: [
      workoutBlock(
        reps,
        distanceMeters,
        targetSecondsPerRep,
        recoverySeconds
      ),
    ],
    thresholdDoseMinutes:
      minutes,
    complexity,
    secondary: ['Aerobic'],
  };
}

function makeThresholdDurationCandidate({
  reps,
  durationSeconds,
  recoverySeconds,
  formKey,
  complexity = 0.05,
}) {
  return {
    family: formKey,
    formKey,
    label:
      `${reps}×${Math.round(
        durationSeconds / 60
      )}min Threshold`,
    blocks: [
      workoutBlock(
        reps,
        0,
        durationSeconds,
        recoverySeconds
      ),
    ],
    thresholdDoseMinutes:
      reps *
      durationSeconds /
      60,
    complexity,
    secondary: ['Aerobic'],
  };
}

function thresholdCandidates(
  athlete
) {
  const intensity =
    resolveThresholdIntensity(
      athlete
    );

  const threshold1k =
    intensity.targetPaceSecondsPerKm;

  const doseRange =
    resolveThresholdDoseRange(
      athlete
    );

  const repRange =
    dynamic1000RepRange(
      athlete,
      threshold1k,
      doseRange
    );

  const candidates = [];

  for (
    let reps =
      repRange.minReps;
    reps <=
      repRange.maxReps;
    reps += 1
  ) {
    candidates.push(
      makeThresholdDistanceCandidate({
        reps,
        distanceMeters: 1000,
        threshold1k,
        recoverySeconds: 60,
        formKey:
          'Threshold1000',
      })
    );
  }

  const rep1600Seconds =
    threshold1k * 1.6;

  const reps1600 =
    nearestValidReps(
      doseRange.targetMinutes,
      rep1600Seconds,
      2,
      6,
      doseRange.hardMaxMinutes
    );

  candidates.push(
    makeThresholdDistanceCandidate({
      reps: reps1600,
      distanceMeters: 1600,
      threshold1k,
      recoverySeconds: 90,
      formKey:
        'Threshold1600',
      complexity: 0.04,
    })
  );

  const rep2000Seconds =
    threshold1k * 2;

  const reps2000 =
    nearestValidReps(
      doseRange.targetMinutes,
      rep2000Seconds,
      2,
      5,
      doseRange.hardMaxMinutes
    );

  candidates.push(
    makeThresholdDistanceCandidate({
      reps: reps2000,
      distanceMeters: 2000,
      threshold1k,
      recoverySeconds: 120,
      formKey:
        'Threshold2000',
      complexity: 0.06,
    })
  );

  if (
    doseRange.hardMaxMinutes >=
    30
  ) {
    candidates.push(
      makeThresholdDurationCandidate({
        reps: 3,
        durationSeconds: 600,
        recoverySeconds: 120,
        formKey:
          'Threshold10min',
      })
    );

    candidates.push(
      makeThresholdDurationCandidate({
        reps: 4,
        durationSeconds: 480,
        recoverySeconds: 90,
        formKey:
          'Threshold8min',
      })
    );

    candidates.push(
      makeThresholdDurationCandidate({
        reps: 6,
        durationSeconds: 360,
        recoverySeconds: 75,
        formKey:
          'Threshold6min',
      })
    );
  } else {
    candidates.push(
      makeThresholdDurationCandidate({
        reps: 2,
        durationSeconds: 600,
        recoverySeconds: 120,
        formKey:
          'Threshold10min',
      })
    );

    candidates.push(
      makeThresholdDurationCandidate({
        reps: 2,
        durationSeconds: 480,
        recoverySeconds: 90,
        formKey:
          'Threshold8min',
      })
    );

    candidates.push(
      makeThresholdDurationCandidate({
        reps: 3,
        durationSeconds: 360,
        recoverySeconds: 75,
        formKey:
          'Threshold6min',
      })
    );
  }

  const allowComposite =
    eventCompositeRules[
      athlete.goalEvent
    ]?.thresholdPlusSpeedDefault;

  if (allowComposite) {
    const base1000Reps =
      Math.max(
        repRange.minReps,
        Math.min(
          repRange.maxReps,
          repRange.minReps
        )
      );

    const fast200 =
      paceFrom5k(
        athlete,
        0.92
      ) *
      0.2;

    candidates.push({
      family:
        'ThresholdComposite',
      formKey:
        'ThresholdComposite',
      label:
        `${base1000Reps}×1000m Threshold + 6×200m fast relaxed`,
      blocks: [
        workoutBlock(
          base1000Reps,
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
      thresholdDoseMinutes:
        base1000Reps *
        threshold1k /
        60,
      complexity: 0.42,
      secondary: ['Speed'],
    });
  }

  candidates.push({
    family: 'OnOffFartlek',
    formKey: 'OnOff2min',
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
    thresholdDoseMinutes: 20,
    complexity: 0.12,
    secondary: ['VO2max'],
  });

  candidates.forEach(candidate => {
    if (candidate.formKey === 'OnOff2min') {
      return;
    }

    candidate.thresholdPaceSecondsPerKm =
      threshold1k;
    candidate.thresholdPaceAdjustmentSecondsPerKm =
      intensity.adjustmentSecondsPerKm;
    candidate.thresholdIntensityReason =
      intensity.reason;
  });

  return {
    candidates:
      candidates.filter(
        candidate =>
          candidate.formKey ===
            'OnOff2min' ||
          candidate.thresholdDoseMinutes <=
            doseRange.hardMaxMinutes +
              0.01
      ),
    doseRange,
    intensity,
  };
}


function vo2PerformanceBandForAthlete(athlete) {
  const seconds = athlete5kSeconds(athlete);

  return vo2Model.performanceBands.find(
    band => seconds <= band.max5kSeconds
  );
}

function vo2TrainingExperienceProfile(athlete = {}) {
  const level = normalizedTrainingExperience(athlete);

  return {
    level,
    ...vo2Model.trainingExperience[level],
  };
}

function vo2ReadinessMinuteAdjustment(readiness) {
  const value = Number(readiness ?? 75);

  if (value < 55) return -3;
  if (value < 70) return -1;
  if (value > 92) return 1;
  return 0;
}

function vo2FormForDistance(distanceMeters) {
  return vo2Model.forms.find(
    form =>
      Math.abs(
        form.distanceMeters -
          Number(distanceMeters || 0)
      ) <= 15
  ) || null;
}

function vo2HistorySessionInfo(session, athlete) {
  if (!session?.workout) return null;

  const parsed = parseWorkoutText(session.workout);
  const work = parsed.blocks.filter(
    block => block.kind === 'work'
  );

  if (work.length !== 1) return null;

  const block = work[0];
  const form = vo2FormForDistance(
    block.distanceMeters
  );

  if (
    !form ||
    !Number.isFinite(block.targetSecondsPerRep) ||
    block.targetSecondsPerRep <= 0
  ) {
    return null;
  }

  const paceSecondsPerKm =
    block.targetSecondsPerRep /
    (block.distanceMeters / 1000);

  const fiveKPaceSecondsPerKm =
    athlete5kSeconds(athlete) / 5;

  const relativeTo5kPace =
    paceSecondsPerKm /
    fiveKPaceSecondsPerKm;

  // Keep response-adjusted VO2 sessions in the same domain while
  // excluding threshold and speed-endurance work.
  if (
    relativeTo5kPace < 0.92 ||
    relativeTo5kPace > 1.05
  ) {
    return null;
  }

  return {
    ...session,
    formKey: form.formKey,
    structureKey: form.structure,
    distanceMeters: form.distanceMeters,
    paceFactor: form.paceFactor,
    paceSecondsPerKm,
    relativeTo5kPace,
    reps: block.reps,
    repSeconds: block.targetSecondsPerRep,
  };
}

function vo2History(athlete) {
  return rawWorkoutHistory(athlete)
    .map(session =>
      vo2HistorySessionInfo(
        session,
        athlete
      )
    )
    .filter(Boolean);
}

function latestVo2Response(athlete) {
  return vo2History(athlete).find(
    session => session.feedback
  ) || null;
}

function consecutiveVo2FeedbackCount(
  athlete,
  feedback
) {
  const rated = vo2History(athlete).filter(
    session => session.feedback
  );

  let count = 0;

  for (const session of rated) {
    if (session.feedback !== feedback) break;
    count += 1;
  }

  return count;
}

export function resolveVo2DoseRange(athlete) {
  const band = vo2PerformanceBandForAthlete(
    athlete
  );

  const phaseRange =
    band.phases[athlete.phase] ||
    band.phases.Loading;

  const experience =
    vo2TrainingExperienceProfile(athlete);

  const toleranceAdjustment =
    vo2Model.toleranceMinuteAdjustment[
      athlete.tolerance
    ] ?? 0;

  const readinessAdjustment =
    vo2ReadinessMinuteAdjustment(
      athlete.readiness
    );

  const latestResponse =
    latestVo2Response(athlete);

  const repeatedTooMuch =
    latestResponse?.feedback === 'Too much' &&
    consecutiveVo2FeedbackCount(
      athlete,
      'Too much'
    ) >= 2;

  const responseAdjustment =
    repeatedTooMuch
      ? vo2Model
          .repeatedTooMuchDoseMinuteAdjustment
      : 0;

  let minMinutes =
    phaseRange[0] +
    toleranceAdjustment +
    readinessAdjustment +
    responseAdjustment;

  let maxMinutes =
    phaseRange[1] +
    toleranceAdjustment +
    readinessAdjustment +
    responseAdjustment;

  const hardMaxMinutes = Math.min(
    vo2Model.globalHardMaxMinutes,
    experience.hardMaxMinutes ??
      vo2Model.globalHardMaxMinutes
  );

  maxMinutes = Math.min(
    maxMinutes,
    hardMaxMinutes
  );

  minMinutes = Math.min(
    minMinutes,
    maxMinutes
  );

  minMinutes = clamp(
    minMinutes,
    4,
    maxMinutes
  );

  return {
    performanceLevel: band.id,
    trainingExperience: experience.level,
    minMinutes,
    maxMinutes,
    hardMaxMinutes,
    targetMinutes:
      (minMinutes + maxMinutes) / 2,
    sessionResponseFeedback:
      latestResponse?.feedback || null,
    sessionResponseAdjustmentMinutes:
      responseAdjustment,
    repeatedTooMuch,
  };
}

export function resolveVo2Intensity(
  athlete,
  distanceMeters = 1000
) {
  const form =
    vo2FormForDistance(distanceMeters) ||
    vo2Model.forms.find(
      item => item.distanceMeters === 1000
    );

  const fiveKPaceSecondsPerKm =
    athlete5kSeconds(athlete) / 5;

  const baselinePaceSecondsPerKm =
    fiveKPaceSecondsPerKm *
    form.paceFactor;

  const history = vo2History(athlete);
  const latestResponse = history.find(
    session => session.feedback
  ) || null;

  const successfulFeedback = new Set([
    'Doable',
    'Comfortable',
    'Too easy',
  ]);

  const established = history.find(
    session =>
      successfulFeedback.has(
        session.feedback
      )
  ) || null;

  let stateAdjustmentSecondsPerKm = 0;
  let anchorSource = '5k-baseline';

  if (established) {
    const expectedSourcePace =
      fiveKPaceSecondsPerKm *
      established.paceFactor;

    stateAdjustmentSecondsPerKm =
      established.paceSecondsPerKm -
      expectedSourcePace;

    anchorSource = 'established-vo2-state';
  }

  let responseAdjustmentSecondsPerKm = 0;
  let repeatedTooMuch = false;

  if (latestResponse) {
    const expectedSourcePace =
      fiveKPaceSecondsPerKm *
      latestResponse.paceFactor;

    stateAdjustmentSecondsPerKm =
      latestResponse.paceSecondsPerKm -
      expectedSourcePace;

    responseAdjustmentSecondsPerKm =
      vo2Model
        .responsePaceAdjustmentSecondsPerKm[
          latestResponse.feedback
        ] ?? 0;

    anchorSource = 'latest-vo2-session';

    if (
      latestResponse.feedback === 'Too much' &&
      consecutiveVo2FeedbackCount(
        athlete,
        'Too much'
      ) >= 2
    ) {
      repeatedTooMuch = true;
      stateAdjustmentSecondsPerKm = 0;
      responseAdjustmentSecondsPerKm =
        vo2Model
          .repeatedTooMuchPaceAdjustmentSecondsPerKm;
      anchorSource =
        '5k-baseline-repeated-response';
    }
  }

  const rawTargetPaceSecondsPerKm = Math.max(
    1,
    baselinePaceSecondsPerKm +
      stateAdjustmentSecondsPerKm +
      responseAdjustmentSecondsPerKm
  );

  const domainMinimumPaceSecondsPerKm =
    fiveKPaceSecondsPerKm *
    vo2Model.domainPaceFactor.minimum;

  const domainMaximumPaceSecondsPerKm =
    fiveKPaceSecondsPerKm *
    vo2Model.domainPaceFactor.maximum;

  const targetPaceSecondsPerKm = clamp(
    rawTargetPaceSecondsPerKm,
    domainMinimumPaceSecondsPerKm,
    domainMaximumPaceSecondsPerKm
  );

  const fasterDomainLimitReached =
    rawTargetPaceSecondsPerKm <
      domainMinimumPaceSecondsPerKm - 0.01;

  const slowerDomainLimitReached =
    rawTargetPaceSecondsPerKm >
      domainMaximumPaceSecondsPerKm + 0.01;

  const repeatedTooEasy =
    latestResponse?.feedback === 'Too easy' &&
    consecutiveVo2FeedbackCount(
      athlete,
      'Too easy'
    ) >= 2;

  const latestAlreadyAtFasterDomainLimit =
    latestResponse?.feedback === 'Too easy' &&
    Number.isFinite(
      latestResponse.relativeTo5kPace
    ) &&
    latestResponse.relativeTo5kPace <=
      vo2Model.domainPaceFactor.minimum + 0.003;

  const performanceReassessmentNeeded =
    latestResponse?.feedback === 'Too easy' &&
    fasterDomainLimitReached &&
    (
      repeatedTooEasy ||
      latestAlreadyAtFasterDomainLimit
    );

  let reason =
    'VO2 pace derived from current 5K performance and rep length.';

  if (latestResponse) {
    if (performanceReassessmentNeeded) {
      reason =
        `VO2 response Too easy reached the VO2 domain ceiling (${secondsToClock(domainMinimumPaceSecondsPerKm)}/km). Do not make the VO2 session faster; reassess current performance before progressing intensity.`;
    } else if (responseAdjustmentSecondsPerKm > 0) {
      reason =
        `VO2 response ${latestResponse.feedback}: ease pace by ${responseAdjustmentSecondsPerKm}s/km before adding work${repeatedTooMuch ? '; repeated Too much also permits dose reduction' : ''}${slowerDomainLimitReached ? '; pace is capped at the slow edge of the VO2 domain' : ''}.`;
    } else if (responseAdjustmentSecondsPerKm < 0) {
      reason = fasterDomainLimitReached
        ? `VO2 response ${latestResponse.feedback}: increase pace only to the VO2 domain ceiling (${secondsToClock(domainMinimumPaceSecondsPerKm)}/km); do not cross into Speed Endurance.`
        : `VO2 response ${latestResponse.feedback}: increase pace by ${Math.abs(responseAdjustmentSecondsPerKm)}s/km before adding work.`;
    } else {
      reason =
        `VO2 response ${latestResponse.feedback}: preserve the established VO2 intensity; progression may change dose or structure, not pace at the same time.`;
    }
  } else if (established) {
    reason =
      'Established VO2 intensity state transferred across compatible VO2 rep lengths.';
  }

  return {
    formKey: form.formKey,
    distanceMeters: form.distanceMeters,
    baselinePaceSecondsPerKm,
    stateAdjustmentSecondsPerKm,
    responseAdjustmentSecondsPerKm,
    rawTargetPaceSecondsPerKm,
    targetPaceSecondsPerKm,
    domainMinimumPaceSecondsPerKm,
    domainMaximumPaceSecondsPerKm,
    fasterDomainLimitReached,
    slowerDomainLimitReached,
    performanceReassessmentNeeded,
    repeatedTooEasy,
    feedback: latestResponse?.feedback || null,
    repeatedTooMuch,
    anchorSource,
    reason,
  };
}

function vo2RepDurationFit(repSeconds) {
  const preferredMin =
    vo2Model.repDurationSeconds
      .minimumPreferred;
  const preferredMax =
    vo2Model.repDurationSeconds
      .maximumPreferred;

  if (
    repSeconds >= preferredMin &&
    repSeconds <= preferredMax
  ) {
    return 1;
  }

  if (repSeconds < preferredMin) {
    return clamp(
      0.72 +
        0.28 *
          repSeconds /
          preferredMin,
      0.72,
      1
    );
  }

  return clamp(
    1 -
      (repSeconds - preferredMax) /
        60,
    0.35,
    1
  );
}

function vo2CandidateRepRange(
  form,
  repSeconds,
  doseRange,
  athlete
) {
  const hardMaxReps = Math.floor(
    doseRange.hardMaxMinutes *
      60 /
      repSeconds
  );

  const maxReps = Math.min(
    form.maxReps,
    hardMaxReps
  );

  const normalMaxReps = Math.floor(
    doseRange.maxMinutes *
      60 /
      repSeconds
  );

  const mayLowerMinimum =
    doseRange.trainingExperience === 'beginner' ||
    athlete.phase === 'Taper' ||
    doseRange.repeatedTooMuch;

  let minimumReps = form.minReps;

  // v0.1.10: when the normal VO2 target is smaller than a form's
  // historical minimum, allow a reduced rep count rather than forcing
  // the workout above the prescribed dose range. Never create a
  // one-rep VO2 interval session.
  if (
    mayLowerMinimum &&
    normalMaxReps < form.minReps
  ) {
    minimumReps = Math.max(
      2,
      Math.ceil(
        doseRange.minMinutes *
          60 /
          repSeconds
      )
    );

    minimumReps = Math.min(
      minimumReps,
      Math.max(2, normalMaxReps)
    );
  }

  if (
    maxReps < minimumReps ||
    minimumReps < 2
  ) {
    return [];
  }

  const targetReps = clamp(
    Math.round(
      doseRange.targetMinutes *
        60 /
        repSeconds
    ),
    minimumReps,
    maxReps
  );

  return [
    targetReps - 1,
    targetReps,
    targetReps + 1,
  ]
    .filter(
      reps =>
        reps >= minimumReps &&
        reps <= maxReps
    )
    .filter(
      (reps, index, list) =>
        list.indexOf(reps) === index
    );
}


function vo2DoseFitForMinutes(
  minutes,
  doseRange
) {
  if (
    minutes >= doseRange.minMinutes &&
    minutes <= doseRange.maxMinutes
  ) {
    const halfRange = Math.max(
      1,
      (doseRange.maxMinutes -
        doseRange.minMinutes) / 2
    );

    const targetDistance = Math.abs(
      minutes - doseRange.targetMinutes
    );

    return clamp(
      1 -
        0.08 *
          targetDistance /
          halfRange,
      0.92,
      1
    );
  }

  return doseFitForMinutes(
    minutes,
    doseRange
  );
}

function vo2Candidates(athlete) {

  const doseRange =
    resolveVo2DoseRange(athlete);

  const experience =
    vo2TrainingExperienceProfile(athlete);

  const latestResponse =
    latestVo2Response(athlete);

  const paceFirstFeedback =
    latestResponse &&
    ['Too much', 'A little hard', 'Too easy']
      .includes(latestResponse.feedback);

  const candidates = [];

  for (const form of vo2Model.forms) {
    const intensity = resolveVo2Intensity(
      athlete,
      form.distanceMeters
    );

    const repSeconds =
      intensity.targetPaceSecondsPerKm *
      (form.distanceMeters / 1000);

    if (
      repSeconds >
      vo2Model.repDurationSeconds
        .absoluteMaximum
    ) {
      continue;
    }

    // Beginners should learn VO2 work with reps that stay near the
    // preferred physiological window rather than very long distance reps.
    if (
      experience.level === 'beginner' &&
      repSeconds >
        vo2Model.repDurationSeconds
          .maximumPreferred
    ) {
      continue;
    }

    let repsList = vo2CandidateRepRange(
      form,
      repSeconds,
      doseRange,
      athlete
    );

    // v0.1.10 pace-first override: preserve the latest response
    // session's rep count as an explicit candidate when it is safe.
    // This prevents rotation from hiding the intended pace correction.
    if (
      paceFirstFeedback &&
      latestResponse.formKey === form.formKey
    ) {
      const responseReps = Number(
        latestResponse.reps
      );

      const responseMinutes =
        responseReps * repSeconds / 60;

      if (
        Number.isInteger(responseReps) &&
        responseReps >= 2 &&
        responseReps <= form.maxReps &&
        responseMinutes <=
          doseRange.hardMaxMinutes + 0.01
      ) {
        repsList = [
          ...new Set([
            ...repsList,
            responseReps,
          ]),
        ];
      }
    }

    for (const reps of repsList) {
      const minutes =
        reps * repSeconds / 60;

      // Beginner progression stays inside the normal adaptive dose
      // ceiling. The separate hard cap is still retained as an
      // absolute safety boundary, but Comfortable alone cannot jump
      // above the phase/performance range.
      if (
        experience.level === 'beginner' &&
        minutes >
          doseRange.maxMinutes +
            vo2Model
              .beginnerNormalMaxToleranceMinutes
      ) {
        continue;
      }

      const repDurationFit =
        vo2RepDurationFit(repSeconds);

      const structureFit =
        vo2Model.phaseStructureFit[
          athlete.phase
        ]?.[form.structure] ?? 0.9;

      candidates.push({
        family: 'VO2max',
        formKey: form.formKey,
        trainingDomain: 'VO2max',
        label:
          `${reps}×${form.distanceMeters}m VO2max`,
        blocks: [
          workoutBlock(
            reps,
            form.distanceMeters,
            repSeconds,
            form.recoverySeconds
          ),
        ],
        vo2DoseMinutes: minutes,
        qualityDoseMinutes: minutes,
        doseFitOverride:
          vo2DoseFitForMinutes(
            minutes,
            doseRange
          ),
        vo2PaceSecondsPerKm:
          intensity.targetPaceSecondsPerKm,
        vo2PaceAdjustmentSecondsPerKm:
          intensity.responseAdjustmentSecondsPerKm,
        vo2IntensityReason:
          intensity.reason,
        vo2DomainMinimumPaceSecondsPerKm:
          intensity.domainMinimumPaceSecondsPerKm,
        vo2DomainMaximumPaceSecondsPerKm:
          intensity.domainMaximumPaceSecondsPerKm,
        vo2DomainLimitReached:
          intensity.fasterDomainLimitReached ||
          intensity.slowerDomainLimitReached,
        performanceReassessmentNeeded:
          intensity.performanceReassessmentNeeded,
        vo2RepDurationSeconds: repSeconds,
        vo2RepDurationFit: repDurationFit,
        vo2Structure: form.structure,
        eventPhaseFit:
          clamp(
            structureFit *
              (0.82 + 0.18 * repDurationFit),
            0,
            1
          ),
        complexity:
          form.distanceMeters <= 600
            ? 0.05
            : 0.02,
        secondary:
          form.distanceMeters <= 600
            ? ['Speed']
            : ['Threshold'],
      });
    }
  }

  return {
    candidates,
    doseRange,
  };
}

function genericCandidates(
  athlete
) {

  const pace1k =
    paceFrom5k(
      athlete,
      1
    );

  return {
    candidates: [
      {
        family:
          athlete.primaryNeed,
        formKey:
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
        complexity: 0,
        secondary: [],
      },
      {
        family:
          `${athlete.primaryNeed}Short`,
        formKey:
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
        secondary: ['Speed'],
      },
    ],
    doseRange: null,
  };
}

function estimateStressFit(
  candidate,
  athlete
) {
  const work =
    candidate.blocks.filter(
      b =>
        b.kind === 'work'
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
      high: 1,
      very_high: 1.07,
    })[
      athlete.tolerance
    ] || 0.9;

  const experience =
    athlete.primaryNeed === 'VO2max'
      ? vo2TrainingExperienceProfile(athlete)
      : trainingExperienceProfile(athlete);

  const experienceBoost =
    experience.stressMultiplier ?? 1;

  const load =
    totalWorkSeconds /
      1800 +
    candidate.complexity *
      0.3;

  return clamp(
    readiness /
      100 *
      toleranceBoost *
      experienceBoost -
      Math.max(
        0,
        load - 1
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
    normalizedTrainingExperience(athlete),
    athlete.tolerance,
    athlete.primaryNeed,
    candidate.family,
  ].join('|');
}

function evaluateHistory(
  candidate,
  athlete
) {
  const history =
    normalizeWorkoutHistory(
      athlete
    );

  let rotation =
    evaluateRotation(
      candidate,
      history
    );

  let structuralRotation =
    evaluateStructuralRotation(
      candidate,
      history
    );

  if (!history.length) {
    return {
      progression: {
        progressionFit: 0.72,
        progressionLink: 0,
        reason:
          'No comparable history.',
      },
      rotation,
      structuralRotation,
      sessionResponse: {
        fit:
          sessionResponseModel
            .neutralFit,
        feedback: null,
        permission: 'Unknown',
        direction: 'different',
        progressionMultiplier: 1,
        intensityAdaptation: false,
        singleAxisConflict: false,
        referenceDaysAgo: null,
        referenceWorkout: null,
        reason:
          'No comparable session feedback.',
      },
      maxSimilarity: 0,
      historySimilarityExposure: 0,
      historyMatches: [],
    };
  }

  const comparisons =
    history.map(
      session => {
        const formKey =
          inferFormKeyFromWorkoutText(
            session.workout
          );

        const similarity =
          compareWorkoutSimilarity(
            candidate,
            session.workout
          );

        const recencyWeight =
          Math.exp(
            -session.daysAgo /
              penalties
                .similarityTauDays
          );

        const progression =
          compareProgression(
            candidate,
            session.workout
          );

        return {
          ...session,
          formKey,
          similarity,
          recencyWeight,
          weightedSimilarity:
            similarity *
            recencyWeight,
          progression,
          progressionSelectionScore:
            progression
              .progressionFit *
            Math.exp(
              -session.daysAgo /
                90
            ),
        };
      }
    );

  const sameFormComparisons =
    comparisons.filter(
      item =>
        item.formKey ===
        candidate.formKey
    );

  const progressionPool =
    sameFormComparisons.length
      ? sameFormComparisons
      : comparisons;

  const bestProgression =
    [...progressionPool].sort(
      (a, b) =>
        b.progressionSelectionScore -
        a.progressionSelectionScore
    )[0];

  let progression = {
    ...bestProgression.progression,
  };

  const responseReference =
    [...progressionPool].sort(
      (a, b) =>
        a.daysAgo - b.daysAgo ||
        b.similarity - a.similarity
    )[0];

  let sessionResponse =
    evaluateSessionResponse(
      candidate,
      athlete,
      responseReference
    );

  sessionResponse = {
    ...sessionResponse,
    referenceDaysAgo:
      responseReference?.daysAgo ?? null,
    referenceWorkout:
      responseReference?.workout ?? null,
  };

  if (sessionResponse.intensityAdaptation) {
    rotation = {
      ...rotation,
      fit: Math.max(rotation.fit, 0.9),
      reason:
        `${rotation.reason} Same-form rotation penalty relaxed for response-driven pace adaptation.`,
    };

    structuralRotation = {
      ...structuralRotation,
      fit: Math.max(
        structuralRotation.fit,
        0.9
      ),
      reason:
        `${structuralRotation.reason} Structural rotation is temporarily neutralized for pace-first adaptation.`,
    };

    progression.progressionFit =
      Math.max(
        progression.progressionFit,
        0.98
      );

    progression.progressionLink =
      Math.max(
        progression.progressionLink,
        0.95
      );

    progression.reason =
      `${progression.reason} ${sessionResponse.reason} Intensity is adjusted before threshold time.`;
  }

  if (
    sessionResponse.feedback &&
    sessionResponse.direction ===
      'progress' &&
    !sessionResponse.intensityAdaptation
  ) {
    progression.progressionFit =
      clamp(
        progression
          .progressionFit *
          sessionResponse
            .progressionMultiplier,
        0,
        1
      );

    progression.reason =
      `${progression.reason} ${sessionResponse.reason}`;
  }

  if (
    sessionResponse.feedback &&
    sessionResponse.direction ===
      'regress' &&
    sessionResponse.permission ===
      'Regress' &&
    !sessionResponse.intensityAdaptation
  ) {
    progression.progressionFit =
      Math.max(
        progression.progressionFit,
        0.95
      );

    progression.progressionLink =
      Math.max(
        progression.progressionLink,
        0.85
      );

    progression.reason =
      `${progression.reason} ${sessionResponse.reason} Regression supported by athlete response.`;
  }

  if (
    sessionResponse.feedback &&
    sessionResponse.direction ===
      'hold' &&
    sessionResponse.permission ===
      'Hold'
  ) {
    progression.progressionFit =
      Math.max(
        progression.progressionFit,
        0.9
      );

    progression.progressionLink =
      Math.max(
        progression.progressionLink,
        0.65
      );

    progression.reason =
      `${progression.reason} ${sessionResponse.reason} Holding the dose is supported.`;
  }

  const isResponseDrivenRegression =
    sessionResponse.intensityAdaptation ||
    (
      sessionResponse.direction ===
        'regress' &&
      sessionResponse.permission ===
        'Regress'
    );

  if (
    bestProgression.formKey ===
      candidate.formKey &&
    progression.progressionLink >=
      0.8 &&
    !isResponseDrivenRegression
  ) {
    const gate =
      0.55 +
      0.45 *
        rotation.fit;

    progression.progressionFit =
      clamp(
        progression
          .progressionFit *
          gate,
        0,
        1
      );

    if (
      rotation.fit < 0.8
    ) {
      progression.reason =
        `${progression.reason} Progression delayed by threshold rotation.`;
    } else {
      progression.reason =
        `${progression.reason} Rotation is ready for progression.`;
    }
  }

  const historySimilarityExposure =
    clamp(
      comparisons.reduce(
        (sum, item) =>
          sum +
          item.weightedSimilarity,
        0
      ),
      0,
      penalties.historyExposureCap
    );

  const historyMatches =
    comparisons
      .filter(
        item =>
          item.similarity >=
          0.2
      )
      .sort(
        (a, b) =>
          b.weightedSimilarity -
          a.weightedSimilarity
      )
      .map(
        item => ({
          daysAgo:
            item.daysAgo,
          workout:
            item.workout,
          formKey:
            item.formKey,
          similarity:
            item.similarity,
          weightedSimilarity:
            item.weightedSimilarity,
          feedback:
            feedbackForHistorySession(
              athlete,
              item
            )?.feedback || null,
        })
      );

  return {
    progression: {
      ...progression,
      reason:
        `${progression.reason} Based on session ${bestProgression.daysAgo}d ago.`,
    },
    rotation,
    structuralRotation,
    sessionResponse,
    maxSimilarity:
      Math.max(
        ...comparisons.map(
          item =>
            item.similarity
        )
      ),
    historySimilarityExposure,
    historyMatches,
  };
}


function evaluateVo2Rotation(
  candidate,
  history
) {
  if (!history.length) {
    return {
      fit: 1,
      otherFormsSince: 0,
      lastSameDaysAgo: null,
      reason:
        'Fresh VO2 form: no recent VO2 history.',
    };
  }

  const sameForm = history.filter(
    session =>
      session.formKey === candidate.formKey
  );

  if (!sameForm.length) {
    return {
      fit: 1,
      otherFormsSince:
        new Set(
          history.map(
            session => session.formKey
          )
        ).size,
      lastSameDaysAgo: null,
      reason:
        'Fresh VO2 form: not used in recent VO2 history.',
    };
  }

  const lastSame = [...sameForm].sort(
    (a, b) => a.daysAgo - b.daysAgo
  )[0];

  const intervening = history.filter(
    session =>
      session.daysAgo < lastSame.daysAgo &&
      session.formKey !== candidate.formKey
  );

  const distinctOtherForms = new Set(
    intervening.map(
      session => session.formKey
    )
  );

  const ageRelief =
    clamp(lastSame.daysAgo / 21, 0, 1) *
    0.25;

  const varietyRelief = Math.min(
    0.45,
    distinctOtherForms.size * 0.22
  );

  const fit = clamp(
    0.34 + ageRelief + varietyRelief,
    0.2,
    1
  );

  return {
    fit,
    otherFormsSince: distinctOtherForms.size,
    lastSameDaysAgo: lastSame.daysAgo,
    reason:
      distinctOtherForms.size >= 2 ||
      lastSame.daysAgo >= 18
        ? `VO2 rotation ready: ${distinctOtherForms.size} other VO2 forms since this form, last used ${lastSame.daysAgo}d ago.`
        : distinctOtherForms.size === 1
          ? `VO2 rotation building: 1 other VO2 form since this form, last used ${lastSame.daysAgo}d ago.`
          : `VO2 rotation hold: this form was used ${lastSame.daysAgo}d ago with no other VO2 form since.`,
  };
}

function evaluateVo2StructuralRotation(
  candidate,
  history
) {
  const candidateStructure =
    candidate.vo2Structure || 'Medium';

  const recent = history
    .filter(session =>
      ['Short', 'Medium', 'Long'].includes(
        session.structureKey
      )
    )
    .slice(0, 3);

  if (recent.length < 2) {
    return {
      fit: 0.92,
      candidateStructure,
      targetStructure: null,
      reason:
        'Not enough VO2 structure history for a strong rotation preference.',
    };
  }

  const counts = {
    Short: 0,
    Medium: 0,
    Long: 0,
  };

  recent.forEach(session => {
    counts[session.structureKey] += 1;
  });

  let targetStructure = null;

  if (
    counts.Short >= 2 &&
    counts.Short > counts.Long
  ) {
    targetStructure = 'Long';
  } else if (
    counts.Long >= 2 &&
    counts.Long > counts.Short
  ) {
    targetStructure = 'Short';
  }

  if (!targetStructure) {
    return {
      fit: 0.9,
      candidateStructure,
      targetStructure: null,
      reason:
        `VO2 structure history is mixed (${counts.Short} short, ${counts.Medium} medium, ${counts.Long} long); no strong direction.`,
    };
  }

  let fit = 0.68;

  if (candidateStructure === targetStructure) {
    fit = 1;
  } else if (candidateStructure === 'Medium') {
    fit = 0.8;
  } else {
    fit = 0.48;
  }

  return {
    fit,
    candidateStructure,
    targetStructure,
    reason:
      `VO2 structural rotation targets ${targetStructure.toLowerCase()} reps after recent ${targetStructure === 'Long' ? 'short' : 'long'}-rep emphasis (${counts.Short} short, ${counts.Medium} medium, ${counts.Long} long).`,
  };
}

function evaluateVo2History(
  candidate,
  athlete
) {
  const history = vo2History(athlete);

  let rotation = evaluateVo2Rotation(
    candidate,
    history
  );

  let structuralRotation =
    evaluateVo2StructuralRotation(
      candidate,
      history
    );

  if (!history.length) {
    return {
      progression: {
        progressionFit: 0.72,
        progressionLink: 0,
        reason:
          'No comparable VO2 history.',
      },
      rotation,
      structuralRotation,
      sessionResponse: {
        fit:
          sessionResponseModel.neutralFit,
        feedback: null,
        permission: 'Unknown',
        direction: 'different',
        progressionMultiplier: 1,
        intensityAdaptation: false,
        singleAxisConflict: false,
        referenceDaysAgo: null,
        referenceWorkout: null,
        reason:
          'No comparable VO2 session feedback.',
      },
      maxSimilarity: 0,
      historySimilarityExposure: 0,
      historyMatches: [],
    };
  }

  const comparisons = history.map(
    session => {
      const similarity =
        compareWorkoutSimilarity(
          candidate,
          session.workout
        );

      const recencyWeight = Math.exp(
        -session.daysAgo /
          penalties.similarityTauDays
      );

      const progression = compareProgression(
        candidate,
        session.workout
      );

      return {
        ...session,
        similarity,
        recencyWeight,
        weightedSimilarity:
          similarity * recencyWeight,
        progression,
        progressionSelectionScore:
          progression.progressionFit *
          Math.exp(-session.daysAgo / 90),
      };
    }
  );

  const sameFormComparisons =
    comparisons.filter(
      item =>
        item.formKey === candidate.formKey
    );

  const progressionPool =
    sameFormComparisons.length
      ? sameFormComparisons
      : comparisons;

  const bestProgression =
    [...progressionPool].sort(
      (a, b) =>
        b.progressionSelectionScore -
        a.progressionSelectionScore
    )[0];

  let progression = {
    ...bestProgression.progression,
  };

  const ratedSameForm =
    sameFormComparisons.filter(
      item => item.feedback
    );

  const ratedPool = ratedSameForm.length
    ? ratedSameForm
    : comparisons.filter(
        item => item.feedback
      );

  const responseReference =
    [...(
      ratedPool.length
        ? ratedPool
        : progressionPool
    )].sort(
      (a, b) =>
        a.daysAgo - b.daysAgo ||
        b.similarity - a.similarity
    )[0];

  let sessionResponse =
    evaluateSessionResponse(
      candidate,
      athlete,
      responseReference
    );

  sessionResponse = {
    ...sessionResponse,
    referenceDaysAgo:
      responseReference?.daysAgo ?? null,
    referenceWorkout:
      responseReference?.workout ?? null,
  };

  const paceFirstFeedback =
    sessionResponse.feedback &&
    ['Too much', 'A little hard', 'Too easy']
      .includes(sessionResponse.feedback);

  const responseReferenceForm =
    responseReference?.formKey || null;

  const changedStructureDuringPaceFirst =
    paceFirstFeedback &&
    responseReferenceForm &&
    candidate.formKey !== responseReferenceForm &&
    !sessionResponse.intensityAdaptation;

  if (changedStructureDuringPaceFirst) {
    sessionResponse = {
      ...sessionResponse,
      fit: Math.min(
        sessionResponse.fit,
        vo2Model
          .paceFirstDifferentStructureFitCap
      ),
      reason:
        `${sessionResponse.reason} VO2 pace-first priority prefers correcting the latest structure before rotating.`,
    };

    progression.progressionFit = Math.min(
      progression.progressionFit,
      vo2Model
        .paceFirstDifferentStructureProgressionCap
    );
  }

  if (sessionResponse.intensityAdaptation) {
    rotation = {
      ...rotation,
      fit: 1,
      reason:
        `${rotation.reason} Same-form rotation penalty is overridden for VO2 pace adaptation.`,
    };

    structuralRotation = {
      ...structuralRotation,
      fit: 1,
      reason:
        `${structuralRotation.reason} Structural rotation is temporarily overridden for VO2 pace-first adaptation.`,
    };

    progression.progressionFit = 1;

    progression.progressionLink = 1;

    progression.reason =
      `${progression.reason} ${sessionResponse.reason} Intensity is adjusted before VO2 dose.`;
  }

  if (
    sessionResponse.feedback &&
    sessionResponse.direction === 'progress' &&
    !sessionResponse.intensityAdaptation
  ) {
    progression.progressionFit = clamp(
      progression.progressionFit *
        sessionResponse.progressionMultiplier,
      0,
      1
    );

    progression.reason =
      `${progression.reason} ${sessionResponse.reason}`;
  }

  if (
    sessionResponse.feedback &&
    sessionResponse.direction === 'regress' &&
    sessionResponse.permission === 'Regress' &&
    !sessionResponse.intensityAdaptation &&
    !changedStructureDuringPaceFirst
  ) {
    progression.progressionFit = Math.max(
      progression.progressionFit,
      0.95
    );

    progression.progressionLink = Math.max(
      progression.progressionLink,
      0.85
    );

    progression.reason =
      `${progression.reason} ${sessionResponse.reason} Regression supported by athlete response.`;
  }

  if (
    sessionResponse.feedback &&
    sessionResponse.direction === 'hold' &&
    sessionResponse.permission === 'Hold' &&
    !changedStructureDuringPaceFirst
  ) {
    progression.progressionFit = Math.max(
      progression.progressionFit,
      0.9
    );

    progression.progressionLink = Math.max(
      progression.progressionLink,
      0.65
    );

    progression.reason =
      `${progression.reason} ${sessionResponse.reason} Holding the VO2 dose is supported.`;
  }

  const isResponseDrivenRegression =
    sessionResponse.intensityAdaptation ||
    (
      sessionResponse.direction === 'regress' &&
      sessionResponse.permission === 'Regress'
    );

  if (
    bestProgression.formKey ===
      candidate.formKey &&
    progression.progressionLink >= 0.8 &&
    !isResponseDrivenRegression
  ) {
    const gate =
      0.55 + 0.45 * rotation.fit;

    progression.progressionFit = clamp(
      progression.progressionFit * gate,
      0,
      1
    );

    progression.reason =
      rotation.fit < 0.8
        ? `${progression.reason} Progression delayed by VO2 rotation.`
        : `${progression.reason} VO2 rotation is ready for progression.`;
  }

  let historySimilarityExposure = clamp(
    comparisons.reduce(
      (sum, item) =>
        sum + item.weightedSimilarity,
      0
    ),
    0,
    penalties.historyExposureCap
  );

  if (sessionResponse.intensityAdaptation) {
    historySimilarityExposure *=
      vo2Model
        .paceFirstHistoryExposureMultiplier;
  }

  const historyMatches = comparisons
    .filter(item => item.similarity >= 0.2)
    .sort(
      (a, b) =>
        b.weightedSimilarity -
        a.weightedSimilarity
    )
    .map(item => ({
      daysAgo: item.daysAgo,
      workout: item.workout,
      formKey: item.formKey,
      similarity: item.similarity,
      weightedSimilarity:
        item.weightedSimilarity,
      feedback: item.feedback || null,
    }));

  return {
    progression: {
      ...progression,
      reason:
        `${progression.reason} Based on VO2 session ${bestProgression.daysAgo}d ago.`,
    },
    rotation,
    structuralRotation,
    sessionResponse,
    maxSimilarity: Math.max(
      ...comparisons.map(
        item => item.similarity
      )
    ),
    historySimilarityExposure,
    historyMatches,
  };
}

export function generateCandidates(
  athlete,
  learningState = {}
) {

  const generated =
    athlete.primaryNeed ===
      'Threshold'
      ? thresholdCandidates(
          athlete
        )
      : athlete.primaryNeed ===
          'VO2max'
        ? vo2Candidates(
            athlete
          )
        : genericCandidates(
            athlete
          );

  const raw =
    generated.candidates;

  const doseRange =
    generated.doseRange;

  const phaseBias =
    racePhaseBias[
      athlete.phase
    ] ||
    racePhaseBias.Loading;

  const candidates =
    raw.map(
      candidate => {
        const history =
          athlete.primaryNeed === 'VO2max'
            ? evaluateVo2History(
                candidate,
                athlete
              )
            : evaluateHistory(
                candidate,
                athlete
              );

        const progression =
          history.progression;

        const key =
          contextKey(
            athlete,
            candidate
          );

        const learnedModifier =
          learningState[key]
            ?.modifier ??
          1;

        const primaryMatch =
          candidate.family
            .toLowerCase()
            .includes(
              athlete
                .primaryNeed
                .toLowerCase()
            )
            ? 1
            : 0.72;

        const hasUsefulSecondary =
          candidate.secondary
            .includes('Speed') &&
          [
            '5K',
            '10K',
            'HM',
            'Marathon',
            '3000m',
          ].includes(
            athlete.goalEvent
          );

        candidate.signature =
          signature(candidate);

        candidate.learningKey =
          key;

        candidate.historyMatches =
          history.historyMatches;

        candidate.rotationReason =
          history.rotation.reason;

        candidate.rotationOtherFormsSince =
          history.rotation
            .otherFormsSince;

        candidate.structureReason =
          history.structuralRotation.reason;

        candidate.structureKey =
          history.structuralRotation
            .candidateStructure;

        candidate.targetStructure =
          history.structuralRotation
            .targetStructure;

        candidate.sessionResponseReason =
          history.sessionResponse.reason;

        candidate.sessionResponseFeedback =
          history.sessionResponse.feedback;

        candidate.progressionPermission =
          history.sessionResponse.permission;

        candidate.progressionDirection =
          history.sessionResponse.direction;

        candidate.intensityAdaptation =
          history.sessionResponse
            .intensityAdaptation;

        candidate.singleAxisConflict =
          history.sessionResponse
            .singleAxisConflict || false;

        candidate.sessionResponseReferenceDaysAgo =
          history.sessionResponse
            .referenceDaysAgo ?? null;

        candidate.sessionResponseReferenceWorkout =
          history.sessionResponse
            .referenceWorkout ?? null;

        const qualityDoseMinutes =
          Number.isFinite(
            candidate.vo2DoseMinutes
          )
            ? candidate.vo2DoseMinutes
            : thresholdDoseMinutes(
                candidate
              );

        candidate.qualityDoseMinutes =
          qualityDoseMinutes;

        if (
          athlete.primaryNeed ===
            'Threshold'
        ) {
          candidate.thresholdDoseMinutes =
            qualityDoseMinutes;
        }

        candidate.doseRange =
          doseRange;

        const doseFit =
          Number.isFinite(
            candidate.doseFitOverride
          )
            ? candidate.doseFitOverride
            : doseRange
              ? doseFitForMinutes(
                  qualityDoseMinutes,
                  doseRange
                )
              : 0.9;

        const toleranceBase =
          ({
            low: 0.82,
            established: 0.92,
            high: 0.97,
            very_high: 1,
          })[
            athlete.tolerance
          ] || 0.9;

        const experience =
          athlete.primaryNeed ===
            'VO2max'
            ? vo2TrainingExperienceProfile(
                athlete
              )
            : trainingExperienceProfile(
                athlete
              );

        const isClearProgression =
          /progression/i.test(
            progression.reason || ''
          ) &&
          progression.progressionLink >=
            0.8;

        const experienceProgressionMultiplier =
          isClearProgression
            ? experience
                .progressionFitMultiplier ?? 1
            : 1;

        candidate.trainingExperience =
          experience.level;

        candidate.experienceProgressionMultiplier =
          experienceProgressionMultiplier;

        candidate.fit = {
          needMatch:
            primaryMatch,

          eventPhaseFit:
            Number.isFinite(
              candidate.eventPhaseFit
            )
              ? candidate.eventPhaseFit
              : clamp(
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
            clamp(
              progression.progressionFit *
                experienceProgressionMultiplier,
              0,
              1
            ),

          doseFit,

          rotationFit:
            history.rotation.fit,

          structuralRotationFit:
            history.structuralRotation.fit,

          sessionResponseFit:
            history.sessionResponse.fit,

          toleranceFit:
            clamp(
              toleranceBase *
                (
                  0.8 +
                  0.2 *
                    doseFit
                ),
              0,
              1
            ),

          stressFit:
            estimateStressFit(
              candidate,
              athlete
            ),

          scheduleFit: 0.9,

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

          workoutSimilarity:
            history.maxSimilarity,

          historySimilarityExposure:
            history
              .historySimilarityExposure,

          progressionLink:
            progression
              .progressionLink,

          complexity:
            candidate
              .complexity,

          novelty:
            candidate.formKey ===
              'ThresholdComposite'
              ? 0.12
              : 0.05,
        };

        candidate.progressionReason =
          progression.reason;

        const scored =
          scoreCandidate(
            candidate,
            {},
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
      b.score -
      a.score
  );
}

export function formatCandidate(
  candidate
) {
  const parts = [];

  for (const block of candidate.blocks) {
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

    const recovery =
      block.recoverySeconds
        ? `${secondsToClock(
            block.recoverySeconds
          )} ${block.recoveryType}`
        : 'recovery unknown';

    if (
      block.distanceMeters > 0
    ) {
      parts.push(
        `${block.reps}×${block.distanceMeters}m @ ${secondsToClock(
          block.targetSecondsPerRep
        )} · ${recovery}`
      );
    } else {
      parts.push(
        `${block.reps}×${secondsToClock(
          block.targetSecondsPerRep
        )} work · ${recovery}`
      );
    }
  }

  return parts;
}
