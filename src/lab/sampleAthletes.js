export const sampleAthlete = Object.freeze({
  goalEvent: '5K',
  phase: 'Loading',
  current5k: '15:00',
  tolerance: 'established',
  primaryNeed: 'Threshold',
  readiness: 82,

  // v0.1.3 sample: the 1000m progression is ready only
  // after other threshold forms have been used in between.
  recentWorkouts: [
    {
      daysAgo: 14,
      workout: '10x1000 @3:14 / 60s',
    },
    {
      daysAgo: 7,
      workout: '3x10min Threshold / 2min jog',
    },
    {
      daysAgo: 3,
      workout: '4x8min Threshold / 90s jog',
    },
  ],
});
