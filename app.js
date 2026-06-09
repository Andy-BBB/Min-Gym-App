const VERSION = "1.3";
const STORAGE_KEY = "minGymAppData_v13";

const state = loadState();
let editingPlanId = null;
let activeSession = null;

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) return JSON.parse(saved);
  return { plans: [], sessions: [] };
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function el(id) { return document.getElementById(id); }

function switchTab(tabId) {
  document.querySelectorAll(".tab").forEach(btn => btn.classList.toggle("active", btn.dataset.tab === tabId));
  document.querySelectorAll(".view").forEach(view => view.classList.toggle("active", view.id === tabId));
  renderAll();
}

document.querySelectorAll(".tab").forEach(btn => btn.addEventListener("click", () => switchTab(btn.dataset.tab)));
el("newPlanBtn").addEventListener("click", createPlan);
el("startSessionBtn").addEventListener("click", startSession);

function createPlan() {
  const name = el("planName").value.trim();
  if (!name) return alert("Skriv ett namn på upplägget först.");
  const plan = { id: uid(), name, exercises: [] };
  state.plans.push(plan);
  editingPlanId = plan.id;
  el("planName").value = "";
  saveState();
  renderAll();
}

function renderWorkoutSelect() {
  const select = el("workoutSelect");
  select.innerHTML = "";
  if (!state.plans.length) {
    select.innerHTML = '<option value="">Inga upplägg skapade ännu</option>';
    return;
  }
  state.plans.forEach(plan => {
    const option = document.createElement("option");
    option.value = plan.id;
    option.textContent = plan.name;
    select.appendChild(option);
  });
}

function renderPlansList() {
  const container = el("plansList");
  if (!state.plans.length) {
    container.innerHTML = '<div class="card empty">Inga upplägg ännu. Skapa ditt första upplägg ovan.</div>';
    return;
  }
  container.innerHTML = state.plans.map(plan => `
    <div class="list-item">
      <h3>${escapeHtml(plan.name)}</h3>
      <p class="muted">${plan.exercises.length} övning(ar)</p>
      <div class="inline-actions">
        <button class="secondary" onclick="editPlan('${plan.id}')">Redigera</button>
        <button class="danger" onclick="deletePlan('${plan.id}')">Ta bort</button>
      </div>
    </div>
  `).join("");
}

