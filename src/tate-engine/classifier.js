import { clamp, parseTimeToSeconds } from './utils.js';

function athlete5kPaceSeconds(athlete) {
  const t = parseTimeToSeconds(athlete.current5k);
  return t ? t / 5 : null;
}

function blockPacePerKm(block) {
  if (!block.targetSecondsPerRep || !block.distanceMeters) return null;
  return block.targetSecondsPerRep / (block.distanceMeters / 1000);
}

export function classifyWorkout(parsed, athlete) {
  const fiveKPace = athlete5kPaceSeconds(athlete);
  let fatigue = 0;
  const classified = [];

  for (const block of parsed.blocks) {
    if (block.kind === 'inter_block_rest') {
      const recoveryFraction = block.durationSeconds ? clamp(block.durationSeconds / 300, 0, 1) : 0.25;
      fatigue *= (1 - 0.65 * recoveryFraction);
      classified.push({ ...block, fatigueAfter: fatigue });
      continue;
    }

    const pace = blockPacePerKm(block);
    const relative = fiveKPace && pace ? pace / fiveKPace : null;
    const repSeconds = block.targetSecondsPerRep || 0;
    const density = block.recoverySeconds ? repSeconds / Math.max(1, block.recoverySeconds) : 1;

    let primary = 'Unknown';
    let secondary = [];

    if (relative != null) {
      if (relative >= 1.10) { primary = 'Aerobic'; secondary = ['Durability']; }
      else if (relative >= 1.02) { primary = 'Threshold'; secondary = ['Aerobic']; }
      else if (relative >= 0.94) { primary = 'VO2max'; secondary = ['Threshold']; }
      else if (relative >= 0.82) { primary = 'SpeedEndurance'; secondary = ['VO2max']; }
      else { primary = 'Speed'; secondary = ['SpeedEndurance']; }
    }

    if (block.distanceMeters <= 250 && block.recoverySeconds != null && block.recoverySeconds < 60 && primary === 'Speed') {
      primary = 'SpeedEndurance';
      secondary = ['Speed'];
    }

    const totalQualitySeconds = repSeconds * block.reps;
    const cv = clamp(2 + totalQualitySeconds / 240 + density * 0.7 + fatigue * 2, 0, 10);
    const msk = clamp(2 + (fiveKPace && pace ? Math.max(0, fiveKPace / pace - 0.85) * 5 : 1) + block.reps / 12 + fatigue, 0, 10);
    const nm = clamp((primary === 'Speed' ? 8 : primary === 'SpeedEndurance' ? 6 : primary === 'VO2max' ? 3 : 1) + fatigue * 2, 0, 10);

    classified.push({
      ...block,
      paceSecondsPerKm: pace,
      relativeTo5kPace: relative,
      primary,
      secondary,
      stress: { cv, msk, nm },
      fatigueBefore: fatigue,
    });

    fatigue = clamp(fatigue + totalQualitySeconds / 1800 + density * 0.07, 0, 1);
  }

  return classified;
}
