import {
  ENGINE_VERSION,
  parseWorkoutText,
  classifyWorkout,
  generateCandidates,
  formatCandidate,
  learnPreference,
} from './tate-engine/index.js';

import {
  loadLearningState,
  saveLearningState,
  resetLearningState,
} from './lab/store.js';

import { sampleAthlete } from './lab/sampleAthletes.js';

const $ = id => document.getElementById(id);

let learningState = loadLearningState();
let latestCandidates = [];
let selectedCandidate = null;

$('engine-version').textContent = `Engine ${ENGINE_VERSION}`;

function historyRows() {
  return [...document.querySelectorAll('.history-row')];
}

function createHistoryRow(session = {}) {
  const row = document.createElement('div');
  row.className = 'history-row';

  row.innerHTML = `
    <label class="history-days-label">
      Days ago
      <input
        class="history-days"
        type="number"
        min="0"
        step="1"
        value="${
          Number.isFinite(Number(session.daysAgo))
            ? Number(session.daysAgo)
            : ''
        }"
        placeholder="7"
      />
    </label>

    <label class="history-workout-label">
      Workout
      <input
        class="history-workout"
        value="${String(session.workout || '')
          .replaceAll('&', '&amp;')
          .replaceAll('"', '&quot;')}"
        placeholder="e.g. 10x1000 @3:14 / 60s"
      />

      <span>Athlete feedback</span>
      <select class="history-feedback">
        <option value="">Not rated</option>
        ${[
          'Too much',
          'A little hard',
          'Doable',
          'Comfortable',
          'Too easy',
        ]
          .map(value => `
            <option
              value="${value}"
              ${session.feedback === value ? 'selected' : ''}
            >
              ${value}
            </option>
          `)
          .join('')}
      </select>
    </label>

    <button
      class="remove-history danger-btn"
      type="button"
    >
      Remove
    </button>
  `;

  row
    .querySelector('.remove-history')
    .addEventListener('click', () => {
      row.remove();

      if (!historyRows().length) {
        createHistoryRow();
      }
    });

  $('history-list').appendChild(row);
}

function setHistory(sessions = []) {
  $('history-list').innerHTML = '';

  const list =
    Array.isArray(sessions) && sessions.length
      ? sessions
      : [{}];

  list.forEach(createHistoryRow);
}

function readHistory() {
  return historyRows()
    .map(row => ({
      daysAgo: Math.max(
        0,
        Number(
          row
            .querySelector('.history-days')
            .value || 0
        )
      ),

      workout: row
        .querySelector('.history-workout')
        .value
        .trim(),

      feedback: row
        .querySelector('.history-feedback')
        .value || null,
    }))
    .filter(item => item.workout)
    .sort((a, b) => a.daysAgo - b.daysAgo);
}

function readAthlete() {
  return {
    goalEvent: $('goal-event').value,
    phase: $('phase').value,
    current5k: $('current-5k').value,
    tolerance: $('tolerance').value,
    primaryNeed: $('primary-need').value,
    readiness: Number($('readiness').value),
    recentWorkouts: readHistory(),
  };
}

function setAthlete(a) {
  $('goal-event').value = a.goalEvent;
  $('phase').value = a.phase;
  $('current-5k').value = a.current5k;
  $('tolerance').value = a.tolerance;
  $('primary-need').value = a.primaryNeed;
  $('readiness').value = a.readiness;

  const sessions =
    Array.isArray(a.recentWorkouts) &&
    a.recentWorkouts.length
      ? a.recentWorkouts
      : a.recentWorkout
        ? [
            {
              daysAgo: 7,
              workout: a.recentWorkout,
            },
          ]
        : [];

  setHistory(sessions);
}

function renderBreakdown(breakdown) {
  return `
    <div class="score-grid">
      ${Object.entries(breakdown)
        .map(([key, value]) => `
          <div class="score-row">
            <span>${key}</span>
            <strong>
              ${value >= 0 ? '+' : ''}${value.toFixed(1)}
            </strong>
          </div>
        `)
        .join('')}
    </div>
  `;
}

