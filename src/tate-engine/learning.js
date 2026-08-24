import { learning } from './config.js';
import { clamp } from './utils.js';

export function learnPreference(state, key, direction = 1, note = '') {
  const current = state[key] || { modifier: 1, evidence: 0, notes: [] };
  const modifier = clamp(current.modifier + learning.step * direction, learning.minModifier, learning.maxModifier);
  return {
    ...state,
    [key]: {
      modifier,
      evidence: current.evidence + 1,
      notes: [...current.notes.slice(-9), note].filter(Boolean),
      updatedAt: new Date().toISOString(),
    },
  };
}
