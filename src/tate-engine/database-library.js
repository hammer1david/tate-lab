const SUPABASE_URL = 'https://uhbhsyuodizauwhhdffu.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_o-hfeydDJf5J-xPQyxwVow_DJ3StSNn';

const WORKOUT_TABLES = [
  'tate_workout_families',
  'tate_workout_blocks',
  'tate_workout_band_defaults',
  'tate_workout_pace_defaults',
  'tate_workout_steps',
  'tate_workout_step_pace_defaults',
  'tate_workout_volume_profiles',
];

const DYNAMIC_TABLES = [
  'tate_aerobic_generation_rules',
  'tate_aerobic_pace_profiles',
  'tate_aerobic_distance_profiles',
  'tate_aerobic_phase_rules',
  'tate_long_run_profiles',
  'tate_long_run_phase_rules',
  'tate_recovery_generation_rules',
  'tate_stride_generation_rules',
  'tate_stride_variants',
  'tate_hill_sprint_generation_rules',
  'tate_hill_sprint_variants',
  'tate_hillwork_generation_rules',
];

const TABLES = [
  ...WORKOUT_TABLES,
  ...DYNAMIC_TABLES,
];

function number(value, fallback = null) {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function activeForEvent(rows = [], event = '10K') {
  return rows.filter(row => row.active !== false && row.event === event);
}

function firstActiveForEvent(rows = [], event = '10K') {
  return activeForEvent(rows, event)[0] || null;
}

function cleanLabel(value) {
  return String(value || '')
    .replaceAll('_', ' ')
    .replace(/\b\w/g, char => char.toUpperCase());
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
    racepace: 'Race Specific',
    racespecific: 'Race Specific',
    '10kspecific': '10K Specific',
    aerobic: 'Aerobic',
    recovery: 'Recovery',
    speedendurance: 'Speed Endurance',
    speed: 'Speed',
    strides: 'Strides',
    progressive: 'Progressive',
    longrun: 'Long Run',
    durability: 'Durability',
    sprint: 'Sprint',
    hillwork: 'Hill Work',
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

function roundWorkKm(value) {
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 1000) / 1000;
}

function distanceKmFromDurationAndPace(
  durationSeconds,
  paceSecondsPerKm
) {
  if (
    !Number.isFinite(durationSeconds) ||
    durationSeconds <= 0 ||
    !Number.isFinite(paceSecondsPerKm) ||
    paceSecondsPerKm <= 0
  ) {
    return null;
  }

  return durationSeconds / paceSecondsPerKm;
}

/*
 * Time-based workout volume:
 *
 * target pace = current 10K pace / pace factor
 * distance km = work duration / target pace
 *
 * Equivalent:
 * distance km =
 * work duration × pace factor / current 10K pace
 *
 * This lets TATE estimate km for sessions such as
 * 4×8 min or 3×10 min instead of treating them as 0 km.
 */

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

function dynamicWorkout({
  id,
  event,
  stimulus,
  structureType,
  dynamicType,
  dynamicConfig,
  role = 'priority',
}) {
  return {
    id,
    event,
    role,
    progress_reps: false,
    progress_pace: false,
    progress_recovery: false,
    progress_block_recovery: false,
    active: true,
    status: 'config',
    stimulus: normalizeStimulus(stimulus),
    structureType,
    blocks: [],
    bandDefaults: [],
    paceDefaults: [],
    steps: [],
    stepPaceDefaults: [],
    volumeProfiles: [],
    dynamicType,
    dynamicConfig,
  };
}

export function buildDynamicWorkoutLibrary(config = {}, { event = '10K' } = {}) {
  const workouts = [];

  const aerobicGenerationRule = firstActiveForEvent(
    config.tate_aerobic_generation_rules,
    event
  );
  const aerobicPaceProfiles = activeForEvent(
    config.tate_aerobic_pace_profiles,
    event
  );
  const aerobicDistanceProfiles = activeForEvent(
    config.tate_aerobic_distance_profiles,
    event
  );
  const aerobicPhaseRules = activeForEvent(
    config.tate_aerobic_phase_rules,
    event
  );

  if (
    aerobicGenerationRule &&
    aerobicPaceProfiles.length &&
    aerobicDistanceProfiles.length
  ) {
    const aerobicConfig = {
      generationRule: aerobicGenerationRule,
      paceProfiles: aerobicPaceProfiles,
      distanceProfiles: aerobicDistanceProfiles,
      phaseRules: aerobicPhaseRules,
    };

    workouts.push(
      dynamicWorkout({
        id: `${event}_AEROBIC_DYNAMIC`,
        event,
        stimulus: 'Aerobic',
        structureType: 'dynamic_aerobic',
        dynamicType: 'aerobic',
        dynamicConfig: aerobicConfig,
      })
    );

    workouts.push(
      dynamicWorkout({
        id: `${event}_PROGRESSIVE_DYNAMIC`,
        event,
        stimulus: 'Progressive',
        structureType: 'dynamic_progressive',
        dynamicType: 'progressive',
        dynamicConfig: aerobicConfig,
      })
    );
  }

  const longRunProfiles = activeForEvent(
    config.tate_long_run_profiles,
    event
  );
  const longRunPhaseRules = activeForEvent(
    config.tate_long_run_phase_rules,
    event
  );

  if (longRunProfiles.length) {
    workouts.push(
      dynamicWorkout({
        id: `${event}_LONG_RUN_DYNAMIC`,
        event,
        stimulus: 'Long Run',
        structureType: 'dynamic_long_run',
        dynamicType: 'long_run',
        dynamicConfig: {
          profiles: longRunProfiles,
          phaseRules: longRunPhaseRules,
          paceProfiles: aerobicPaceProfiles,
        },
      })
    );
  }

  const recoveryRule = firstActiveForEvent(
    config.tate_recovery_generation_rules,
    event
  );

  if (recoveryRule) {
    workouts.push(
      dynamicWorkout({
        id: `${event}_RECOVERY_DYNAMIC`,
        event,
        stimulus: 'Recovery',
        structureType: 'dynamic_recovery',
        dynamicType: 'recovery',
        dynamicConfig: {
          rule: recoveryRule,
        },
      })
    );
  }

  const strideRule = firstActiveForEvent(
    config.tate_stride_generation_rules,
    event
  );
  const strideVariants = activeForEvent(
    config.tate_stride_variants,
    event
  );

  if (strideRule) {
    for (const variant of strideVariants) {
      workouts.push(
        dynamicWorkout({
          id: `${event}_STRIDES_${String(variant.variant_id).toUpperCase().replaceAll('-', '_')}`,
          event,
          stimulus: 'Strides',
          structureType: 'dynamic_strides',
          dynamicType: 'strides',
          dynamicConfig: {
            rule: strideRule,
            variant,
          },
        })
      );
    }
  }

  const hillSprintRule = firstActiveForEvent(
    config.tate_hill_sprint_generation_rules,
    event
  );
  const hillSprintVariants = activeForEvent(
    config.tate_hill_sprint_variants,
    event
  );

  if (hillSprintRule) {
    for (const variant of hillSprintVariants) {
      workouts.push(
        dynamicWorkout({
          id: `${event}_HILL_SPRINT_${String(variant.variant_id).toUpperCase().replaceAll('-', '_')}`,
          event,
          stimulus: 'Sprint',
          structureType: 'dynamic_hill_sprint',
          dynamicType: 'hill_sprint',
          dynamicConfig: {
            rule: hillSprintRule,
            variant,
          },
        })
      );
    }
  }

  const hillworkRule = firstActiveForEvent(
    config.tate_hillwork_generation_rules,
    event
  );

  if (hillworkRule) {
    workouts.push(
      dynamicWorkout({
        id: `${event}_HILLWORK_DYNAMIC`,
        event,
        stimulus: 'Hill Work',
        structureType: 'dynamic_hillwork',
        dynamicType: 'hillwork',
        dynamicConfig: {
          rule: hillworkRule,
        },
      })
    );
  }

  return workouts;
}

function sortWorkoutLibrary(workouts) {
  return [...workouts].sort((a, b) => {
    if (a.stimulus !== b.stimulus) {
      return a.stimulus.localeCompare(b.stimulus);
    }

    if (a.role !== b.role) {
      return a.role === 'priority' ? -1 : 1;
    }

    return a.id.localeCompare(b.id);
  });
}

export async function loadWorkoutLibrary({ event = '10K' } = {}) {
  const tableRows = await Promise.all(TABLES.map(fetchTable));
  const data = Object.fromEntries(
    TABLES.map((table, index) => [table, tableRows[index]])
  );

  const families = data.tate_workout_families;
  const blocks = data.tate_workout_blocks;
  const bandDefaults = data.tate_workout_band_defaults;
  const paceDefaults = data.tate_workout_pace_defaults;
  const steps = data.tate_workout_steps;
  const stepPaceDefaults = data.tate_workout_step_pace_defaults;
  const volumeProfiles = data.tate_workout_volume_profiles;

  const fixedWorkouts = families
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
        structureType: workoutBlocks[0]?.structure_type || 'intervals',
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
        volumeProfiles: rowsForWorkout(
          volumeProfiles,
          family.id
        ),
      };
    });

  const dynamicWorkouts = buildDynamicWorkoutLibrary(data, { event });

  return sortWorkoutLibrary([
    ...fixedWorkouts,
    ...dynamicWorkouts,
  ]);
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
    const durationSeconds = number(block?.duration_sec);
    const targetSeconds =
      Number.isFinite(paceSecondsPerKm) &&
      Number.isFinite(distanceMeters)
        ? (paceSecondsPerKm * distanceMeters) / 1000
        : null;

    const reps = number(row.reps_default, 1);
    const repWorkDistanceKm =
      Number.isFinite(distanceMeters)
        ? distanceMeters / 1000
        : distanceKmFromDurationAndPace(
            durationSeconds,
            paceSecondsPerKm
          );

    return {
      blockNumber: row.block_number,
      reps,
      distanceMeters,
      durationSeconds,
      paceFactor: factor,
      paceSecondsPerKm,
      targetSeconds,
      repWorkDistanceKm:
        roundWorkKm(repWorkDistanceKm),
      workDistanceKm:
        roundWorkKm(
          Number.isFinite(repWorkDistanceKm)
            ? repWorkDistanceKm * reps
            : null
        ),
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

      const reps = number(step.reps, 1);
      const repWorkDistanceKm =
        Number.isFinite(distanceMeters)
          ? distanceMeters / 1000
          : null;

      return {
        stepNumber: Number(step.step_number),
        reps,
        distanceMeters,
        paceFactor: factor,
        paceSecondsPerKm,
        targetSeconds,
        repWorkDistanceKm:
          roundWorkKm(repWorkDistanceKm),
        workDistanceKm:
          roundWorkKm(
            Number.isFinite(repWorkDistanceKm)
              ? repWorkDistanceKm * reps
              : null
          ),
        recoveryType: step.recovery_type,
        recoverySeconds: number(step.recovery_sec),
      };
    });

  return {
    kind: 'steps',
    steps,
  };
}

