const LEARNING_KEY = 'tate-lab-learning-v1';

export function loadLearningState() {
  try { return JSON.parse(localStorage.getItem(LEARNING_KEY) || '{}'); }
  catch { return {}; }
}

export function saveLearningState(state) {
  localStorage.setItem(LEARNING_KEY, JSON.stringify(state));
}

export function resetLearningState() {
  localStorage.removeItem(LEARNING_KEY);
}