function renderHistoryMatches(candidate) {
  const matches = candidate.historyMatches || [];

  if (!matches.length) {
    return `
      <div class="meta-line">
        History similarity: no meaningful recent match.
      </div>
    `;
  }

  const lines = matches
    .slice(0, 4)
    .map(match => `
      <div class="history-match">
        <strong>${match.daysAgo}d ago</strong>
        <span>${match.workout}</span>
        <span>
          ${Math.round(match.similarity * 100)}% similar
        </span>
        ${
          match.feedback
            ? `<span>Feedback: ${match.feedback}</span>`
            : ''
        }
      </div>
    `)
    .join('');

  return `
    <div class="history-match-title">
      Relevant recent history
    </div>

    <div class="history-match-list">
      ${lines}
    </div>
  `;
}

function renderDoseAndRotation(candidate) {
  const dose =
    Number.isFinite(candidate.thresholdDoseMinutes)
      ? `
        <div class="meta-line">
          Threshold dose:
          <strong>${candidate.thresholdDoseMinutes.toFixed(1)} min</strong>
          ${
            candidate.doseRange
              ? ` · target ${candidate.doseRange.minMinutes.toFixed(0)}–${candidate.doseRange.maxMinutes.toFixed(0)} min`
              : ''
          }
        </div>
      `
      : '';

  const rotation =
    candidate.rotationReason
      ? `
        <div class="meta-line">
          Rotation:
          ${candidate.rotationReason}
        </div>
      `
      : '';

  const structure =
    candidate.structureReason
      ? `
        <div class="meta-line">
          Structure:
          ${candidate.structureReason}
        </div>
      `
      : '';

  const response =
    candidate.sessionResponseReason
      ? `
        <div class="meta-line">
          Session response:
          ${candidate.sessionResponseReason}
        </div>
      `
      : '';

  return dose + rotation + structure + response;
}

function renderCandidateCard(candidate, isSelected = false) {
  const blocks = formatCandidate(candidate)
    .map(line => `
      <div class="block">
        ${line}
      </div>
    `)
    .join('');

  return `
    <div class="workout-title">
      ${candidate.label}
    </div>

    <div>
      <span class="score">
        ${candidate.score.toFixed(1)}
      </span>
      / 100
    </div>

    <div class="meta-line">
      Family:
      ${candidate.family}
      · Learned modifier:
      ${candidate.learnedModifier.toFixed(3)}
    </div>

    <div class="meta-line">
      Progression:
      ${candidate.progressionReason}
    </div>

    ${renderDoseAndRotation(candidate)}

    ${blocks}

    ${
      isSelected
        ? renderHistoryMatches(candidate)
        : ''
    }

    ${
      isSelected
        ? renderBreakdown(candidate.breakdown)
        : ''
    }
  `;
}

function renderDecision() {
  if (!latestCandidates.length) return;

  selectedCandidate = latestCandidates[0];

  $('decision-status').textContent =
    `${latestCandidates.length} valid candidates ranked`;

  $('selected-workout')
    .classList
    .remove('empty');

  $('selected-workout').innerHTML =
    renderCandidateCard(
      selectedCandidate,
      true
    );

  $('alternatives').innerHTML =
    latestCandidates
      .slice(1, 5)
      .map((candidate, index) => `
        <div
          class="candidate-card"
          data-index="${index + 1}"
        >
          ${renderCandidateCard(candidate, false)}
        </div>
      `)
      .join('');

  document
    .querySelectorAll('.candidate-card')
    .forEach(el => {
      el.addEventListener('click', () => {
        const candidate =
          latestCandidates[
            Number(el.dataset.index)
          ];

        $('correction-text').value =
          formatCandidate(candidate)
            .join(' + ');
      });
    });
}

function generate() {
  latestCandidates =
    generateCandidates(
      readAthlete(),
      learningState
    );

  renderDecision();
}

