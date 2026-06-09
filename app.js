const APP_VERSION = "1.4.1";
const STORAGE_KEY = "minGymAppData_v141";

const defaultData = { plans: [], sessions: [] };

let data = loadData();
let draftPlan = createEmptyDraft();
let editingPlanId = null;
let activeSession = null;

const el = (id) => document.getElementById(id);

document.addEventListener("DOMContentLoaded", () => {
  setupTabs();
  setupButtons();
  renderAll();
});

function createEmptyDraft() {
  return { id: makeId(), name: "", exercises: [] };
}

function makeId() {
  return "id-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function loadData() {
  try {
    const stored =
      localStorage.getItem(STORAGE_KEY) ||
      localStorage.getItem("minGymAppData_v14") ||
      localStorage.getItem("minGymAppData_v13") ||
      localStorage.getItem("minGymAppData_v12");

    if (!stored) return clone(defaultData);
    return normalizeData(JSON.parse(stored));
  } catch {
    return clone(defaultData);
  }
}

function normalizeData(raw) {
  return {
    plans: Array.isArray(raw.plans) ? raw.plans : [],
    sessions: Array.isArray(raw.sessions) ? raw.sessions : []
  };
}

function saveData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function setupTabs() {
  document.querySelectorAll(".tab").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach(b => b.classList.remove("active"));
      document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById(btn.dataset.tab).classList.add("active");
    });
  });
}

function setupButtons() {
  el("addExerciseBtn").addEventListener("click", addExerciseToDraft);
  el("savePlanBtn").addEventListener("click", saveDraftPlan);
  el("cancelEditBtn").addEventListener("click", cancelEditPlan);
  el("startSessionBtn").addEventListener("click", startSession);
  el("saveSessionBtn").addEventListener("click", saveSession);
}

function renderAll() {
  renderPlanEditorMode();
  renderDraftPlan();
  renderPlans();
  renderSessionPlanSelect();
  renderActiveSession();
  renderHistory();
  renderPB();
}

function renderPlanEditorMode() {
  const isEditing = Boolean(editingPlanId);
  el("planEditorTitle").textContent = isEditing ? "Redigera upplägg" : "Skapa upplägg";
  el("planEditorHelp").innerHTML = isEditing
    ? `<span class="editing-badge">Redigerar standardupplägg</span><br>Ändringar påverkar bara standardupplägget, inte historiken.`
    : "Här administrerar du dina standardupplägg.";
  el("savePlanBtn").textContent = isEditing ? "Spara ändringar" : "Spara upplägg";
  el("cancelEditBtn").classList.toggle("hidden", !isEditing);
}

function addExerciseToDraft() {
  draftPlan.exercises.push({
    id: makeId(),
    name: "",
    sets: [{ id: makeId(), weight: "", reps: "" }]
  });
  renderDraftPlan();
}

function renderDraftPlan() {
  el("planName").value = draftPlan.name;
  const container = el("exerciseEditor");

  container.innerHTML = draftPlan.exercises.map((exercise, exIndex) => `
    <div class="exercise-editor">
      <div class="exercise-name-row">
        <div>
          <label>Övning</label>
          <input value="${escapeHtml(exercise.name)}" placeholder="Exempel: Marklyft"
            oninput="updateDraftExerciseName(${exIndex}, this.value)" />
        </div>
        <button class="danger" onclick="removeDraftExercise(${exIndex})">Ta bort</button>
      </div>

      ${exercise.sets.map((set, setIndex) => `
        <div class="set-row">
          <div class="set-index">${setIndex + 1}</div>
          <input type="number" inputmode="decimal" value="${escapeHtml(set.weight)}"
            placeholder="kg" oninput="updateDraftSet(${exIndex}, ${setIndex}, 'weight', this.value)" />
          <input type="number" inputmode="numeric" value="${escapeHtml(set.reps)}"
            placeholder="reps" oninput="updateDraftSet(${exIndex}, ${setIndex}, 'reps', this.value)" />
          <button class="danger" onclick="removeDraftSet(${exIndex}, ${setIndex})">×</button>
        </div>
      `).join("")}

      <button class="secondary full" onclick="addDraftSet(${exIndex})">+ Lägg till set</button>
    </div>
  `).join("");
}

