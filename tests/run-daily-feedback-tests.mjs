import assert from 'node:assert/strict';
import {
  buildFeedbackAdaptation,
  calendarDayKey,
  feedbackBalance,
  normalizeTweteDailyFeedback,
  validateTweteDailyFeedback,
  missedSessionPolicy,
} from '../src/tate-engine/daily-feedback-simulator.js';

const baseWeekRule = {
  week: 1,
  days: {
    mon: 'easy',
    tue: 'workout',
    wed: 'easy',
    thu: 'easy',
    fri: 'workout',
    sat: 'easy',
    sun: 'long_run',
  },
};

{
  const validation = validateTweteDailyFeedback({
    feeling: 'great',
    training_difficulty: 'as_expected',
    completion_status: 'completed',
    pain_severity: 0,
  });
  assert.equal(validation.valid, true);
}

{
  const validation = validateTweteDailyFeedback({
    feeling: 'tired',
    training_difficulty: 'hard',
    completion_status: 'completed',
    pain_severity: 3,
    pain_area: '',
  });
  assert.equal(validation.valid, false);
  assert.ok(validation.errors.includes('pain_area'));
}

{
  const normalized = normalizeTweteDailyFeedback({
    feeling: 'good',
    training_difficulty: 'very_hard',
    completion_status: 'skipped',
    pain_severity: 0,
  });
  assert.equal(normalized.training_difficulty, null);
  assert.equal(normalized.pain_present, false);
}

{
  const result = buildFeedbackAdaptation({
    baseWeekRule,
    totalWeeks: 2,
    completedThroughIndex: 0,
    phase: 'base',
    feedbackHistory: [
      {
        calendarIndex: 0,
        feeling: 'very_tired',
        training_difficulty: 'very_hard',
        completion_status: 'completed',
        pain_severity: 0,
      },
    ],
  });

  assert.equal(result.weekRules[0].days.mon, 'unavailable');
  assert.equal(result.weekRules[0].days.tue, 'easy');
  assert.ok(result.heldWorkoutKeys.has(calendarDayKey(1, 'tue')));
  assert.ok(result.forceRecoveryKeys.has(calendarDayKey(1, 'wed')));
}

{
  const loading = buildFeedbackAdaptation({
    baseWeekRule,
    totalWeeks: 2,
    completedThroughIndex: 0,
    phase: 'loading',
    feedbackHistory: [
      {
        calendarIndex: 0,
        feeling: 'great',
        training_difficulty: 'as_expected',
        completion_status: 'completed',
        pain_severity: 0,
      },
    ],
  });

  assert.ok(
    loading.progressiveLongRunKeys.has(calendarDayKey(1, 'sun'))
  );
}

{
  const base = buildFeedbackAdaptation({
    baseWeekRule,
    totalWeeks: 2,
    completedThroughIndex: 0,
    phase: 'base',
    feedbackHistory: [
      {
        calendarIndex: 0,
        feeling: 'great',
        training_difficulty: 'easy',
        completion_status: 'completed',
        pain_severity: 0,
      },
    ],
  });

  assert.equal(base.progressiveLongRunKeys.size, 0);
}


{
  const missedWorkout = missedSessionPolicy({
    placementType: 'workout',
    completionStatus: 'skipped',
  });
  assert.equal(missedWorkout.missed, true);
  assert.equal(missedWorkout.action, 'make_up');
  assert.equal(missedWorkout.carryForward, true);
}

{
  const missedSpeed = missedSessionPolicy({
    placementType: 'speed',
    completionStatus: 'skipped',
  });
  assert.equal(missedSpeed.action, 'make_up');
  assert.equal(missedSpeed.carryForward, true);
}

{
  const missedAerobic = missedSessionPolicy({
    placementType: 'easy',
    completionStatus: 'skipped',
  });
  assert.equal(missedAerobic.action, 'ignored');
  assert.equal(missedAerobic.ignoredForFuturePlan, true);
}

{
  const missedLongRun = missedSessionPolicy({
    placementType: 'long_run',
    completionStatus: 'skipped',
  });
  assert.equal(missedLongRun.action, 'ignored');
  assert.equal(missedLongRun.ignoredForFuturePlan, true);
}

assert.equal(
  feedbackBalance([
    {
      feeling: 'great',
      training_difficulty: 'easy',
      completion_status: 'completed',
      pain_severity: 0,
    },
    {
      feeling: 'very_tired',
      training_difficulty: 'very_hard',
      completion_status: 'partial',
      pain_severity: 4,
      pain_area: 'calf',
    },
  ]),
  -5
);

console.log('TWETE daily feedback simulator tests passed');
