import assert from 'node:assert/strict';

import {
  parseWorkoutText,
  classifyWorkout,
  generateCandidates,
  resolveThresholdDoseRange,
  resolveThresholdIntensity,
  ENGINE_VERSION,
} from '../src/tate-engine/index.js';

function baseAthlete(overrides = {}) {
  return {
    goalEvent: '5K',
    phase: 'Loading',
    current5k: '15:00',
    tolerance: 'established',
    primaryNeed: 'Threshold',
    readiness: 82,
    ...overrides,
  };
}

function testParser() {
  const parsed = parseWorkoutText(
    '6x1000m in 3:00, 2min rest + 5min jog between blocks + 5x200m in 36s, 30sec rest'
  );

  assert.equal(parsed.blocks.length, 3);
  assert.equal(parsed.blocks[0].reps, 6);
  assert.equal(parsed.blocks[0].distanceMeters, 1000);
  assert.equal(parsed.blocks[0].targetSecondsPerRep, 180);
  assert.equal(parsed.blocks[0].recoverySeconds, 120);
  assert.equal(parsed.blocks[1].kind, 'inter_block_rest');
  assert.equal(parsed.blocks[1].durationSeconds, 300);
  assert.equal(parsed.blocks[2].reps, 5);
  assert.equal(parsed.blocks[2].distanceMeters, 200);
}

function testDurationParser() {
  const repeated = parseWorkoutText(
    '3x10min Threshold / 2min jog'
  );

  assert.equal(repeated.blocks.length, 1);
  assert.equal(repeated.blocks[0].workType, 'duration');
  assert.equal(repeated.blocks[0].reps, 3);
  assert.equal(repeated.blocks[0].targetSecondsPerRep, 600);
  assert.equal(repeated.blocks[0].recoverySeconds, 120);

  const eight = parseWorkoutText(
    '4x8min Threshold / 90s jog'
  );

  assert.equal(eight.blocks[0].reps, 4);
  assert.equal(eight.blocks[0].targetSecondsPerRep, 480);
}

function testClassifier() {
  const parsed = parseWorkoutText(
    '5x1000m in 3:00, 60sec rest'
  );

  const classified = classifyWorkout(
    parsed,
    baseAthlete()
  );

  assert.ok(classified.length > 0);
  assert.equal(classified[0].kind, 'work');
}

function testCompetitive5kBaseStartsAtTenBy1k() {
  const athlete = baseAthlete({
    phase: 'Base',
    recentWorkouts: [],
  });

  const candidates = generateCandidates(
    athlete,
    {}
  );

  const thousandLabels = candidates
    .filter(c => c.formKey === 'Threshold1000')
    .map(c => c.label);

  assert.deepEqual(
    thousandLabels,
    ['10×1000m Threshold']
  );

  const ten = candidates.find(
    c => c.label === '10×1000m Threshold'
  );

  assert.ok(ten);
  assert.ok(ten.thresholdDoseMinutes >= 30);
  assert.ok(ten.thresholdDoseMinutes <= 34);
}

function testCompetitive5kLoadingAllowsTenToTwelve() {
  const candidates = generateCandidates(
    baseAthlete({
      phase: 'Loading',
      recentWorkouts: [],
    }),
    {}
  );

  const thousandLabels = candidates
    .filter(c => c.formKey === 'Threshold1000')
    .map(c => c.label)
    .sort();

  assert.deepEqual(
    thousandLabels,
    [
      '10×1000m Threshold',
      '11×1000m Threshold',
      '12×1000m Threshold',
    ]
  );

  assert.equal(
    candidates.some(
      c => c.label === '13×1000m Threshold'
    ),
    false
  );
}

function testNoviceThresholdCapTwentyMinutes() {
  const athlete = baseAthlete({
    current5k: '27:00',
    tolerance: 'low',
    phase: 'Loading',
    readiness: 80,
  });

  const range = resolveThresholdDoseRange(
    athlete
  );

  assert.equal(
    range.hardMaxMinutes,
    20
  );

  const candidates = generateCandidates(
    athlete,
    {}
  );

  const thresholdCandidates = candidates.filter(
    c =>
      c.formKey !== 'OnOff2min'
  );

  for (const candidate of thresholdCandidates) {
    assert.ok(
      candidate.thresholdDoseMinutes <= 20.01,
      `${candidate.label} exceeded novice cap: ${candidate.thresholdDoseMinutes}`
    );
  }
}

