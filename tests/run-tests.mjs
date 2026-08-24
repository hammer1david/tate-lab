import assert from 'node:assert/strict';

import {
  parseWorkoutText,
  classifyWorkout,
  generateCandidates,
  resolveThresholdDoseRange,
  resolveThresholdIntensity,
  resolveVo2DoseRange,
  resolveVo2Intensity,
  ENGINE_VERSION,
} from '../src/tate-engine/index.js';

function baseAthlete(overrides = {}) {
  return {
    goalEvent: '5K',
    phase: 'Loading',
    current5k: '15:00',
    trainingExperience: 'experienced',
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
    trainingExperience: 'beginner',
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
    trainingExperience: 'beginner',
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


function testBeginnerExperienceOwnsTwentyMinuteCap() {
  const athlete = baseAthlete({
    current5k: '20:00',
    trainingExperience: 'beginner',
    tolerance: 'established',
    readiness: 82,
    recentWorkouts: [],
  });

  const range = resolveThresholdDoseRange(athlete);

  assert.equal(range.trainingExperience, 'beginner');
  assert.equal(range.hardMaxMinutes, 20);
  assert.equal(range.maxMinutes, 20);
  assert.equal(range.minMinutes, 20);

  const candidates = generateCandidates(athlete, {});

  for (const candidate of candidates) {
    if (candidate.formKey === 'OnOff2min') continue;
    assert.ok(
      candidate.thresholdDoseMinutes <= 20.01,
      `${candidate.label} exceeded beginner hard cap.`
    );
  }
}

function testExperiencedLowToleranceIsNotAutomaticallyBeginner() {
  const athlete = baseAthlete({
    current5k: '20:00',
    trainingExperience: 'experienced',
    tolerance: 'low',
    readiness: 82,
    recentWorkouts: [],
  });

  const range = resolveThresholdDoseRange(athlete);

  assert.equal(range.trainingExperience, 'experienced');
  assert.equal(range.hardMaxMinutes, 40);
  assert.equal(range.minMinutes, 24);
  assert.equal(range.maxMinutes, 32);
}

function testIntermediateExperienceHasSeparateSafetyCeiling() {
  const athlete = baseAthlete({
    current5k: '15:00',
    trainingExperience: 'intermediate',
    tolerance: 'established',
    readiness: 82,
    recentWorkouts: [],
  });

  const range = resolveThresholdDoseRange(athlete);

  assert.equal(range.trainingExperience, 'intermediate');
  assert.equal(range.hardMaxMinutes, 36);
  assert.equal(range.minMinutes, 32);
  assert.equal(range.maxMinutes, 36);
}

function testLegacyLowToleranceStillDefaultsToBeginner() {
  const athlete = {
    goalEvent: '5K',
    phase: 'Loading',
    current5k: '27:00',
    tolerance: 'low',
    primaryNeed: 'Threshold',
    readiness: 80,
    recentWorkouts: [],
  };

  const range = resolveThresholdDoseRange(athlete);

  assert.equal(range.trainingExperience, 'beginner');
  assert.equal(range.hardMaxMinutes, 20);
}

function testNormalDoseMaxIsStronglyRespected() {
  const athlete = baseAthlete({
    current5k: '22:00',
    trainingExperience: 'experienced',
    tolerance: 'established',
    readiness: 82,
    recentWorkouts: [],
  });

  const range = resolveThresholdDoseRange(athlete);
  assert.equal(range.minMinutes, 20);
  assert.equal(range.maxMinutes, 28);

  const candidates = generateCandidates(athlete, {});
  const five = candidates.find(
    c => c.label === '5×1000m Threshold'
  );
  const threeByTen = candidates.find(
    c => c.label === '3×10min Threshold'
  );
  const fourByEight = candidates.find(
    c => c.label === '4×8min Threshold'
  );

  assert.ok(five);
  assert.ok(threeByTen);
  assert.ok(fourByEight);
  assert.equal(five.fit.doseFit, 1);
  assert.ok(
    threeByTen.fit.doseFit <= 0.61,
    `30min should be meaningfully penalized above a 28min max; got ${threeByTen.fit.doseFit}`
  );
  assert.ok(
    fourByEight.fit.doseFit <= 0.21,
    `32min should be strongly penalized above a 28min max; got ${fourByEight.fit.doseFit}`
  );
  assert.ok(five.score > fourByEight.score);
}

function testBeginnerProgressionIsMoreConservative() {
  const shared = {
    current5k: '27:00',
    tolerance: 'established',
    readiness: 82,
    recentWorkouts: [
      {
        daysAgo: 7,
        workout: '1x1600 @9:20 / 90s',
        feedback: 'Comfortable',
      },
    ],
  };

  const beginner = generateCandidates(
    baseAthlete({
      ...shared,
      trainingExperience: 'beginner',
    }),
    {}
  );

  const experienced = generateCandidates(
    baseAthlete({
      ...shared,
      trainingExperience: 'experienced',
    }),
    {}
  );

  const beginnerTwo = beginner.find(
    c => c.label === '2×1600m Threshold'
  );
  const experiencedTwo = experienced.find(
    c => c.label === '2×1600m Threshold'
  );

  assert.ok(beginnerTwo);
  assert.ok(experiencedTwo);
  assert.equal(
    beginnerTwo.experienceProgressionMultiplier,
    0.82
  );
  assert.equal(
    experiencedTwo.experienceProgressionMultiplier,
    1
  );
  assert.ok(
    beginnerTwo.fit.progressionFit <
      experiencedTwo.fit.progressionFit
  );
}


function vo2Athlete(overrides = {}) {
  return baseAthlete({
    primaryNeed: 'VO2max',
    ...overrides,
  });
}

function testVo2GeneratedWorkClassifiesAsVo2max() {
  const profiles = [
    vo2Athlete({
      current5k: '15:00',
      trainingExperience: 'experienced',
      tolerance: 'established',
    }),
    vo2Athlete({
      current5k: '20:00',
      trainingExperience: 'intermediate',
      tolerance: 'established',
    }),
    vo2Athlete({
      current5k: '27:00',
      trainingExperience: 'beginner',
      tolerance: 'low',
    }),
  ];

  for (const athlete of profiles) {
    const candidates = generateCandidates(
      athlete,
      {}
    );

    assert.ok(candidates.length > 0);

    for (const candidate of candidates) {
      const classified = classifyWorkout(
        {
          blocks: candidate.blocks,
          warnings: [],
          raw: candidate.label,
        },
        athlete
      ).filter(
        block => block.kind === 'work'
      );

      assert.ok(classified.length > 0);
      assert.equal(
        classified[0].primary,
        'VO2max',
        `${candidate.label} classified as ${classified[0].primary}`
      );
    }
  }
}

function testVo2BeginnerDoseAndRepDurationGuardrails() {
  const athlete = vo2Athlete({
    current5k: '27:00',
    trainingExperience: 'beginner',
    tolerance: 'low',
    phase: 'Loading',
    readiness: 82,
    recentWorkouts: [],
  });

  const range = resolveVo2DoseRange(
    athlete
  );

  assert.equal(range.trainingExperience, 'beginner');
  assert.equal(range.hardMaxMinutes, 14);
  assert.equal(range.minMinutes, 6);
  assert.equal(range.maxMinutes, 10);

  const candidates = generateCandidates(
    athlete,
    {}
  );

  assert.ok(candidates.length > 0);

  for (const candidate of candidates) {
    assert.ok(
      candidate.vo2DoseMinutes <= 14.01,
      `${candidate.label} exceeded VO2 beginner hard cap`
    );

    assert.ok(
      candidate.vo2RepDurationSeconds <= 300.01,
      `${candidate.label} used a beginner VO2 rep longer than 5min`
    );
  }

  assert.equal(
    candidates.some(
      candidate =>
        candidate.formKey === 'VO21000' ||
        candidate.formKey === 'VO21200'
    ),
    false
  );

  assert.ok(
    ['VO2400', 'VO2600', 'VO2800']
      .includes(candidates[0].formKey)
  );
}

function testVo2PhaseChangesDoseAndStructure() {
  const shared = {
    current5k: '15:00',
    trainingExperience: 'experienced',
    tolerance: 'established',
    readiness: 82,
    recentWorkouts: [],
  };

  const base = vo2Athlete({
    ...shared,
    phase: 'Base',
  });
  const loading = vo2Athlete({
    ...shared,
    phase: 'Loading',
  });
  const sharpening = vo2Athlete({
    ...shared,
    phase: 'Sharpening',
  });
  const taper = vo2Athlete({
    ...shared,
    phase: 'Taper',
  });

  assert.deepEqual(
    [
      resolveVo2DoseRange(base).minMinutes,
      resolveVo2DoseRange(base).maxMinutes,
    ],
    [12, 16]
  );

  assert.deepEqual(
    [
      resolveVo2DoseRange(loading).minMinutes,
      resolveVo2DoseRange(loading).maxMinutes,
    ],
    [15, 20]
  );

  assert.deepEqual(
    [
      resolveVo2DoseRange(taper).minMinutes,
      resolveVo2DoseRange(taper).maxMinutes,
    ],
    [8, 12]
  );

  const baseTop = generateCandidates(
    base,
    {}
  )[0];
  const sharpeningTop = generateCandidates(
    sharpening,
    {}
  )[0];
  const taperTop = generateCandidates(
    taper,
    {}
  )[0];

  assert.ok(
    baseTop.blocks[0].distanceMeters >= 800,
    `Base should favor controlled longer VO2 reps; got ${baseTop.label}`
  );

  assert.ok(
    sharpeningTop.blocks[0].distanceMeters <= 600,
    `Sharpening should favor shorter VO2 reps; got ${sharpeningTop.label}`
  );

  assert.ok(
    taperTop.blocks[0].distanceMeters <= 600,
    `Taper should favor shorter VO2 reps; got ${taperTop.label}`
  );

  assert.ok(
    taperTop.vo2DoseMinutes <= 12.01
  );
}

function testVo2LittleHardEasesPaceBeforeAddingDose() {
  const athlete = vo2Athlete({
    current5k: '15:00',
    trainingExperience: 'experienced',
    tolerance: 'established',
    phase: 'Loading',
    recentWorkouts: [
      {
        daysAgo: 7,
        workout: '5x1000 @2:55 / 120s',
        feedback: 'A little hard',
      },
    ],
  });

  const range = resolveVo2DoseRange(athlete);
  const intensity = resolveVo2Intensity(
    athlete,
    1000
  );

  assert.equal(range.minMinutes, 15);
  assert.equal(range.maxMinutes, 20);
  assert.equal(
    range.sessionResponseAdjustmentMinutes,
    0
  );
  assert.equal(
    intensity.responseAdjustmentSecondsPerKm,
    3
  );
  assert.equal(
    Math.round(intensity.targetPaceSecondsPerKm),
    178
  );

  const candidates = generateCandidates(
    athlete,
    {}
  );

  const five = candidates.find(
    candidate =>
      candidate.label === '5×1000m VO2max'
  );
  const six = candidates.find(
    candidate =>
      candidate.label === '6×1000m VO2max'
  );

  assert.ok(five);
  assert.ok(six);
  assert.equal(five.intensityAdaptation, true);
  assert.equal(five.progressionPermission, 'Hold');
  assert.equal(six.singleAxisConflict, true);
  assert.ok(five.score > six.score);
}

function testVo2EstablishedPaceMemoryAfterComfortable() {
  const athlete = vo2Athlete({
    current5k: '15:00',
    trainingExperience: 'experienced',
    tolerance: 'established',
    phase: 'Loading',
    recentWorkouts: [
      {
        daysAgo: 14,
        workout: '5x1000 @2:55 / 120s',
        feedback: 'A little hard',
      },
      {
        daysAgo: 5,
        workout: '5x1000 @2:58 / 120s',
        feedback: 'Comfortable',
      },
    ],
  });

  const intensity = resolveVo2Intensity(
    athlete,
    1000
  );

  assert.equal(
    Math.round(intensity.targetPaceSecondsPerKm),
    178
  );
  assert.equal(intensity.feedback, 'Comfortable');

  const candidates = generateCandidates(
    athlete,
    {}
  );

  const six = candidates.find(
    candidate =>
      candidate.label === '6×1000m VO2max'
  );

  assert.ok(six);
  assert.equal(
    Math.round(six.vo2PaceSecondsPerKm),
    178
  );
  assert.equal(six.progressionPermission, 'Progress');
  assert.equal(six.singleAxisConflict, false);
  assert.equal(
    six.sessionResponseReferenceDaysAgo,
    5
  );
}

function testVo2TooEasyUsesPaceFirst() {
  const athlete = vo2Athlete({
    current5k: '15:00',
    trainingExperience: 'experienced',
    tolerance: 'established',
    phase: 'Loading',
    recentWorkouts: [
      {
        daysAgo: 5,
        workout: '5x1000 @2:55 / 120s',
        feedback: 'Too easy',
      },
    ],
  });

  const intensity = resolveVo2Intensity(
    athlete,
    1000
  );

  assert.equal(
    intensity.responseAdjustmentSecondsPerKm,
    -3
  );

  const candidates = generateCandidates(
    athlete,
    {}
  );

  const five = candidates.find(
    candidate =>
      candidate.label === '5×1000m VO2max'
  );
  const six = candidates.find(
    candidate =>
      candidate.label === '6×1000m VO2max'
  );

  assert.ok(five);
  assert.ok(six);
  assert.equal(five.intensityAdaptation, true);
  assert.equal(six.singleAxisConflict, true);
  assert.ok(five.score > six.score);
}

function testVo2RepeatedTooMuchCanReduceDose() {
  const athlete = vo2Athlete({
    current5k: '15:00',
    trainingExperience: 'experienced',
    tolerance: 'established',
    phase: 'Loading',
    recentWorkouts: [
      {
        daysAgo: 10,
        workout: '5x1000 @2:55 / 120s',
        feedback: 'Too much',
      },
      {
        daysAgo: 4,
        workout: '5x1000 @3:00 / 120s',
        feedback: 'Too much',
      },
    ],
  });

  const range = resolveVo2DoseRange(
    athlete
  );
  const intensity = resolveVo2Intensity(
    athlete,
    1000
  );

  assert.equal(range.repeatedTooMuch, true);
  assert.deepEqual(
    [range.minMinutes, range.maxMinutes],
    [12, 17]
  );
  assert.equal(
    intensity.responseAdjustmentSecondsPerKm,
    8
  );
}


function testVo2StructuralRotationWorksBothDirections() {
  const shared = {
    current5k: '15:00',
    trainingExperience: 'experienced',
    tolerance: 'established',
    phase: 'Loading',
    readiness: 82,
  };

  const afterShort = generateCandidates(
    vo2Athlete({
      ...shared,
      recentWorkouts: [
        {
          daysAgo: 10,
          workout: '12x400 @1:08 / 60s',
          feedback: 'Comfortable',
        },
        {
          daysAgo: 4,
          workout: '9x600 @1:43 / 75s',
          feedback: 'Comfortable',
        },
      ],
    }),
    {}
  );

  assert.equal(
    afterShort[0].vo2Structure,
    'Long'
  );

  const afterLong = generateCandidates(
    vo2Athlete({
      ...shared,
      recentWorkouts: [
        {
          daysAgo: 10,
          workout: '5x1000 @2:55 / 120s',
          feedback: 'Comfortable',
        },
        {
          daysAgo: 4,
          workout: '4x1200 @3:32 / 150s',
          feedback: 'Comfortable',
        },
      ],
    }),
    {}
  );

  assert.equal(
    afterLong[0].vo2Structure,
    'Short'
  );
}


function testVo2PaceFirstOverrideBeatsRotation() {
  const athlete = vo2Athlete({
    current5k: '20:00',
    trainingExperience: 'intermediate',
    tolerance: 'established',
    phase: 'Loading',
    recentWorkouts: [
      {
        daysAgo: 7,
        workout: '10x400 @1:31 / 60s',
        feedback: 'A little hard',
      },
    ],
  });

  const candidates = generateCandidates(
    athlete,
    {}
  );

  assert.equal(
    candidates[0].label,
    '10×400m VO2max'
  );
  assert.equal(
    candidates[0].intensityAdaptation,
    true
  );
  assert.equal(
    candidates[0].progressionPermission,
    'Hold'
  );
  assert.equal(
    Math.round(
      candidates[0].vo2PaceSecondsPerKm
    ),
    231
  );
}

function testVo2BeginnerNormalMaxStaysStrongAfterComfortableHistory() {
  const athlete = vo2Athlete({
    current5k: '27:00',
    trainingExperience: 'beginner',
    tolerance: 'low',
    phase: 'Loading',
    readiness: 82,
    recentWorkouts: [
      {
        daysAgo: 18,
        workout: '4x400 @2:02 / 60s',
        feedback: 'Comfortable',
      },
      {
        daysAgo: 11,
        workout: '3x600 @3:04 / 75s',
        feedback: 'Comfortable',
      },
      {
        daysAgo: 4,
        workout: '2x800 @4:09 / 90s',
        feedback: 'Comfortable',
      },
    ],
  });

  const range = resolveVo2DoseRange(
    athlete
  );
  const candidates = generateCandidates(
    athlete,
    {}
  );

  assert.equal(range.maxMinutes, 10);
  assert.ok(candidates.length > 0);

  for (const candidate of candidates) {
    assert.ok(
      candidate.vo2DoseMinutes <= 10.26,
      `${candidate.label} escaped beginner normal max: ${candidate.vo2DoseMinutes}`
    );
  }
}

function testVo2DynamicMinimumRepsSupportsSmallDoseWindows() {
  const taper = vo2Athlete({
    current5k: '27:00',
    trainingExperience: 'beginner',
    tolerance: 'low',
    phase: 'Taper',
    readiness: 82,
    recentWorkouts: [],
  });

  const taperRange = resolveVo2DoseRange(
    taper
  );
  const taperCandidates = generateCandidates(
    taper,
    {}
  );

  assert.deepEqual(
    [taperRange.minMinutes, taperRange.maxMinutes],
    [4, 6]
  );

  assert.ok(
    taperCandidates.some(
      candidate =>
        candidate.formKey === 'VO2400' &&
        candidate.blocks[0].reps <= 3 &&
        candidate.vo2DoseMinutes <= 6.26
    )
  );

  const repeatedTooMuch = vo2Athlete({
    current5k: '27:00',
    trainingExperience: 'beginner',
    tolerance: 'low',
    phase: 'Loading',
    readiness: 82,
    recentWorkouts: [
      {
        daysAgo: 10,
        workout: '4x400 @2:02 / 60s',
        feedback: 'Too much',
      },
      {
        daysAgo: 4,
        workout: '4x400 @2:07 / 60s',
        feedback: 'Too much',
      },
    ],
  });

  const regressRange = resolveVo2DoseRange(
    repeatedTooMuch
  );
  const regressCandidates = generateCandidates(
    repeatedTooMuch,
    {}
  );

  assert.deepEqual(
    [regressRange.minMinutes, regressRange.maxMinutes],
    [4, 7]
  );

  assert.ok(
    regressCandidates.some(
      candidate =>
        candidate.vo2DoseMinutes >= 4 &&
        candidate.vo2DoseMinutes <= 7.26
    )
  );
}

function testVo2DomainCeilingPreventsSpeedEnduranceDrift() {
  const athlete = vo2Athlete({
    current5k: '15:00',
    trainingExperience: 'experienced',
    tolerance: 'established',
    phase: 'Loading',
    recentWorkouts: [
      {
        daysAgo: 14,
        workout: '5x1000 @2:53 / 120s',
        feedback: 'Too easy',
      },
      {
        daysAgo: 5,
        workout: '5x1000 @2:50 / 120s',
        feedback: 'Too easy',
      },
    ],
  });

  const intensity = resolveVo2Intensity(
    athlete,
    1000
  );

  assert.equal(
    intensity.performanceReassessmentNeeded,
    true
  );
  assert.ok(
    intensity.targetPaceSecondsPerKm >=
      intensity.domainMinimumPaceSecondsPerKm - 0.001
  );
  assert.match(
    intensity.reason,
    /reassess current performance/i
  );

  const candidates = generateCandidates(
    athlete,
    {}
  );

  assert.ok(candidates.length > 0);

  for (const candidate of candidates) {
    const classified = classifyWorkout(
      {
        blocks: candidate.blocks,
        warnings: [],
        raw: candidate.label,
      },
      athlete
    ).find(
      block => block.kind === 'work'
    );

    assert.equal(
      classified.primary,
      'VO2max',
      `${candidate.label} drifted into ${classified.primary}`
    );
  }
}

function testVo2SingleTooEasyCapsBeforeReassessment() {
  const athlete = vo2Athlete({
    current5k: '20:00',
    trainingExperience: 'intermediate',
    tolerance: 'established',
    phase: 'Loading',
    recentWorkouts: [
      {
        daysAgo: 5,
        workout: '10x400 @1:31 / 60s',
        feedback: 'Too easy',
      },
    ],
  });

  const intensity = resolveVo2Intensity(
    athlete,
    400
  );

  assert.equal(
    intensity.fasterDomainLimitReached,
    true
  );
  assert.equal(
    intensity.performanceReassessmentNeeded,
    false
  );
  assert.match(
    intensity.reason,
    /do not cross into Speed Endurance/i
  );
}

function run() {
  assert.equal(
    ENGINE_VERSION,
    '0.1.10-lab'
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
  testBeginnerExperienceOwnsTwentyMinuteCap();
  testExperiencedLowToleranceIsNotAutomaticallyBeginner();
  testIntermediateExperienceHasSeparateSafetyCeiling();
  testLegacyLowToleranceStillDefaultsToBeginner();
  testNormalDoseMaxIsStronglyRespected();
  testBeginnerProgressionIsMoreConservative();
  testVo2GeneratedWorkClassifiesAsVo2max();
  testVo2BeginnerDoseAndRepDurationGuardrails();
  testVo2PhaseChangesDoseAndStructure();
  testVo2LittleHardEasesPaceBeforeAddingDose();
  testVo2EstablishedPaceMemoryAfterComfortable();
  testVo2TooEasyUsesPaceFirst();
  testVo2RepeatedTooMuchCanReduceDose();
  testVo2StructuralRotationWorksBothDirections();
  testVo2PaceFirstOverrideBeatsRotation();
  testVo2BeginnerNormalMaxStaysStrongAfterComfortableHistory();
  testVo2DynamicMinimumRepsSupportsSmallDoseWindows();
  testVo2DomainCeilingPreventsSpeedEnduranceDrift();
  testVo2SingleTooEasyCapsBeforeReassessment();

  console.log(
    '✅ All TATE Lab v0.1.10 tests passed'
  );
}

run();
