import assert from 'node:assert/strict';

import {
  assignWorkoutsToSlots,
  buildAutomaticSecondaryPlan,
  buildSlotSequence,
  calculateSlotCounts,
} from '../src/tate-engine/slot-planner.js';

function aerobicSlot({
  slot = 1,
  secondaryTarget = 'strides',
} = {}) {
  return {
    slot,
    stimulus: 'Aerobic',
    primaryAnchor: 'Aerobic',
    secondaryTarget,
  };
}

function testStridesStayAttachedToAerobicPrimary() {
  const workouts = [
    {
      id: 'AEROBIC_BASE',
      role: 'priority',
      stimulus: 'Aerobic',
      active: true,
    },
    {
      id: 'STRIDES_6X100',
      role: 'priority',
      stimulus: 'Strides',
      active: true,
    },
  ];

  const [assigned] = assignWorkoutsToSlots(
    [aerobicSlot()],
    workouts
  );

  assert.equal(assigned.status, 'assigned');
  assert.equal(assigned.workout.id, 'AEROBIC_BASE');
  assert.equal(assigned.selectedStimulus, 'Aerobic');
  assert.equal(assigned.secondaryTarget, 'strides');

  assert.equal(
    assigned.selectionMode,
    'primary_with_addon'
  );
  assert.equal(
    assigned.addonWorkout.id,
    'STRIDES_6X100'
  );
  assert.equal(
    assigned.addonStimulus,
    'Strides'
  );
  assert.equal(
    assigned.addonStatus,
    'assigned'
  );

  assert.notEqual(
    assigned.workout.id,
    assigned.addonWorkout.id
  );
}

function testMissingStridesKeepsAerobicAndCreatesAddonGap() {
  const workouts = [
    {
      id: 'AEROBIC_BASE',
      role: 'priority',
      stimulus: 'Aerobic',
      active: true,
    },
  ];

  const [assigned] = assignWorkoutsToSlots(
    [aerobicSlot()],
    workouts
  );

  assert.equal(assigned.status, 'assigned');
  assert.equal(assigned.workout.id, 'AEROBIC_BASE');
  assert.equal(assigned.selectedStimulus, 'Aerobic');

  assert.equal(
    assigned.selectionMode,
    'primary_addon_gap'
  );
  assert.equal(assigned.addonWorkout, null);
  assert.equal(assigned.addonStimulus, 'Strides');
  assert.equal(assigned.addonStatus, 'missing');

  assert.match(
    assigned.reason,
    /Aerobic run remains scheduled/i
  );
}

function testStridesNeverRunWithoutAerobicPrimary() {
  const workouts = [
    {
      id: 'STRIDES_6X100',
      role: 'priority',
      stimulus: 'Strides',
      active: true,
    },
  ];

  const [assigned] = assignWorkoutsToSlots(
    [aerobicSlot()],
    workouts
  );

  assert.equal(assigned.status, 'missing');
  assert.equal(assigned.workout, null);
  assert.equal(assigned.selectedStimulus, 'Aerobic');

  assert.equal(assigned.addonWorkout, null);
  assert.equal(
    assigned.addonStatus,
    'blocked_primary_missing'
  );

  assert.match(
    assigned.reason,
    /Strides cannot be scheduled alone/i
  );
}

function testAutomaticStridesNeverReplaceLongRunSlot() {
  const counts = calculateSlotCounts({
    event: '10K',
    slotCount: 30,
  });

  const slots = buildSlotSequence(counts);

  const automatic = buildAutomaticSecondaryPlan({
    slots,
    phase: 'base',
    trainingDaysPerWeek: 5,
    hasLongRunDay: true,
    longRunAllowed: true,
  });

  const longRunSlots = new Set(
    Object.entries(automatic.secondaryPlan)
      .filter(([, entry]) => entry.target === 'long_run')
      .map(([slot]) => Number(slot))
  );

  const stridesSlots = Object.entries(
    automatic.secondaryPlan
  )
    .filter(([, entry]) => entry.target === 'strides')
    .map(([slot]) => Number(slot));

  assert.ok(longRunSlots.size > 0);
  assert.ok(stridesSlots.length > 0);

  for (const slotNumber of stridesSlots) {
    assert.equal(
      longRunSlots.has(slotNumber),
      false
    );

    const slot = slots.find(
      item => item.slot === slotNumber
    );

    assert.equal(
      slot.primaryAnchor,
      'Aerobic'
    );
  }
}

testStridesStayAttachedToAerobicPrimary();
testMissingStridesKeepsAerobicAndCreatesAddonGap();
testStridesNeverRunWithoutAerobicPrimary();
testAutomaticStridesNeverReplaceLongRunSlot();

console.log('TATE Strides add-on tests passed');
