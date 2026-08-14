const History = {
  async init() {
    console.log("History.init() startar.");

    await this.load();
    this.render();
    this.renderPB();

    console.log("History.init() klar.");
  },

  async load() {
    try {
      const loadedSessions = await Storage.loadSessions();

      app.state.sessions = loadedSessions;

      console.log(
        `History.load(): ${loadedSessions.length} pass hämtades.`
      );

      return loadedSessions;
    } catch (error) {
      console.error("History.load() misslyckades:", error);
      throw error;
    }
  },

  calculatePB() {
    const personalBests = new Map();

    app.state.sessions.forEach(session => {
      session.exercises.forEach(exercise => {
        exercise.sets.forEach(set => {
          const weight = Number(set.weight || 0);
          const reps = Number(set.reps || 0);

          const exerciseKey = exercise.exerciseId ||
            `legacy:${Exercises.identityKey(exercise.name)}`;

          const canonicalExercise =
            Exercises.getById(exercise.exerciseId);

          const currentBest = personalBests.get(exerciseKey);

          if (!currentBest || weight > currentBest.weight) {
            personalBests.set(exerciseKey, {
              exercise: canonicalExercise?.name || exercise.name,
              weight,
              reps,
              date: session.date
            });
          }
        });
      });
    });

    return [...personalBests.values()].sort((first, second) => {
      return first.exercise.localeCompare(
        second.exercise,
        "sv"
      );
    });
  },

  render() {
    const historyList =
      document.getElementById("historyList");

    if (!historyList) {
      console.error(
        "History.render(): Elementet #historyList saknas."
      );

      return;
    }

    const sessions = app.state.sessions;

    if (sessions.length === 0) {
      historyList.innerHTML =
        '<div class="empty">Ingen historik ännu.</div>';

      return;
    }

    historyList.innerHTML = sessions
      .map(session => {
        const exercisesHtml = session.exercises
          .map(exercise => {
            const setsHtml = exercise.sets
              .map(set => {
                return `
                  ${utils.escapeHtml(set.weight)} kg ×
                  ${utils.escapeHtml(set.reps)}
                `;
              })
              .join("<br>");

            return `
              <div class="history-exercise">
                <strong>
                  ${utils.escapeHtml(exercise.name)}
                </strong>

                <div class="history-sets">
                  ${setsHtml}
                </div>
              </div>
            `;
          })
          .join("");

        return `
          <details class="history-item">
            <summary class="history-summary">
              <span class="history-heading">
                <span class="history-date">
                  ${utils.escapeHtml(session.date)}
                </span>

                <span class="muted history-plan-name">
                  ${utils.escapeHtml(session.planName)}
                </span>
              </span>

              <span class="history-chevron" aria-hidden="true">
                &#9662;
              </span>
            </summary>

            <div class="history-details">
              ${exercisesHtml}
            </div>
          </details>
        `;
      })
      .join("");
  },

  renderPB() {
    const pbList = document.getElementById("pbList");

    if (!pbList) {
      console.error(
        "History.renderPB(): Elementet #pbList saknas."
      );

      return;
    }

    const personalBests = this.calculatePB();

    if (personalBests.length === 0) {
      pbList.innerHTML =
        '<div class="empty">Inga personbästan ännu.</div>';

      return;
    }

    pbList.innerHTML = personalBests
      .map(personalBest => {
        return `
          <div class="pb-item">
            <strong>
              ${utils.escapeHtml(personalBest.exercise)}
            </strong>

            <div class="pb-lift">
              ${utils.escapeHtml(personalBest.weight)} kg ×
              ${utils.escapeHtml(personalBest.reps)}
            </div>

            <div class="pb-meta">
              ${utils.escapeHtml(personalBest.date)}
            </div>
          </div>
        `;
      })
      .join("");
  }
};

window.History = History;