function testRotationDelaysImmediateProgression() {
  const immediate = generateCandidates(
    baseAthlete({
      recentWorkouts: [
        {
          daysAgo: 7,
          workout: '10x1000 @3:14 / 60s',
        },
      ],
    }),
    {}
  );

  const elevenImmediate = immediate.find(
    c => c.label === '11×1000m Threshold'
  );

  const freshForm = immediate.find(
    c => c.formKey === 'Threshold8min'
  );

  assert.ok(elevenImmediate);
  assert.ok(freshForm);

  assert.ok(
    elevenImmediate.fit.rotationFit <
      freshForm.fit.rotationFit
  );

  assert.match(
    elevenImmediate.progressionReason,
    /Progression delayed by threshold rotation/
  );
}

function testRotationUnlocksProgressionAfterOtherForms() {
  const before = generateCandidates(
    baseAthlete({
      recentWorkouts: [
        {
          daysAgo: 7,
          workout: '10x1000 @3:14 / 60s',
        },
      ],
    }),
    {}
  );

  const after = generateCandidates(
    baseAthlete({
      recentWorkouts: [
        {
          daysAgo: 14,
          workout: '10x1000 @3:14 / 60s',
        },
        {
          daysAgo: 7,
          workout: '3x10min Threshold / 2min jog',
        },
        {
          daysAgo: 3,
          workout: '4x8min Threshold / 90s jog',
        },
      ],
    }),
    {}
  );

  const elevenBefore = before.find(
    c => c.label === '11×1000m Threshold'
  );

  const elevenAfter = after.find(
    c => c.label === '11×1000m Threshold'
  );

  assert.ok(
    elevenAfter.fit.rotationFit >
      elevenBefore.fit.rotationFit
  );

  assert.ok(
    elevenAfter.fit.progressionFit >
      elevenBefore.fit.progressionFit
  );

  assert.match(
    elevenAfter.progressionReason,
    /Rotation is ready for progression/
  );
}

function testTwelveRequiresPriorElevenForCleanProgression() {
  const candidates = generateCandidates(
    baseAthlete({
      recentWorkouts: [
        {
          daysAgo: 16,
          workout: '11x1000 @3:14 / 60s',
        },
        {
          daysAgo: 9,
          workout: '3x10min Threshold / 2min jog',
        },
        {
          daysAgo: 4,
          workout: '4x8min Threshold / 90s jog',
        },
      ],
    }),
    {}
  );

  const twelve = candidates.find(
    c => c.label === '12×1000m Threshold'
  );

  assert.ok(twelve);

  assert.match(
    twelve.progressionReason,
    /Safe volume progression/
  );

  assert.match(
    twelve.progressionReason,
    /Rotation is ready for progression/
  );
}

function testHistoryStillTimeWeighted() {
  const recent = generateCandidates(
    baseAthlete({
      recentWorkouts: [
        {
          daysAgo: 2,
          workout: '3x10min Threshold / 2min jog',
        },
      ],
    }),
    {}
  );

  const old = generateCandidates(
    baseAthlete({
      recentWorkouts: [
        {
          daysAgo: 35,
          workout: '3x10min Threshold / 2min jog',
        },
      ],
    }),
    {}
  );

  const recentThree = recent.find(
    c => c.label === '3×10min Threshold'
  );

  const oldThree = old.find(
    c => c.label === '3×10min Threshold'
  );

  assert.ok(
    recentThree.score <
      oldThree.score
  );
}


