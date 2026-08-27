import {
  formatMaterializedWorkout,
  loadWorkoutLibrary,
  materializeWorkout,
} from './tate-engine/database-library.js';

import {
  SLOT_SECTIONS,
  SECONDARY_TARGET_LABELS,
  TRAINING_PHASE_LABELS,
  buildGoalPlan,
} from './tate-engine/slot-planner.js';

import {
  DAY_ROLE_LABELS,
  DAY_ROLES,
  WEEKDAYS,
  WEEKDAY_LABELS,
  blankWeekRule,
  schedulePlanIntoWeeks,
} from './tate-engine/week-scheduler.js';

import {
  TWETE_DAILY_FEEDBACK_LABELS,
  TWETE_DAILY_FEEDBACK_OPTIONS,
  buildFeedbackAdaptation,
  calendarDayKey,
  validateTweteDailyFeedback,
  missedSessionPolicy,
} from './tate-engine/daily-feedback-simulator.js';

import {
  applyWeeklyKmPlanToSchedule,
} from './tate-engine/weekly-plan-km.js';

import {
  applyWeeklyWorkoutProgressionToSchedule,
} from './tate-engine/progression-machine.js';

const LAB_VERSION = '0.6.2-detailed-weekly-workouts';
const $ = id => document.getElementById(id);

let workoutLibrary = [];
let weekRuleState = blankWeekRule(1).days;
let dailyFeedbackState = {
  cursor: 0,
  history: [],
  completedSlots: new Set(),
  completedDays: new Map(),
  missedMakeupSlots: new Set(),
};

let lastSimulation = null;

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function readScores() {
  return Object.fromEntries(
    SLOT_SECTIONS.map(section => [
      section,
      Number(
        document.querySelector(
          `[data-score="${section}"]`
        ).value
      ),
    ])
  );
}

function trainingDaysPerWeek() {
  return WEEKDAYS.filter(
    day =>
      weekRuleState[day] !==
      DAY_ROLES.UNAVAILABLE
  ).length;
}

function currentWeekRule() {
  return {
    week: 1,
    days: { ...weekRuleState },
  };
}

function hasLongRunDay() {
  return WEEKDAYS.some(
    day =>
      weekRuleState[day] ===
      DAY_ROLES.LONG_RUN
  );
}

function renderWeekRuleEditor() {
  const target = $('week-rules');
  const count = trainingDaysPerWeek();

  $('training-days-count').textContent =
    `${count} Training Day${count === 1 ? '' : 's'} / Week`;

  target.innerHTML = `
    <div
      style="
        display:grid;
        grid-template-columns:repeat(7,minmax(124px,1fr));
        gap:8px;
        overflow-x:auto;
      "
    >
      ${WEEKDAYS.map(day => {
        const role =
          weekRuleState[day] ||
          DAY_ROLES.EASY;

        const enabled =
          role !== DAY_ROLES.UNAVAILABLE;

        const activeRole = enabled
          ? role
          : DAY_ROLES.EASY;

        return `
          <div
            class="library-role"
            style="min-width:124px;"
          >
            <label
              style="
                display:flex;
                align-items:center;
                gap:8px;
                margin-bottom:10px;
              "
            >
              <input
                type="checkbox"
                data-training-day
                data-day="${day}"
                ${enabled ? 'checked' : ''}
                style="width:auto;"
              />

              <strong style="color:var(--text);">
                ${WEEKDAY_LABELS[day]}
              </strong>
            </label>

            <select
              data-day-role
              data-day="${day}"
              ${enabled ? '' : 'disabled'}
            >
              <option
                value="easy"
                ${activeRole === DAY_ROLES.EASY ? 'selected' : ''}
              >
                Easy
              </option>

              <option
                value="workout"
                ${activeRole === DAY_ROLES.WORKOUT ? 'selected' : ''}
              >
                Workout Day
              </option>

              <option
                value="long_run"
                ${activeRole === DAY_ROLES.LONG_RUN ? 'selected' : ''}
              >
                Long Run Day
              </option>
            </select>

            <div
              class="muted"
              style="margin-top:7px;"
            >
              ${
                enabled
                  ? escapeHtml(DAY_ROLE_LABELS[activeRole])
                  : escapeHtml(
                      DAY_ROLE_LABELS[
                        DAY_ROLES.UNAVAILABLE
                      ]
                    )
              }
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function renderLibrary() {
  const target = $('workout-library');

  if (!workoutLibrary.length) {
    target.innerHTML = `
      <div class="empty-state">
        No active 10K workouts found in Supabase.
      </div>
    `;
    return;
  }

  const byStimulus = Map.groupBy
    ? Map.groupBy(
        workoutLibrary,
        workout => workout.stimulus
      )
    : workoutLibrary.reduce(
        (map, workout) => {
          const list =
            map.get(workout.stimulus) || [];

          list.push(workout);
          map.set(workout.stimulus, list);
          return map;
        },
        new Map()
      );

  target.innerHTML =
    [...byStimulus.entries()]
      .map(([stimulus, workouts]) => {
        const priority = workouts.filter(
          workout => workout.role === 'priority'
        );
        const coverage = workouts.filter(
          workout => workout.role === 'coverage'
        );

        const renderGroup = (
          title,
          items
        ) => `
          <div class="library-role">
            <div class="role-title">
              ${title}
            </div>

            ${
              items.length
                ? items
                    .map(
                      workout => `
                        <div class="library-workout">
                          <div>
                            <strong>
                              ${escapeHtml(workout.id)}
                            </strong>

                            <span class="tag">
                              ${escapeHtml(workout.structureType)}
                            </span>
                          </div>

                          <div class="muted">
                            ${escapeHtml(workout.status)}
                            · ${workout.blocks.length}
                            block${workout.blocks.length === 1 ? '' : 's'}
                          </div>
                        </div>
                      `
                    )
                    .join('')
                : '<div class="muted">None</div>'
            }
          </div>
        `;

        return `
          <article class="library-section">
            <div class="stimulus-heading">
              <h3>${escapeHtml(stimulus)}</h3>
              <span>
                ${workouts.length}
                workout${workouts.length === 1 ? '' : 's'}
              </span>
            </div>

            <div class="library-columns">
              ${renderGroup('Priority', priority)}
              ${renderGroup('Coverage', coverage)}
            </div>
          </article>
        `;
      })
      .join('');
}

function renderAllocation(counts) {
  $('allocation-summary').innerHTML =
    counts
      .map(
        item => `
          <div class="allocation-chip">
            <strong>${escapeHtml(item.section)}</strong>
            <span>${item.count}</span>
          </div>
        `
      )
      .join('');
}

function renderSecondarySummary(plan) {
  const target = $('secondary-summary');
  const summary = plan.secondarySummary || {};

  const rows = [
    ['Normal Aerobic', summary.normalAerobic || 0],
    ['Long Run', summary.longRun || 0],
    ['Strides', summary.strides || 0],
    ['Progressive', summary.progressive || 0],
    ['Threshold', summary.threshold || 0],
    ['Race Specific', summary.raceSpecific || 0],
    ['Durability', summary.durability || 0],
    ['VO₂max', summary.vo2max || 0],
    ['Speed', summary.speed || 0],
    ['Sprint', summary.sprint || 0],
    ['Hill Work', summary.hillWork || 0],
  ];

  target.innerHTML = `
    <div class="allocation-summary">
      ${rows
        .filter(([, value]) => value > 0)
        .map(
          ([label, value]) => `
            <div class="allocation-chip">
              <strong>${escapeHtml(label)}</strong>
              <span>${value}</span>
            </div>
          `
        )
        .join('')}
    </div>
  `;
}

function readWeeklyKm() {
  const value = Number(
    $('weekly-km')?.value
  );

  return Number.isFinite(value) && value > 0
    ? value
    : null;
}

function numberOrNull(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? parsed
    : null;
}

function roundHalfKm(value) {
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 2) / 2;
}