window.updateDraftExerciseName = (exIndex, value) => {
  draftPlan.exercises[exIndex].name = value;
};

window.updateDraftSet = (exIndex, setIndex, field, value) => {
  draftPlan.exercises[exIndex].sets[setIndex][field] = value;
};

window.addDraftSet = (exIndex) => {
  draftPlan.exercises[exIndex].sets.push({ id: makeId(), weight: "", reps: "" });
  renderDraftPlan();
};

window.removeDraftSet = (exIndex, setIndex) => {
  draftPlan.exercises[exIndex].sets.splice(setIndex, 1);
  if (draftPlan.exercises[exIndex].sets.length === 0) {
    draftPlan.exercises[exIndex].sets.push({ id: makeId(), weight: "", reps: "" });
  }
  renderDraftPlan();
};

window.removeDraftExercise = (exIndex) => {
  draftPlan.exercises.splice(exIndex, 1);
  renderDraftPlan();
};

function cleanDraftPlan() {
  const name = el("planName").value.trim();

  const exercises = draftPlan.exercises
    .map(ex => ({
      ...ex,
      name: String(ex.name || "").trim(),
      sets: ex.sets
        .filter(s => String(s.weight ?? "") !== "" || String(s.reps ?? "") !== "")
        .map(s => ({
          id: s.id || makeId(),
          weight: Number(s.weight || 0),
          reps: Number(s.reps || 0)
        }))
    }))
    .filter(ex => ex.name && ex.sets.length > 0);

  return { name, exercises };
}

function saveDraftPlan() {
  const cleaned = cleanDraftPlan();

  if (!cleaned.name) {
    alert("Skriv ett namn på upplägget.");
    return;
  }

  if (cleaned.exercises.length === 0) {
    alert("Lägg till minst en övning med minst ett set.");
    return;
  }

  if (editingPlanId) {
    const idx = data.plans.findIndex(p => p.id === editingPlanId);
    if (idx !== -1) {
      data.plans[idx] = {
        ...data.plans[idx],
        name: cleaned.name,
        exercises: cleaned.exercises.map(ex => ({
          id: ex.id || makeId(),
          name: ex.name,
          sets: ex.sets
        }))
      };
    }
    editingPlanId = null;
  } else {
    data.plans.push({
      id: makeId(),
      name: cleaned.name,
      exercises: cleaned.exercises.map(ex => ({
        id: ex.id || makeId(),
        name: ex.name,
        sets: ex.sets
      }))
    });
  }

  draftPlan = createEmptyDraft();
  saveData();
  renderAll();
}

window.editPlan = (planId) => {
  const plan = data.plans.find(p => p.id === planId);
  if (!plan) return;

  editingPlanId = plan.id;
  draftPlan = clone(plan);
  renderAll();

  document.querySelector('[data-tab="plans"]').click();
  window.scrollTo({ top: 0, behavior: "smooth" });
};

function cancelEditPlan() {
  editingPlanId = null;
  draftPlan = createEmptyDraft();
  renderAll();
}

function renderPlans() {
  const container = el("plansList");
  if (data.plans.length === 0) {
    container.innerHTML = `<div class="empty">Inga upplägg skapade ännu.</div>`;
    return;
  }

  container.innerHTML = data.plans.map((plan, idx) => {
    const totalSets = plan.exercises.reduce((sum, ex) => sum + ex.sets.length, 0);
    return `
      <div class="plan-item">
        <div class="exercise-header">
          <div>
            <h3>${escapeHtml(plan.name)}</h3>
            <p class="plan-summary">${plan.exercises.length} övningar · ${totalSets} set</p>
          </div>
          <div class="plan-actions">
            <button class="secondary" onclick="editPlan('${plan.id}')">Redigera</button>
            <button class="danger" onclick="deletePlan(${idx})">Ta bort</button>
          </div>
        </div>
        <div class="plan-exercises">
          ${plan.exercises.map(ex => `
            <div class="plan-exercise-line">
              <span>${escapeHtml(ex.name)}</span>
              <span>${ex.sets.length} set</span>
            </div>
          `).join("")}
        </div>
      </div>
    `;
  }).join("");
}