function testShortHistoryPrefersLongStructuralRotation() {
  const candidates = generateCandidates(
    baseAthlete({
      recentWorkouts: [
        {
          daysAgo: 14,
          workout: '10x1000 @3:14 / 60s',
        },
        {
          daysAgo: 7,
          workout: '12x800 @2:36 / 60s',
        },
        {
          daysAgo: 3,
          workout: '10x1000 @3:14 / 60s',
        },
      ],
    }),
    {}
  );

  const fourByEight = candidates.find(
    c => c.label === '4×8min Threshold'
  );
  const threeByTen = candidates.find(
    c => c.label === '3×10min Threshold'
  );
  const fiveByTwoK = candidates.find(
    c => c.label === '5×2000m Threshold'
  );
  const elevenByOneK = candidates.find(
    c => c.label === '11×1000m Threshold'
  );

  assert.ok(fourByEight);
  assert.ok(threeByTen);
  assert.ok(fiveByTwoK);
  assert.ok(elevenByOneK);

  assert.ok(
    fourByEight.score > threeByTen.score,
    `Expected 4x8 (${fourByEight.score}) above 3x10 (${threeByTen.score})`
  );
  assert.ok(
    threeByTen.score > fiveByTwoK.score,
    `Expected 3x10 (${threeByTen.score}) above 5x2000 (${fiveByTwoK.score})`
  );
  assert.ok(
    fiveByTwoK.score > elevenByOneK.score,
    `Expected long alternative 5x2000 (${fiveByTwoK.score}) above 11x1000 (${elevenByOneK.score})`
  );
  assert.equal(
    fourByEight.targetStructure,
    'Long'
  );
}

function testUsedFourByEightRotatesToOtherLongForms() {
  const candidates = generateCandidates(
    baseAthlete({
      recentWorkouts: [
        {
          daysAgo: 21,
          workout: '10x1000 @3:14 / 60s',
        },
        {
          daysAgo: 14,
          workout: '12x800 @2:36 / 60s',
        },
        {
          daysAgo: 7,
          workout: '10x1000 @3:14 / 60s',
        },
        {
          daysAgo: 3,
          workout: '4x8min Threshold / 90s jog',
        },
      ],
    }),
    {}
  );

  const fourByEight = candidates.find(
    c => c.label === '4×8min Threshold'
  );
  const threeByTen = candidates.find(
    c => c.label === '3×10min Threshold'
  );
  const fiveByTwoK = candidates.find(
    c => c.label === '5×2000m Threshold'
  );

  assert.ok(
    threeByTen.score > fourByEight.score,
    `Expected 3x10 (${threeByTen.score}) above recently used 4x8 (${fourByEight.score})`
  );
  assert.ok(
    fiveByTwoK.score > fourByEight.score,
    `Expected 5x2000 (${fiveByTwoK.score}) above recently used 4x8 (${fourByEight.score})`
  );
}

function testLongHistoryPrefersShortStructureProgression() {
  const candidates = generateCandidates(
    baseAthlete({
      recentWorkouts: [
        {
          daysAgo: 14,
          workout: '10x1000 @3:14 / 60s',
        },
        {
          daysAgo: 7,
          workout: '3x10min Threshold / 2min jog',
        },
        {
          daysAgo: 3,
          workout: '4x8min Threshold / 90s jog',
        },
      ],
    }),
    {}
  );

  assert.equal(
    candidates[0].label,
    '11×1000m Threshold'
  );
  assert.equal(
    candidates[0].targetStructure,
    'Short'
  );
}


function feedbackAthlete(feedback, overrides = {}) {
  return baseAthlete({
    current5k: '18:30',
    recentWorkouts: [
      {
        daysAgo: 7,
        workout: '7x1000 @4:00 / 60s',
        feedback,
      },
    ],
    ...overrides,
  });
}

function testComfortableAllowsProgression() {
  const comfortable = generateCandidates(
    feedbackAthlete('Comfortable'),
    {}
  );

  const doable = generateCandidates(
    feedbackAthlete('Doable'),
    {}
  );

  const comfortableEight = comfortable.find(
    c => c.label === '8×1000m Threshold'
  );

  const doableEight = doable.find(
    c => c.label === '8×1000m Threshold'
  );

  assert.ok(comfortableEight);
  assert.ok(doableEight);
  assert.equal(
    comfortableEight.progressionPermission,
    'Progress'
  );
  assert.equal(
    comfortableEight.progressionDirection,
    'progress'
  );
  assert.ok(
    comfortableEight.fit.progressionFit >
      doableEight.fit.progressionFit
  );
}