function dynamicPhaseKey(phase) {
  return phase === 'tapering'
    ? 'taper'
    : phase;
}

function plannedDistanceKm(
  workout,
  {
    weeklyKm,
    trainingDays,
    phase,
  }
) {
  if (
    !workout ||
    !Number.isFinite(weeklyKm) ||
    weeklyKm <= 0
  ) {
    return null;
  }

  const config = workout.dynamicConfig || {};

  if (
    workout.dynamicType === 'aerobic' ||
    workout.dynamicType === 'progressive'
  ) {
    const days = Math.max(
      1,
      Number(trainingDays) || 1
    );
    const baselineDayKm = weeklyKm / days;

    const distanceProfile =
      (config.distanceProfiles || []).find(
        item =>
          item.distance_mode === 'normal'
      ) ||
      config.distanceProfiles?.[0];

    const multiplier =
      numberOrNull(
        distanceProfile?.multiplier_default
      ) ?? 1;

    return roundHalfKm(
      baselineDayKm * multiplier
    );
  }

  if (workout.dynamicType === 'long_run') {
    const phaseKey = dynamicPhaseKey(phase);

    const phaseRule =
      (config.phaseRules || []).find(
        item =>
          item.active !== false &&
          item.phase === phaseKey
      ) ||
      (config.phaseRules || []).find(
        item =>
          item.active !== false &&
          item.phase === 'base'
      ) ||
      config.phaseRules?.[0];

    const share = numberOrNull(
      phaseRule?.weekly_km_share_default
    );

    if (!Number.isFinite(share)) {
      return null;
    }

    let distance = weeklyKm * share;

    const maxDistance = numberOrNull(
      phaseRule?.max_distance_km
    );

    if (Number.isFinite(maxDistance)) {
      distance = Math.min(
        distance,
        maxDistance
      );
    }

    return roundHalfKm(distance);
  }

  return null;
}

