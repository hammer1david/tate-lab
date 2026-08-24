export const ENGINE_VERSION =
  '0.1.2-lab';

export const scoringWeights =
  Object.freeze({
    needMatch: 35,
    eventPhaseFit: 15,
    progressionFit: 12,
    toleranceFit: 10,
    stressFit: 10,
    scheduleFit: 8,
    secondaryCoverage: 5,
    practicalityFit: 5,
  });

export const penalties =
  Object.freeze({
    recentSimilarityMax: 8,

    similarityTauDays: 14,

    historyExposureCap: 1.5,

    progressionRepeatRelief:
      0.75,

    complexityMax: 4,

    noveltyMax: 4,
  });

export const learning =
  Object.freeze({
    minModifier: 0.85,
    maxModifier: 1.15,
    step: 0.015,
    maxScoreAdjustment: 3,
  });

export const thresholdDoseByTolerance =
  Object.freeze({
    low: {
      minMinutes: 15,
      maxMinutes: 25,
      defaultReps1000: 5,
    },

    established: {
      minMinutes: 20,
      maxMinutes: 35,
      defaultReps1000: 6,
    },

    high: {
      minMinutes: 25,
      maxMinutes: 45,
      defaultReps1000: 8,
    },

    very_high: {
      minMinutes: 30,
      maxMinutes: 60,
      defaultReps1000: 10,
    },
  });

export const eventCompositeRules =
  Object.freeze({
    '800m': {
      thresholdPlusSpeedDefault:
        false,
    },

    '1500m': {
      thresholdPlusSpeedDefault:
        false,
    },

    '3000m': {
      thresholdPlusSpeedDefault:
        true,
    },

    '5K': {
      thresholdPlusSpeedDefault:
        true,
    },

    '10K': {
      thresholdPlusSpeedDefault:
        true,
    },

    HM: {
      thresholdPlusSpeedDefault:
        true,
    },

    Marathon: {
      thresholdPlusSpeedDefault:
        true,
    },
  });

export const racePhaseBias =
  Object.freeze({
    Base: {
      simplicity: 1,
      specificity: 0.65,
    },

    Loading: {
      simplicity: 0.9,
      specificity: 0.85,
    },

    Sharpening: {
      simplicity: 0.85,
      specificity: 1,
    },

    Taper: {
      simplicity: 0.95,
      specificity: 1,
    },
  });
