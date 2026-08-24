import { parseWorkoutText } from './parser.js';

function firstWorkBlock(parsed) {
  return parsed.blocks.find(b => b.kind === 'work') || null;
}

export function compareProgression(candidate, recentWorkoutText) {
  if (!recentWorkoutText) return { progressionFit: 0.72, progressionLink: 0, reason: 'No comparable history.' };
  const recent = firstWorkBlock(parseWorkoutText(recentWorkoutText));
  const current = candidate.blocks?.find(b => b.kind === 'work') || null;
  if (!recent || !current) return { progressionFit: 0.65, progressionLink: 0, reason: 'History could not be compared.' };

  const sameDistance = Math.abs(recent.distanceMeters - current.distanceMeters) < 10;
  const repDelta = current.reps - recent.reps;
  const paceDelta = (recent.targetSecondsPerRep ?? 0) - (current.targetSecondsPerRep ?? 0);

  if (sameDistance && repDelta === 1 && Math.abs(paceDelta) < 2) {
    return { progressionFit: 1.0, progressionLink: 1.0, reason: 'Safe volume progression.' };
  }
  if (sameDistance && repDelta === 0 && paceDelta > 0 && paceDelta <= 5) {
    return { progressionFit: 0.95, progressionLink: 1.0, reason: 'Safe intensity progression.' };
  }
  if (sameDistance && repDelta === 0 && Math.abs(paceDelta) <= 1) {
    return { progressionFit: 0.66, progressionLink: 0.2, reason: 'Near-repeat; variation may be preferable.' };
  }
  if (sameDistance && repDelta >= 2) {
    return { progressionFit: 0.48, progressionLink: 0.8, reason: 'Progression step may be too large.' };
  }
  return { progressionFit: 0.78, progressionLink: 0.35, reason: 'Different structure with plausible progression.' };
}
