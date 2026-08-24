export const sampleAthlete = Object.freeze({
  goalEvent: '5K',
  phase: 'Loading',
  current5k: '18:30',
  tolerance: 'established',
  primaryNeed: 'Threshold',
  readiness: 82,

  // v0.1.5 sample: athlete response controls whether progression
  // is permitted, held, or regressed without disabling rotation.
  recentWorkouts: [
    {
      daysAgo: 7,
      workout: '7x1000 @4:00 / 60s',
      feedback: 'Comfortable',
    },
  ],
});