function materializedAssignmentDetails(
  assignment,
  {
    plan,
    scores,
    current10k,
    progressiveSlots,
    kmPlan,
  }
) {
  if (
    !assignment ||
    assignment.status === 'missing' ||
    !assignment.workout
  ) {
    return null;
  }

  const athlete = {
  score:
    scores[assignment.primaryAnchor] ?? 50,

  current10k,
  phase: plan.phase,

  longRunProgressive:
    progressiveSlots.has(
      assignment.slot
    ),

  aerobicDistanceMode:
    assignment.aerobicDistanceMode,

  aerobicPaceLevel:
    assignment.aerobicPaceLevel,

  aerobicDistanceMultiplier:
    assignment.aerobicDistanceMultiplier,

  longRunShareMode:
    assignment.longRunShareMode,

  longRunWeeklyShare:
    assignment.longRunWeeklyShare,
};

  const workout =
  assignment
    .progressionMaterialized ??
  materializeWorkout(
    assignment.workout,
    athlete
  );

  const plannedKm =
    kmPlan?.plannedKmBySlot?.get(
      assignment.slot
    );

  const progressionLine =
  assignment.progressionDecision
    ? (
        `TATE ${
          assignment
            .progressionDecision
            .toUpperCase()
        }` +
        (
          assignment
            .progressionResult
            ?.changed &&
          assignment
            .progressionResult
            ?.lever
            ? ` · ${
                assignment
                  .progressionResult
                  .lever
              }`
            : ' · unchanged'
        )
      )
    : null;


const lines = [
  ...(progressionLine
    ? [progressionLine]
    : []),

  ...(Number.isFinite(plannedKm)
    ? [
        `${plannedKm} km planned session total`,
      ]
    : []),

  ...formatMaterializedWorkout(
    workout
  ),
];

  let addon = null;

  if (
    assignment.addonStatus === 'assigned' &&
    assignment.addonWorkout
  ) {
    const addonWorkout = materializeWorkout(
      assignment.addonWorkout,
      athlete
    );

    addon = {
      workout: addonWorkout,
      lines:
        formatMaterializedWorkout(
          addonWorkout
        ),
    };
  }

  return {
    workout,
    lines,
    addon,
  };
}

function workoutLinesMarkup(lines = []) {
  if (!lines.length) return '';

  return `
    <div
      class="workout-lines"
      style="margin-top:8px;"
    >
      ${lines
        .map(
          line => `
            <div>${escapeHtml(line)}</div>
          `
        )
        .join('')}
    </div>
  `;
}

function sessionTitle(assignment) {
  if (!assignment) return 'No session';

  const selected =
    assignment.selectedStimulus ||
    assignment.primaryAnchor ||
    assignment.stimulus;

  if (
    assignment.secondaryTarget === 'strides'
  ) {
    return assignment.addonStatus === 'assigned'
      ? `${selected} + Strides`
      : selected || 'Aerobic';
  }

  if (assignment.secondaryTarget) {
    const secondaryLabel =
      SECONDARY_TARGET_LABELS[
        assignment.secondaryTarget
      ];

    if (secondaryLabel) return secondaryLabel;
  }

  return selected || 'Session';
}

function resetDailyFeedbackSimulation() {
  dailyFeedbackState = {
    cursor: 0,
    history: [],
    completedSlots: new Set(),
    completedDays: new Map(),
    missedMakeupSlots: new Set(),
  };

  lastSimulation = null;
}

function flattenScheduleDays(schedule) {
  return schedule.weeks.flatMap(
    week =>
      week.days.map(
        (day, dayIndex) => ({
          week: week.week,
          day,
          key: calendarDayKey(
            week.week,
            day.day
          ),
          calendarIndex:
            (week.week - 1) * 7 +
            dayIndex,
        })
      )
  );
}

function recoveryWorkoutFromLibrary() {
  return (
    workoutLibrary.find(
      workout =>
        workout.active !== false &&
        workout.dynamicType === 'recovery'
    ) || null
  );
}

function applyRecoveryOverrides(
  schedule,
  adaptation
) {
  const recoveryWorkout =
    recoveryWorkoutFromLibrary();

  if (!recoveryWorkout) return schedule;

  for (const item of flattenScheduleDays(schedule)) {
    if (
      !adaptation.forceRecoveryKeys.has(item.key) ||
      !item.day.assignment ||
      item.day.placementType !== 'easy'
    ) {
      continue;
    }

    item.day.assignment = {
      ...item.day.assignment,
      secondaryTarget: null,
      selectedStimulus: 'Recovery',
      selectionMode: 'feedback_override',
      workout: recoveryWorkout,
      reason:
        adaptation.adaptationReasons[item.key] ||
        'TWETE Daily Feedback converted this Aerobic slot to Recovery.',
    };

    item.day.placementReason =
      adaptation.adaptationReasons[item.key] ||
      'TWETE Daily Feedback converted this Aerobic slot to Recovery.';
  }

  return schedule;
}

function mergeCompletedDays(schedule) {
  for (const item of flattenScheduleDays(schedule)) {
    const completed =
      dailyFeedbackState.completedDays.get(item.key);

    if (!completed) continue;

    Object.assign(
      item.day,
      completed.day,
      {
        simulated: true,
        feedback: completed.feedback,
      }
    );
  }

  for (const week of schedule.weeks) {
    week.scheduledTrainingDays =
      week.days.filter(day => day.assignment).length;

    week.hasLongRun = week.days.some(
      day => day.placementType === 'long_run'
    );

    week.hasSpeed = week.days.some(
      day => day.placementType === 'speed'
    );
  }

  return schedule;
}

function progressiveSlotsFor(
  schedule,
  adaptation
) {
  const result = new Set();

  for (const item of flattenScheduleDays(schedule)) {
    if (
      adaptation.progressiveLongRunKeys.has(item.key) &&
      item.day.assignment?.slot
    ) {
      result.add(item.day.assignment.slot);
    }
  }

  return result;
}

function currentSimulationDay(schedule) {
  return (
    flattenScheduleDays(schedule).find(
      item =>
        item.calendarIndex ===
        dailyFeedbackState.cursor
    ) || null
  );
}

