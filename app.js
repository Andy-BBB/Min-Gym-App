const STORAGE_KEY = 'minGymApp.v12';

let state = loadState();
let editingPlanId = null;
let activeSession = null;

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

function uid() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return JSON.parse(saved);
  } catch (error) {
    console.warn('Kunde inte läsa sparad data', error);
  }
  return { plans: [], sessions: [] };
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function switchView(viewId) {
  $$('.view').forEach(v => v.classList.remove('active-view'));
  $$('.tab').forEach(t => t.classList.remove('active'));
  $(`#${viewId}`).classList.add('active-view');
  $(`.tab[data-view="${viewId}"]`).classList.add('active');
  renderAll();
}

function renderAll() {
  renderPlanSelect();
  renderPlanEditor();
  renderPlansList();
  renderActiveSession();
  renderHistory();
  renderPB();
}

function renderPlanSelect() {
  const select = $('#todayPlanSelect');
  select.innerHTML = '';
  if (state.plans.length === 0) {
    select.innerHTML = '<option>Inga upplägg ännu</option>';
    $('#startSessionBtn').disabled = true;
    return;
  }
  $('#startSessionBtn').disabled = false;
  state.plans.forEach(plan => {
    const option = document.createElement('option');
    option.value = plan.id;
    option.textContent = plan.name;
    select.appendChild(option);
  });
}

function renderPlanEditor() {
  const area = $('#planEditorArea');
  if (!editingPlanId) {
    area.innerHTML = '';
    return;
  }
  const plan = state.plans.find(p => p.id === editingPlanId);
  if (!plan) {
    editingPlanId = null;
    area.innerHTML = '';
    return;
  }

  area.innerHTML = `
    <div class="card">
      <div class="plan-actions">
        <div>
          <h2>Redigera upplägg</h2>
          <p class="muted">Ändringar sparas när du klickar på Spara upplägg.</p>
        </div>
        <button id="savePlanBtn">Spara upplägg</button>
      </div>
      <label>Namn</label>
      <input id="editingPlanName" type="text" value="${escapeHtml(plan.name)}" />
      <div id="editingExercises"></div>
      <button id="addExerciseBtn" class="ghost">+ Lägg till övning</button>
    </div>
  `;

  const exerciseArea = $('#editingExercises');
  plan.exercises.forEach((exercise, exerciseIndex) => {
    exerciseArea.appendChild(createExerciseEditor(exercise, exerciseIndex));
  });

  $('#editingPlanName').addEventListener('input', (e) => {
    plan.name = e.target.value;
  });

  $('#addExerciseBtn').addEventListener('click', () => {
    plan.exercises.push({ id: uid(), name: '', sets: [{ id: uid(), weight: '', reps: '' }] });
    renderPlanEditor();
  });

  $('#savePlanBtn').addEventListener('click', () => {
    plan.name = $('#editingPlanName').value.trim() || 'Namnlöst upplägg';
    plan.exercises = plan.exercises
      .map(ex => ({
        ...ex,
        name: ex.name.trim() || 'Namnlös övning',
        sets: ex.sets.filter(s => s.weight !== '' || s.reps !== '')
      }))
      .filter(ex => ex.sets.length > 0);
    saveState();
    editingPlanId = null;
    renderAll();
    switchView('plansView');
  });
}

function createExerciseEditor(exercise, exerciseIndex) {
  const wrapper = document.createElement('div');
  wrapper.className = 'exercise-block';
  wrapper.innerHTML = `
    <div class="exercise-header">
      <input class="exercise-name" type="text" value="${escapeHtml(exercise.name)}" placeholder="Övning, t.ex. Marklyft" />
      <button class="ghost danger remove-exercise-btn">Ta bort</button>
    </div>
    <div class="sets"></div>
    <button class="ghost add-set-btn">+ Lägg till set</button>
  `;

  const plan = state.plans.find(p => p.id === editingPlanId);
  const setsArea = wrapper.querySelector('.sets');

  exercise.sets.forEach((set, setIndex) => {
    const row = document.createElement('div');
    row.className = 'set-row';
    row.innerHTML = `
      <div class="set-number">${setIndex + 1}</div>
      <input type="number" inputmode="decimal" placeholder="Vikt kg" value="${escapeHtml(set.weight)}" />
      <input type="number" inputmode="numeric" placeholder="Reps" value="${escapeHtml(set.reps)}" />
      <button class="ghost danger">Ta bort</button>
    `;
    const [weightInput, repsInput] = row.querySelectorAll('input');
    weightInput.addEventListener('input', e => set.weight = e.target.value);
    repsInput.addEventListener('input', e => set.reps = e.target.value);
    row.querySelector('button').addEventListener('click', () => {
      exercise.sets.splice(setIndex, 1);
      if (exercise.sets.length === 0) exercise.sets.push({ id: uid(), weight: '', reps: '' });
      renderPlanEditor();
    });
    setsArea.appendChild(row);
  });

  wrapper.querySelector('.exercise-name').addEventListener('input', e => exercise.name = e.target.value);
  wrapper.querySelector('.remove-exercise-btn').addEventListener('click', () => {
    plan.exercises.splice(exerciseIndex, 1);
    renderPlanEditor();
  });
  wrapper.querySelector('.add-set-btn').addEventListener('click', () => {
    exercise.sets.push({ id: uid(), weight: '', reps: '' });
    renderPlanEditor();
  });

  return wrapper;
}

