export const sampleAthlete = Object.freeze({
  goalEvent: '5K',
  phase: 'Loading',
  current5k: '18:30',
  tolerance: 'established',
  primaryNeed: 'Threshold',
  readiness: 82,

  // v0.1.7 sample: a pace adjustment becomes established after
  // the athlete reports the corrected session as Comfortable.
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
