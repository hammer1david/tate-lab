import { scoringWeights, penalties, learning } from './config.js';
import { clamp } from './utils.js';

export function scoreCandidate(candidate, context, learnedModifier = 1) {
  const fit = candidate.fit;
  const core =
    scoringWeights.needMatch * fit.needMatch +
    scoringWeights.eventPhaseFit * fit.eventPhaseFit +
    scoringWeights.progressionFit * fit.progressionFit +
    scoringWeights.toleranceFit * fit.toleranceFit +
    scoringWeights.stressFit * fit.stressFit +
    scoringWeights.scheduleFit * fit.scheduleFit +
    scoringWeights.secondaryCoverage * fit.secondaryCoverage +
    scoringWeights.practicalityFit * fit.practicalityFit;

  const learnedAdjustment = learning.maxScoreAdjustment * clamp((learnedModifier - 1) / (learning.maxModifier - 1), -1, 1);

  const recentSimilarityPenalty = penalties.recentSimilarityMax *
    fit.workoutSimilarity *
    Math.exp(-context.daysSinceSimilar / penalties.similarityTauDays) *
    (1 - penalties.progressionRepeatRelief * fit.progressionLink);

  const complexityPenalty = penalties.complexityMax * fit.complexity;
  const noveltyPenalty = penalties.noveltyMax * fit.novelty;
  const score = clamp(core + learnedAdjustment - recentSimilarityPenalty - complexityPenalty - noveltyPenalty, 0, 100);

  return {
    score,
    breakdown: {
      needMatch: scoringWeights.needMatch * fit.needMatch,
      eventPhaseFit: scoringWeights.eventPhaseFit * fit.eventPhaseFit,
      progressionFit: scoringWeights.progressionFit * fit.progressionFit,
      toleranceFit: scoringWeights.toleranceFit * fit.toleranceFit,
      stressFit: scoringWeights.stressFit * fit.stressFit,
      scheduleFit: scoringWeights.scheduleFit * fit.scheduleFit,
      secondaryCoverage: scoringWeights.secondaryCoverage * fit.secondaryCoverage,
      practicalityFit: scoringWeights.practicalityFit * fit.practicalityFit,
      learnedAdjustment,
      recentSimilarityPenalty: -recentSimilarityPenalty,
      complexityPenalty: -complexityPenalty,
      noveltyPenalty: -noveltyPenalty,
    },
  };
}
