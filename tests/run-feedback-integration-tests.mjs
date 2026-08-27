import assert from 'node:assert/strict';

import {
  buildFeedbackAdaptation,
  buildWeeklyProgressionDecisions,
  missedSessionPolicy,
  progressionDecisionFromFeedback,
} from '../src/tate-engine/daily-feedback-simulator.js';
import {
  DAY_ROLES,
  blankWeekRule,
  schedulePlanIntoWeeks,
} from '../src/tate-engine/week-scheduler.js';

function fakeAssignment(
  slot,
  primaryAnchor,
  extra = {}
) {
  return {
    slot,
    stimulus: primaryAnchor,
    primaryAnchor,
    selectedStimulus: primaryAnchor,
    secondaryTarget: null,
    selectionMode: 'primary',
    status: 'assigned',
    workout: {
      id: `TEST_${slot}`,
      stimulus: primaryAnchor,
      role: 'priority',
      active: true,
    },
    ...extra,
  };
}

function day(
  schedule,
  weekNumber,
  weekday
) {
  return schedule.weeks[
    weekNumber - 1
  ].days.find(
    item => item.day === weekday
  );
}

/*
 * 1. Readiness adaptation:
 * severe/tired feedback holds the next Workout Day.
 */
{
  const rule = blankWeekRule(1);

  const adaptation =
    buildFeedbackAdaptation({
      baseWeekRule: rule,
      totalWeeks: 2,
      completedThroughIndex: 0,
      phase: 'base',
      feedbackHistory: [
        {
          calendarIndex: 0,
          feeling: 'very_tired',
          training_difficulty: 'hard',
          completion_status: 'completed',
          pain_severity: 4,
          pain_area: 'calf',
        },
      ],
    });

  const remaining = [
    fakeAssignment(2, 'Threshold'),
    fakeAssignment(3, 'Aerobic'),
    fakeAssignment(4, 'Aerobic'),
    fakeAssignment(5, 'Threshold'),
    fakeAssignment(6, 'Aerobic'),
  ];

  const schedule =
    schedulePlanIntoWeeks(
      remaining,
      adaptation.weekRules
    );

  assert.equal(
    day(schedule, 1, 'mon').available,
    false
  );

  assert.equal(
    day(schedule, 1, 'tue').effectiveRole,
    DAY_ROLES.EASY
  );

  assert.notEqual(
    day(schedule, 1, 'tue')
      .placementType,
    'workout'
  );

  assert.equal(
    day(schedule, 1, 'fri')
      .placementType,
    'workout'
  );
}

/*
 * 2. Missed Quality:
 * Tuesday Quality is skipped.
 *
 * It must remain open and be made up on
 * the next eligible Workout Day (Friday).
 *
 * The Quality that originally followed it
 * then shifts to the next Workout Day
 * (Tuesday of week 2).
 */
{
  const rule = blankWeekRule(1);

  const missedPolicy =
    missedSessionPolicy({
      placementType: 'workout',
      completionStatus: 'skipped',
    });

  assert.equal(
    missedPolicy.missed,
    true
  );

  assert.equal(
    missedPolicy.carryForward,
    true
  );

  const adaptation =
    buildFeedbackAdaptation({
      baseWeekRule: rule,
      totalWeeks: 2,
      completedThroughIndex: 1,
      phase: 'base',
      feedbackHistory: [
        {
          calendarIndex: 1,
          feeling: 'good',
          training_difficulty: null,
          completion_status: 'skipped',
          pain_severity: 0,
        },
      ],
    });

  const missedQuality =
    fakeAssignment(
      2,
      'Threshold',
      {
        feedbackMakeup: true,
        feedbackMakeupReason:
          'Previously missed Quality session.',
      }
    );

  const laterQuality =
    fakeAssignment(
      5,
      'Threshold'
    );

  const schedule =
    schedulePlanIntoWeeks(
      [
        missedQuality,
        laterQuality,
      ],
      adaptation.weekRules
    );

  assert.equal(
    day(schedule, 1, 'tue').available,
    false
  );

  assert.equal(
    day(schedule, 1, 'fri')
      .assignment?.slot,
    2
  );

  assert.equal(
    day(schedule, 1, 'fri')
      .placementType,
    'workout'
  );

  assert.equal(
    day(schedule, 2, 'tue')
      .assignment?.slot,
    5
  );

  assert.equal(
    day(schedule, 2, 'tue')
      .placementType,
    'workout'
  );
}

