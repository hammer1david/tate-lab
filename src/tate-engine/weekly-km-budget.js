const FLEXIBLE_TYPES = new Set([
  'aerobic',
  'recovery',
  'progressive',
]);

const DEFAULT_FLEXIBLE_WEIGHTS = Object.freeze({
  aerobic: 1.0,
  recovery: 0.8,
  progressive: 1.05,
});

function number(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? parsed
    : fallback;
}

function positiveNumber(value, name) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new TypeError(
      `${name} must be a positive number.`
    );
  }

  return parsed;
}

function nonNegativeNumber(
  value,
  name
) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new TypeError(
      `${name} must be zero or a positive number.`
    );
  }

  return parsed;
}

export function roundKm(
  value,
  step = 0.5
) {
  const km = nonNegativeNumber(
    value,
    'km'
  );
  const roundingStep = positiveNumber(
    step,
    'rounding step'
  );

  return (
    Math.round(km / roundingStep) *
    roundingStep
  );
}

export function qualitySessionTotalKm({
  workKm,
  warmupKm,
  cooldownKm,
  extraKm = 0,
} = {}) {
  return (
    nonNegativeNumber(
      workKm,
      'workKm'
    ) +
    nonNegativeNumber(
      warmupKm,
      'warmupKm'
    ) +
    nonNegativeNumber(
      cooldownKm,
      'cooldownKm'
    ) +
    nonNegativeNumber(
      extraKm,
      'extraKm'
    )
  );
}

export function calculateLongRunKm({
  targetWeeklyKm,
  weeklyShare,
  maxDistanceKm = Infinity,
  roundingStep = 0.5,
} = {}) {
  const weeklyKm = positiveNumber(
    targetWeeklyKm,
    'targetWeeklyKm'
  );

  const share = Number(weeklyShare);

  if (
    !Number.isFinite(share) ||
    share <= 0 ||
    share >= 1
  ) {
    throw new RangeError(
      'weeklyShare must be between 0 and 1.'
    );
  }

  const maxKm =
    maxDistanceKm === Infinity
      ? Infinity
      : positiveNumber(
          maxDistanceKm,
          'maxDistanceKm'
        );

  return roundKm(
    Math.min(
      weeklyKm * share,
      maxKm
    ),
    roundingStep
  );
}

function normalizeSession(
  session,
  index
) {
  const type = String(
    session?.type || ''
  )
    .trim()
    .toLowerCase();

  if (
    ![
      'quality',
      'long_run',
      'aerobic',
      'recovery',
      'progressive',
    ].includes(type)
  ) {
    throw new RangeError(
      `session ${index + 1} has an unsupported type.`
    );
  }

  const id =
    session.id ||
    `session-${index + 1}`;

  const addonKm =
    nonNegativeNumber(
      session.addonKm ?? 0,
      `${id}.addonKm`
    );

  if (!FLEXIBLE_TYPES.has(type)) {
    const fixedKm =
      nonNegativeNumber(
        session.fixedKm,
        `${id}.fixedKm`
      );

    return {
      ...session,
      id,
      type,
      addonKm,
      fixedKm,
      flexible: false,
    };
  }

  const minKm =
    nonNegativeNumber(
      session.minKm ?? 0,
      `${id}.minKm`
    );

  const weight =
    positiveNumber(
      session.weight ??
        DEFAULT_FLEXIBLE_WEIGHTS[type],
      `${id}.weight`
    );

  return {
    ...session,
    id,
    type,
    addonKm,
    minKm,
    weight,
    flexible: true,
  };
}

/**
 * Weekly mileage budget allocator.
 *
 * Priority order:
 * 1. Fixed Quality session km
 * 2. Fixed Long Run km
 * 3. Add-on km (for example Strides on an Aerobic day)
 * 4. Minimum km for flexible Aerobic / Recovery / Progressive days
 * 5. Remaining km distributed by flexible-session weight
 *
 * Quality `fixedKm` must represent the FULL session distance
 * (work + warm-up + cool-down + any extra running).
 * Work-distance alone is intentionally not treated as full weekly mileage.
 */