window.deletePlan = (idx) => {
  if (!confirm("Vill du ta bort upplägget?")) return;

  if (data.plans[idx]?.id === editingPlanId) {
    editingPlanId = null;
    draftPlan = createEmptyDraft();
  }

  data.plans.splice(idx, 1);
  saveData();
  renderAll();
};

function renderSessionPlanSelect() {
  const select = el("sessionPlanSelect");
  if (data.plans.length === 0) {
    select.innerHTML = `<option value="">Skapa ett upplägg först</option>`;
    el("startSessionBtn").disabled = true;
    return;
  }

  el("startSessionBtn").disabled = false;
  select.innerHTML = data.plans.map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join("");
}

function startSession() {
  const planId = el("sessionPlanSelect").value;
  const plan = data.plans.find(p => p.id === planId);
  if (!plan) return;

  activeSession = {
    id: makeId(),
    planId: plan.id,
    planName: plan.name,
    date: new Date().toISOString().slice(0, 10),
    exercises: plan.exercises.map(ex => ({
      id: makeId(),
      templateExerciseId: ex.id,
      name: ex.name,
      done: false,
      updateStandard: false,
      sets: ex.sets.map(s => ({
        id: makeId(),
        weight: s.weight,
        reps: s.reps
      }))
    }))
  };

  el("saveConfirmation").classList.add("hidden");
  renderActiveSession();
}

function renderActiveSession() {
  const card = el("activeSessionCard");
  if (!activeSession) {
    card.classList.add("hidden");
    return;
  }

  card.classList.remove("hidden");
  el("activeSessionTitle").textContent = activeSession.planName;
  el("activeSessionDate").textContent = activeSession.date;

  const doneCount = activeSession.exercises.filter(ex => ex.done).length;
  el("sessionProgress").textContent = `${doneCount}/${activeSession.exercises.length} klara`;

  el("activeExercises").innerHTML = activeSession.exercises.map((ex, exIndex) => `
    <div class="session-exercise ${ex.done ? "done" : ""}">
      <div class="checkbox-row">
        <input type="checkbox" ${ex.done ? "checked" : ""} onchange="toggleExerciseDone(${exIndex}, this.checked)" />
        <h3>${escapeHtml(ex.name)}</h3>
      </div>

      ${ex.sets.map((set, setIndex) => `
        <div class="set-row">
          <div class="set-index">${setIndex + 1}</div>
          <input type="number" inputmode="decimal" value="${set.weight}"
            oninput="updateSessionSet(${exIndex}, ${setIndex}, 'weight', this.value)" />
          <input type="number" inputmode="numeric" value="${set.reps}"
            oninput="updateSessionSet(${exIndex}, ${setIndex}, 'reps', this.value)" />
          <button class="danger" onclick="removeSessionSet(${exIndex}, ${setIndex})">×</button>
        </div>
      `).join("")}

      <button class="secondary full" onclick="addSessionSet(${exIndex})">+ Lägg till set</button>
    </div>
  `).join("");

  el("updateStandardOptions").innerHTML = activeSession.exercises.map((ex, exIndex) => `
    <label class="checkbox-row">
      <input type="checkbox" ${ex.updateStandard ? "checked" : ""} onchange="toggleUpdateStandard(${exIndex}, this.checked)" />
      <span>Uppdatera standard för ${escapeHtml(ex.name)}</span>
    </label>
  `).join("");
}

