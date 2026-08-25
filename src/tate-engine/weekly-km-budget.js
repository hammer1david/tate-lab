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

export const QUALITY_WARMUP_COOLDOWN_KM_BY_BAND =
  Object.freeze({
    1: Object.freeze({
      warmupKm: 0.5,
      cooldownKm: 0.5,
      totalKm: 1.0,
    }),
    2: Object.freeze({
      warmupKm: 1.0,
      cooldownKm: 1.0,
      totalKm: 2.0,
    }),
    3: Object.freeze({
      warmupKm: 2.0,
      cooldownKm: 2.0,
      totalKm: 4.0,
    }),
  });

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

export function normalizePerformanceBand(value) {
  const band = Number(value);

  if (![1, 2, 3].includes(band)) {
    throw new RangeError(
      'performanceBand must be 1, 2, or 3.'
    );
  }

  return band;
}

export function roundKm(
  value,
  step = 1
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

export function qualityWarmupCooldownForBand(
  performanceBand
) {
  const band =
    normalizePerformanceBand(
      performanceBand
    );

  return QUALITY_WARMUP_COOLDOWN_KM_BY_BAND[
    band
  ];
}

/**
 * Full mileage counted for a Quality workout.
 *
 * Recovery jogging between reps/blocks is intentionally
 * NOT included in the TWETE weekly-km budget.
 *
 * Band 1:
 *   0.5 km warm-up + 0.5 km cool-down = 1 km
 *
 * Band 2:
 *   1 km warm-up + 1 km cool-down = 2 km
 *
 * Band 3:
 *   2 km warm-up + 2 km cool-down = 4 km
 */
export function qualitySessionTotalKm({
  workKm,
  performanceBand,
  extraKm = 0,
} = {}) {
  const work =
    nonNegativeNumber(
      workKm,
      'workKm'
    );

  const extra =
    nonNegativeNumber(
      extraKm,
      'extraKm'
    );

  const warmupCooldown =
    qualityWarmupCooldownForBand(
      performanceBand
    );

  return (
    work +
    warmupCooldown.totalKm +
    extra
  );
}

/**
 * Long Run mileage is the Long Run itself.
 * No additional warm-up or cool-down is added.
 */
export function calculateLongRunKm({
  targetWeeklyKm,
  weeklyShare,
  maxDistanceKm = Infinity,
  roundingStep = 1,
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
 * 1. Full Quality session km
 *    = work km + band-specific warm-up/cool-down
 *    Recovery jogging inside Quality workouts is excluded.
 * 2. Long Run km
 *    No separate warm-up/cool-down.
 * 3. Add-on km (for example Strides on an Aerobic day)
 * 4. Minimum km for flexible Aerobic / Recovery / Progressive days
 * 5. Remaining km distributed by flexible-session weight
 *
 * `fixedKm` supplied for a Quality session must therefore
 * already be the result of qualitySessionTotalKm().
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
export function allocateWeeklyKmBudget({
  targetWeeklyKm,
  sessions = [],
  roundingStep = 1,
} = {}) {
  const requestedTarget =
    positiveNumber(
      targetWeeklyKm,
      'targetWeeklyKm'
    );

  const target =
    roundKm(
      requestedTarget,
      roundingStep
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

  /*
   * Fixed sessions keep their exact workout
   * structure internally.
   *
   * Only the weekly-km budget / displayed
   * session total is rounded.
   */
  const fixedPlannedKmById =
    new Map(
      fixedSessions.map(
        session => [
          session.id,

          roundKm(
            session.fixedKm +
              session.addonKm,
            roundingStep
          ),
        ]
      )
    );

  const fixedSessionKm =
    [...fixedPlannedKmById.values()]
      .reduce(
        (sum, km) =>
          sum + km,
        0
      );

  const flexibleAddonKm =
    flexibleSessions.reduce(
      (sum, session) =>
        sum +
        session.addonKm,
      0
    );

  const flexibleMinimumKm =
    flexibleSessions.reduce(
      (sum, session) =>
        sum +
        session.minKm,
      0
    );

  const reservedKm =
    fixedSessionKm +
    flexibleAddonKm +
    flexibleMinimumKm;

  const remainingKm =
    target -
    reservedKm;

  if (
    remainingKm <
    -1e-9
  ) {
    const outputSessions =
      normalized.map(
        session => ({
          ...session,

          plannedKm:
            session.flexible
              ? roundKm(
                  session.minKm +
                    session.addonKm,
                  roundingStep
                )
              : fixedPlannedKmById.get(
                  session.id
                ),
        })
      );

    return {
      status:
        'over_budget',

      targetWeeklyKm:
        target,

      requestedTargetWeeklyKm:
        requestedTarget,

      reservedKm,

      overByKm:
        Math.round(
          Math.abs(
            remainingKm
          ) *
            1000
        ) /
        1000,

      remainingKm: 0,

      allocatedTotalKm:
        outputSessions.reduce(
          (sum, session) =>
            sum +
            session.plannedKm,
          0
        ),

      sessions:
        outputSessions,
    };
  }

  if (
    flexibleSessions.length ===
    0
  ) {
    const allocatedTotalKm =
      fixedSessionKm;

    return {
      status:
        Math.abs(
          allocatedTotalKm -
            target
        ) <
        1e-9
          ? 'balanced'
          : 'under_budget',

      targetWeeklyKm:
        target,

      requestedTargetWeeklyKm:
        requestedTarget,

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
              fixedPlannedKmById.get(
                session.id
              ),
          })
        ),
    };
  }

  const totalWeight =
    flexibleSessions.reduce(
      (sum, session) =>
        sum +
        session.weight,
      0
    );

  /*
   * Add-on distance is part of the final
   * session total before rounding.
   *
   * Example:
   * Aerobic 13.4 km
   * + Strides 0.6 km
   * = displayed/planned 14 km.
   */
  const rawFlexible =
    flexibleSessions.map(
      session => ({
        ...session,

        rawPlannedKm:
          session.minKm +
          session.addonKm +
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

        plannedKm:
          roundKm(
            session.rawPlannedKm,
            roundingStep
          ),
      })
    );

  let roundedTotal =
    fixedSessionKm +
    roundedFlexible.reduce(
      (sum, session) =>
        sum +
        session.plannedKm,
      0
    );

  /*
   * Individual rounding can leave the
   * week ±1 or ±2 km away from target.
   *
   * Close that difference on the
   * largest flexible session.
   */
  const correction =
    target -
    roundedTotal;

  if (
    Math.abs(
      correction
    ) >
    1e-9
  ) {
    const adjustable =
      [...roundedFlexible]
        .sort(
          (a, b) =>
            b.plannedKm -
            a.plannedKm
        )[0];

    const minimumPlannedKm =
      roundKm(
        adjustable.minKm +
          adjustable.addonKm,
        roundingStep
      );

    adjustable.plannedKm =
      Math.max(
        minimumPlannedKm,

        adjustable.plannedKm +
          correction
      );

    roundedTotal =
      fixedSessionKm +
      roundedFlexible.reduce(
        (sum, session) =>
          sum +
          session.plannedKm,
        0
      );
  }

  const plannedById =
    new Map(
      roundedFlexible.map(
        session => [
          session.id,
          session.plannedKm,
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
            : fixedPlannedKmById.get(
                session.id
              ),
      })
    );

  const allocatedTotalKm =
    outputSessions.reduce(
      (sum, session) =>
        sum +
        session.plannedKm,
      0
    );

  return {
    status:
      Math.abs(
        allocatedTotalKm -
          target
      ) <
      0.001
        ? 'balanced'
        : allocatedTotalKm >
            target
          ? 'over_budget'
          : 'under_budget',

    targetWeeklyKm:
      target,

    requestedTargetWeeklyKm:
      requestedTarget,

    fixedSessionKm,

    flexibleAddonKm:
      Math.round(
        flexibleAddonKm *
          1000
      ) /
      1000,

    flexibleMinimumKm:
      Math.round(
        flexibleMinimumKm *
          1000
      ) /
      1000,

    reservedKm:
      Math.round(
        reservedKm *
          1000
      ) /
      1000,

    allocatedTotalKm,

    remainingKm:
      Math.max(
        0,
        target -
          allocatedTotalKm
      ),

    sessions:
      outputSessions,
  };
}