/*
 * 3. Missed Quality + poor readiness:
 *
 * Tuesday Quality is skipped and the feedback
 * is bad enough to hold Friday's Workout Day.
 *
 * Therefore Friday is downgraded to Easy.
 * The missed Quality must NOT be forced there.
 *
 * It moves to the next genuinely eligible
 * Workout Day: Tuesday of week 2.
 *
 * The later Quality shifts to Friday of week 2.
 */
{
  const rule = blankWeekRule(1);

  const adaptation =
    buildFeedbackAdaptation({
      baseWeekRule: rule,
      totalWeeks: 2,
      completedThroughIndex: 1,
      phase: 'base',
      feedbackHistory: [
        {
          calendarIndex: 1,
          feeling: 'very_tired',
          training_difficulty: null,
          completion_status: 'skipped',
          pain_severity: 4,
          pain_area: 'calf',
        },
      ],
    });

  assert.equal(
    adaptation.weekRules[0]
      .days.fri,
    DAY_ROLES.EASY
  );

  const missedQuality =
    fakeAssignment(
      2,
      'Threshold',
      {
        feedbackMakeup: true,
        feedbackMakeupReason:
          'Previously missed Quality session.',
      }
    );

  const laterQuality =
    fakeAssignment(
      5,
      'Threshold'
    );

  const schedule =
    schedulePlanIntoWeeks(
      [
        missedQuality,
        laterQuality,
      ],
      adaptation.weekRules
    );

  assert.notEqual(
    day(schedule, 1, 'fri')
      .placementType,
    'workout'
  );

  assert.equal(
    day(schedule, 2, 'tue')
      .assignment?.slot,
    2
  );

  assert.equal(
    day(schedule, 2, 'tue')
      .placementType,
    'workout'
  );

  assert.equal(
    day(schedule, 2, 'fri')
      .assignment?.slot,
    5
  );

  assert.equal(
    day(schedule, 2, 'fri')
      .placementType,
    'workout'
  );
}
/*
 * 4. Positive feedback progresses.
 */
assert.equal(
  progressionDecisionFromFeedback([
    {
      feeling: 'good',
      training_difficulty:
        'as_expected',
      completion_status:
        'completed',
      pain_severity: 0,
    },
  ]),
  'progress'
);


/*
 * 5. Moderate negative feedback maintains.
 */
assert.equal(
  progressionDecisionFromFeedback([
    {
      feeling: 'tired',
      training_difficulty:
        'as_expected',
      completion_status:
        'completed',
      pain_severity: 0,
    },
  ]),
  'maintain'
);


/*
 * 6. Strong negative feedback recovers.
 */
assert.equal(
  progressionDecisionFromFeedback([
    {
      feeling: 'very_tired',
      training_difficulty:
        'hard',
      completion_status:
        'completed',
      pain_severity: 4,
      pain_area: 'calf',
    },
  ]),
  'recover'
);


/*
 * 7. Previous week controls next week.
 */
const weeklyDecisions =
  buildWeeklyProgressionDecisions({
    totalWeeks: 4,

    feedbackHistory: [
      {
        week: 1,
        calendarIndex: 1,
        feeling: 'good',
        training_difficulty:
          'as_expected',
        completion_status:
          'completed',
        pain_severity: 0,
      },

      {
        week: 2,
        calendarIndex: 8,
        feeling: 'tired',
        training_difficulty:
          'hard',
        completion_status:
          'completed',
        pain_severity: 0,
      },

      {
        week: 3,
        calendarIndex: 15,
        feeling: 'very_tired',
        training_difficulty:
          'very_hard',
        completion_status:
          'completed',
        pain_severity: 4,
        pain_area: 'calf',
      },
    ],
  });

assert.deepEqual(
  weeklyDecisions,
  [
    'progress',
    'progress',
    'maintain',
    'recover',
  ]
);
console.log(
  'TWETE daily feedback integration tests passed'
);
