const Sessions = {
  activeSession: null,

  async init() {
    console.log("Sessions.init() startar.");

    this.bindEvents();
    this.renderPlanSelect();
    this.render();

    console.log("Sessions.init() klar.");
  },

  bindEvents() {
    const startSessionButton =
      document.getElementById("startSessionBtn");

    const saveSessionButton =
      document.getElementById("saveSessionBtn");

    if (!startSessionButton || !saveSessionButton) {
      throw new Error(
        "Knapparna för träningspass kunde inte hittas."
      );
    }

    startSessionButton.onclick = () => {
      this.start();
    };

    saveSessionButton.onclick = () => {
      this.save();
    };
  },

  renderPlanSelect() {
    const select =
      document.getElementById("sessionPlanSelect");

    const startButton =
      document.getElementById("startSessionBtn");

    const plans = app.state.plans;

    if (!plans.length) {
      select.innerHTML =
        "<option>Skapa ett upplägg först</option>";

      startButton.disabled = true;
      return;
    }

    select.innerHTML = plans
      .map(plan => {
        return `
          <option value="${plan.id}">
            ${utils.escapeHtml(plan.name)}
          </option>
        `;
      })
      .join("");

    startButton.disabled = false;
  },

  start() {
    const select =
      document.getElementById("sessionPlanSelect");

    const selectedPlan = app.state.plans.find(plan => {
      return plan.id === select.value;
    });

    if (!selectedPlan) {
      alert("Välj ett giltigt upplägg.");
      return;
    }

    this.activeSession = {
      id: utils.id(),
      planId: selectedPlan.id,
      planName: selectedPlan.name,
      date: new Date().toISOString().slice(0, 10),

      exercises: selectedPlan.exercises.map(exercise => {
        return {
          id: utils.id(),
          templateExerciseId: exercise.id,
          name: exercise.name,
          done: false,

          sets: exercise.sets.map(set => {
            return {
              id: utils.id(),
              weight: set.weight,
              reps: set.reps
            };
          })
        };
      })
    };

    this.render();
  },

  toggleDone(exerciseIndex, isDone) {
    const exercise =
      this.activeSession?.exercises[exerciseIndex];

    if (!exercise) {
      return;
    }

    exercise.done = isDone;
    this.render();
  },

  updateSetWeight(exerciseIndex, setIndex, weight) {
    const set =
      this.activeSession
        ?.exercises[exerciseIndex]
        ?.sets[setIndex];

    if (set) {
      set.weight = Number(weight || 0);
    }
  },

  updateSetReps(exerciseIndex, setIndex, reps) {
    const set =
      this.activeSession
        ?.exercises[exerciseIndex]
        ?.sets[setIndex];

    if (set) {
      set.reps = Number(reps || 0);
    }
  },

async save() {
  if (!this.activeSession) {
    alert("Det finns inget aktivt pass att spara.");
    return;
  }

  const completedExercises =
    this.activeSession.exercises.filter(exercise => {
      return exercise.done;
    });

  if (completedExercises.length === 0) {
    alert(
      "Markera minst en övning som genomförd innan du sparar passet."
    );

    return;
  }

  if (
    completedExercises.length < this.activeSession.exercises.length
  ) {
    const confirmed = confirm(
      `Du har markerat ${completedExercises.length} av ` +
      `${this.activeSession.exercises.length} övningar som genomförda. ` +
      "Endast de genomförda övningarna sparas. Vill du fortsätta?"
    );

    if (!confirmed) {
      return;
    }
  }

  const saveButton =
    document.getElementById("saveSessionBtn");

  saveButton.disabled = true;
  saveButton.textContent = "Sparar...";

  try {
    const savedSession = this.activeSession;

    await Storage.saveSession(savedSession);

    await History.load();
    History.render();
    History.renderPB();

    const exerciseCount = completedExercises.length;

    const setCount = completedExercises.reduce(
      (total, exercise) => {
        return total + exercise.sets.length;
      },
      0
    );

    this.activeSession = null;
    this.render();

    const confirmation =
      document.getElementById("saveConfirmation");

    confirmation.innerHTML = `
      <strong>Pass sparat ✅</strong>

      <p class="muted">
        Genomförda övningar: ${exerciseCount}<br>
        Totalt antal set: ${setCount}<br>
        Datum: ${utils.escapeHtml(savedSession.date)}
      </p>
    `;

    confirmation.classList.remove("hidden");

    console.log("Sessions.save(): passet sparades.");
  } catch (error) {
    console.error("Sessions.save() misslyckades:", error);

    alert(
      `Kunde inte spara passet: ${error.message}`
    );
  } finally {
    saveButton.disabled = false;
    saveButton.textContent = "Spara pass";
  }
},

  render() {
    const card =
      document.getElementById("activeSessionCard");

    if (!this.activeSession) {
      card.classList.add("hidden");
      return;
    }

    card.classList.remove("hidden");

    document.getElementById(
      "activeSessionTitle"
    ).textContent = this.activeSession.planName;

    document.getElementById(
      "activeSessionDate"
    ).textContent = this.activeSession.date;

    const completedCount =
      this.activeSession.exercises.filter(exercise => {
        return exercise.done;
      }).length;

    document.getElementById(
      "sessionProgress"
    ).textContent =
      `${completedCount}/${this.activeSession.exercises.length} klara`;

    const exercisesHtml =
      this.activeSession.exercises
        .map((exercise, exerciseIndex) => {
          const setsHtml = exercise.sets
            .map((set, setIndex) => {
              return `
                <div class="set-row">
                  <div class="set-index">
                    ${setIndex + 1}
                  </div>

                  <input
                    type="number"
                    inputmode="decimal"
                    value="${utils.escapeHtml(set.weight)}"
                    oninput="
                      Sessions.updateSetWeight(
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
                    oninput="
                      Sessions.updateSetReps(
                        ${exerciseIndex},
                        ${setIndex},
                        this.value
                      )
                    "
                  >
                </div>
              `;
            })
            .join("");

          return `
            <div class="session-exercise ${
              exercise.done ? "done" : ""
            }">
              <div class="exercise-header">
                <label class="checkbox-row">
                  <input
                    type="checkbox"
                    ${exercise.done ? "checked" : ""}
                    onchange="
                      Sessions.toggleDone(
                        ${exerciseIndex},
                        this.checked
                      )
                    "
                  >

                  <span>
                    <strong>
                      ${utils.escapeHtml(exercise.name)}
                    </strong>
                  </span>
                </label>
              </div>

              ${setsHtml}
            </div>
          `;
        })
        .join("");

    document.getElementById(
      "activeExercises"
    ).innerHTML = exercisesHtml;
  }
};

window.Sessions = Sessions;