window.toggleExerciseDone = (exIndex, checked) => {
  activeSession.exercises[exIndex].done = checked;
  renderActiveSession();
};

window.updateSessionSet = (exIndex, setIndex, field, value) => {
  activeSession.exercises[exIndex].sets[setIndex][field] = Number(value || 0);
};

window.addSessionSet = (exIndex) => {
  activeSession.exercises[exIndex].sets.push({ id: makeId(), weight: 0, reps: 0 });
  renderActiveSession();
};

window.removeSessionSet = (exIndex, setIndex) => {
  activeSession.exercises[exIndex].sets.splice(setIndex, 1);
  if (activeSession.exercises[exIndex].sets.length === 0) {
    activeSession.exercises[exIndex].sets.push({ id: makeId(), weight: 0, reps: 0 });
  }
  renderActiveSession();
};

window.toggleUpdateStandard = (exIndex, checked) => {
  activeSession.exercises[exIndex].updateStandard = checked;
};

function saveSession() {
  if (!activeSession) return;

  data.sessions.unshift(clone(activeSession));

  const plan = data.plans.find(p => p.id === activeSession.planId);
  if (plan) {
    activeSession.exercises.forEach(sessionExercise => {
      if (!sessionExercise.updateStandard) return;
      const templateExercise = plan.exercises.find(ex => ex.id === sessionExercise.templateExerciseId);
      if (templateExercise) {
        templateExercise.sets = sessionExercise.sets.map(s => ({
          id: makeId(),
          weight: Number(s.weight || 0),
          reps: Number(s.reps || 0)
        }));
      }
    });
  }

  const exercisesCount = activeSession.exercises.length;
  const setsCount = activeSession.exercises.reduce((sum, ex) => sum + ex.sets.length, 0);
  const date = activeSession.date;

  activeSession = null;
  saveData();
  renderAll();

  el("saveConfirmation").innerHTML = `
    <strong>Pass sparat ✅</strong>
    <p class="muted">Övningar: ${exercisesCount}<br>Totalt antal set: ${setsCount}<br>Datum: ${date}</p>
  `;
  el("saveConfirmation").classList.remove("hidden");
}

function renderHistory() {
  const container = el("historyList");
  if (data.sessions.length === 0) {
    container.innerHTML = `<div class="empty">Ingen historik ännu.</div>`;
    return;
  }

  container.innerHTML = data.sessions.map(session => `
    <div class="history-item">
      <div class="history-date">${session.date}</div>
      <p class="muted">${escapeHtml(session.planName)}</p>
      ${session.exercises.map(ex => `
        <div class="history-exercise">
          <strong>${escapeHtml(ex.name)}</strong>
          <div class="history-sets">
            ${ex.sets.map(s => `${s.weight} kg × ${s.reps}`).join("<br>")}
          </div>
        </div>
      `).join("")}
    </div>
  `).join("");
}

function renderPB() {
  const pbs = {};

  data.sessions.forEach(session => {
    session.exercises.forEach(ex => {
      ex.sets.forEach(set => {
        const weight = Number(set.weight || 0);
        const reps = Number(set.reps || 0);
        if (!pbs[ex.name] || weight > pbs[ex.name].weight) {
          pbs[ex.name] = { exercise: ex.name, weight, reps, date: session.date };
        }
      });
    });
  });

  const values = Object.values(pbs).sort((a, b) => a.exercise.localeCompare(b.exercise));
  const container = el("pbList");

  if (values.length === 0) {
    container.innerHTML = `<div class="empty">Inga personbästan ännu.</div>`;
    return;
  }

  container.innerHTML = values.map(pb => `
    <div class="pb-item">
      <strong>${escapeHtml(pb.exercise)}</strong>
      <div class="pb-lift">${pb.weight} kg × ${pb.reps}</div>
      <div class="pb-meta">${pb.date}</div>
    </div>
  `).join("");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
