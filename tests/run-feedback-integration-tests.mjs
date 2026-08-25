import assert from 'node:assert/strict';

import {
  buildFeedbackAdaptation,
} from '../src/tate-engine/daily-feedback-simulator.js';

import {
  DAY_ROLES,
  blankWeekRule,
  schedulePlanIntoWeeks,
} from '../src/tate-engine/week-scheduler.js';

function fakeAssignment(slot, primaryAnchor) {
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
  };
}

const rule = blankWeekRule(1);
const adaptation = buildFeedbackAdaptation({
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

const schedule = schedulePlanIntoWeeks(
  remaining,
  adaptation.weekRules
);

const week1 = schedule.weeks[0];
assert.equal(
  week1.days.find(day => day.day === 'mon').available,
  false
);
assert.equal(
  week1.days.find(day => day.day === 'tue').effectiveRole,
  DAY_ROLES.EASY
);
assert.notEqual(
  week1.days.find(day => day.day === 'tue').placementType,
  'workout'
);
assert.equal(
  week1.days.find(day => day.day === 'fri').placementType,
  'workout'
);

console.log('TWETE daily feedback integration tests passed');
