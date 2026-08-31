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

  parseSessionDate(value) {
    const match = String(value || "").match(
      /^(\d{4})-(\d{2})-(\d{2})/
    );

    if (!match) {
      return null;
    }

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(year, month - 1, day);

    if (
      date.getFullYear() !== year ||
      date.getMonth() !== month - 1 ||
      date.getDate() !== day
    ) {
      return null;
    }

    return date;
  },

  countSessionsInLastDays(days) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const firstDay = new Date(today);
    firstDay.setDate(today.getDate() - (days - 1));

    return app.state.sessions.filter(session => {
      const sessionDate = this.parseSessionDate(session.date);

      return sessionDate &&
        sessionDate >= firstDay &&
        sessionDate <= today;
    }).length;
  },

  getSummaryHtml() {
    const sevenDayCount = this.countSessionsInLastDays(7);
    const thirtyDayCount = this.countSessionsInLastDays(30);

    return `
      <div
        class="history-stats"
        role="group"
        aria-label="Träningssammanfattning"
      >
        <div class="history-stat">
          <strong class="history-stat-value">
            ${sevenDayCount} pass
          </strong>
          <span class="history-stat-label">
            Senaste 7 dagarna
          </span>
        </div>

        <div class="history-stat">
          <strong class="history-stat-value">
            ${thirtyDayCount} pass
          </strong>
          <span class="history-stat-label">
            Senaste 30 dagarna
          </span>
        </div>
      </div>
    `;
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

          const isBetterResult = !currentBest ||
            weight > currentBest.weight ||
            (
              weight === currentBest.weight &&
              reps > currentBest.reps
            );

          if (isBetterResult) {
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
    const summaryHtml = this.getSummaryHtml();

    if (sessions.length === 0) {
      historyList.innerHTML =
        `${summaryHtml}
        <div class="empty">Ingen historik ännu.</div>`;

      return;
    }

    const sessionsHtml = sessions
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

    historyList.innerHTML = summaryHtml + sessionsHtml;
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
    const featuredExerciseNames = ["Bänkpress", "Marklyft"];
    const featuredExerciseKeys = new Set(
      featuredExerciseNames.map(name =>
        Exercises.identityKey(name)
      )
    );

    const featuredHtml = featuredExerciseNames
      .map(exerciseName => {
        const exerciseKey = Exercises.identityKey(exerciseName);
        const personalBest = personalBests.find(item => {
          return Exercises.identityKey(item.exercise) ===
            exerciseKey;
        });

        const resultHtml = personalBest
          ? `
              <span class="featured-pb-lift">
                ${utils.escapeHtml(personalBest.weight)} kg ×
                ${utils.escapeHtml(personalBest.reps)}
              </span>

              <span class="featured-pb-date">
                ${utils.escapeHtml(personalBest.date)}
              </span>
            `
          : `
              <span class="featured-pb-empty">
                Inget PB ännu
              </span>
            `;

        return `
          <div class="featured-pb-item">
            <strong class="featured-pb-name">
              ${utils.escapeHtml(exerciseName)}
            </strong>

            ${resultHtml}
          </div>
        `;
      })
      .join("");

    const otherPersonalBests = personalBests.filter(item => {
      return !featuredExerciseKeys.has(
        Exercises.identityKey(item.exercise)
      );
    });

    const otherPersonalBestsHtml = otherPersonalBests.length > 0
      ? otherPersonalBests
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
      .join("")
      : '<div class="empty">Inga övriga PB ännu.</div>';

    pbList.innerHTML = `
      <div
        class="featured-pb"
        role="group"
        aria-label="Utvalda personbästa"
      >
        ${featuredHtml}
      </div>

      <h3 class="pb-section-title">
        Övriga personbästa
      </h3>

      ${otherPersonalBestsHtml}
    `;
  }
};

window.History = History;