function feedbackText(feedback) {
  if (!feedback) return '—';

  const feeling =
    TWETE_DAILY_FEEDBACK_LABELS.feeling[
      feedback.feeling
    ] || feedback.feeling;

  const difficulty =
    feedback.training_difficulty
      ? TWETE_DAILY_FEEDBACK_LABELS
          .training_difficulty[
            feedback.training_difficulty
          ] || feedback.training_difficulty
      : '—';

  const completion =
    TWETE_DAILY_FEEDBACK_LABELS
      .completion_status[
        feedback.completion_status
      ] || feedback.completion_status;

  return (
    `Feeling ${feeling} · ` +
    `Training ${difficulty} · ` +
    `Completion ${completion} · ` +
    `Pain ${feedback.pain_severity}/10`
  );
}

function optionMarkup(values, labels) {
  return values
    .map(
      value => `
        <option value="${value}">
          ${escapeHtml(labels[value])}
        </option>
      `
    )
    .join('');
}

function renderDailyFeedbackPanel(
  schedule,
  adaptation
) {
  const current = currentSimulationDay(schedule);
  const totalDays = schedule.weeks.length * 7;
  const balance = adaptation?.feedbackBalance ?? 0;

  if (!current) {
    return `
      <div class="empty-state">
        <strong>Daily Feedback Simulation complete</strong>
        <br />
        ${dailyFeedbackState.history.length} TWETE check-ins processed.
        <br /><br />
        <button
          type="button"
          class="ghost-btn"
          data-feedback-reset
        >
          Reset Daily Simulation
        </button>
      </div>
    `;
  }

  const assignment = current.day.assignment;
  const planned = assignment
    ? `${sessionTitle(assignment)} · ${assignment.workout?.id || 'Assigned'}`
    : current.day.available
      ? 'Rest Day'
      : 'Unavailable / Rest';

  return `
    <div
      class="library-section"
      style="border-style:dashed;"
    >
      <div class="stimulus-heading">
        <h3>TWETE Daily Feedback Simulator</h3>
        <span>
          Day ${dailyFeedbackState.cursor + 1}/${totalDays}
          · Lab feedback balance ${balance > 0 ? '+' : ''}${balance}
        </span>
      </div>

      <div class="workout-meta">
        Week ${current.week}
        · ${WEEKDAY_LABELS[current.day.day]}
        · ${escapeHtml(planned)}
      </div>

      <div
        class="simulation-grid"
        style="margin-top:14px;"
      >
        <label>
          How do you feel?
          <select data-feedback-field="feeling">
            ${optionMarkup(
              TWETE_DAILY_FEEDBACK_OPTIONS.feeling,
              TWETE_DAILY_FEEDBACK_LABELS.feeling
            )}
          </select>
        </label>

        <label>
          How was your training?
          <select data-feedback-field="training_difficulty">
            ${optionMarkup(
              TWETE_DAILY_FEEDBACK_OPTIONS.training_difficulty,
              TWETE_DAILY_FEEDBACK_LABELS.training_difficulty
            )}
          </select>
        </label>

        <label>
          Did you complete today’s training?
          <select data-feedback-field="completion_status">
            ${optionMarkup(
              TWETE_DAILY_FEEDBACK_OPTIONS.completion_status,
              TWETE_DAILY_FEEDBACK_LABELS.completion_status
            )}
          </select>
        </label>

        <label>
          Pain level (0–10)
          <input
            type="range"
            min="0"
            max="10"
            value="0"
            step="1"
            data-feedback-field="pain_severity"
          />
        </label>

        <label>
          Where is the pain?
          <input
            type="text"
            maxlength="120"
            placeholder="e.g. Achilles, calf, knee"
            data-feedback-field="pain_area"
          />
        </label>

        <label>
          Anything else? (optional)
          <textarea
            rows="2"
            maxlength="1000"
            placeholder="Add anything Puri should know..."
            data-feedback-field="optional_comment"
          ></textarea>
        </label>
      </div>

      <div
        class="muted"
        data-feedback-error
        style="margin-top:10px;"
      ></div>

      <div
        style="
          display:flex;
          gap:8px;
          flex-wrap:wrap;
          margin-top:12px;
        "
      >
        <button
          type="button"
          class="primary-btn"
          data-feedback-submit
        >
          Submit TWETE Daily Feedback
        </button>

        <button
          type="button"
          class="ghost-btn"
          data-feedback-reset
        >
          Reset
        </button>
      </div>

      <div
        class="muted"
        style="margin-top:10px;"
      >
        Lab-only: these fields match TWETE's real Daily Check-in payload.
        Past days stay frozen and only the future plan is re-scheduled.
      </div>
    </div>
  `;
}

