export const ENGINE_VERSION = '0.1.4-lab';

export const scoringWeights = Object.freeze({
  needMatch: 24,
  eventPhaseFit: 8,
  progressionFit: 11,
  doseFit: 14,
  rotationFit: 9,
  structuralRotationFit: 12,
  toleranceFit: 7,
  stressFit: 7,
  scheduleFit: 3,
  secondaryCoverage: 2,
  practicalityFit: 3,
});

export const penalties = Object.freeze({
  recentSimilarityMax: 8,
  similarityTauDays: 14,
  historyExposureCap: 1.5,
  progressionRepeatRelief: 0.75,
  complexityMax: 4,
  noveltyMax: 4,
});

export const learning = Object.freeze({
  minModifier: 0.85,
  maxModifier: 1.15,
  step: 0.015,
  maxScoreAdjustment: 3,
});

export const thresholdDoseModel = Object.freeze({
  noviceMaxMinutes: 20,
  globalMaxMinutes: 40,

  toleranceMinuteAdjustment: {
    low: -2,
    established: 0,
    high: 2,
    very_high: 4,
  },

  performanceBands: [
    {
      id: 'competitive',
      max5kSeconds: 17 * 60,
      phases: {
        Base: [30, 34],
        Loading: [32, 40],
        Sharpening: [24, 32],
        Taper: [16, 24],
      },
    },
    {
      id: 'trained',
      max5kSeconds: 20 * 60,
      phases: {
        Base: [24, 30],
        Loading: [26, 34],
        Sharpening: [20, 28],
        Taper: [14, 22],
      },
    },
    {
      id: 'developing',
      max5kSeconds: 24 * 60,
      phases: {
        Base: [18, 24],
        Loading: [20, 28],
        Sharpening: [16, 24],
        Taper: [12, 20],
      },
    },
    {
      id: 'recreational',
      max5kSeconds: Infinity,
      phases: {
        Base: [12, 18],
        Loading: [14, 22],
        Sharpening: [12, 18],
        Taper: [10, 16],
      },
    },
  ],

  competitive5k1000Progression: {
    Base: [10, 10],
    Loading: [10, 12],
    Sharpening: [8, 10],
    Taper: [5, 8],
  },
});

export const eventCompositeRules = Object.freeze({
  '800m': { thresholdPlusSpeedDefault: false },
  '1500m': { thresholdPlusSpeedDefault: false },
  '3000m': { thresholdPlusSpeedDefault: true },
  '5K': { thresholdPlusSpeedDefault: true },
  '10K': { thresholdPlusSpeedDefault: true },
  HM: { thresholdPlusSpeedDefault: true },
  Marathon: { thresholdPlusSpeedDefault: true },
});

export const racePhaseBias = Object.freeze({
  Base: { simplicity: 1, specificity: 0.65 },
  Loading: { simplicity: 0.9, specificity: 0.85 },
  Sharpening: { simplicity: 0.85, specificity: 1 },
  Taper: { simplicity: 0.95, specificity: 1 },
});