function renderPlansList() {
  const area = $('#plansListArea');
  if (state.plans.length === 0) {
    area.innerHTML = '<div class="card"><p>Du har inga upplägg ännu. Skapa ditt första ovan.</p></div>';
    return;
  }

  area.innerHTML = state.plans.map(plan => `
    <div class="card">
      <div class="plan-actions">
        <div>
          <h3>${escapeHtml(plan.name)}</h3>
          <p class="muted">${plan.exercises.length} övningar</p>
        </div>
        <div class="row gap">
          <button class="ghost edit-plan" data-id="${plan.id}">Redigera</button>
          <button class="ghost danger delete-plan" data-id="${plan.id}">Ta bort</button>
        </div>
      </div>
      ${renderPlanSummary(plan)}
    </div>
  `).join('');

  $$('.edit-plan').forEach(btn => btn.addEventListener('click', () => {
    editingPlanId = btn.dataset.id;
    renderAll();
  }));

  $$('.delete-plan').forEach(btn => btn.addEventListener('click', () => {
    if (confirm('Vill du ta bort upplägget?')) {
      state.plans = state.plans.filter(p => p.id !== btn.dataset.id);
      saveState();
      renderAll();
    }
  }));
}

function renderPlanSummary(plan) {
  if (plan.exercises.length === 0) return '<p class="muted">Inga övningar ännu.</p>';
  return `<ul class="summary-list">${plan.exercises.map(ex => `
    <li><strong>${escapeHtml(ex.name)}</strong><br><span class="muted">${ex.sets.map(s => `${escapeHtml(s.weight)} kg x ${escapeHtml(s.reps)}`).join(' · ')}</span></li>
  `).join('')}</ul>`;
}

function startSession() {
  const planId = $('#todayPlanSelect').value;
  const plan = state.plans.find(p => p.id === planId);
  if (!plan) return;
  activeSession = {
    id: uid(),
    date: todayIso(),
    planId: plan.id,
    planName: plan.name,
    exercises: plan.exercises.map(ex => ({
      id: uid(),
      templateExerciseId: ex.id,
      name: ex.name,
      updateTemplate: false,
      sets: ex.sets.map(s => ({ id: uid(), weight: s.weight, reps: s.reps }))
    }))
  };
  renderActiveSession();
}

function renderActiveSession() {
  const area = $('#activeSessionArea');
  if (!activeSession) {
    area.innerHTML = '';
    return;
  }
  area.innerHTML = `
    <div class="card">
      <div class="session-header">
        <div>
          <h2>${escapeHtml(activeSession.planName)}</h2>
          <p class="muted">Datum: ${escapeHtml(activeSession.date)}</p>
        </div>
        <button id="saveSessionBtn">Spara pass</button>
      </div>
      <p class="muted">Ändra dagens vikt/reps. Kryssa per övning om standardupplägget ska uppdateras med dagens värden.</p>
    </div>
    ${activeSession.exercises.map((ex, exIndex) => `
      <div class="session-exercise">
        <h3>${escapeHtml(ex.name)}</h3>
        ${ex.sets.map((set, setIndex) => `
          <div class="session-set-row">
            <div class="set-number">${setIndex + 1}</div>
            <input class="session-weight" data-ex="${exIndex}" data-set="${setIndex}" type="number" inputmode="decimal" value="${escapeHtml(set.weight)}" placeholder="Vikt kg" />
            <input class="session-reps" data-ex="${exIndex}" data-set="${setIndex}" type="number" inputmode="numeric" value="${escapeHtml(set.reps)}" placeholder="Reps" />
            <button class="ghost danger remove-session-set" data-ex="${exIndex}" data-set="${setIndex}">Ta bort</button>
          </div>
        `).join('')}
        <button class="ghost add-session-set" data-ex="${exIndex}">+ Lägg till set</button>
        <label class="checkbox-row">
          <input class="update-template-checkbox" data-ex="${exIndex}" type="checkbox" ${ex.updateTemplate ? 'checked' : ''} />
          Uppdatera standardupplägget för ${escapeHtml(ex.name)} med dagens vikter/reps
        </label>
      </div>
    `).join('')}
  `;

  $$('.session-weight').forEach(input => input.addEventListener('input', e => {
    activeSession.exercises[e.target.dataset.ex].sets[e.target.dataset.set].weight = e.target.value;
  }));
  $$('.session-reps').forEach(input => input.addEventListener('input', e => {
    activeSession.exercises[e.target.dataset.ex].sets[e.target.dataset.set].reps = e.target.value;
  }));
  $$('.update-template-checkbox').forEach(input => input.addEventListener('change', e => {
    activeSession.exercises[e.target.dataset.ex].updateTemplate = e.target.checked;
  }));
  $$('.add-session-set').forEach(btn => btn.addEventListener('click', () => {
    activeSession.exercises[btn.dataset.ex].sets.push({ id: uid(), weight: '', reps: '' });
    renderActiveSession();
  }));
  $$('.remove-session-set').forEach(btn => btn.addEventListener('click', () => {
    const ex = activeSession.exercises[btn.dataset.ex];
    ex.sets.splice(btn.dataset.set, 1);
    if (ex.sets.length === 0) ex.sets.push({ id: uid(), weight: '', reps: '' });
    renderActiveSession();
  }));
  $('#saveSessionBtn').addEventListener('click', saveSession);
}