export function allocateWeeklyKmBudget({
  targetWeeklyKm,
  sessions = [],
  roundingStep = 0.5,
} = {}) {
  const target =
    positiveNumber(
      targetWeeklyKm,
      'targetWeeklyKm'
    );

  const normalized =
    sessions.map(
      normalizeSession
    );

  const fixedSessions =
    normalized.filter(
      session =>
        !session.flexible
    );

  const flexibleSessions =
    normalized.filter(
      session =>
        session.flexible
    );

  const fixedSessionKm =
    fixedSessions.reduce(
      (sum, session) =>
        sum +
        session.fixedKm +
        session.addonKm,
      0
    );

  const flexibleAddonKm =
    flexibleSessions.reduce(
      (sum, session) =>
        sum + session.addonKm,
      0
    );

  const flexibleMinimumKm =
    flexibleSessions.reduce(
      (sum, session) =>
        sum + session.minKm,
      0
    );

  const reservedKm =
    fixedSessionKm +
    flexibleAddonKm +
    flexibleMinimumKm;

  const remainingKm =
    target - reservedKm;

  if (remainingKm < -1e-9) {
    return {
      status: 'over_budget',
      targetWeeklyKm: target,
      reservedKm,
      overByKm:
        Math.round(
          Math.abs(remainingKm) *
            1000
        ) / 1000,
      remainingKm: 0,
      sessions: normalized.map(
        session => ({
          ...session,
          plannedKm:
            session.flexible
              ? session.minKm +
                session.addonKm
              : session.fixedKm +
                session.addonKm,
        })
      ),
    };
  }

  if (
    flexibleSessions.length === 0
  ) {
    const allocatedTotalKm =
      fixedSessionKm;

    return {
      status:
        Math.abs(
          allocatedTotalKm - target
        ) < 1e-9
          ? 'balanced'
          : 'under_budget',
      targetWeeklyKm: target,
      reservedKm,
      remainingKm:
        Math.max(
          0,
          target -
            allocatedTotalKm
        ),
      allocatedTotalKm,
      sessions:
        normalized.map(
          session => ({
            ...session,
            plannedKm:
              session.fixedKm +
              session.addonKm,
          })
        ),
    };
  }

  const totalWeight =
    flexibleSessions.reduce(
      (sum, session) =>
        sum + session.weight,
      0
    );

  const rawFlexible =
    flexibleSessions.map(
      session => ({
        ...session,
        rawBaseKm:
          session.minKm +
          remainingKm *
            (
              session.weight /
              totalWeight
            ),
      })
    );

  const roundedFlexible =
    rawFlexible.map(
      session => ({
        ...session,
        baseKm:
          roundKm(
            session.rawBaseKm,
            roundingStep
          ),
      })
    );

  let roundedTotal =
    fixedSessionKm +
    flexibleAddonKm +
    roundedFlexible.reduce(
      (sum, session) =>
        sum + session.baseKm,
      0
    );

  // Keep the week on target after normal rounding.
  // The adjustment is placed on the largest flexible session.
  const correction =
    Math.round(
      (target -
        roundedTotal) *
        1000
    ) / 1000;

  if (
    Math.abs(correction) >
      1e-9
  ) {
    const adjustable =
      [...roundedFlexible].sort(
        (a, b) =>
          b.baseKm - a.baseKm
      )[0];

    adjustable.baseKm =
      Math.max(
        adjustable.minKm,
        Math.round(
          (
            adjustable.baseKm +
            correction
          ) *
            1000
        ) / 1000
      );
  }

  const plannedById =
    new Map(
      roundedFlexible.map(
        session => [
          session.id,
          session.baseKm +
            session.addonKm,
        ]
      )
    );

  const outputSessions =
    normalized.map(
      session => ({
        ...session,
        plannedKm:
          session.flexible
            ? plannedById.get(
                session.id
              )
            : session.fixedKm +
              session.addonKm,
      })
    );

  const allocatedTotalKm =
    Math.round(
      outputSessions.reduce(
        (sum, session) =>
          sum +
          session.plannedKm,
        0
      ) *
        1000
    ) / 1000;

  return {
    status:
      Math.abs(
        allocatedTotalKm -
          target
      ) < 0.001
        ? 'balanced'
        : allocatedTotalKm >
            target
          ? 'over_budget'
          : 'under_budget',
    targetWeeklyKm: target,
    fixedSessionKm:
      Math.round(
        fixedSessionKm * 1000
      ) / 1000,
    flexibleAddonKm:
      Math.round(
        flexibleAddonKm * 1000
      ) / 1000,
    flexibleMinimumKm:
      Math.round(
        flexibleMinimumKm * 1000
      ) / 1000,
    reservedKm:
      Math.round(
        reservedKm * 1000
      ) / 1000,
    allocatedTotalKm,
    remainingKm:
      Math.max(
        0,
        Math.round(
          (
            target -
            allocatedTotalKm
          ) *
            1000
        ) / 1000
      ),
    sessions: outputSessions,
  };
}
