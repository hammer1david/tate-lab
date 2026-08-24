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

const LAB_VERSION = '0.4.2-weekly-availability';
const $ = id => document.getElementById(id);

let workoutLibrary = [];
let weekRuleState = blankWeekRule(1).days;

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
    day => weekRuleState[day] !== DAY_ROLES.UNAVAILABLE
  ).length;
}

function currentWeekRule() {
  return {
    week: 1,
    days: { ...weekRuleState },
  };
}

function renderWeekRuleEditor() {
  const target = $('week-rules');
  const count = trainingDaysPerWeek();

  $('training-days-count').textContent =
    `${count} Training Day${count === 1 ? '' : 's'} / Week`;

  target.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(7,minmax(124px,1fr));gap:8px;overflow-x:auto;">
      ${WEEKDAYS.map(day => {
        const role = weekRuleState[day] || DAY_ROLES.EASY;
        const enabled = role !== DAY_ROLES.UNAVAILABLE;
        const activeRole = enabled ? role : DAY_ROLES.EASY;

        return `
          <div class="library-role" style="min-width:124px;">
            <label style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
              <input
                type="checkbox"
                data-training-day
                data-day="${day}"
                ${enabled ? 'checked' : ''}
                style="width:auto;"
              />
              <strong style="color:var(--text);">${WEEKDAY_LABELS[day]}</strong>
            </label>

            <select
              data-day-role
              data-day="${day}"
              ${enabled ? '' : 'disabled'}
            >
              <option value="easy" ${activeRole === DAY_ROLES.EASY ? 'selected' : ''}>Easy</option>
              <option value="workout" ${activeRole === DAY_ROLES.WORKOUT ? 'selected' : ''}>Workout Day</option>
              <option value="long_run" ${activeRole === DAY_ROLES.LONG_RUN ? 'selected' : ''}>Long Run Day</option>
            </select>

            <div class="muted" style="margin-top:7px;">
              ${enabled
                ? escapeHtml(DAY_ROLE_LABELS[activeRole])
                : escapeHtml(DAY_ROLE_LABELS[DAY_ROLES.UNAVAILABLE])}
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
    : workoutLibrary.reduce((map, workout) => {
        const list = map.get(workout.stimulus) || [];
        list.push(workout);
        map.set(workout.stimulus, list);
        return map;
      }, new Map());

  target.innerHTML = [...byStimulus.entries()]
    .map(([stimulus, workouts]) => {
      const priority = workouts.filter(
        workout => workout.role === 'priority'
      );
      const coverage = workouts.filter(
        workout => workout.role === 'coverage'
      );

      const renderGroup = (title, items) => `
        <div class="library-role">
          <div class="role-title">${title}</div>
          ${
            items.length
              ? items
                  .map(
                    workout => `
                      <div class="library-workout">
                        <div>
                          <strong>${escapeHtml(workout.id)}</strong>
                          <span class="tag">${escapeHtml(
                            workout.structureType
                          )}</span>
                        </div>
                        <div class="muted">
                          ${escapeHtml(workout.status)} · ${
                            workout.blocks.length
                          } block${
                            workout.blocks.length === 1 ? '' : 's'
                          }
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
            <span>${workouts.length} workout${
              workouts.length === 1 ? '' : 's'
            }</span>
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
  $('allocation-summary').innerHTML = counts
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

function sessionTitle(assignment) {
  if (!assignment) return 'No session';

  const selected =
    assignment.selectedStimulus ||
    assignment.primaryAnchor ||
    assignment.stimulus;

  return selected || 'Session';
}

function renderWeeklySchedule(schedule) {
  const target = $('weekly-plan');

  const weekMarkup = schedule.weeks
    .map(week => {
      return `
        <article class="library-section">
          <div class="stimulus-heading">
            <h3>Week ${week.week}</h3>
            <span>
              ${week.scheduledTrainingDays}/${week.trainingDays} selected training days used
              ${week.hasLongRun ? ' · Long Run planned' : ''}
              ${week.hasSpeed ? ' · Speed planned' : ''}
            </span>
          </div>

          <div style="display:grid;grid-template-columns:repeat(7,minmax(130px,1fr));gap:8px;overflow-x:auto;">
            ${week.days.map(day => {
              const assignment = day.assignment;
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

              return `
                <div class="library-role" style="min-width:130px;">
                  <div class="role-title">
                    ${WEEKDAY_LABELS[day.day]} · ${escapeHtml(
                      dayLabel
                    )}
                  </div>
                  <div>
                    <strong>${escapeHtml(
                      assignment
                        ? sessionTitle(assignment)
                        : 'Rest'
                    )}</strong>
                  </div>
                  <div class="muted">
                    ${escapeHtml(dbStatus)}
                  </div>
                  ${
                    day.placementReason
                      ? `<div class="muted" style="margin-top:6px;">${escapeHtml(
                          day.placementReason
                        )}</div>`
                      : ''
                  }
                </div>
              `;
            }).join('')}
          </div>

          ${
            week.unscheduled.length
              ? `
                <div class="empty-state error-text" style="margin-top:12px;">
                  <strong>SCHEDULE GAP</strong><br />
                  ${week.unscheduled
                    .map(
                      item => `${escapeHtml(
                        sessionTitle(item.assignment)
                      )}: ${escapeHtml(item.reason)}`
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
          <strong>SCHEDULE GAP</strong><br />
          ${schedule.unscheduled
            .map(
              item => `${escapeHtml(
                sessionTitle(item.assignment)
              )}: ${escapeHtml(item.reason)}`
            )
            .join('<br />')}
        </div>
      `
    : '';

  target.innerHTML = weekMarkup + gapMarkup;
}

function renderPlan(plan, schedule) {
  renderAllocation(plan.counts);
  renderWeeklySchedule(schedule);

  const scores = readScores();
  const current10k = $('current-10k').value;

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
            <div class="slot-index">${assignment.slot}</div>
            <div class="slot-main">
              <div class="slot-topline">
                <strong>${escapeHtml(
                  assignment.primaryAnchor
                )}</strong>
                <span class="missing-badge">DATABASE GAP</span>
              </div>
              ${
                secondary
                  ? `<div class="workout-meta">Secondary need: ${escapeHtml(
                      secondary
                    )}</div>`
                  : ''
              }
              <div class="missing-title">
                NO ELIGIBLE DATABASE WORKOUT
              </div>
              <div class="muted">
                ${escapeHtml(assignment.reason)}
              </div>
            </div>
          </article>
        `;
      }

      const workout = materializeWorkout(
        assignment.workout,
        {
          score:
            scores[assignment.primaryAnchor] ?? 50,
          current10k,
        }
      );

      const lines = formatMaterializedWorkout(workout);

      return `
        <article class="slot-card">
          <div class="slot-index">${assignment.slot}</div>
          <div class="slot-main">
            <div class="slot-topline">
              <strong>${escapeHtml(
                assignment.primaryAnchor
              )}</strong>
              <span class="role-badge ${
                assignment.workout.role
              }">
                ${escapeHtml(assignment.workout.role)}
              </span>
            </div>

            ${
              secondary
                ? `<div class="workout-meta">
                    Secondary need: ${escapeHtml(
                      secondary
                    )} · Mode: ${escapeHtml(
                      assignment.selectionMode
                    )}
                  </div>`
                : `<div class="workout-meta">Mode: Primary</div>`
            }

            <div class="workout-id">
              ${escapeHtml(assignment.workout.id)}
            </div>

            <div class="workout-meta">
              Athlete score ${workout.athleteScore} · Band ${
                workout.performanceBand
              } · Group ${workout.scoreGroup}
            </div>

            <div class="workout-lines">
              ${lines
                .map(
                  line => `<div>${escapeHtml(line)}</div>`
                )
                .join('')}
            </div>

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
    `${missing} database gap${missing === 1 ? '' : 's'}`,
    `${scheduleGaps} schedule gap${scheduleGaps === 1 ? '' : 's'}`,
  ];

  $('plan-status').textContent = parts.join(' · ');
}

function buildSimulation() {
  const slotCount = Number($('slot-count').value);
  renderWeekRuleEditor();

  const plan = buildGoalPlan({
    event: '10K',
    phase: $('training-phase').value,
    slotCount,
    scores: readScores(),
    workouts: workoutLibrary,
  });

  const schedule = schedulePlanIntoWeeks(
    plan.assignments,
    currentWeekRule()
  );

  renderPlan(plan, schedule);
}

async function loadDatabase() {
  $('db-status').textContent = 'Loading Supabase…';
  $('db-status').className = 'status-pill';

  try {
    workoutLibrary = await loadWorkoutLibrary({
      event: '10K',
    });

    $('db-status').textContent = `${workoutLibrary.length} live workouts`;
    $('db-status').className = 'status-pill success';

    renderLibrary();
    buildSimulation();
  } catch (error) {
    console.error(error);
    $('db-status').textContent = 'Supabase load failed';
    $('db-status').className = 'status-pill error';

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
      input.value = defaults[input.dataset.score] ?? 80;
    });
}

$('engine-version').textContent = `Engine ${LAB_VERSION}`;

$('refresh-db').addEventListener('click', loadDatabase);
$('build-goal').addEventListener('click', buildSimulation);
$('training-phase').addEventListener('change', buildSimulation);

$('slot-count').addEventListener('change', () => {
  buildSimulation();
});

$('current-10k').addEventListener('change', buildSimulation);

$('week-rules').addEventListener('change', event => {
  const checkbox = event.target.closest('[data-training-day]');
  const select = event.target.closest('[data-day-role]');

  if (checkbox) {
    const day = checkbox.dataset.day;
    weekRuleState[day] = checkbox.checked
      ? DAY_ROLES.EASY
      : DAY_ROLES.UNAVAILABLE;
    buildSimulation();
    return;
  }

  if (select) {
    const day = select.dataset.day;
    weekRuleState[day] = select.value;
    buildSimulation();
  }
});

document
  .querySelectorAll('[data-score]')
  .forEach(input =>
    input.addEventListener('change', buildSimulation)
  );

setDefaultScores();
renderWeekRuleEditor();
loadDatabase();