function renderWeeklySchedule(
  schedule,
  adaptation,
  displayContext
) {
  const target = $('weekly-plan');
  const current = currentSimulationDay(schedule);

  const weekMarkup = schedule.weeks
    .map(week => {
      const kmWeek =
        displayContext
          ?.kmPlan
          ?.weeks
          ?.find(
            item =>
              item.week === week.week
          );

      return `
      <article class="library-section">
        <div class="stimulus-heading">
          <h3>Week ${week.week}</h3>

          <span>
            ${week.scheduledTrainingDays}/${week.trainingDays}
            selected training days used
            ${week.hasLongRun ? ' · Long Run planned' : ''}
            ${week.hasSpeed ? ' · Speed planned' : ''}
            ${
              kmWeek
                ? ` · ${kmWeek.plannedKm}/${kmWeek.targetWeeklyKm} km planned`
                : ''
            }
            ${
              kmWeek?.status === 'incomplete'
                ? ' · KM ESTIMATE INCOMPLETE'
                : ''
            }
          </span>
        </div>

        <div
          style="
            display:grid;
            grid-template-columns:repeat(7,minmax(230px,1fr));
            gap:8px;
            overflow-x:auto;
          "
        >
          ${week.days
            .map(day => {
              const assignment = day.assignment;
              const dayKey = calendarDayKey(
                week.week,
                day.day
              );
              const completed =
                dailyFeedbackState.completedDays.get(dayKey);
              const isCurrent = current?.key === dayKey;

              const dbStatus = assignment
                ? assignment.status === 'missing'
                  ? 'DATABASE GAP'
                  : assignment.workout?.id || 'Assigned'
                : day.available
                  ? 'Rest'
                  : 'Unavailable';

              const dayLabel = assignment
                ? DAY_ROLE_LABELS[day.effectiveRole]
                : day.available
                  ? 'Rest Day'
                  : 'Unavailable';

              const adaptationReason =
                adaptation?.adaptationReasons?.[dayKey] || null;

              const details =
                assignment && displayContext
                  ? materializedAssignmentDetails(
                      assignment,
                      displayContext
                    )
                  : null;

              return `
                <div
                  class="library-role"
                  style="
                    min-width:230px;
                    ${isCurrent ? 'outline:2px solid var(--accent);' : ''}
                    ${completed ? 'opacity:0.78;' : ''}
                  "
                >
                  <div class="role-title">
                    ${WEEKDAY_LABELS[day.day]}
                    · ${escapeHtml(dayLabel)}
                  </div>

                  ${
                    isCurrent
                      ? `
                        <div
                          class="status-pill success"
                          style="margin-bottom:7px;"
                        >
                          CURRENT DAY
                        </div>
                      `
                      : ''
                  }

                  ${
                    completed
                      ? `
                        <div
                          class="status-pill"
                          style="margin-bottom:7px;"
                        >
                          COMPLETED DAY
                        </div>
                      `
                      : ''
                  }

                  <div>
                    <strong>
                      ${escapeHtml(
                        assignment
                          ? sessionTitle(assignment)
                          : 'Rest'
                      )}
                    </strong>
                  </div>

                  <div class="muted">
                    ${escapeHtml(dbStatus)}
                  </div>

                  ${
                    details
                      ? workoutLinesMarkup(
                          details.lines
                        )
                      : ''
                  }

                  ${
                    details?.addon
                      ? `
                        <div
                          style="
                            margin-top:10px;
                            padding-top:9px;
                            border-top:1px solid var(--border);
                          "
                        >
                          <div
                            style="
                              font-weight:700;
                              margin-bottom:4px;
                            "
                          >
                            + Strides after Aerobic
                          </div>

                          <div class="muted">
                            ${escapeHtml(
                              assignment.addonWorkout.id
                            )}
                          </div>

                          ${workoutLinesMarkup(
                            details.addon.lines
                          )}
                        </div>
                      `
                      : ''
                  }

                  ${
                    assignment?.addonStatus === 'missing'
                      ? `
                        <div
                          class="error-text"
                          style="
                            margin-top:9px;
                            font-weight:700;
                          "
                        >
                          STRIDES ADD-ON DATABASE GAP
                        </div>
                      `
                      : ''
                  }

                  ${
                    assignment?.addonStatus ===
                    'blocked_primary_missing'
                      ? `
                        <div
                          class="error-text"
                          style="
                            margin-top:9px;
                            font-weight:700;
                          "
                        >
                          STRIDES BLOCKED — AEROBIC WORKOUT MISSING
                        </div>
                      `
                      : ''
                  }

                  ${
                    day.missedLabel
                      ? `
                        <div
                          class="error-text"
                          style="
                            margin-top:7px;
                            font-weight:700;
                          "
                        >
                          ${escapeHtml(day.missedLabel)}
                        </div>
                      `
                      : ''
                  }

                  ${
                    day.feedback
                      ? `
                        <div
                          class="muted"
                          style="margin-top:7px;"
                        >
                          ${escapeHtml(feedbackText(day.feedback))}
                        </div>
                      `
                      : ''
                  }

                  ${
                    day.placementReason
                      ? `
                        <div
                          class="muted"
                          style="margin-top:6px;"
                        >
                          ${escapeHtml(day.placementReason)}
                        </div>
                      `
                      : ''
                  }

                  ${
                    adaptationReason
                      ? `
                        <div
                          class="muted"
                          style="margin-top:7px;"
                        >
                          TATE update:
                          ${escapeHtml(adaptationReason)}
                        </div>
                      `
                      : ''
                  }
                </div>
              `;
            })
            .join('')}
        </div>

        ${
          week.unscheduled.length
            ? `
              <div
                class="empty-state error-text"
                style="margin-top:12px;"
              >
                <strong>SCHEDULE GAP</strong>
                <br />
                ${week.unscheduled
                  .map(
                    item => `
                      ${escapeHtml(sessionTitle(item.assignment))}:
                      ${escapeHtml(item.reason)}
                    `
                  )
                  .join('<br />')}
              </div>
            `
            : ''
        }
      </article>
      `;
    })
    .join('');

  const gapMarkup = schedule.unscheduled.length
    ? `
      <div class="empty-state error-text">
        <strong>SCHEDULE GAP</strong>
        <br />
        ${schedule.unscheduled
          .map(
            item => `
              ${escapeHtml(sessionTitle(item.assignment))}:
              ${escapeHtml(item.reason)}
            `
          )
          .join('<br />')}
      </div>
    `
    : '';

  target.innerHTML =
    renderDailyFeedbackPanel(
      schedule,
      adaptation
    ) +
    weekMarkup +
    gapMarkup;
}

