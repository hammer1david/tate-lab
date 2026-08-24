import { parseTimeToSeconds } from './utils.js';

const normalize = (text) => text
  .replace(/[×*]/g, 'x')
  .replace(/\s+/g, ' ')
  .trim();

function parseRecovery(raw) {
  if (!raw) return { durationSeconds: null, type: 'unknown' };

  const lower = raw.toLowerCase();

  const minMatch = lower.match(/(\d+(?:\.\d+)?)\s*min/);
  const secMatch = lower.match(/(\d+(?:\.\d+)?)\s*(?:sec|s)\b/);

  const durationSeconds = minMatch
    ? Number(minMatch[1]) * 60
    : secMatch
      ? Number(secMatch[1])
      : null;

  let type = 'unknown';

  if (/jog|easy jog/.test(lower)) type = 'jog';
  else if (/walk/.test(lower)) type = 'walk';
  else if (/stand|standing/.test(lower)) type = 'standing';
  else if (/float/.test(lower)) type = 'float';

  return {
    durationSeconds,
    type,
  };
}

function parseDistance(valueRaw, unitRaw) {
  const value = Number(valueRaw);

  if (!Number.isFinite(value)) return null;

  const unit = unitRaw?.toLowerCase();

  if (unit === 'km') return value * 1000;

  if (unit === 'm') return value;

  // Coach shorthand:
  // 5x1000 = 5x1000m
  // But small unit-less values are not interpreted as distance.
  return value >= 100 ? value : null;
}

function parseWorkBlock(segment) {
  const match = segment.match(
    /(\d+)\s*x\s*(\d+(?:\.\d+)?)\s*(m|km)?\b/i
  );

  if (!match) return null;

  const reps = Number(match[1]);

  const distance = parseDistance(
    match[2],
    match[3]
  );

  if (distance == null) return null;

  let targetSeconds = null;

  const inMatch = segment.match(
    /(?:in|@)\s*(\d{1,2}:\d{2}(?:\.\d+)?|\d+(?:\.\d+)?)\s*(?:s|sec)?/i
  );

  if (inMatch) {
    targetSeconds = parseTimeToSeconds(inMatch[1]);
  }

  const recoveryAfterLabel = segment.match(
    /(?:\brest\b|\brecovery\b|\br\b)[:=]?\s*([^,+]+)/i
  );

  const recoveryBeforeLabel = segment.match(
    /(\d+(?:\.\d+)?\s*(?:min|sec|s)\b(?:\s*(?:jog|walk|standing|stand|float))?)\s*(?:rest|recovery)\b/i
  );

  const recoveryAfterSlash = segment.match(
    /\/\s*(\d+(?:\.\d+)?\s*(?:min|sec|s)\b(?:\s*(?:jog|walk|standing|stand|float))?)/i
  );

  const recovery = parseRecovery(
    recoveryBeforeLabel?.[1] ||
    recoveryAfterLabel?.[1] ||
    recoveryAfterSlash?.[1] ||
    ''
  );

  return {
    kind: 'work',
    reps,
    distanceMeters: distance,
    targetSecondsPerRep: targetSeconds,
    recoverySeconds: recovery.durationSeconds,
    recoveryType: recovery.type,
    raw: segment.trim(),
  };
}

export function parseWorkoutText(text) {
  const normalized = normalize(text);

  if (!normalized) {
    return {
      blocks: [],
      warnings: ['No workout text provided.'],
      raw: text,
    };
  }

  const interBlockRegex =
    /(\d+(?:\.\d+)?)\s*(min|sec|s)\s*(jog|walk|standing|stand|float)?\s*(?:rest\s*)?(?:between\s+blocks|between\s+sets)/ig;

  const interBlockMatches = [
    ...normalized.matchAll(interBlockRegex),
  ];

  let stripped = normalized;

  for (const match of interBlockMatches) {
    stripped = stripped.replace(
      match[0],
      ' + '
    );
  }

  const workSegments = stripped
    .split(/\s*\+\s*/)
    .map(s => s.trim())
    .filter(Boolean);

  const workBlocks = workSegments
    .map(parseWorkBlock)
    .filter(Boolean);

  const blocks = [];

  workBlocks.forEach((block, index) => {
    blocks.push(block);

    if (index < workBlocks.length - 1) {
      const source = interBlockMatches[index];

      if (source) {
        const amount = Number(source[1]);
        const unit = source[2].toLowerCase();

        blocks.push({
          kind: 'inter_block_rest',
          durationSeconds:
            unit === 'min'
              ? amount * 60
              : amount,
          type: (source[3] || 'unknown')
            .toLowerCase()
            .replace('stand', 'standing'),
          raw: source[0],
        });
      } else {
        blocks.push({
          kind: 'inter_block_rest',
          durationSeconds: null,
          type: 'unknown',
          raw: '',
        });
      }
    }
  });

  const warnings = [];

  if (!workBlocks.length) {
    warnings.push(
      'No work blocks could be parsed.'
    );
  }

  workBlocks.forEach((b, i) => {
    if (b.targetSecondsPerRep == null) {
      warnings.push(
        `Block ${i + 1}: target time/intensity is unknown.`
      );
    }

    if (b.recoverySeconds == null) {
      warnings.push(
        `Block ${i + 1}: rep recovery duration is unknown.`
      );
    }
  });

  return {
    blocks,
    warnings,
    raw: text,
  };
}
