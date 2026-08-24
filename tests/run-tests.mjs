import assert from 'node:assert/strict';

import {
  parseWorkoutText,
  classifyWorkout,
  generateCandidates,
  ENGINE_VERSION,
} from '../src/tate-engine/index.js';

function testParser() {
  const parsed =
    parseWorkoutText(
      '6x1000m in 3:00, 2min rest + 5min jog between blocks + 5x200m in 36s, 30sec rest'
    );

  assert.equal(
    parsed.blocks.length,
    3
  );

  const first =
    parsed.blocks[0];

  const inter =
    parsed.blocks[1];

  const second =
    parsed.blocks[2];

  assert.equal(
    first.kind,
    'work'
  );

  assert.equal(
    first.reps,
    6
  );

  assert.equal(
    first.distanceMeters,
    1000
  );

  assert.equal(
    first.targetSecondsPerRep,
    180
  );

  assert.equal(
    first.recoverySeconds,
    120
  );

  assert.equal(
    inter.kind,
    'inter_block_rest'
  );

  assert.equal(
    inter.durationSeconds,
    300
  );

  assert.equal(
    inter.type,
    'jog'
  );

  assert.equal(
    second.kind,
    'work'
  );

  assert.equal(
    second.reps,
    5
  );

  assert.equal(
    second.distanceMeters,
    200
  );

  assert.equal(
    second.targetSecondsPerRep,
    36
  );

  assert.equal(
    second.recoverySeconds,
    30
  );
}

function testParserCoachShorthand() {
  const variants = [
    '5x1000 @3:03 / 60s',
    '5×1000m @ 3:03, 60sec rest',
    '5x1km @3:03 / 1min',
  ];

  for (
    const text
    of variants
  ) {
    const parsed =
      parseWorkoutText(text);

    assert.equal(
      parsed.blocks.length,
      1,
      text
    );

    const block =
      parsed.blocks[0];

    assert.equal(
      block.reps,
      5,
      text
    );

    assert.equal(
      block.distanceMeters,
      1000,
      text
    );

    assert.equal(
      block.targetSecondsPerRep,
      183,
      text
    );

    assert.equal(
      block.recoverySeconds,
      60,
      text
    );
  }
}

function testClassifier() {
  const parsed =
    parseWorkoutText(
      '5x1000m in 3:00, 60sec rest'
    );

  const athlete = {
    goalEvent: '5K',
    phase: 'Loading',
    current5k: '15:00',
    tolerance: 'established',
    primaryNeed: 'Threshold',
    readiness: 82,
    recentWorkout: '',
  };

  const classified =
    classifyWorkout(
      parsed,
      athlete
    );

  assert.ok(
    classified.length > 0
  );

  assert.equal(
    classified[0].kind,
    'work'
  );

  assert.ok(
    classified[0].primary
  );
}

function testGenerator() {
  const athlete = {
    goalEvent: '5K',
    phase: 'Loading',
    current5k: '15:00',
    tolerance: 'established',
    primaryNeed: 'Threshold',
    readiness: 82,

    recentWorkout:
      '5x1000 @3:03 / 60s',
  };

  const candidates =
    generateCandidates(
      athlete,
      {}
    );

  assert.ok(
    Array.isArray(candidates)
  );

  assert.ok(
    candidates.length > 0
  );

  for (
    const candidate
    of candidates
  ) {
    assert.ok(
      candidate.score >= 0
    );

    assert.ok(
      candidate.score <= 100
    );

    assert.ok(
      candidate.label
    );

    assert.ok(
      candidate.family
    );
  }

  for (
    let i = 1;
    i < candidates.length;
    i++
  ) {
    assert.ok(
      candidates[i - 1]
        .score >=
        candidates[i]
          .score,
      'Candidates must be sorted highest score first'
    );
  }
}

function testStructuralSimilarityAcrossNotation() {
  const base = {
    goalEvent: '5K',
    phase: 'Loading',
    current5k: '15:00',
    tolerance: 'established',
    primaryNeed: 'Threshold',
    readiness: 82,
  };

  const a =
    generateCandidates(
      {
        ...base,

        recentWorkout:
          '5x1000 @3:14 / 60s',
      },

      {}
    );

  const b =
    generateCandidates(
      {
        ...base,

        recentWorkout:
          '5×1000m @3:14, 60sec rest',
      },

      {}
    );

  assert.deepEqual(
    a.map(
      c => [
        c.label,
        c.score,
      ]
    ),

    b.map(
      c => [
        c.label,
        c.score,
      ]
    )
  );

  const fiveBy1k =
    a.find(
      c =>
        c.label ===
        '5×1000m Threshold'
    );

  assert.ok(
    fiveBy1k.fit
      .workoutSimilarity >=
      0.99
  );
}

function testProgressionFromShorthand() {
  const athlete = {
    goalEvent: '5K',
    phase: 'Loading',
    current5k: '15:00',
    tolerance: 'established',
    primaryNeed: 'Threshold',
    readiness: 82,

    recentWorkout:
      '5x1000 @3:14 / 60s',
  };

  const candidates =
    generateCandidates(
      athlete,
      {}
    );

  const sixBy1k =
    candidates.find(
      c =>
        c.label ===
        '6×1000m Threshold'
    );

  assert.equal(
    sixBy1k.progressionReason,
    'Safe volume progression.'
  );

  assert.equal(
    sixBy1k.fit
      .progressionFit,
    1
  );
}

function run() {
  assert.equal(
    ENGINE_VERSION,
    '0.1.1-lab'
  );

  testParser();

  testParserCoachShorthand();

  testClassifier();

  testGenerator();

  testStructuralSimilarityAcrossNotation();

  testProgressionFromShorthand();

  console.log(
    '✅ All TATE Lab v0.1.1 tests passed'
  );
}

run();