function editPlan(planId) {
  editingPlanId = planId;
  renderPlanEditor();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function deletePlan(planId) {
  if (!confirm("Ta bort upplägget?")) return;
  const index = state.plans.findIndex(p => p.id === planId);
  if (index >= 0) state.plans.splice(index, 1);
  if (editingPlanId === planId) editingPlanId = null;
  saveState();
  renderAll();
}

function renderPlanEditor() {
  const container = el("planEditor");
  if (!editingPlanId) {
    container.innerHTML = "";
    return;
  }
  const plan = state.plans.find(p => p.id === editingPlanId);
  if (!plan) return;

  container.innerHTML = `
    <div class="card">
      <h2>Redigera: ${escapeHtml(plan.name)}</h2>
      <label>Ny övning</label>
      <div class="row">
        <input id="newExerciseName" placeholder="Exempel: Marklyft" />
        <input id="newExerciseWeight" type="number" inputmode="decimal" placeholder="Vikt" />
        <input id="newExerciseReps" type="number" inputmode="numeric" placeholder="Reps" />
        <button class="secondary" onclick="addExercise()">Lägg till</button>
      </div>
      <p class="muted">Du kan lägga till fler set efter att övningen skapats.</p>
      <button class="primary" onclick="savePlan()">Spara upplägg</button>
    </div>
    ${plan.exercises.map(exercise => renderExerciseEditor(plan.id, exercise)).join("")}
  `;
}

function renderExerciseEditor(planId, exercise) {
  return `
    <div class="list-item">
      <div class="exercise-title">
        <h3>${escapeHtml(exercise.name)}</h3>
        <button class="danger" onclick="deleteExercise('${planId}','${exercise.id}')">Ta bort</button>
      </div>
      ${exercise.sets.map((set, index) => `
        <div class="set-row">
          <div class="set-pill">Set ${index + 1}</div>
          <input type="number" inputmode="decimal" value="${set.weight}" onchange="updateTemplateSet('${planId}','${exercise.id}',${index},'weight',this.value)" />
          <input type="number" inputmode="numeric" value="${set.reps}" onchange="updateTemplateSet('${planId}','${exercise.id}',${index},'reps',this.value)" />
          <button class="danger" onclick="deleteTemplateSet('${planId}','${exercise.id}',${index})">Ta bort</button>
        </div>
      `).join("")}
      <button class="secondary" onclick="addTemplateSet('${planId}','${exercise.id}')">Lägg till set</button>
    </div>
  `;
}

function addExercise() {
  const plan = state.plans.find(p => p.id === editingPlanId);
  if (!plan) return;
  const name = el("newExerciseName").value.trim();
  const weight = Number(el("newExerciseWeight").value || 0);
  const reps = Number(el("newExerciseReps").value || 0);
  if (!name) return alert("Skriv namn på övningen.");
  plan.exercises.push({ id: uid(), name, sets: [{ weight, reps }] });
  saveState();
  renderAll();
}

function updateTemplateSet(planId, exerciseId, setIndex, field, value) {
  const plan = state.plans.find(p => p.id === planId);
  const exercise = plan?.exercises.find(e => e.id === exerciseId);
  if (!exercise) return;
  exercise.sets[setIndex][field] = Number(value || 0);
  saveState();
}

function addTemplateSet(planId, exerciseId) {
  const plan = state.plans.find(p => p.id === planId);
  const exercise = plan?.exercises.find(e => e.id === exerciseId);
  if (!exercise) return;
  exercise.sets.push({ weight: 0, reps: 0 });
  saveState();
  renderAll();
}

function deleteTemplateSet(planId, exerciseId, setIndex) {
  const plan = state.plans.find(p => p.id === planId);
  const exercise = plan?.exercises.find(e => e.id === exerciseId);
  if (!exercise) return;
  exercise.sets.splice(setIndex, 1);
  saveState();
  renderAll();
}

function deleteExercise(planId, exerciseId) {
  const plan = state.plans.find(p => p.id === planId);
  if (!plan) return;
  plan.exercises = plan.exercises.filter(e => e.id !== exerciseId);
  saveState();
  renderAll();
}

function savePlan() {
  saveState();
  alert("Upplägget är sparat.");
  renderAll();
}

function startSession() {
  const planId = el("workoutSelect").value;
  const plan = state.plans.find(p => p.id === planId);
  if (!plan) return alert("Skapa eller välj ett upplägg först.");
  activeSession = {
    id: uid(),
    date: today(),
    planId: plan.id,
    planName: plan.name,
    exercises: plan.exercises.map(e => ({
      id: uid(),
      templateExerciseId: e.id,
      name: e.name,
      updateStandard: false,
      sets: e.sets.map(s => ({ weight: s.weight, reps: s.reps }))
    }))
  };
  renderActiveSession();
}

function renderActiveSession() {
  const container = el("activeSession");
  if (!activeSession) {
    container.innerHTML = "";
    return;
  }
  container.innerHTML = `
    <div class="card">
      <h2>${escapeHtml(activeSession.planName)}</h2>
      <p class="muted">Datum: ${activeSession.date}</p>
      ${activeSession.exercises.map((exercise, exerciseIndex) => `
        <div class="exercise-summary">
          <h3>${escapeHtml(exercise.name)}</h3>
          ${exercise.sets.map((set, setIndex) => `
            <div class="set-row">
              <div class="set-pill">Set ${setIndex + 1}</div>
              <input type="number" inputmode="decimal" value="${set.weight}" onchange="updateSessionSet(${exerciseIndex},${setIndex},'weight',this.value)" />
              <input type="number" inputmode="numeric" value="${set.reps}" onchange="updateSessionSet(${exerciseIndex},${setIndex},'reps',this.value)" />
              <button class="danger" onclick="deleteSessionSet(${exerciseIndex},${setIndex})">Ta bort</button>
            </div>
          `).join("")}
          <button class="secondary" onclick="addSessionSet(${exerciseIndex})">Lägg till set</button>
          <label class="update-standard">
            <input type="checkbox" ${exercise.updateStandard ? "checked" : ""} onchange="toggleUpdateStandard(${exerciseIndex}, this.checked)" />
            Uppdatera standard för ${escapeHtml(exercise.name)} med dagens vikter
          </label>
        </div>
      `).join("")}
      <button class="primary" onclick="saveSession()">Spara pass</button>
      <button class="secondary" onclick="cancelSession()">Avbryt pass</button>
    </div>
  `;
}

function updateSessionSet(exerciseIndex, setIndex, field, value) {
  activeSession.exercises[exerciseIndex].sets[setIndex][field] = Number(value || 0);
}

function addSessionSet(exerciseIndex) {
  activeSession.exercises[exerciseIndex].sets.push({ weight: 0, reps: 0 });
  renderActiveSession();
}

function deleteSessionSet(exerciseIndex, setIndex) {
  activeSession.exercises[exerciseIndex].sets.splice(setIndex, 1);
  renderActiveSession();
}

function toggleUpdateStandard(exerciseIndex, checked) {
  activeSession.exercises[exerciseIndex].updateStandard = checked;
}

function cancelSession() {
  if (!confirm("Avbryt dagens pass?")) return;
  activeSession = null;
  renderActiveSession();
}

function saveSession() {
  if (!activeSession) return;
  state.sessions.unshift(JSON.parse(JSON.stringify(activeSession)));
  const plan = state.plans.find(p => p.id === activeSession.planId);
  if (plan) {
    activeSession.exercises.forEach(sessionExercise => {
      if (!sessionExercise.updateStandard) return;
      const templateExercise = plan.exercises.find(e => e.id === sessionExercise.templateExerciseId);
      if (templateExercise) {
        templateExercise.sets = sessionExercise.sets.map(s => ({ weight: s.weight, reps: s.reps }));
      }
    });
  }
  activeSession = null;
  saveState();
  renderAll();
  alert("Passet är sparat.");
}

function renderHistory() {
  const container = el("historyList");
  if (!state.sessions.length) {
    container.innerHTML = '<div class="card empty">Ingen historik ännu.</div>';
    return;
  }
  container.innerHTML = state.sessions.map(session => `
    <div class="list-item">
      <h3>${session.date} – ${escapeHtml(session.planName)}</h3>
      ${session.exercises.map(exercise => `
        <div class="exercise-summary">
          <strong>${escapeHtml(exercise.name)}</strong>
          <p class="muted">${exercise.sets.map(s => `${s.weight} kg x ${s.reps}`).join(" · ")}</p>
        </div>
      `).join("")}
    </div>
  `).join("");
}

function renderPB() {
  const container = el("pbList");
  const best = {};
  state.sessions.forEach(session => {
    session.exercises.forEach(exercise => {
      exercise.sets.forEach(set => {
        if (!best[exercise.name] || set.weight > best[exercise.name].weight) {
          best[exercise.name] = { weight: set.weight, reps: set.reps, date: session.date };
        }
      });
    });
  });
  const entries = Object.entries(best).sort((a, b) => a[0].localeCompare(b[0], "sv"));
  if (!entries.length) {
    container.innerHTML = '<div class="card empty">Inga personbästan ännu. Spara ett pass först.</div>';
    return;
  }
  container.innerHTML = entries.map(([name, pb]) => `
    <div class="list-item">
      <h3>${escapeHtml(name)}</h3>
      <div class="pb-weight">${pb.weight} kg x ${pb.reps}</div>
      <p class="muted">Datum: ${pb.date}</p>
    </div>
  `).join("");
}

function renderAll() {
  renderWorkoutSelect();
  renderPlansList();
  renderPlanEditor();
  renderActiveSession();
  renderHistory();
  renderPB();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

renderAll();