function renderParsed(parsed, classified = []) {
  const workBlocks =
    classified.filter(
      b => b.kind === 'work'
    );

  const html =
    parsed.blocks
      .map(block => {
        if (
          block.kind ===
          'inter_block_rest'
        ) {
          return `
            <div class="interblock">
              Between blocks:
              ${block.durationSeconds ?? '?'} sec
              · ${block.type}
            </div>
          `;
        }

        const classed = workBlocks.shift();

        const workLabel =
          block.distanceMeters > 0
            ? `${block.reps}×${block.distanceMeters}m`
            : `${block.reps}×${Math.round(
                (block.targetSecondsPerRep || 0) / 60
              )}min work`;

        return `
          <div class="block">
            <strong>${workLabel}</strong>
            <br>

            ${
              block.distanceMeters > 0
                ? `target: ${block.targetSecondsPerRep ?? '?'} s/rep · `
                : ''
            }

            rep recovery:
            ${block.recoverySeconds ?? '?'} s
            (${block.recoveryType})

            <br>

            <span class="meta-line">
              TATE:
              ${classed?.primary ?? 'Unknown'}
              ${
                classed?.secondary?.length
                  ? ` · secondary ${classed.secondary.join(', ')}`
                  : ''
              }
            </span>
          </div>
        `;
      })
      .join('');

  const warnings =
    parsed.warnings.length
      ? `
        <div class="meta-line">
          Warnings:
          ${parsed.warnings.join(' | ')}
        </div>
      `
      : '';

  $('parsed-correction')
    .classList
    .remove('empty');

  $('parsed-correction').innerHTML =
    html + warnings;
}

function parseCorrection() {
  const parsed =
    parseWorkoutText(
      $('correction-text').value
    );

  const classified =
    classifyWorkout(
      parsed,
      readAthlete()
    );

  renderParsed(
    parsed,
    classified
  );

  return {
    parsed,
    classified,
  };
}

function applyCorrection() {
  const text =
    $('correction-text')
      .value
      .trim();

  if (
    !text ||
    !selectedCandidate
  ) {
    return;
  }

  parseCorrection();

  learningState =
    learnPreference(
      learningState,
      selectedCandidate.learningKey,
      -1,
      `Coach preferred a different workout over ${selectedCandidate.label}`
    );

  const athlete = readAthlete();

  const correctionKey = [
    athlete.goalEvent,
    athlete.phase,
    athlete.tolerance,
    athlete.primaryNeed,
    'CoachCompositeOrCustom',
  ].join('|');

  learningState =
    learnPreference(
      learningState,
      correctionKey,
      1,
      text
    );

  saveLearningState(
    learningState
  );

  renderLearning();
  generate();
}

function renderLearning() {
  const entries =
    Object.entries(
      learningState
    );

  if (!entries.length) {
    $('learning-state').innerHTML =
      '<div class="empty">No learned lab preferences yet.</div>';

    return;
  }

  $('learning-state').innerHTML = `
    <div class="learning-list">
      ${entries
        .map(([key, value]) => `
          <div class="learning-item">
            <div class="learning-key">
              ${key}
            </div>

            <div class="learning-value">
              ${value.modifier.toFixed(3)}
            </div>

            <div class="meta-line">
              Evidence:
              ${value.evidence}
              ${
                value.notes?.length
                  ? ` · Last note: ${value.notes.at(-1)}`
                  : ''
              }
            </div>
          </div>
        `)
        .join('')}
    </div>
  `;
}

$('generate')
  .addEventListener(
    'click',
    generate
  );

$('parse-correction')
  .addEventListener(
    'click',
    parseCorrection
  );

$('apply-correction')
  .addEventListener(
    'click',
    applyCorrection
  );

$('add-history')
  .addEventListener(
    'click',
    () => createHistoryRow()
  );

$('load-sample')
  .addEventListener(
    'click',
    () => {
      setAthlete(sampleAthlete);
      generate();
    }
  );

$('reset-learning')
  .addEventListener(
    'click',
    () => {
      resetLearningState();
      learningState = {};
      renderLearning();

      if (latestCandidates.length) {
        generate();
      }
    }
  );

renderLearning();
setAthlete(sampleAthlete);
generate();
