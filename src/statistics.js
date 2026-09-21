const Statistics = {
  period: "threeMonths",
  activeTab: "overview",
  strengthExerciseId: null,
  strengthGoals: [],
  weeklySessionGoal: 3,
  goalsAvailable: true,
  loadError: null,
  isBound: false,

  async init() {
    console.log("Statistics.init() startar.");

    this.bindEvents();
    this.showLoading();

    try {
      const [strengthGoals, settings] = await Promise.all([
        Storage.loadStrengthGoals(),
        Storage.loadTrainingSettings()
      ]);

      this.strengthGoals = strengthGoals;
      this.weeklySessionGoal = settings?.weeklySessionGoal || 3;
      this.goalsAvailable = true;
      this.loadError = null;
    } catch (error) {
      console.error("Statistikmål kunde inte laddas:", error);
      this.goalsAvailable = false;
      this.loadError = error;
    }

    this.render();
    console.log("Statistics.init() klar.");
  },

  bindEvents() {
    if (this.isBound) {
      return;
    }

    this.isBound = true;

    document.querySelectorAll(".statistics-subtab").forEach(button => {
      button.onclick = () => {
        this.showTab(button.dataset.statisticsTab);
      };
    });

    const periodSelect = document.getElementById("statisticsPeriod");
    const exerciseSelect = document.getElementById(
      "strengthExerciseSelect"
    );

    periodSelect.onchange = () => {
      this.period = periodSelect.value;
      this.render();
    };

    exerciseSelect.onchange = () => {
      this.strengthExerciseId = exerciseSelect.value || null;
      this.renderStrength();
    };

    document.getElementById("cancelStrengthGoalBtn").onclick = () => {
      document.getElementById("strengthGoalDialog").close();
    };

    document.getElementById("strengthGoalForm").onsubmit = event => {
      event.preventDefault();
      this.saveStrengthGoal();
    };
  },

  showLoading() {
    const status = document.getElementById("statisticsStatus");

    status.className = "card statistics-status";
    status.textContent = "Laddar statistik...";
    status.hidden = false;
  },

  showTab(tabName) {
    this.activeTab = tabName;

    document.querySelectorAll(".statistics-subtab").forEach(button => {
      const isActive = button.dataset.statisticsTab === tabName;
      button.classList.toggle("active", isActive);
      button.setAttribute("aria-selected", String(isActive));
    });

    document.querySelectorAll(".statistics-panel").forEach(panel => {
      panel.classList.toggle(
        "active",
        panel.id === `statistics${this.capitalize(tabName)}`
      );
    });

    if (tabName === "history") {
      this.renderHistory();
    }
  },

  capitalize(value) {
    return value.charAt(0).toUpperCase() + value.slice(1);
  },

  refresh() {
    this.render();
  },

  render() {
    const status = document.getElementById("statisticsStatus");

    if (this.loadError) {
      status.className = "card statistics-status error-state";
      status.textContent =
        "Träningsstatistiken kunde läsas, men mål kunde inte hämtas. " +
        "Kontrollera att statistikmigrationen är körd i Supabase.";
      status.hidden = false;
    } else {
      status.hidden = true;
    }

    this.renderOverview();
    this.renderStrength();
    this.renderHabits();
    this.renderHistory();
    this.showTab(this.activeTab);
  },

  parseDate(value) {
    return History.parseSessionDate(value);
  },

  formatDateKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
  },

  addDays(date, days) {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    result.setHours(0, 0, 0, 0);
    return result;
  },

  startOfWeek(date) {
    const result = new Date(date);
    const day = result.getDay();
    const daysFromMonday = day === 0 ? 6 : day - 1;

    result.setDate(result.getDate() - daysFromMonday);
    result.setHours(0, 0, 0, 0);
    return result;
  },

  getToday() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
  },

  getPeriodStart() {
    const today = this.getToday();

    if (this.period === "year") {
      return new Date(today.getFullYear(), 0, 1);
    }

    if (this.period === "threeMonths") {
      const start = new Date(today);
      start.setMonth(start.getMonth() - 3);
      return start;
    }

    const sessionDates = app.state.sessions
      .map(session => this.parseDate(session.date))
      .filter(Boolean)
      .sort((first, second) => first - second);

    return sessionDates[0] || today;
  },

  getPeriodSessions() {
    const start = this.getPeriodStart();
    const today = this.getToday();

    return app.state.sessions.filter(session => {
      const date = this.parseDate(session.date);
      return date && date >= start && date <= today;
    });
  },

  getExerciseKey(exercise) {
    return exercise.exerciseId ||
      `legacy:${Exercises.identityKey(exercise.name)}`;
  },

  calculatePBEvents() {
    const currentBests = new Map();
    const events = [];
    const sessions = [...app.state.sessions].sort((first, second) => {
      const firstTime = new Date(
        first.completedAt || first.startedAt || first.date
      ).getTime();
      const secondTime = new Date(
        second.completedAt || second.startedAt || second.date
      ).getTime();

      return firstTime - secondTime;
    });

    sessions.forEach(session => {
      const sessionBests = new Map();

      session.exercises.forEach(exercise => {
        const key = this.getExerciseKey(exercise);

        exercise.sets.forEach(set => {
          const candidate = {
            key,
            exercise: exercise.name,
            weight: Number(set.weight || 0),
            reps: Number(set.reps || 0),
            date: session.date
          };
          const sessionBest = sessionBests.get(key);

          if (History.isBetterResult(
            candidate.weight,
            candidate.reps,
            sessionBest
          )) {
            sessionBests.set(key, candidate);
          }
        });
      });

      sessionBests.forEach(candidate => {
        const currentBest = currentBests.get(candidate.key);

        if (History.isBetterResult(
          candidate.weight,
          candidate.reps,
          currentBest
        )) {
          currentBests.set(candidate.key, candidate);
          events.push(candidate);
        }
      });
    });

    return events;
  },

  getWeekCounts(sessions = app.state.sessions) {
    const counts = new Map();

    sessions.forEach(session => {
      const date = this.parseDate(session.date);

      if (!date) {
        return;
      }

      const key = this.formatDateKey(this.startOfWeek(date));
      counts.set(key, (counts.get(key) || 0) + 1);
    });

    return counts;
  },

  calculateStreaks(weekCounts, requiredSessions = 1) {
    const qualifies = date => {
      return (weekCounts.get(this.formatDateKey(date)) || 0) >=
        requiredSessions;
    };
    const currentWeek = this.startOfWeek(this.getToday());
    let cursor = new Date(currentWeek);

    if (!qualifies(cursor)) {
      cursor = this.addDays(cursor, -7);
    }

    let current = 0;

    while (qualifies(cursor)) {
      current += 1;
      cursor = this.addDays(cursor, -7);
    }

    const qualifyingWeeks = [...weekCounts.keys()]
      .filter(key => weekCounts.get(key) >= requiredSessions)
      .map(key => this.parseDate(key))
      .filter(Boolean)
      .sort((first, second) => first - second);

    let longest = 0;
    let running = 0;
    let previous = null;

    qualifyingWeeks.forEach(week => {
      const isConsecutive = previous &&
        Math.round((week - previous) / 604800000) === 1;

      running = isConsecutive ? running + 1 : 1;
      longest = Math.max(longest, running);
      previous = week;
    });

    return { current, longest };
  },

  renderOverview() {
    const container = document.getElementById(
      "statisticsOverviewContent"
    );
    const sessions = this.getPeriodSessions();
    const sevenDayCount = History.countSessionsInLastDays(7);
    const thirtyDayCount = History.countSessionsInLastDays(30);
    const repetitions = sessions.reduce((sessionTotal, session) => {
      return sessionTotal + session.exercises.reduce(
        (exerciseTotal, exercise) => {
          return exerciseTotal + exercise.sets.reduce(
            (setTotal, set) => setTotal + Number(set.reps || 0),
            0
          );
        },
        0
      );
    }, 0);
    const periodStart = this.getPeriodStart();
    const personalBestCount = this.calculatePBEvents().filter(event => {
      const date = this.parseDate(event.date);
      return date && date >= periodStart && date <= this.getToday();
    }).length;

    if (app.state.sessions.length === 0) {
      container.innerHTML = `
        <section class="card empty-state">
          <h2>Ingen statistik ännu</h2>
          <p class="muted">Statistiken visas när ditt första genomförda pass har sparats.</p>
        </section>
      `;
      return;
    }

    const latestSession = sessions[0];
    const latestExerciseCount = latestSession?.exercises.length || 0;
    const latestExerciseLabel = latestExerciseCount === 1
      ? "1 övning"
      : `${latestExerciseCount} övningar`;
    const latestSessionHtml = latestSession
      ? `
          <div class="latest-session">
            <div>
              <strong>${utils.escapeHtml(latestSession.planName)}</strong>
              <span class="muted">${utils.escapeHtml(latestSession.date)} · ${utils.escapeHtml(latestExerciseLabel)}</span>
            </div>
            <button type="button" class="secondary" id="openStatisticsHistory">Historik</button>
          </div>
        `
      : '<div class="empty">Inga pass under vald period.</div>';

    container.innerHTML = `
      <section class="statistics-metrics" aria-label="Träningsöversikt">
        ${this.getMetricHtml(sevenDayCount, "pass", "Senaste 7 dagarna")}
        ${this.getMetricHtml(thirtyDayCount, "pass", "Senaste 30 dagarna")}
        ${this.getMetricHtml(repetitions, "reps", "Genomförda repetitioner")}
        ${this.getMetricHtml(personalBestCount, "PB", "Nya personbästa")}
      </section>

      <section class="card">
        <h2>Pass per kalendervecka</h2>
        <p class="muted small">Antal genomförda pass under vald period.</p>
        ${this.getWeeklyBarChartHtml(sessions)}
      </section>

      <section class="card">
        <h2>Senaste genomförda pass</h2>
        ${latestSessionHtml}
      </section>
    `;

    document.getElementById("openStatisticsHistory")?.addEventListener(
      "click",
      () => this.showTab("history")
    );
  },

  getMetricHtml(value, unit, label) {
    return `
      <div class="statistics-metric">
        <strong>${utils.escapeHtml(value)} <span>${utils.escapeHtml(unit)}</span></strong>
        <span>${utils.escapeHtml(label)}</span>
      </div>
    `;
  },

  getWeeklyBarChartHtml(sessions) {
    if (!sessions.length) {
      return '<div class="empty">Inga pass under vald period.</div>';
    }

    const counts = this.getWeekCounts(sessions);
    let cursor = this.startOfWeek(this.getPeriodStart());
    const end = this.startOfWeek(this.getToday());
    const weeks = [];

    while (cursor <= end) {
      weeks.push({
        date: new Date(cursor),
        count: counts.get(this.formatDateKey(cursor)) || 0
      });
      cursor = this.addDays(cursor, 7);
    }

    const maximum = Math.max(1, ...weeks.map(week => week.count));
    const labelStep = Math.max(1, Math.ceil(weeks.length / 6));
    const bars = weeks.map((week, index) => {
      const height = week.count === 0
        ? 3
        : Math.max(12, Math.round((week.count / maximum) * 100));
      const showLabel = index === 0 ||
        index === weeks.length - 1 ||
        index % labelStep === 0;
      const label = week.date.toLocaleDateString("sv-SE", {
        day: "numeric",
        month: "short"
      });

      return `
        <div class="weekly-bar-column" title="Veckan ${utils.escapeHtml(label)}: ${week.count} pass">
          <span class="weekly-bar-value">${week.count || ""}</span>
          <span class="weekly-bar" style="height: ${height}%"></span>
          <span class="weekly-bar-label">${showLabel ? utils.escapeHtml(label) : ""}</span>
        </div>
      `;
    }).join("");

    return `
      <div class="weekly-chart" style="--week-count: ${weeks.length}" role="img" aria-label="Stapeldiagram över antal pass per kalendervecka">
        ${bars}
      </div>
    `;
  },

  getStrengthExercises() {
    return [...Exercises.items].sort((first, second) => {
      return first.name.localeCompare(second.name, "sv");
    });
  },

  renderStrength() {
    const select = document.getElementById("strengthExerciseSelect");
    const container = document.getElementById(
      "statisticsStrengthContent"
    );
    const exercises = this.getStrengthExercises();

    if (!exercises.length) {
      select.innerHTML = '<option value="">Inga övningar</option>';
      select.disabled = true;
      container.innerHTML = `
        <section class="card empty-state">
          <h2>Ingen styrkestatistik ännu</h2>
          <p class="muted">Skapa och genomför en övning först.</p>
        </section>
      `;
      return;
    }

    select.disabled = false;

    if (!this.strengthExerciseId ||
      !exercises.some(exercise => exercise.id === this.strengthExerciseId)) {
      const exerciseWithHistory = exercises.find(exercise => {
        return app.state.sessions.some(session => {
          return session.exercises.some(item => {
            return item.exerciseId === exercise.id;
          });
        });
      });

      this.strengthExerciseId = exerciseWithHistory?.id || exercises[0].id;
    }

    select.innerHTML = exercises.map(exercise => {
      return `
        <option value="${utils.escapeHtml(exercise.id)}" ${exercise.id === this.strengthExerciseId ? "selected" : ""}>
          ${utils.escapeHtml(exercise.name)}
        </option>
      `;
    }).join("");

    const selectedExercise = Exercises.getById(this.strengthExerciseId);
    const allPoints = this.getStrengthPoints(
      selectedExercise,
      app.state.sessions
    );
    const periodPoints = this.getStrengthPoints(
      selectedExercise,
      this.getPeriodSessions()
    );
    const currentBest = allPoints.reduce((best, point) => {
      return !best || point.e1rm > best.e1rm ? point : best;
    }, null);
    const goal = this.strengthGoals.find(item => {
      return item.exerciseId === this.strengthExerciseId;
    });

    if (!currentBest) {
      container.innerHTML = `
        <section class="card empty-state">
          <h2>Ingen statistik för ${utils.escapeHtml(selectedExercise.name)}</h2>
          <p class="muted">Genomför övningen i ett pass för att skapa en styrkekurva.</p>
          ${this.getGoalActionHtml(goal)}
        </section>
      `;
      this.bindGoalButton();
      return;
    }

    const goalHtml = goal
      ? this.getGoalProgressHtml(goal, currentBest)
      : `
          <div class="empty goal-empty">
            <strong>Inget mål skapat</strong>
            <span class="muted">Sätt ett mål i vikt och repetitioner.</span>
          </div>
        `;

    container.innerHTML = `
      <section class="statistics-metrics strength-metrics" aria-label="Styrkesammanfattning">
        <div class="statistics-metric">
          <strong>${utils.escapeHtml(currentBest.weight)} <span>kg</span> × ${utils.escapeHtml(currentBest.reps)}</strong>
          <span>Bästa genomförda set</span>
        </div>
        <div class="statistics-metric">
          <strong>${this.formatNumber(currentBest.e1rm)} <span>kg</span></strong>
          <span>Högsta uppskattade 1RM</span>
        </div>
      </section>

      <section class="card">
        <h2>Styrkeutveckling</h2>
        <p class="muted small">Bästa uppskattade 1RM per träningsdatum.</p>
        ${this.getStrengthChartHtml(periodPoints)}
      </section>

      <section class="card">
        <div class="section-title-row">
          <div>
            <h2>Mitt mål</h2>
            <p class="muted small">Jämförs med din högsta registrerade e1RM.</p>
          </div>
          ${this.getGoalActionHtml(goal)}
        </div>
        ${goalHtml}
      </section>
    `;

    this.bindGoalButton();
  },

  estimateOneRepMax(weight, reps) {
    const numericWeight = Number(weight || 0);
    const numericReps = Number(reps || 0);

    if (numericReps === 1) {
      return numericWeight;
    }

    return numericWeight * (1 + numericReps / 30);
  },

  getStrengthPoints(exercise, sessions) {
    if (!exercise) {
      return [];
    }

    const pointsByDate = new Map();

    sessions.forEach(session => {
      session.exercises.forEach(item => {
        const matches = item.exerciseId === exercise.id ||
          (
            !item.exerciseId &&
            Exercises.identityKey(item.name) ===
              Exercises.identityKey(exercise.name)
          );

        if (!matches) {
          return;
        }

        item.sets.forEach(set => {
          const weight = Number(set.weight || 0);
          const reps = Number(set.reps || 0);

          if (reps <= 0) {
            return;
          }

          const point = {
            date: session.date,
            weight,
            reps,
            e1rm: this.estimateOneRepMax(weight, reps)
          };
          const current = pointsByDate.get(session.date);

          if (!current || point.e1rm > current.e1rm) {
            pointsByDate.set(session.date, point);
          }
        });
      });
    });

    return [...pointsByDate.values()].sort((first, second) => {
      return this.parseDate(first.date) - this.parseDate(second.date);
    });
  },

  getStrengthChartHtml(points) {
    if (!points.length) {
      return '<div class="empty">Ingen styrkedata under vald period.</div>';
    }

    const width = 640;
    const height = 220;
    const padding = 34;
    const values = points.map(point => point.e1rm);
    const minimum = Math.min(...values);
    const maximum = Math.max(...values);
    const range = Math.max(1, maximum - minimum);
    const coordinates = points.map((point, index) => {
      const x = points.length === 1
        ? width / 2
        : padding + index * ((width - padding * 2) / (points.length - 1));
      const y = height - padding -
        ((point.e1rm - minimum) / range) * (height - padding * 2);

      return { ...point, x, y };
    });
    const polyline = coordinates
      .map(point => `${point.x},${point.y}`)
      .join(" ");
    const dots = coordinates.map(point => {
      return `
        <circle cx="${point.x}" cy="${point.y}" r="6">
          <title>${utils.escapeHtml(point.date)}: ${this.formatNumber(point.e1rm)} kg e1RM (${point.weight} kg × ${point.reps})</title>
        </circle>
      `;
    }).join("");

    return `
      <div class="strength-chart">
        <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Styrkeutveckling för vald övning">
          <line x1="${padding}" y1="${height - padding}" x2="${width - padding}" y2="${height - padding}" class="chart-axis-line"></line>
          <polyline points="${polyline}" class="strength-chart-line"></polyline>
          <g class="strength-chart-dots">${dots}</g>
        </svg>
        <div class="chart-date-range">
          <span>${utils.escapeHtml(points[0].date)}</span>
          <span>${utils.escapeHtml(points[points.length - 1].date)}</span>
        </div>
      </div>
    `;
  },

  getGoalActionHtml(goal) {
    return `
      <button type="button" id="editStrengthGoalBtn" class="secondary compact-button" ${this.goalsAvailable ? "" : "disabled"}>
        ${goal ? "Ändra mål" : "Sätt mål"}
      </button>
    `;
  },

  bindGoalButton() {
    document.getElementById("editStrengthGoalBtn")?.addEventListener(
      "click",
      () => this.openStrengthGoalDialog()
    );
  },

  getGoalProgressHtml(goal, currentBest) {
    const goalE1rm = this.estimateOneRepMax(goal.weight, goal.reps);
    const percentage = goalE1rm > 0
      ? Math.min(100, Math.round((currentBest.e1rm / goalE1rm) * 100))
      : 0;

    return `
      <div class="goal-summary">
        <strong>${utils.escapeHtml(goal.weight)} kg × ${utils.escapeHtml(goal.reps)} reps</strong>
        <span class="muted">Mål-e1RM: ${this.formatNumber(goalE1rm)} kg</span>
      </div>
      <div class="goal-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percentage}">
        <span style="width: ${percentage}%"></span>
      </div>
      <strong class="goal-percentage">${percentage} % uppnått</strong>
    `;
  },

  openStrengthGoalDialog() {
    const exercise = Exercises.getById(this.strengthExerciseId);

    if (!exercise || !this.goalsAvailable) {
      return;
    }

    const goal = this.strengthGoals.find(item => {
      return item.exerciseId === exercise.id;
    });

    document.getElementById("strengthGoalExerciseName").textContent =
      exercise.name;
    document.getElementById("strengthGoalWeight").value =
      goal?.weight || "";
    document.getElementById("strengthGoalReps").value =
      goal?.reps || "";
    document.getElementById("strengthGoalError").hidden = true;
    document.getElementById("strengthGoalDialog").showModal();
    document.getElementById("strengthGoalWeight").focus();
  },

  async saveStrengthGoal() {
    const weight = Number(
      document.getElementById("strengthGoalWeight").value
    );
    const reps = Number(
      document.getElementById("strengthGoalReps").value
    );
    const errorElement = document.getElementById("strengthGoalError");
    const saveButton = document.getElementById("saveStrengthGoalBtn");

    if (weight <= 0 || !Number.isInteger(reps) || reps < 1) {
      errorElement.textContent = "Ange en giltig målvikt och minst en repetition.";
      errorElement.hidden = false;
      return;
    }

    saveButton.disabled = true;
    saveButton.textContent = "Sparar...";
    errorElement.hidden = true;

    try {
      const savedGoal = await Storage.saveStrengthGoal(
        this.strengthExerciseId,
        weight,
        reps
      );
      const existingIndex = this.strengthGoals.findIndex(goal => {
        return goal.exerciseId === savedGoal.exerciseId;
      });

      if (existingIndex >= 0) {
        this.strengthGoals.splice(existingIndex, 1, savedGoal);
      } else {
        this.strengthGoals.push(savedGoal);
      }

      document.getElementById("strengthGoalDialog").close();
      this.renderStrength();
    } catch (error) {
      console.error("Styrkemålet kunde inte sparas:", error);
      errorElement.textContent = `Kunde inte spara målet: ${error.message}`;
      errorElement.hidden = false;
    } finally {
      saveButton.disabled = false;
      saveButton.textContent = "Spara mål";
    }
  },

  renderHabits() {
    const container = document.getElementById("statisticsHabitsContent");
    const allWeekCounts = this.getWeekCounts();
    const trainingStreak = this.calculateStreaks(allWeekCounts, 1);
    const goalStreak = this.calculateStreaks(
      allWeekCounts,
      this.weeklySessionGoal
    );
    const sessions = this.getPeriodSessions();
    const weekdayCounts = this.getWeekdayCounts(sessions);
    const mostCommonDay = weekdayCounts.reduce((best, day) => {
      return !best || day.count > best.count ? day : best;
    }, null);
    const commonDayText = mostCommonDay?.count > 0
      ? mostCommonDay.name
      : "–";

    container.innerHTML = `
      <section class="statistics-metrics habits-metrics" aria-label="Träningsvanor">
        <div class="statistics-metric">
          <strong>${trainingStreak.current} <span>veckor</span></strong>
          <span>Aktuell träningssvit</span>
        </div>
        <div class="statistics-metric">
          <strong>${trainingStreak.longest} <span>veckor</span></strong>
          <span>Längsta träningssvit</span>
        </div>
        <div class="statistics-metric">
          <strong>${goalStreak.current} <span>veckor</span></strong>
          <span>Aktuell målsvit</span>
        </div>
        <div class="statistics-metric">
          <strong>${utils.escapeHtml(commonDayText)}</strong>
          <span>Vanligaste träningsdag</span>
        </div>
      </section>

      <section class="card">
        <h2>Veckomål</h2>
        <p class="muted small">Målsviten räknar veckor där veckomålet har uppnåtts.</p>
        <div class="weekly-goal-form">
          <div>
            <label for="weeklySessionGoal">Pass per vecka</label>
            <input id="weeklySessionGoal" type="number" inputmode="numeric" min="1" max="14" value="${this.weeklySessionGoal}" ${this.goalsAvailable ? "" : "disabled"}>
          </div>
          <button type="button" id="saveWeeklyGoalBtn" class="primary" ${this.goalsAvailable ? "" : "disabled"}>Spara mål</button>
        </div>
        <p id="weeklyGoalMessage" class="muted small"></p>
      </section>

      <section class="card">
        <h2>Träningskalender</h2>
        <p class="muted small">Mörkare ruta betyder fler pass samma dag.</p>
        ${this.getCalendarHtml(sessions)}
      </section>

      <section class="card">
        <h2>Pass per veckodag</h2>
        ${this.getWeekdayChartHtml(weekdayCounts)}
      </section>

      <section class="card data-note">
        <strong>Passlängd visas inte ännu</strong>
        <p class="muted small">Appen registrerar inte en tillräckligt exakt faktisk starttid för passet.</p>
      </section>
    `;

    document.getElementById("saveWeeklyGoalBtn")?.addEventListener(
      "click",
      () => this.saveWeeklyGoal()
    );
  },

  async saveWeeklyGoal() {
    const input = document.getElementById("weeklySessionGoal");
    const button = document.getElementById("saveWeeklyGoalBtn");
    const message = document.getElementById("weeklyGoalMessage");
    const value = Number(input.value);

    if (!Number.isInteger(value) || value < 1 || value > 14) {
      message.textContent = "Ange ett heltal mellan 1 och 14.";
      return;
    }

    button.disabled = true;
    button.textContent = "Sparar...";
    message.textContent = "";

    try {
      this.weeklySessionGoal = await Storage.saveWeeklySessionGoal(value);
      this.renderHabits();
      document.getElementById("weeklyGoalMessage").textContent = "Veckomålet är sparat.";
    } catch (error) {
      console.error("Veckomålet kunde inte sparas:", error);
      message.textContent = `Kunde inte spara veckomålet: ${error.message}`;
      button.disabled = false;
      button.textContent = "Spara mål";
    }
  },

  getWeekdayCounts(sessions) {
    const days = [
      { index: 1, name: "Måndag", count: 0 },
      { index: 2, name: "Tisdag", count: 0 },
      { index: 3, name: "Onsdag", count: 0 },
      { index: 4, name: "Torsdag", count: 0 },
      { index: 5, name: "Fredag", count: 0 },
      { index: 6, name: "Lördag", count: 0 },
      { index: 0, name: "Söndag", count: 0 }
    ];

    sessions.forEach(session => {
      const date = this.parseDate(session.date);
      const day = days.find(item => item.index === date?.getDay());

      if (day) {
        day.count += 1;
      }
    });

    return days;
  },

  getWeekdayChartHtml(days) {
    const maximum = Math.max(1, ...days.map(day => day.count));

    return `
      <div class="weekday-chart">
        ${days.map(day => {
          const width = Math.round((day.count / maximum) * 100);
          return `
            <div class="weekday-row">
              <span>${utils.escapeHtml(day.name)}</span>
              <span class="weekday-track"><span style="width: ${width}%"></span></span>
              <strong>${day.count}</strong>
            </div>
          `;
        }).join("")}
      </div>
    `;
  },

  getCalendarHtml(sessions) {
    const countsByDate = new Map();

    sessions.forEach(session => {
      countsByDate.set(
        session.date,
        (countsByDate.get(session.date) || 0) + 1
      );
    });

    if (!sessions.length) {
      return '<div class="empty">Inga pass under vald period.</div>';
    }

    const periodStart = this.getPeriodStart();
    const start = new Date(
      periodStart.getFullYear(),
      periodStart.getMonth(),
      1
    );
    const end = this.getToday();
    const months = [];
    let cursor = new Date(start);

    while (cursor <= end) {
      months.push(new Date(cursor));
      cursor.setMonth(cursor.getMonth() + 1);
    }

    return `
      <div class="heatmap-months">
        ${months.map(month => {
          return this.getCalendarMonthHtml(
            month,
            countsByDate,
            periodStart,
            end
          );
        }).join("")}
      </div>
    `;
  },

  getCalendarMonthHtml(month, countsByDate, startDate, endDate) {
    const year = month.getFullYear();
    const monthIndex = month.getMonth();
    const firstDay = new Date(year, monthIndex, 1);
    const lastDay = new Date(year, monthIndex + 1, 0);
    const leadingBlanks = firstDay.getDay() === 0
      ? 6
      : firstDay.getDay() - 1;
    const cells = Array.from({ length: leadingBlanks }, () => {
      return '<span class="heatmap-day is-empty"></span>';
    });

    for (let day = 1; day <= lastDay.getDate(); day += 1) {
      const date = new Date(year, monthIndex, day);

      if (date < startDate || date > endDate) {
        cells.push('<span class="heatmap-day is-empty"></span>');
        continue;
      }

      const key = this.formatDateKey(date);
      const count = countsByDate.get(key) || 0;
      const level = Math.min(3, count);

      cells.push(`
        <span class="heatmap-day level-${level}" title="${key}: ${count} pass" aria-label="${key}: ${count} pass">
          ${day}
        </span>
      `);
    }

    return `
      <div class="heatmap-month">
        <strong>${month.toLocaleDateString("sv-SE", { month: "long", year: "numeric" })}</strong>
        <div class="heatmap-weekdays" aria-hidden="true">
          <span>M</span><span>T</span><span>O</span><span>T</span><span>F</span><span>L</span><span>S</span>
        </div>
        <div class="heatmap-grid">${cells.join("")}</div>
      </div>
    `;
  },

  renderHistory() {
    History.render(this.getPeriodSessions());
  },

  formatNumber(value) {
    return Number(value).toLocaleString("sv-SE", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 1
    });
  }
};

window.Statistics = Statistics;