function renderPlan(
  plan,
  schedule,
  simulationContext = {}
) {
  renderAllocation(plan.counts);
  renderSecondarySummary(plan);

  const scores = readScores();
  const current10k = $('current-10k').value;
  const weeklyKm = readWeeklyKm();
  const progressiveSlots =
    simulationContext.progressiveSlots || new Set();

  const displayContext = {
    plan,
    scores,
    current10k,
    weeklyKm,
    progressiveSlots,
    trainingDays:
      schedule.trainingDaysPerWeek,
    kmPlan:
      simulationContext.kmPlan || null,
  };

  renderWeeklySchedule(
    schedule,
    simulationContext.adaptation,
    displayContext
  );

  $('goal-plan').innerHTML = plan.assignments
    .map(assignment => {
      const secondary = assignment.secondaryTarget
        ? SECONDARY_TARGET_LABELS[
            assignment.secondaryTarget
          ] || assignment.secondaryTarget
        : null;

      if (assignment.status === 'missing') {
        return `
          <article class="slot-card missing">
            <div class="slot-index">
              ${assignment.slot}
            </div>

            <div class="slot-main">
              <div class="slot-topline">
                <strong>
                  ${escapeHtml(assignment.primaryAnchor)}
                </strong>

                <span class="missing-badge">
                  DATABASE GAP
                </span>
              </div>

              ${
                secondary
                  ? `
                    <div class="workout-meta">
                      Secondary need:
                      ${escapeHtml(secondary)}
                    </div>
                  `
                  : ''
              }

              <div class="missing-title">
                NO ELIGIBLE DATABASE WORKOUT
              </div>

              ${
                assignment.addonStatus ===
                'blocked_primary_missing'
                  ? `
                    <div
                      class="error-text"
                      style="margin-bottom:8px;"
                    >
                      Strides are blocked because the Aerobic
                      Primary workout is missing.
                    </div>
                  `
                  : ''
              }

              <div class="muted">
                ${escapeHtml(assignment.reason)}
              </div>
            </div>
          </article>
        `;
      }

      const details =
        materializedAssignmentDetails(
          assignment,
          displayContext
        );

      const workout = details.workout;
      const lines = details.lines;

      return `
        <article class="slot-card">
          <div class="slot-index">
            ${assignment.slot}
          </div>

          <div class="slot-main">
            <div class="slot-topline">
              <strong>
                ${escapeHtml(assignment.primaryAnchor)}
              </strong>

              <span
                class="role-badge ${assignment.workout.role}"
              >
                ${escapeHtml(assignment.workout.role)}
              </span>
            </div>

            ${
              secondary
                ? `
                  <div class="workout-meta">
                    Secondary need:
                    ${escapeHtml(secondary)}
                    · Mode:
                    ${escapeHtml(assignment.selectionMode)}
                  </div>
                `
                : `
                  <div class="workout-meta">
                    Mode: Primary
                  </div>
                `
            }

            <div class="workout-id">
              ${escapeHtml(assignment.workout.id)}
            </div>

            <div class="workout-meta">
              Athlete score ${workout.athleteScore}
              · Band ${workout.performanceBand}
              · Group ${workout.scoreGroup}
            </div>

            ${workoutLinesMarkup(lines)}

            ${
              details.addon
                ? `
                  <div
                    style="
                      margin-top:14px;
                      padding-top:12px;
                      border-top:1px solid var(--border);
                    "
                  >
                    <div class="workout-id">
                      + STRIDES AFTER AEROBIC
                    </div>

                    <div class="workout-meta">
                      ${escapeHtml(
                        assignment.addonWorkout.id
                      )}
                      · same training day
                      · no additional slot
                    </div>

                    ${workoutLinesMarkup(
                      details.addon.lines
                    )}
                  </div>
                `
                : ''
            }

            ${
              assignment.addonStatus === 'missing'
                ? `
                  <div
                    class="error-text"
                    style="
                      margin-top:12px;
                      font-weight:700;
                    "
                  >
                    STRIDES ADD-ON DATABASE GAP —
                    Aerobic remains scheduled.
                  </div>
                `
                : ''
            }

            <div class="selection-reason">
              ${escapeHtml(assignment.reason)}
            </div>
          </div>
        </article>
      `;
    })
    .join('');

  const missing = plan.assignments.filter(
    item => item.status === 'missing'
  ).length;

  const phaseLabel =
    TRAINING_PHASE_LABELS[plan.phase] || plan.phase;

  const scheduleGaps = schedule.unscheduledCount;

  const parts = [
    phaseLabel,
    `${plan.slotCount} slots`,
    `${schedule.trainingDaysPerWeek} training days/week`,
    simulationContext.kmPlan
      ? `km targets ${simulationContext.kmPlan.weeks
          .map(item => item.targetWeeklyKm)
          .join(' → ')}`
      : Number.isFinite(weeklyKm)
        ? `${weeklyKm} km start`
        : 'weekly km not set',
    `${missing} database gap${missing === 1 ? '' : 's'}`,
    `${scheduleGaps} schedule gap${scheduleGaps === 1 ? '' : 's'}`,
    `${dailyFeedbackState.history.length} feedback day${dailyFeedbackState.history.length === 1 ? '' : 's'}`,
  ];

  $('plan-status').textContent = parts.join(' · ');
}

