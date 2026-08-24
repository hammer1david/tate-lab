const SUPABASE_URL = 'https://uhbhsyuodizauwhhdffu.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_o-hfeydDJf5J-xPQyxwVow_DJ3StSNn';

const TABLES = [
  'tate_workout_families',
  'tate_workout_blocks',
  'tate_workout_band_defaults',
  'tate_workout_pace_defaults',
  'tate_workout_steps',
  'tate_workout_step_pace_defaults',
];

function number(value, fallback = null) {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function clampScore(value) {
  return Math.min(100, Math.max(1, number(value, 50)));
}

export function performanceBandForScore(score) {
  const value = clampScore(score);
  if (value <= 30) return 1;
  if (value <= 70) return 2;
  return 3;
}

export function scoreGroupForScore(score) {
  const value = clampScore(score);
  return Math.min(10, Math.max(1, Math.ceil(value / 10)));
}

export function normalizeStimulus(value) {
  const raw = String(value || '').trim();
  const key = raw.toLowerCase().replace(/[\s_-]+/g, '');

  const aliases = {
    vo2max: 'VO2max',
    threshold: 'Threshold',
    '10kspecific': '10K Specific',
    aerobic: 'Aerobic',
    speedendurance: 'Speed Endurance',
    speed: 'Speed',
  };

  return aliases[key] || raw || 'Unknown';
}

export function parseClockToSeconds(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  const text = String(value || '').trim();
  if (!text) return null;

  if (/^\d+(\.\d+)?$/.test(text)) {
    return Number(text);
  }

  const parts = text.split(':').map(Number);

  if (!parts.length || parts.some(part => !Number.isFinite(part))) {
    return null;
  }

  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }

  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }

  return null;
}