function testDoableAllowsCautiousProgression() {
  const doable = generateCandidates(
    feedbackAthlete('Doable'),
    {}
  );

  const comfortable = generateCandidates(
    feedbackAthlete('Comfortable'),
    {}
  );

  const littleHard = generateCandidates(
    feedbackAthlete('A little hard'),
    {}
  );

  const doableEight = doable.find(
    c => c.label === '8×1000m Threshold'
  );
  const comfortableEight = comfortable.find(
    c => c.label === '8×1000m Threshold'
  );
  const hardEight = littleHard.find(
    c => c.label === '8×1000m Threshold'
  );

  assert.equal(
    doableEight.progressionPermission,
    'Progress cautiously'
  );
  assert.ok(
    doableEight.fit.progressionFit <
      comfortableEight.fit.progressionFit
  );
  assert.ok(
    doableEight.fit.progressionFit >
      hardEight.fit.progressionFit
  );
}

function testLittleHardEasesPaceBeforeCuttingTime() {
  const athlete =
    feedbackAthlete('A little hard');

  const range =
    resolveThresholdDoseRange(athlete);

  const intensity =
    resolveThresholdIntensity(athlete);

  assert.equal(range.minMinutes, 26);
  assert.equal(range.maxMinutes, 34);
  assert.equal(
    range.sessionResponseAdjustmentMinutes,
    0
  );
  assert.equal(
    intensity.adjustmentSecondsPerKm,
    3
  );

  const candidates = generateCandidates(
    athlete,
    {}
  );

  const seven = candidates.find(
    c => c.label === '7×1000m Threshold'
  );
  const eight = candidates.find(
    c => c.label === '8×1000m Threshold'
  );

  assert.ok(seven);
  assert.ok(eight);
  assert.equal(
    seven.progressionPermission,
    'Hold'
  );
  assert.equal(
    seven.progressionDirection,
    'regress'
  );
  assert.equal(
    seven.intensityAdaptation,
    true
  );
  assert.ok(
    seven.thresholdPaceSecondsPerKm > 240
  );
  assert.ok(
    seven.score > eight.score,
    'A little hard should prefer easing the same session pace before adding an eighth rep.'
  );
}

function testSingleTooMuchKeepsDoseAndEasesPaceFirst() {
  const athlete =
    feedbackAthlete('Too much');

  const range =
    resolveThresholdDoseRange(athlete);

  const intensity =
    resolveThresholdIntensity(athlete);

  assert.equal(range.minMinutes, 26);
  assert.equal(range.maxMinutes, 34);
  assert.equal(
    range.sessionResponseFeedback,
    'Too much'
  );
  assert.equal(
    range.sessionResponseAdjustmentMinutes,
    0
  );
  assert.equal(
    range.repeatedTooMuch,
    false
  );
  assert.equal(
    intensity.adjustmentSecondsPerKm,
    6
  );
  assert.equal(
    intensity.repeatedTooMuch,
    false
  );

  const candidates = generateCandidates(
    athlete,
    {}
  );

  const seven = candidates.find(
    c => c.label === '7×1000m Threshold'
  );

  assert.ok(seven);
  assert.equal(
    candidates.some(
      c => c.label === '6×1000m Threshold'
    ),
    false,
    'A single Too much response should not immediately cut threshold time to six reps.'
  );
  assert.equal(
    seven.intensityAdaptation,
    true
  );
  assert.equal(
    seven.progressionPermission,
    'Regress'
  );
  assert.ok(
    seven.thresholdPaceSecondsPerKm >= 245
  );
  assert.ok(
    seven.thresholdDoseMinutes >=
      range.minMinutes
  );
  assert.equal(
    candidates[0].label,
    '7×1000m Threshold'
  );
  assert.match(
    seven.thresholdIntensityReason,
    /before cutting threshold time/
  );
}

function testTooEasyRaisesPaceBeforeAddingTime() {
  const athlete =
    feedbackAthlete('Too easy');

  const range =
    resolveThresholdDoseRange(athlete);

  const intensity =
    resolveThresholdIntensity(athlete);

  assert.equal(range.minMinutes, 26);
  assert.equal(range.maxMinutes, 34);
  assert.equal(
    range.sessionResponseAdjustmentMinutes,
    0
  );
  assert.equal(
    intensity.adjustmentSecondsPerKm,
    -3
  );

  const candidates = generateCandidates(
    athlete,
    {}
  );

  const seven = candidates.find(
    c => c.label === '7×1000m Threshold'
  );
  const eight = candidates.find(
    c => c.label === '8×1000m Threshold'
  );

  assert.ok(seven);
  assert.ok(eight);
  assert.equal(
    seven.intensityAdaptation,
    true
  );
  assert.ok(
    seven.thresholdPaceSecondsPerKm < 240
  );
  assert.ok(
    seven.score > eight.score,
    'Too easy should first test a slightly faster threshold pace before adding more threshold time.'
  );
  assert.equal(
    candidates.some(
      c => c.label === '9×1000m Threshold'
    ),
    false
  );
}