function findPaceProfile(profiles, level) {
  return profiles.find(profile => profile.pace_level === level) || null;
}

function formatPaceRange(current10kSeconds, profile) {
  if (!profile || !Number.isFinite(current10kSeconds)) return 'effort based';

  const values = [
    paceFrom10k(current10kSeconds, number(profile.pace_factor_min)),
    paceFrom10k(current10kSeconds, number(profile.pace_factor_default)),
    paceFrom10k(current10kSeconds, number(profile.pace_factor_max)),
  ].filter(Number.isFinite);

  if (!values.length) return 'effort based';

  const fastest = Math.min(...values);
  const slowest = Math.max(...values);
  const defaultPace = paceFrom10k(
    current10kSeconds,
    number(profile.pace_factor_default)
  );

  return `${formatClock(defaultPace)}/km default (${formatClock(slowest)}–${formatClock(fastest)}/km)`;
}

function normalizePhaseForConfig(value) {
  const key = String(value || 'base')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '');

  const aliases = {
    loading: 'loading',
    base: 'base',
    specific: 'specific',
    sharpening: 'sharpening',
    taper: 'taper',
    tapering: 'taper',
  };

  return aliases[key] || 'base';
}

function materializeDynamicWorkout(workout, athlete, common) {
  const current10kSeconds = parseClockToSeconds(athlete.current10k);
  const phase = normalizePhaseForConfig(athlete.phase);
  const config = workout.dynamicConfig || {};
  const lines = [];

  if (workout.dynamicType === 'aerobic') {
  const selectedPaceLevel =
    athlete.aerobicPaceLevel ||
    'normal';

  const selectedDistanceMode =
    athlete.aerobicDistanceMode ||
    'normal';

  const paceProfile =
    findPaceProfile(
      config.paceProfiles || [],
      selectedPaceLevel
    ) ||
    findPaceProfile(
      config.paceProfiles || [],
      'normal'
    ) ||
    config.paceProfiles?.[0];

  const distanceProfile =
    (config.distanceProfiles || []).find(
      item =>
        item.distance_mode ===
        selectedDistanceMode
    ) ||
    (config.distanceProfiles || []).find(
      item =>
        item.distance_mode ===
        'normal'
    ) ||
    config.distanceProfiles?.[0];

  const selectedMultiplier =
    number(
      athlete.aerobicDistanceMultiplier
    );

  lines.push(
    `${cleanLabel(selectedDistanceMode)} Aerobic · ` +
    `${cleanLabel(paceProfile?.pace_level || selectedPaceLevel)} · ` +
    `${formatPaceRange(current10kSeconds, paceProfile)}`
  );

  if (distanceProfile) {
    lines.push(
      `Distance mode ${cleanLabel(distanceProfile.distance_mode)} · ` +
      `${number(distanceProfile.multiplier_min)?.toFixed(2)}–` +
      `${number(distanceProfile.multiplier_max)?.toFixed(2)}× average aerobic slot` +
      (
        Number.isFinite(selectedMultiplier)
          ? ` · selected ${selectedMultiplier.toFixed(2)}×`
          : ` · ${number(distanceProfile.multiplier_default)?.toFixed(2)}× default`
      )
    );
  }
}

  if (workout.dynamicType === 'progressive') {
    const start =
      findPaceProfile(config.paceProfiles || [], 'normal') ||
      findPaceProfile(config.paceProfiles || [], 'easy');
    const finish = findPaceProfile(config.paceProfiles || [], 'moderate');
    const startPace = paceFrom10k(
      current10kSeconds,
      number(start?.pace_factor_default)
    );
    const finishPace = paceFrom10k(
      current10kSeconds,
      number(finish?.pace_factor_default)
    );

    lines.push(
      Number.isFinite(startPace) && Number.isFinite(finishPace)
        ? `Progressive Aerobic · ${formatClock(startPace)}/km → ${formatClock(finishPace)}/km`
        : 'Progressive Aerobic · controlled progression within the aerobic pace profiles'
    );
  }

  if (workout.dynamicType === 'long_run') {
    const phaseRule =
      (config.phaseRules || []).find(
        item => item.phase === phase
      ) ||
      (config.phaseRules || []).find(
        item => item.phase === 'base'
      ) ||
      config.phaseRules?.[0];

    const defaultLongRunType =
      phaseRule?.default_long_run_type ||
      'normal';

    const progressiveRequested =
      athlete.longRunProgressive === true;

    const progressiveAllowed =
      phaseRule?.progressive_allowed === true;

    const progressivePolicy =
      phaseRule?.progressive_policy ||
      'off';

    const longRunType =
      progressiveRequested &&
      progressiveAllowed &&
      progressivePolicy !== 'off'
        ? 'progressive'
        : defaultLongRunType;

    const profile =
      (config.profiles || []).find(
        item => item.long_run_type === longRunType
      ) ||
      (config.profiles || []).find(
        item => item.long_run_type === 'normal'
      ) ||
      config.profiles?.[0];

    const startProfile = findPaceProfile(
      config.paceProfiles || [],
      profile?.start_pace_level
    );
    const finishProfile = findPaceProfile(
      config.paceProfiles || [],
      profile?.finish_pace_level
    );
    const startPace = paceFrom10k(
      current10kSeconds,
      number(startProfile?.pace_factor_default)
    );
    const finishPace = paceFrom10k(
      current10kSeconds,
      number(finishProfile?.pace_factor_default)
    );

    lines.push(
      `Long Run · ${cleanLabel(profile?.long_run_type || 'normal')} · ${cleanLabel(profile?.start_pace_level || 'normal')} → ${cleanLabel(profile?.finish_pace_level || 'normal')}`
    );

    if (Number.isFinite(startPace) && Number.isFinite(finishPace)) {
      lines.push(
        startPace === finishPace
          ? `Reference pace ${formatClock(startPace)}/km`
          : `Reference pace ${formatClock(startPace)}/km → ${formatClock(finishPace)}/km`
      );
    }

    if (phaseRule) {
      lines.push(
        `${cleanLabel(phase)} phase · ${(number(phaseRule.weekly_km_share_min) * 100).toFixed(0)}–${(number(phaseRule.weekly_km_share_max) * 100).toFixed(0)}% weekly km (${(number(phaseRule.weekly_km_share_default) * 100).toFixed(1)}% default)${Number.isFinite(number(phaseRule.max_distance_km)) ? ` · max ${number(phaseRule.max_distance_km)} km` : ''}`
      );
    }
  }

  if (workout.dynamicType === 'recovery') {
    const rule = config.rule || {};
    lines.push(
      `Recovery Run · ${cleanLabel(rule.effort_guidance || 'very easy relaxed')} · RPE ${rule.rpe_min ?? '—'}–${rule.rpe_max ?? '—'} · no fixed pace`
    );
  }

  if (workout.dynamicType === 'strides') {
    const rule = config.rule || {};
    const variant = config.variant || {};
    lines.push(
      `${variant.reps}×${variant.distance_m}m Strides · ${cleanLabel(rule.effort_guidance || 'fast but relaxed')} · ${cleanLabel(rule.recovery_policy || 'full or near full recovery')}`
    );
  }

  if (workout.dynamicType === 'hill_sprint') {
    const rule = config.rule || {};
    const variant = config.variant || {};
    const reps = Number.isFinite(number(variant.reps_default))
      ? String(number(variant.reps_default))
      : `${variant.reps_min}–${variant.reps_max}`;

    lines.push(
      `${reps}×${variant.duration_sec}s Short Hill Sprints · ${cleanLabel(rule.effort_guidance || 'very fast explosive clean')} · ${cleanLabel(rule.recovery_policy || 'full or near full recovery')}`
    );
  }

  if (workout.dynamicType === 'hillwork') {
    const rule = config.rule || {};
    lines.push(
      `${formatClock(number(rule.block_duration_min_sec))}–${formatClock(number(rule.block_duration_max_sec))} Hillwork · repeat ${rule.uphill_distance_min_m}–${rule.uphill_distance_max_m}m uphill ${cleanLabel(rule.uphill_effort_guidance || 'hard but controlled')} · downhill jog`
    );
  }

  return {
    ...common,
    kind: 'dynamic',
    lines,
  };
}