export function formatClock(seconds, decimals = 0) {
  if (!Number.isFinite(seconds)) return '—';

  if (seconds < 60) {
    return `${seconds.toFixed(decimals)}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainder = seconds - minutes * 60;
  const fixed = remainder.toFixed(decimals);
  const [whole, fraction] = fixed.split('.');
  const paddedWhole = whole.padStart(2, '0');

  return fraction == null
    ? `${minutes}:${paddedWhole}`
    : `${minutes}:${paddedWhole}.${fraction}`;
}

function paceFrom10k(current10kSeconds, factor) {
  if (!Number.isFinite(current10kSeconds) || !Number.isFinite(factor) || factor <= 0) {
    return null;
  }

  return current10kSeconds / 10 / factor;
}

async function fetchTable(table) {
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/${table}?select=*`,
    {
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Accept: 'application/json',
      },
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${table}: ${response.status} ${text}`);
  }

  return response.json();
}

function rowsForWorkout(rows, workoutId) {
  return rows.filter(row => row.workout_id === workoutId);
}

export async function loadWorkoutLibrary({ event = '10K' } = {}) {
  const [
    families,
    blocks,
    bandDefaults,
    paceDefaults,
    steps,
    stepPaceDefaults,
  ] = await Promise.all(TABLES.map(fetchTable));

  return families
    .filter(family => family.active && family.event === event)
    .map(family => {
      const workoutBlocks = rowsForWorkout(blocks, family.id)
        .filter(block => block.active)
        .sort((a, b) => a.block_number - b.block_number);

      const stimuli = [
        ...new Set(
          workoutBlocks.map(block => normalizeStimulus(block.stimulus))
        ),
      ];

      return {
        ...family,
        stimulus:
          stimuli.length === 1
            ? stimuli[0]
            : stimuli.join(' + '),
        structureType:
          workoutBlocks[0]?.structure_type || 'intervals',
        blocks: workoutBlocks,
        bandDefaults: rowsForWorkout(bandDefaults, family.id),
        paceDefaults: rowsForWorkout(paceDefaults, family.id),
        steps: rowsForWorkout(steps, family.id).filter(
          step => step.active
        ),
        stepPaceDefaults: rowsForWorkout(
          stepPaceDefaults,
          family.id
        ),
      };
    })
    .sort((a, b) => {
      if (a.stimulus !== b.stimulus) {
        return a.stimulus.localeCompare(b.stimulus);
      }

      if (a.role !== b.role) {
        return a.role === 'priority' ? -1 : 1;
      }

      return a.id.localeCompare(b.id);
    });
}

function materializeIntervalWorkout(
  workout,
  band,
  group,
  current10kSeconds
) {
  const defaults = workout.bandDefaults
    .filter(row => Number(row.performance_band) === band)
    .sort((a, b) => a.block_number - b.block_number);

  const blocks = defaults.map(row => {
    const block = workout.blocks.find(
      item => item.block_number === row.block_number
    );

    const pace = workout.paceDefaults.find(
      item =>
        item.block_number === row.block_number &&
        Number(item.score_group) === group
    );

    const factor = number(pace?.pace_factor_default);
    const paceSecondsPerKm = paceFrom10k(
      current10kSeconds,
      factor
    );
    const distanceMeters = number(block?.distance_m);
    const targetSeconds =
      Number.isFinite(paceSecondsPerKm) &&
      Number.isFinite(distanceMeters)
        ? (paceSecondsPerKm * distanceMeters) / 1000
        : null;

    return {
      blockNumber: row.block_number,
      reps: number(row.reps_default, 1),
      distanceMeters,
      paceFactor: factor,
      paceSecondsPerKm,
      targetSeconds,
      recoveryType: row.recovery_type,
      recoverySeconds: number(row.recovery_default_sec),
      blockRecoveryType: row.block_recovery_type,
      blockRecoverySeconds: number(
        row.block_recovery_default_sec
      ),
    };
  });

  return {
    kind: 'intervals',
    blocks,
  };
}

function materializeStepWorkout(
  workout,
  band,
  group,
  current10kSeconds
) {
  const steps = workout.steps
    .filter(
      step => Number(step.performance_band) === band
    )
    .sort((a, b) => a.step_number - b.step_number)
    .map(step => {
      const pace = workout.stepPaceDefaults.find(
        item =>
          Number(item.performance_band) === band &&
          Number(item.step_number) ===
            Number(step.step_number) &&
          Number(item.score_group) === group
      );

      const factor = number(pace?.pace_factor_default);
      const paceSecondsPerKm = paceFrom10k(
        current10kSeconds,
        factor
      );
      const distanceMeters = number(step.distance_m);
      const targetSeconds =
        Number.isFinite(paceSecondsPerKm) &&
        Number.isFinite(distanceMeters)
          ? (paceSecondsPerKm * distanceMeters) / 1000
          : null;

      return {
        stepNumber: Number(step.step_number),
        reps: number(step.reps, 1),
        distanceMeters,
        paceFactor: factor,
        paceSecondsPerKm,
        targetSeconds,
        recoveryType: step.recovery_type,
        recoverySeconds: number(step.recovery_sec),
      };
    });

  return {
    kind: 'steps',
    steps,
  };
}

export function materializeWorkout(
  workout,
  athlete = {}
) {
  const score = clampScore(athlete.score);
  const band = performanceBandForScore(score);
  const group = scoreGroupForScore(score);
  const current10kSeconds = parseClockToSeconds(
    athlete.current10k
  );

  const structure = workout.steps.length
    ? materializeStepWorkout(
        workout,
        band,
        group,
        current10kSeconds
      )
    : materializeIntervalWorkout(
        workout,
        band,
        group,
        current10kSeconds
      );

  return {
    id: workout.id,
    event: workout.event,
    role: workout.role,
    status: workout.status,
    stimulus: workout.stimulus,
    structureType: workout.structureType,
    athleteScore: score,
    performanceBand: band,
    scoreGroup: group,
    ...structure,
  };
}

export function formatMaterializedWorkout(workout) {
  if (!workout) return [];

  if (workout.kind === 'steps') {
    return workout.steps.map(step => {
      const target = Number.isFinite(step.targetSeconds)
        ? ` @ ${formatClock(step.targetSeconds, 1)}`
        : '';

      const pace = Number.isFinite(step.paceSecondsPerKm)
        ? ` (${formatClock(step.paceSecondsPerKm, 1)}/km)`
        : '';

      const recovery = Number.isFinite(
        step.recoverySeconds
      )
        ? ` / ${formatClock(step.recoverySeconds)} ${
            step.recoveryType || ''
          }`
        : '';

      const reps =
        step.reps > 1 ? `${step.reps}×` : '';

      return `${reps}${step.distanceMeters}m${target}${pace}${recovery}`.trim();
    });
  }

  const lines = [];

  for (const block of workout.blocks) {
    const target = Number.isFinite(block.targetSeconds)
      ? ` @ ${formatClock(block.targetSeconds, 1)}`
      : '';

    const pace = Number.isFinite(block.paceSecondsPerKm)
      ? ` (${formatClock(block.paceSecondsPerKm, 1)}/km)`
      : '';

    const recovery = Number.isFinite(
      block.recoverySeconds
    )
      ? ` / ${formatClock(block.recoverySeconds)} ${
          block.recoveryType || ''
        }`
      : '';

    lines.push(
      `${block.reps}×${block.distanceMeters}m${target}${pace}${recovery}`.trim()
    );

    if (Number.isFinite(block.blockRecoverySeconds)) {
      lines.push(
        `↳ ${formatClock(
          block.blockRecoverySeconds
        )} ${
          block.blockRecoveryType ||
          'between blocks'
        }`
      );
    }
  }

  return lines;
}