function testRepeatedTooMuchMayReduceDose() {
  const athlete = feedbackAthlete(
    'Too much',
    {
      recentWorkouts: [
        {
          daysAgo: 3,
          workout: '7x1000 @4:00 / 60s',
          feedback: 'Too much',
        },
        {
          daysAgo: 10,
          workout: '7x1000 @4:00 / 60s',
          feedback: 'Too much',
        },
      ],
    }
  );

  const range =
    resolveThresholdDoseRange(athlete);

  const intensity =
    resolveThresholdIntensity(athlete);

  assert.equal(range.minMinutes, 22);
  assert.equal(range.maxMinutes, 30);
  assert.equal(
    range.sessionResponseAdjustmentMinutes,
    -4
  );
  assert.equal(range.repeatedTooMuch, true);
  assert.equal(
    intensity.adjustmentSecondsPerKm,
    8
  );
  assert.equal(
    intensity.repeatedTooMuch,
    true
  );

  const candidates = generateCandidates(
    athlete,
    {}
  );

  assert.ok(
    candidates.some(
      c => c.label === '6×1000m Threshold'
    ),
    'Repeated Too much may open a lower-dose option.'
  );
}

function testLowReadinessCanStillReduceDose() {
  const athlete = feedbackAthlete(
    'Too much',
    { readiness: 50 }
  );

  const range =
    resolveThresholdDoseRange(athlete);

  assert.equal(range.minMinutes, 22);
  assert.equal(range.maxMinutes, 30);
  assert.equal(
    range.sessionResponseAdjustmentMinutes,
    0
  );
}

function testNoviceCapStillWinsOverTooEasyFeedback() {
  const athlete = baseAthlete({
    current5k: '27:00',
    tolerance: 'low',
    readiness: 80,
    recentWorkouts: [
      {
        daysAgo: 5,
        workout: '3x1000 @5:50 / 60s',
        feedback: 'Too easy',
      },
    ],
  });

  const range =
    resolveThresholdDoseRange(athlete);

  assert.equal(
    range.hardMaxMinutes,
    20
  );
  assert.ok(range.maxMinutes <= 20);

  const candidates = generateCandidates(
    athlete,
    {}
  );

  for (const candidate of candidates) {
    if (candidate.formKey === 'OnOff2min') {
      continue;
    }

    assert.ok(
      candidate.thresholdDoseMinutes <= 20.01,
      `${candidate.label} exceeded novice cap after Too easy feedback.`
    );
  }
}


function establishedPaceAthlete() {
  return baseAthlete({
    current5k: '18:30',
    recentWorkouts: [
      {
        daysAgo: 7,
        workout: '7x1000 @4:00 / 60s',
        feedback: 'A little hard',
      },
      {
        daysAgo: 3,
        workout: '7x1000 @4:03 / 60s',
        feedback: 'Comfortable',
      },
    ],
  });
}

function testEstablishedPaceMemoryKeepsSuccessfulAdjustment() {
  const athlete =
    establishedPaceAthlete();

  const intensity =
    resolveThresholdIntensity(athlete);

  assert.equal(
    intensity.establishedPaceSecondsPerKm,
    243
  );
  assert.equal(
    intensity.latestSessionPaceSecondsPerKm,
    243
  );
  assert.equal(
    intensity.targetPaceSecondsPerKm,
    243
  );
  assert.equal(
    intensity.adjustmentSecondsPerKm,
    0
  );
  assert.equal(
    intensity.feedback,
    'Comfortable'
  );
}

