const Plans = {
  draft: null,

  async init() {
    console.log("Plans.init() startar.");

    this.resetDraft();
    this.bindEvents();

    await this.load();

    this.renderEditor();
    this.renderDraft();
    this.render();

    console.log("Plans.init() klar.");
  },

  bindEvents() {
    const addExerciseButton = document.getElementById("addExerciseBtn");
    const savePlanButton = document.getElementById("savePlanBtn");
    const cancelEditButton = document.getElementById("cancelEditBtn");

    if (
      !addExerciseButton ||
      !savePlanButton ||
      !cancelEditButton
    ) {
      throw new Error(
        "Formuläret för träningsupplägg kunde inte hittas."
      );
    }

    addExerciseButton.onclick = () => {
      this.addExercise();
    };

    savePlanButton.onclick = () => {
      if (this.draft.id) {
        this.update();
      } else {
        this.create();
      }
    };

    cancelEditButton.onclick = () => {
      this.cancelEdit();
    };
  },

  createEmptyPlan() {
    return {
      id: null,
      name: "",
      exercises: []
    };
  },

  createEmptySet() {
    return {
      id: utils.id(),
      weight: "",
      reps: ""
    };
  },

  resetDraft() {
    this.draft = this.createEmptyPlan();
  },

  addExercise() {
    this.draft.exercises.push({
      id: utils.id(),
      name: "",
      sets: [this.createEmptySet()]
    });

    this.renderDraft();
  },

  removeExercise(exerciseIndex) {
    this.draft.exercises.splice(exerciseIndex, 1);
    this.renderDraft();
  },

  addSet(exerciseIndex) {
    const exercise = this.draft.exercises[exerciseIndex];

    if (!exercise) {
      return;
    }

    exercise.sets.push(this.createEmptySet());
    this.renderDraft();
  },

  removeSet(exerciseIndex, setIndex) {
    const exercise = this.draft.exercises[exerciseIndex];

    if (!exercise) {
      return;
    }

    exercise.sets.splice(setIndex, 1);

    if (exercise.sets.length === 0) {
      exercise.sets.push(this.createEmptySet());
    }

    this.renderDraft();
  },

  updateExerciseName(exerciseIndex, name) {
    const exercise = this.draft.exercises[exerciseIndex];

    if (exercise) {
      exercise.name = name;
    }
  },

  updateSetWeight(exerciseIndex, setIndex, weight) {
    const set =
      this.draft.exercises[exerciseIndex]?.sets[setIndex];

    if (set) {
      set.weight = weight;
    }
  },

  updateSetReps(exerciseIndex, setIndex, reps) {
    const set =
      this.draft.exercises[exerciseIndex]?.sets[setIndex];

    if (set) {
      set.reps = reps;
    }
  },

  getPlanFromForm() {
    const planNameInput =
      document.getElementById("planName");

    const planName = planNameInput.value.trim();

    const exercises = this.draft.exercises
      .map(exercise => ({
        name: String(exercise.name || "").trim(),

        sets: exercise.sets
          .filter(set => {
            return (
              String(set.weight ?? "") !== "" ||
              String(set.reps ?? "") !== ""
            );
          })
          .map(set => ({
            weight: Number(set.weight || 0),
            reps: Number(set.reps || 0)
          }))
      }))
      .filter(exercise => {
        return exercise.name && exercise.sets.length > 0;
      });

    if (!planName) {
      alert("Skriv ett namn på upplägget.");
      return null;
    }

    if (exercises.length === 0) {
      alert(
        "Lägg till minst en övning med minst ett set."
      );

      return null;
    }

    return {
      id: this.draft.id,
      name: planName,
      exercises
    };
  },

  async load() {
    try {
      const loadedPlans = await Storage.loadPlans();

      app.state.plans = loadedPlans;

      console.log(
        `Plans.load(): ${loadedPlans.length} upplägg hämtades.`
      );

      return loadedPlans;
    } catch (error) {
      console.error("Plans.load() misslyckades:", error);
      throw error;
    }
  },

  async create() {
    const plan = this.getPlanFromForm();

    if (!plan) {
      return;
    }

    await this.savePlan(plan, "Plans.create()");
  },

  edit(planId) {
    const plan = app.state.plans.find(item => {
      return item.id === planId;
    });

    if (!plan) {
      alert("Upplägget kunde inte hittas.");
      return;
    }

    this.draft = utils.clone(plan);

    const planNameInput =
      document.getElementById("planName");

    planNameInput.value = this.draft.name;

    this.renderEditor();
    this.renderDraft();

    window.scrollTo({
      top: 0,
      behavior: "smooth"
    });
  },

  async update() {
    const plan = this.getPlanFromForm();

    if (!plan) {
      return;
    }

    if (!plan.id) {
      alert("Upplägget som ska redigeras saknar id.");
      return;
    }

    await this.savePlan(plan, "Plans.update()");
  },

  async savePlan(plan, logName) {
    const savePlanButton =
      document.getElementById("savePlanBtn");

    savePlanButton.disabled = true;
    savePlanButton.textContent = "Sparar...";

    try {
      await Storage.savePlan(plan);

      this.resetDraft();

      document.getElementById("planName").value = "";

      await this.load();

      this.renderEditor();
      this.renderDraft();
      this.render();

      console.log(`${logName}: upplägget sparades.`);
    } catch (error) {
      console.error(`${logName} misslyckades:`, error);

      alert(
        `Kunde inte spara upplägget: ${error.message}`
      );
    } finally {
      savePlanButton.disabled = false;
      this.renderEditor();
    }
  },

  cancelEdit() {
    this.resetDraft();

    document.getElementById("planName").value = "";

    this.renderEditor();
    this.renderDraft();
  },

async delete(planId) {
  const plan = app.state.plans.find(item => {
    return item.id === planId;
  });

  if (!plan) {
    alert("Upplägget kunde inte hittas.");
    return;
  }

  const confirmed = confirm(
    `Vill du ta bort upplägget "${plan.name}"?`
  );

  if (!confirmed) {
    return;
  }

  try {
    await Storage.deletePlan(planId);

    if (this.draft?.id === planId) {
      this.cancelEdit();
    }

    await this.load();
    this.render();

    console.log("Plans.delete(): upplägget togs bort.");
  } catch (error) {
    console.error("Plans.delete() misslyckades:", error);

    alert(
      `Kunde inte ta bort upplägget: ${error.message}`
    );
  }
},

  renderEditor() {
    const title =
      document.getElementById("planEditorTitle");

    const help =
      document.getElementById("planEditorHelp");

    const saveButton =
      document.getElementById("savePlanBtn");

    const cancelButton =
      document.getElementById("cancelEditBtn");

    const isEditing = Boolean(this.draft?.id);

    if (isEditing) {
      title.textContent = "Redigera upplägg";

      help.innerHTML = `
        <span class="editing-badge">
          Redigerar standardupplägg
        </span>
        <br>
        Historiken påverkas inte.
      `;

      saveButton.textContent = "Spara ändringar";
      cancelButton.classList.remove("hidden");
    } else {
      title.textContent = "Skapa upplägg";

      help.textContent =
        "Här administrerar du dina standardupplägg.";

      saveButton.textContent = "Spara upplägg";
      cancelButton.classList.add("hidden");
    }
  },

  renderDraft() {
    const exerciseEditor =
      document.getElementById("exerciseEditor");

    exerciseEditor.innerHTML = this.draft.exercises
      .map((exercise, exerciseIndex) => {
        const setsHtml = exercise.sets
          .map((set, setIndex) => `
            <div class="set-row">
              <div class="set-index">
                ${setIndex + 1}
              </div>

              <input
                type="number"
                inputmode="decimal"
                value="${utils.escapeHtml(set.weight)}"
                placeholder="kg"
                oninput="
                  Plans.updateSetWeight(
                    ${exerciseIndex},
                    ${setIndex},
                    this.value
                  )
                "
              >

              <input
                type="number"
                inputmode="numeric"
                value="${utils.escapeHtml(set.reps)}"
                placeholder="reps"
                oninput="
                  Plans.updateSetReps(
                    ${exerciseIndex},
                    ${setIndex},
                    this.value
                  )
                "
              >

              <button
                class="danger"
                onclick="
                  Plans.removeSet(
                    ${exerciseIndex},
                    ${setIndex}
                  )
                "
              >
                ×
              </button>
            </div>
          `)
          .join("");

        return `
          <div class="exercise-editor">
            <div class="exercise-name-row">
              <div>
                <label>Övning</label>

                <input
                  list="exerciseSuggestions"
                  value="${utils.escapeHtml(exercise.name)}"
                  placeholder="Exempel: Marklyft"
                  oninput="
                    Plans.updateExerciseName(
                      ${exerciseIndex},
                      this.value
                    )
                  "
                >
              </div>

              <button
                class="danger"
                onclick="
                  Plans.removeExercise(${exerciseIndex})
                "
              >
                Ta bort
              </button>
            </div>

            ${setsHtml}

            <button
              class="secondary full"
              onclick="Plans.addSet(${exerciseIndex})"
            >
              + Lägg till set
            </button>
          </div>
        `;
      })
      .join("");
  },

  render() {
    const plansList =
      document.getElementById("plansList");

    if (!plansList) {
      console.error(
        "Plans.render(): Elementet #plansList saknas."
      );

      return;
    }

    const plans = app.state.plans;

    if (plans.length === 0) {
      plansList.innerHTML =
        '<div class="empty">Inga upplägg skapade ännu.</div>';

      return;
    }

    plansList.innerHTML = plans
      .map(plan => {
        const exerciseCount = plan.exercises.length;

        const setCount = plan.exercises.reduce(
          (total, exercise) => {
            return total + exercise.sets.length;
          },
          0
        );

        const exercisesHtml = plan.exercises
          .map(exercise => `
            <div class="plan-exercise-line">
              <span>
                ${utils.escapeHtml(exercise.name)}
              </span>

              <span>
                ${exercise.sets.length} set
              </span>
            </div>
          `)
          .join("");

        return `
          <div class="plan-item">
            <div class="exercise-header">
              <div>
                <h3>
                  ${utils.escapeHtml(plan.name)}
                </h3>

                <p class="plan-summary">
                  ${exerciseCount} övningar ·
                  ${setCount} set
                </p>
              </div>

<div class="plan-actions">
  <button
    class="secondary"
    onclick="Plans.edit('${plan.id}')"
  >
    Redigera
  </button>

  <button
    class="danger"
    onclick="Plans.delete('${plan.id}')"
  >
    Ta bort
  </button>
</div>
            </div>

            <div class="plan-exercises">
              ${exercisesHtml}
            </div>
          </div>
        `;
      })
      .join("");
  }
};

window.Plans = Plans;