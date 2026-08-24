export const sampleAthlete = Object.freeze({
  goalEvent: '5K',
  phase: 'Loading',
  current5k: '15:00',
  tolerance: 'established',
  primaryNeed: 'Threshold',
  readiness: 82,

  // v0.1.4 sample: several short threshold structures should
  // rotate toward longer work, while form rotation still matters.
  recentWorkouts: [
    {
      daysAgo: 14,
      workout: '10x1000 @3:14 / 60s',
    },
    {
      daysAgo: 7,
      workout: '12x800 @2:36 / 60s',
    },
    {
      daysAgo: 3,
      workout: '10x1000 @3:14 / 60s',
    },
  ],
});