function testLatestMatchingFeedbackOverridesOlderHardResponse() {
  const candidates = generateCandidates(
    establishedPaceAthlete(),
    {}
  );

  const seven = candidates.find(
    c => c.label === '7×1000m Threshold'
  );

  const eight = candidates.find(
    c => c.label === '8×1000m Threshold'
  );

  assert.ok(seven);
  assert.ok(eight);

  assert.equal(
    eight.sessionResponseFeedback,
    'Comfortable'
  );
  assert.equal(
    eight.progressionPermission,
    'Progress'
  );
  assert.equal(
    eight.sessionResponseReferenceDaysAgo,
    3
  );
  assert.equal(
    eight.thresholdPaceSecondsPerKm,
    243
  );
  assert.equal(
    seven.thresholdPaceSecondsPerKm,
    243
  );
  assert.ok(
    eight.score > seven.score,
    'After the adjusted 4:03/km pace becomes comfortable, 8x1000 should be the preferred 1000m-family progression while pace stays fixed.'
  );
}

function testSingleAxisProgressionAvoidsFasterAndLongerTogether() {
  const candidates = generateCandidates(
    feedbackAthlete('Too easy'),
    {}
  );

  const seven = candidates.find(
    c => c.label === '7×1000m Threshold'
  );

  const eight = candidates.find(
    c => c.label === '8×1000m Threshold'
  );

  assert.ok(seven);
  assert.ok(eight);

  assert.equal(
    seven.intensityAdaptation,
    true
  );
  assert.equal(
    seven.singleAxisConflict,
    false
  );
  assert.equal(
    eight.singleAxisConflict,
    true
  );
  assert.equal(
    seven.thresholdPaceSecondsPerKm,
    237
  );
  assert.equal(
    eight.thresholdPaceSecondsPerKm,
    237
  );
  assert.ok(
    seven.fit.sessionResponseFit >
      eight.fit.sessionResponseFit
  );
  assert.ok(
    seven.score > eight.score,
    'Too easy should test the faster pace at the established dose before adding an eighth rep.'
  );
}

function testThresholdMemoryIgnoresUnrelatedSpeedFeedback() {
  const athlete = baseAthlete({
    current5k: '18:30',
    recentWorkouts: [
      {
        daysAgo: 10,
        workout: '7x1000 @4:03 / 60s',
        feedback: 'Comfortable',
      },
      {
        daysAgo: 2,
        workout: '8x200 @34 / 60s',
        feedback: 'Too much',
      },
    ],
  });

  const intensity =
    resolveThresholdIntensity(athlete);

  assert.equal(
    intensity.establishedPaceSecondsPerKm,
    243
  );
  assert.equal(
    intensity.targetPaceSecondsPerKm,
    243
  );
  assert.equal(
    intensity.feedback,
    'Comfortable'
  );
}

function run() {
  assert.equal(
    ENGINE_VERSION,
    '0.1.7-lab'
  );

  testParser();
  testDurationParser();
  testClassifier();
  testCompetitive5kBaseStartsAtTenBy1k();
  testCompetitive5kLoadingAllowsTenToTwelve();
  testNoviceThresholdCapTwentyMinutes();
  testRotationDelaysImmediateProgression();
  testRotationUnlocksProgressionAfterOtherForms();
  testTwelveRequiresPriorElevenForCleanProgression();
  testHistoryStillTimeWeighted();
  testShortHistoryPrefersLongStructuralRotation();
  testUsedFourByEightRotatesToOtherLongForms();
  testLongHistoryPrefersShortStructureProgression();
  testComfortableAllowsProgression();
  testDoableAllowsCautiousProgression();
  testLittleHardEasesPaceBeforeCuttingTime();
  testSingleTooMuchKeepsDoseAndEasesPaceFirst();
  testTooEasyRaisesPaceBeforeAddingTime();
  testRepeatedTooMuchMayReduceDose();
  testLowReadinessCanStillReduceDose();
  testNoviceCapStillWinsOverTooEasyFeedback();
  testEstablishedPaceMemoryKeepsSuccessfulAdjustment();
  testLatestMatchingFeedbackOverridesOlderHardResponse();
  testSingleAxisProgressionAvoidsFasterAndLongerTogether();
  testThresholdMemoryIgnoresUnrelatedSpeedFeedback();

  console.log(
    '✅ All TATE Lab v0.1.7 tests passed'
  );
}

run();
