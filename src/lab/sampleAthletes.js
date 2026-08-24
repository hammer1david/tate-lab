export const sampleAthlete = Object.freeze({
  goalEvent: '5K',
  phase: 'Loading',
  current5k: '18:30',
  tolerance: 'established',
  primaryNeed: 'Threshold',
  readiness: 82,

  // v0.1.6 sample: a single "Too much" response keeps the
  // threshold dose but eases the target pace first.
  recentWorkouts: [
    {
      daysAgo: 7,
      workout: '7x1000 @4:00 / 60s',
      feedback: 'Too much',
    },
  ],
});