function volumeProfileForBand(
  workout,
  band
) {
  return (
    (workout.volumeProfiles || []).find(
      row =>
        Number(row.performance_band) ===
        Number(band)
    ) || null
  );
}

function structureWorkDistanceKm(structure) {
  const items =
    structure.kind === 'steps'
      ? structure.steps || []
      : structure.blocks || [];

  const distances = items
    .map(item => number(item.workDistanceKm))
    .filter(Number.isFinite);

  if (!distances.length) return null;

  return roundWorkKm(
    distances.reduce(
      (sum, value) => sum + value,
      0
    )
  );
}

function structureWorkDurationSec(structure) {
  if (structure.kind !== 'intervals') {
    return null;
  }

  const durations = (structure.blocks || [])
    .map(block => {
      const duration = number(
        block.durationSeconds
      );
      const reps = number(
        block.reps,
        1
      );

      return Number.isFinite(duration)
        ? duration * reps
        : null;
    })
    .filter(Number.isFinite);

  if (!durations.length) return null;

  return durations.reduce(
    (sum, value) => sum + value,
    0
  );
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

  const common = {
    id: workout.id,
    event: workout.event,
    role: workout.role,
    status: workout.status,
    stimulus: workout.stimulus,
    structureType: workout.structureType,
    athleteScore: score,
    performanceBand: band,
    scoreGroup: group,
  };

  if (workout.dynamicType) {
    return materializeDynamicWorkout(workout, athlete, common);
  }

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

  const volumeProfile =
    volumeProfileForBand(
      workout,
      band
    );

  const profileDistanceKm = number(
    volumeProfile?.work_distance_km
  );
  const computedDistanceKm =
    structureWorkDistanceKm(
      structure
    );

  const distanceMode =
    volumeProfile?.distance_mode ||
    (
      structureWorkDurationSec(
        structure
      )
        ? 'time_based'
        : 'fixed'
    );

  const workDurationSec =
    number(
      volumeProfile?.work_duration_sec
    ) ??
    structureWorkDurationSec(
      structure
    );

  const workDistanceKm =
    Number.isFinite(profileDistanceKm)
      ? roundWorkKm(
          profileDistanceKm
        )
      : computedDistanceKm;

  const workDistanceEstimated =
    distanceMode === 'time_based' &&
    Number.isFinite(workDistanceKm);

  return {
    ...common,
    ...structure,
    distanceMode,
    workDurationSec,
    workDistanceKm,
    workDistanceEstimated,
    workDistanceCalculation:
      workDistanceEstimated
        ? 'work_duration_x_pace_factor_x_current_10k'
        : 'fixed_distance_from_database',
  };
}

function formatIntervalUnit(block) {
  if (Number.isFinite(block.distanceMeters)) {
    return `${block.distanceMeters}m`;
  }

  if (Number.isFinite(block.durationSeconds)) {
    return formatClock(block.durationSeconds);
  }

  return 'block';
}

export function formatMaterializedWorkout(workout) {
  if (!workout) return [];

  if (workout.kind === 'dynamic') {
    return workout.lines || [];
  }

  if (workout.kind === 'steps') {
    const lines =
      workout.steps.map(step => {
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

    if (
      Number.isFinite(
        workout.workDistanceKm
      )
    ) {
      lines.push(
        `Work distance ${workout.workDistanceKm.toFixed(2)} km`
      );
    }

    return lines;
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
      `${block.reps}×${formatIntervalUnit(block)}${target}${pace}${recovery}`.trim()
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

  if (
    Number.isFinite(
      workout.workDistanceKm
    )
  ) {
    lines.push(
      workout.workDistanceEstimated
        ? `Estimated work distance ${workout.workDistanceKm.toFixed(2)} km`
        : `Work distance ${workout.workDistanceKm.toFixed(2)} km`
    );
  }

  return lines;
}