function saveSession() {
  if (!activeSession) return;
  const sessionToSave = JSON.parse(JSON.stringify(activeSession));
  state.sessions.unshift(sessionToSave);

  const plan = state.plans.find(p => p.id === activeSession.planId);
  if (plan) {
    activeSession.exercises.forEach(sessionExercise => {
      if (!sessionExercise.updateTemplate) return;
      const templateExercise = plan.exercises.find(ex => ex.id === sessionExercise.templateExerciseId);
      if (templateExercise) {
        templateExercise.sets = sessionExercise.sets.map(s => ({ id: uid(), weight: s.weight, reps: s.reps }));
      }
    });
  }

  activeSession = null;
  saveState();
  renderAll();
  switchView('historyView');
}

function renderHistory() {
  const area = $('#historyListArea');
  if (state.sessions.length === 0) {
    area.innerHTML = '<div class="card"><p>Ingen historik ännu.</p></div>';
    return;
  }
  area.innerHTML = state.sessions.map(session => `
    <div class="card">
      <h3>${escapeHtml(session.date)} – ${escapeHtml(session.planName)}</h3>
      <ul class="summary-list">
        ${session.exercises.map(ex => `
          <li><strong>${escapeHtml(ex.name)}</strong><br><span class="muted">${ex.sets.map(s => `${escapeHtml(s.weight)} kg x ${escapeHtml(s.reps)}`).join(' · ')}</span></li>
        `).join('')}
      </ul>
    </div>
  `).join('');
}

function renderPB() {
  const area = $('#pbListArea');
  const best = new Map();
  state.sessions.forEach(session => {
    session.exercises.forEach(ex => {
      ex.sets.forEach(set => {
        const weight = Number(set.weight);
        const reps = Number(set.reps);
        if (!weight || !reps) return;
        const current = best.get(ex.name);
        if (!current || weight > current.weight) {
          best.set(ex.name, { exercise: ex.name, weight, reps, date: session.date });
        }
      });
    });
  });

  if (best.size === 0) {
    area.innerHTML = '<div class="card"><p>Inga PB ännu. Spara ett pass först.</p></div>';
    return;
  }

  const rows = Array.from(best.values()).sort((a, b) => a.exercise.localeCompare(b.exercise, 'sv'));
  area.innerHTML = rows.map(pb => `
    <div class="card">
      <h3>${escapeHtml(pb.exercise)}</h3>
      <p><strong>${pb.weight} kg x ${pb.reps}</strong></p>
      <p class="muted">Datum: ${escapeHtml(pb.date)}</p>
    </div>
  `).join('');
}

function createNewPlan() {
  const nameInput = $('#planNameInput');
  const name = nameInput.value.trim() || 'Nytt upplägg';
  const plan = { id: uid(), name, exercises: [] };
  state.plans.unshift(plan);
  editingPlanId = plan.id;
  nameInput.value = '';
  saveState();
  renderAll();
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function init() {
  $$('.tab').forEach(tab => tab.addEventListener('click', () => switchView(tab.dataset.view)));
  $('#newPlanBtn').addEventListener('click', createNewPlan);
  $('#startSessionBtn').addEventListener('click', startSession);
  $('#resetDataBtn').addEventListener('click', () => {
    if (confirm('Vill du radera all lokal data?')) {
      localStorage.removeItem(STORAGE_KEY);
      state = loadState();
      editingPlanId = null;
      activeSession = null;
      renderAll();
    }
  });
  renderAll();
}

init();