function longRunPhaseRuleFor(phase) {
  const phaseKey =
    phase === 'tapering'
      ? 'taper'
      : phase;

  const longRunWorkout = workoutLibrary.find(
    workout =>
      workout.active !== false &&
      workout.dynamicType === 'long_run'
  );

  return (
    longRunWorkout
      ?.dynamicConfig
      ?.phaseRules
      ?.find(
        rule =>
          rule.active !== false &&
          rule.phase === phaseKey
      ) || null
  );
}

function buildSimulation() {
  const slotCount = Number(
    $('slot-count').value
  );
  const phase = $('training-phase').value;
  const scores = readScores();

  const longRunPhaseRule =
    longRunPhaseRuleFor(phase);

  const longRunAllowed = longRunPhaseRule
    ? longRunPhaseRule.long_run_allowed !== false &&
      Number(
        longRunPhaseRule.sessions_per_week ?? 1
      ) === 1
    : true;

  renderWeekRuleEditor();

  const trainingDays = trainingDaysPerWeek();
  const estimatedWeeks = trainingDays > 0
    ? Math.max(
        1,
        Math.ceil(slotCount / trainingDays)
      )
    : 1;

  const plan = buildGoalPlan({
    event: '10K',
    phase,
    slotCount,
    scores,
    workouts: workoutLibrary,
    secondaryNeedConfig: {
      enabled: true,
      trainingDaysPerWeek: trainingDays,
      estimatedWeeks,
      hasLongRunDay: hasLongRunDay(),
      longRunAllowed,
    },
  });

  const baseSchedule = schedulePlanIntoWeeks(
    plan.assignments,
    currentWeekRule()
  );

  const adaptation = buildFeedbackAdaptation({
    baseWeekRule: currentWeekRule(),
    totalWeeks: baseSchedule.weeks.length,
    completedThroughIndex:
      dailyFeedbackState.cursor - 1,
    feedbackHistory:
      dailyFeedbackState.history,
    phase,
  });

  const remainingAssignments = plan.assignments
    .filter(
      assignment =>
        !dailyFeedbackState.completedSlots.has(
          assignment.slot
        )
    )
    .map(assignment =>
      dailyFeedbackState.missedMakeupSlots.has(
        assignment.slot
      )
        ? {
            ...assignment,
            feedbackMakeup: true,
            feedbackMakeupReason:
              'Previously missed Quality/Speed session. Make it up on the next eligible Workout Day before later quality sessions.',
          }
        : assignment
    );

  let schedule = schedulePlanIntoWeeks(
    remainingAssignments,
    adaptation.weekRules
  );

  schedule = applyRecoveryOverrides(
    schedule,
    adaptation
  );

  schedule = mergeCompletedDays(schedule);

  const progressiveSlots = progressiveSlotsFor(
    schedule,
    adaptation
  );

  const workoutProgression =
  applyWeeklyWorkoutProgressionToSchedule({
    schedule,

    weeklyDecisions:
      adaptation
        .weeklyWorkoutProgressionDecisions,

    scores,

    current10k:
      $('current-10k').value,
  });
  const weeklyKm = readWeeklyKm();

  const kmPlan =
  Number.isFinite(weeklyKm)
    ? applyWeeklyKmPlanToSchedule({
        schedule,
        phase,
        scores,

        current10k:
          $('current-10k').value,

        startWeeklyKm:
          weeklyKm,

        progressiveSlots,

        weeklyDecisions:
          adaptation
            .weeklyProgressionDecisions,
      })
    : null;

  lastSimulation = {
  plan,
  schedule,
  adaptation,
  progressiveSlots,
  workoutProgression,
  kmPlan,
};

  renderPlan(
    plan,
    schedule,
    {
      adaptation,
      progressiveSlots,
      kmPlan,
    }
  );
}

async function loadDatabase() {
  $('db-status').textContent =
    'Loading Supabase…';
  $('db-status').className =
    'status-pill';

  try {
    workoutLibrary = await loadWorkoutLibrary({
      event: '10K',
    });

    $('db-status').textContent =
      `${workoutLibrary.length} live workouts`;
    $('db-status').className =
      'status-pill success';

    renderLibrary();
    resetDailyFeedbackSimulation();
    buildSimulation();
  } catch (error) {
    console.error(error);

    $('db-status').textContent =
      'Supabase load failed';
    $('db-status').className =
      'status-pill error';

    $('workout-library').innerHTML = `
      <div class="empty-state error-text">
        ${escapeHtml(error.message)}
      </div>
    `;
  }
}

function setDefaultScores() {
  const defaults = {
    Aerobic: 85,
    Threshold: 80,
    VO2max: 85,
  };

  document
    .querySelectorAll('[data-score]')
    .forEach(input => {
      input.value =
        defaults[input.dataset.score] ?? 80;
    });
}

