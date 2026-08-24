export const ENGINE_VERSION = '0.1.10-lab';

export const scoringWeights = Object.freeze({
  needMatch: 22,
  eventPhaseFit: 7,
  progressionFit: 10,
  doseFit: 13,
  rotationFit: 8,
  structuralRotationFit: 11,
  sessionResponseFit: 10,
  toleranceFit: 6,
  stressFit: 6,
  scheduleFit: 2,
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


export const sessionResponseModel = Object.freeze({
  neutralFit: 0.9,
  repeatedTooMuchDoseMinuteAdjustment: -4,

  responses: {
    'Too much': {
      permission: 'Regress',
      doseMinuteAdjustment: 0,
      paceAdjustmentSecondsPerKm: 6,
      repeatedPaceAdjustmentSecondsPerKm: 8,
      progressFit: 0.15,
      holdFit: 0.55,
      regressFit: 1,
      differentFit: 0.78,
      progressionMultiplier: 0.25,
      singleAxisProgressFit: 0.1,
    },
    'A little hard': {
      permission: 'Hold',
      doseMinuteAdjustment: 0,
      paceAdjustmentSecondsPerKm: 3,
      progressFit: 0.4,
      holdFit: 0.92,
      regressFit: 0.95,
      differentFit: 0.86,
      progressionMultiplier: 0.5,
      singleAxisProgressFit: 0.2,
    },
    Doable: {
      permission: 'Progress cautiously',
      doseMinuteAdjustment: 0,
      paceAdjustmentSecondsPerKm: 0,
      progressFit: 0.86,
      holdFit: 0.9,
      regressFit: 0.65,
      differentFit: 0.92,
      progressionMultiplier: 0.9,
    },
    Comfortable: {
      permission: 'Progress',
      doseMinuteAdjustment: 0,
      paceAdjustmentSecondsPerKm: 0,
      progressFit: 1,
      holdFit: 0.82,
      regressFit: 0.45,
      differentFit: 0.94,
      progressionMultiplier: 1,
    },
    'Too easy': {
      permission: 'Progress stronger',
      doseMinuteAdjustment: 0,
      paceAdjustmentSecondsPerKm: -3,
      progressFit: 1,
      holdFit: 0.65,
      regressFit: 0.25,
      differentFit: 0.9,
      progressionMultiplier: 1,
      singleAxisProgressFit: 0.35,
    },
  },
});

export const thresholdDoseModel = Object.freeze({
  noviceMaxMinutes: 20,
  globalMaxMinutes: 40,

  trainingExperience: {
    beginner: {
      hardMaxMinutes: 20,
      progressionFitMultiplier: 0.82,
      stressMultiplier: 0.92,
    },
    intermediate: {
      hardMaxMinutes: 36,
      progressionFitMultiplier: 0.92,
      stressMultiplier: 0.97,
    },
    experienced: {
      hardMaxMinutes: 40,
      progressionFitMultiplier: 1,
      stressMultiplier: 1,
    },
  },

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


export const vo2Model = Object.freeze({
  globalHardMaxMinutes: 22,
  repeatedTooMuchDoseMinuteAdjustment: -3,

  // v0.1.10 guardrails: beginner work stays inside the normal
  // phase/performance dose ceiling, while the hard cap remains an
  // absolute safety ceiling for every experience level.
  beginnerNormalMaxToleranceMinutes: 0.25,

  // A response-driven pace correction should temporarily outrank
  // structural rotation when the same session can be repeated safely.
  paceFirstDifferentStructureFitCap: 0.62,
  paceFirstDifferentStructureProgressionCap: 0.78,
  paceFirstHistoryExposureMultiplier: 0.12,

  // Keep generated VO2 work inside the engine's own VO2 classifier
  // domain (kept just inside 0.94 <= pace/5K pace < 1.02).
  domainPaceFactor: {
    minimum: 0.941,
    maximum: 1.019,
  },

  trainingExperience: {
    beginner: {
      hardMaxMinutes: 14,
      progressionFitMultiplier: 0.78,
      stressMultiplier: 0.9,
    },
    intermediate: {
      hardMaxMinutes: 19,
      progressionFitMultiplier: 0.9,
      stressMultiplier: 0.96,
    },
    experienced: {
      hardMaxMinutes: 22,
      progressionFitMultiplier: 1,
      stressMultiplier: 1,
    },
  },

  toleranceMinuteAdjustment: {
    low: -2,
    established: 0,
    high: 1,
    very_high: 2,
  },

  performanceBands: [
    {
      id: 'competitive',
      max5kSeconds: 17 * 60,
      phases: {
        Base: [12, 16],
        Loading: [15, 20],
        Sharpening: [12, 18],
        Taper: [8, 12],
      },
    },
    {
      id: 'trained',
      max5kSeconds: 20 * 60,
      phases: {
        Base: [10, 14],
        Loading: [12, 18],
        Sharpening: [10, 16],
        Taper: [7, 11],
      },
    },
    {
      id: 'developing',
      max5kSeconds: 24 * 60,
      phases: {
        Base: [8, 12],
        Loading: [10, 15],
        Sharpening: [8, 13],
        Taper: [6, 10],
      },
    },
    {
      id: 'recreational',
      max5kSeconds: Infinity,
      phases: {
        Base: [6, 10],
        Loading: [8, 12],
        Sharpening: [7, 11],
        Taper: [5, 8],
      },
    },
  ],

  // Target speed is expressed relative to current 5K pace.
  // Shorter reps may sit at the faster end of the VO2 domain,
  // while longer reps stay more controlled.
  forms: [
    {
      formKey: 'VO2400',
      distanceMeters: 400,
      paceFactor: 0.945,
      recoverySeconds: 60,
      minReps: 4,
      maxReps: 12,
      structure: 'Short',
    },
    {
      formKey: 'VO2600',
      distanceMeters: 600,
      paceFactor: 0.95,
      recoverySeconds: 75,
      minReps: 3,
      maxReps: 9,
      structure: 'Short',
    },
    {
      formKey: 'VO2800',
      distanceMeters: 800,
      paceFactor: 0.96,
      recoverySeconds: 90,
      minReps: 2,
      maxReps: 8,
      structure: 'Medium',
    },
    {
      formKey: 'VO21000',
      distanceMeters: 1000,
      paceFactor: 0.97,
      recoverySeconds: 120,
      minReps: 2,
      maxReps: 6,
      structure: 'Long',
    },
    {
      formKey: 'VO21200',
      distanceMeters: 1200,
      paceFactor: 0.98,
      recoverySeconds: 150,
      minReps: 2,
      maxReps: 5,
      structure: 'Long',
    },
  ],

  repDurationSeconds: {
    minimumPreferred: 90,
    maximumPreferred: 300,
    absoluteMaximum: 315,
  },

  responsePaceAdjustmentSecondsPerKm: {
    'Too much': 5,
    'A little hard': 3,
    Doable: 0,
    Comfortable: 0,
    'Too easy': -3,
  },

  repeatedTooMuchPaceAdjustmentSecondsPerKm: 8,

  phaseStructureFit: {
    Base: { Short: 0.78, Medium: 0.95, Long: 1 },
    Loading: { Short: 0.9, Medium: 1, Long: 0.96 },
    Sharpening: { Short: 1, Medium: 0.96, Long: 0.82 },
    Taper: { Short: 1, Medium: 0.88, Long: 0.68 },
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
