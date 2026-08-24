import {
  formatMaterializedWorkout,
  loadWorkoutLibrary,
  materializeWorkout,
} from './tate-engine/database-library.js';

import {
  SLOT_SECTIONS,
  buildGoalPlan,
} from './tate-engine/slot-planner.js';

const LAB_VERSION = '0.2.0-db-slots';
const $ = id => document.getElementById(id);

let workoutLibrary = [];

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
                          <strong>${escapeHtml(
                            workout.id
                          )}</strong>
                          <span class="tag">${escapeHtml(
                            workout.structureType
                          )}</span>
                        </div>
                        <div class="muted">
                          ${escapeHtml(
                            workout.status
                          )} · ${
                            workout.blocks.length
                          } block${
                            workout.blocks.length === 1
                              ? ''
                              : 's'
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

function renderPlan(plan) {
  renderAllocation(plan.counts);

  const scores = readScores();
  const current10k = $('current-10k').value;

  $('goal-plan').innerHTML = plan.assignments
    .map(assignment => {
      if (assignment.status === 'missing') {
        return `
          <article class="slot-card missing">
            <div class="slot-index">${assignment.slot}</div>
            <div class="slot-main">
              <div class="slot-topline">
                <strong>${escapeHtml(
                  assignment.stimulus
                )}</strong>
                <span class="missing-badge">
                  DATABASE GAP
                </span>
              </div>
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
            scores[assignment.stimulus] ?? 50,
          current10k,
        }
      );

      const lines = formatMaterializedWorkout(
        workout
      );

      return `
        <article class="slot-card">
          <div class="slot-index">${assignment.slot}</div>
          <div class="slot-main">
            <div class="slot-topline">
              <strong>${escapeHtml(
                assignment.stimulus
              )}</strong>
              <span class="role-badge ${
                assignment.workout.role
              }">
                ${escapeHtml(
                  assignment.workout.role
                )}
              </span>
            </div>

            <div class="workout-id">
              ${escapeHtml(assignment.workout.id)}
            </div>

            <div class="workout-meta">
              Athlete score ${
                workout.athleteScore
              } · Band ${
                workout.performanceBand
              } · Group ${workout.scoreGroup}
            </div>

            <div class="workout-lines">
              ${lines
                .map(
                  line => `
                    <div>${escapeHtml(line)}</div>
                  `
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

  $('plan-status').textContent = missing
    ? `${plan.slotCount} slots · ${missing} database gap${
        missing === 1 ? '' : 's'
      }`
    : `${plan.slotCount} slots · all assigned from Supabase`;
}

function buildSimulation() {
  const slotCount = Number(
    $('slot-count').value
  );

  const plan = buildGoalPlan({
    event: '10K',
    slotCount,
    scores: readScores(),
    workouts: workoutLibrary,
  });

  renderPlan(plan);
}

async function loadDatabase() {
  $('db-status').textContent =
    'Loading Supabase…';
  $('db-status').className = 'status-pill';

  try {
    workoutLibrary = await loadWorkoutLibrary({
      event: '10K',
    });

    $('db-status').textContent = `${workoutLibrary.length} live workouts`;
    $('db-status').className =
      'status-pill success';

    renderLibrary();
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
    VO2max: 85,
    Threshold: 80,
    '10K Specific': 80,
    Aerobic: 85,
    'Speed Endurance': 75,
    Speed: 75,
  };

  document
    .querySelectorAll('[data-score]')
    .forEach(input => {
      input.value =
        defaults[input.dataset.score] ?? 80;
    });
}

$('engine-version').textContent =
  `Engine ${LAB_VERSION}`;

$('refresh-db').addEventListener(
  'click',
  loadDatabase
);

$('build-goal').addEventListener(
  'click',
  buildSimulation
);

$('slot-count').addEventListener(
  'change',
  buildSimulation
);

$('current-10k').addEventListener(
  'change',
  buildSimulation
);

document
  .querySelectorAll('[data-score]')
  .forEach(input =>
    input.addEventListener(
      'change',
      buildSimulation
    )
  );

setDefaultScores();
loadDatabase();