function submitTweteDailyFeedback() {
  if (!lastSimulation) return;

  const current = currentSimulationDay(
    lastSimulation.schedule
  );

  if (!current) return;

  const panel = $('weekly-plan');
  const value = name =>
    panel.querySelector(
      `[data-feedback-field="${name}"]`
    )?.value ?? null;

  const plannedWorkoutCount =
    current.day.assignment ? 1 : 0;

  const completionStatus =
    value('completion_status');

  const completedWorkoutCount =
    completionStatus === 'completed'
      ? plannedWorkoutCount
      : completionStatus === 'partial'
        ? Math.min(
            plannedWorkoutCount,
            plannedWorkoutCount > 0 ? 1 : 0
          )
        : 0;

  const feedback = {
    feeling: value('feeling'),
    training_difficulty:
      completionStatus === 'skipped'
        ? null
        : value('training_difficulty'),
    completion_status: completionStatus,
    pain_severity: Number(
      value('pain_severity') || 0
    ),
    pain_area: String(
      value('pain_area') || ''
    ).trim(),
    optional_comment: String(
      value('optional_comment') || ''
    ).trim(),
    planned_workout_count:
      plannedWorkoutCount,
    completed_workout_count:
      completedWorkoutCount,
  };

  feedback.pain_present =
    feedback.pain_severity > 0;

  const validation = validateTweteDailyFeedback(
    feedback
  );

  if (!validation.valid) {
    const error = panel.querySelector(
      '[data-feedback-error]'
    );

    if (error) {
      error.textContent =
        `Missing/invalid: ${validation.errors.join(', ')}`;
    }
    return;
  }

  dailyFeedbackState.history.push({
    calendarIndex:
      dailyFeedbackState.cursor,
    week: current.week,
    day: current.day.day,
    ...feedback,
  });

  dailyFeedbackState.completedDays.set(
    current.key,
    {
      day: {
        ...current.day,
        assignment:
          current.day.assignment
            ? { ...current.day.assignment }
            : null,
      },
      feedback,
    }
  );

  const missedPolicy = missedSessionPolicy({
    placementType:
      current.day.placementType,
    completionStatus:
      feedback.completion_status,
  });

  if (current.day.assignment?.slot) {
    const slot = current.day.assignment.slot;

    if (!missedPolicy.missed) {
      dailyFeedbackState.completedSlots.add(slot);
      dailyFeedbackState.missedMakeupSlots.delete(slot);
    } else if (missedPolicy.carryForward) {
      dailyFeedbackState.missedMakeupSlots.add(slot);
    } else {
      dailyFeedbackState.completedSlots.add(slot);
      dailyFeedbackState.missedMakeupSlots.delete(slot);
    }
  }

  const storedDay =
    dailyFeedbackState.completedDays.get(
      current.key
    );

  if (storedDay) {
    storedDay.day.missed = missedPolicy.missed;
    storedDay.day.missedAction = missedPolicy.action;
    storedDay.day.missedLabel =
      missedPolicy.missed
        ? missedPolicy.carryForward
          ? 'MISSED · MAKE UP NEXT WORKOUT DAY'
          : 'MISSED · NOT MADE UP'
        : null;
  }

  dailyFeedbackState.cursor += 1;
  buildSimulation();
}

function rebuildSimulationFromInput() {
  resetDailyFeedbackSimulation();
  buildSimulation();
}

$('engine-version').textContent =
  `Engine ${LAB_VERSION}`;

$('refresh-db').addEventListener(
  'click',
  loadDatabase
);

$('build-goal').addEventListener(
  'click',
  rebuildSimulationFromInput
);

$('training-phase').addEventListener(
  'change',
  rebuildSimulationFromInput
);

$('slot-count').addEventListener(
  'change',
  rebuildSimulationFromInput
);

$('current-10k').addEventListener(
  'change',
  rebuildSimulationFromInput
);

$('weekly-km').addEventListener(
  'change',
  rebuildSimulationFromInput
);

$('week-rules').addEventListener(
  'change',
  event => {
    const checkbox = event.target.closest(
      '[data-training-day]'
    );
    const select = event.target.closest(
      '[data-day-role]'
    );

    if (checkbox) {
      const day = checkbox.dataset.day;

      weekRuleState[day] = checkbox.checked
        ? DAY_ROLES.EASY
        : DAY_ROLES.UNAVAILABLE;

      resetDailyFeedbackSimulation();
      buildSimulation();
      return;
    }

    if (select) {
      const day = select.dataset.day;
      weekRuleState[day] = select.value;

      resetDailyFeedbackSimulation();
      buildSimulation();
    }
  }
);

$('weekly-plan').addEventListener(
  'click',
  event => {
    const submitButton = event.target.closest(
      '[data-feedback-submit]'
    );
    const resetButton = event.target.closest(
      '[data-feedback-reset]'
    );

    if (submitButton) {
      submitTweteDailyFeedback();
      return;
    }

    if (resetButton) {
      resetDailyFeedbackSimulation();
      buildSimulation();
    }
  }
);

document
  .querySelectorAll('[data-score]')
  .forEach(input =>
    input.addEventListener(
      'change',
      rebuildSimulationFromInput
    )
  );

setDefaultScores();
renderWeekRuleEditor();
loadDatabase();
