const Exercises = {
  items: [],

  async init() {
    console.log("Exercises.init() startar.");

    await this.reload();

    console.log(
      `Exercises.init(): ${this.items.length} övningar hämtades.`
    );
  },

  async reload() {
    this.items = await Storage.loadExercises();
    app.state.exerciseLibrary = this.items;

    return this.items;
  },

  normalize(value) {
    return String(value || "")
      .normalize("NFC")
      .trim()
      .replace(/\s+/g, " ")
      .toLocaleLowerCase("sv-SE");
  },

  identityKey(value) {
    return this.normalize(value).replace(/\s/g, "");
  },

  getById(exerciseId) {
    if (!exerciseId) {
      return null;
    }

    return this.items.find(exercise => exercise.id === exerciseId) || null;
  },

  findCanonical(name) {
    const key = this.identityKey(name);

    if (!key) {
      return null;
    }

    return this.items.find(exercise => {
      return this.identityKey(exercise.name) === key;
    }) || null;
  },

  editDistance(firstValue, secondValue) {
    const first = [...this.identityKey(firstValue)];
    const second = [...this.identityKey(secondValue)];
    const previous = second.map((_, index) => index + 1);

    previous.unshift(0);

    first.forEach((character, firstIndex) => {
      const current = [firstIndex + 1];

      second.forEach((otherCharacter, secondIndex) => {
        current.push(Math.min(
          current[secondIndex] + 1,
          previous[secondIndex + 1] + 1,
          previous[secondIndex] +
            (character === otherCharacter ? 0 : 1)
        ));
      });

      previous.splice(0, previous.length, ...current);
    });

    return previous[second.length];
  },

  findSimilar(name) {
    const key = this.identityKey(name);

    if (key.length < 4) {
      return null;
    }

    const maximumDistance = key.length >= 6 ? 2 : 1;

    return this.items
      .map(exercise => ({
        exercise,
        distance: this.editDistance(name, exercise.name)
      }))
      .filter(candidate => candidate.distance <= maximumDistance)
      .sort((first, second) => {
        return first.distance - second.distance ||
          first.exercise.name.localeCompare(
            second.exercise.name,
            "sv"
          );
      })[0]?.exercise || null;
  },

  findMatches(query) {
    const normalizedQuery = this.normalize(query);
    const queryKey = this.identityKey(query);

    if (!normalizedQuery) {
      return [];
    }

    return this.items
      .map(exercise => {
        const normalizedName = this.normalize(exercise.name);
        const nameKey = this.identityKey(exercise.name);
        let score = Number.POSITIVE_INFINITY;

        if (normalizedName.startsWith(normalizedQuery)) {
          score = 0;
        } else if (nameKey.startsWith(queryKey)) {
          score = 1;
        } else if (normalizedName.includes(normalizedQuery)) {
          score = 2;
        } else if (
          queryKey.length >= 4 &&
          this.editDistance(query, exercise.name) <=
            (queryKey.length >= 6 ? 2 : 1)
        ) {
          score = 3;
        }

        return { exercise, score };
      })
      .filter(candidate => Number.isFinite(candidate.score))
      .sort((first, second) => {
        return first.score - second.score ||
          first.exercise.name.localeCompare(
            second.exercise.name,
            "sv"
          );
      })
      .slice(0, 8)
      .map(candidate => candidate.exercise);
  },

  resolveForSave({ exerciseId, name }) {
    const cleanName = String(name || "").trim();
    const selectedExercise = this.getById(exerciseId);

    if (selectedExercise) {
      return {
        exerciseId: selectedExercise.id,
        name: selectedExercise.name,
        createNew: false
      };
    }

    const canonicalExercise = this.findCanonical(cleanName);

    if (canonicalExercise) {
      return {
        exerciseId: canonicalExercise.id,
        name: canonicalExercise.name,
        createNew: false
      };
    }

    const similarExercise = this.findSimilar(cleanName);

    if (
      similarExercise &&
      window.confirm(
        `Menade du "${similarExercise.name}" i stället för ` +
        `"${cleanName}"?`
      )
    ) {
      return {
        exerciseId: similarExercise.id,
        name: similarExercise.name,
        createNew: false
      };
    }

    if (!window.confirm(`Skapa "${cleanName}" som en ny övning?`)) {
      return null;
    }

    return {
      exerciseId: null,
      name: cleanName,
      createNew: true
    };
  },

  attachAutocomplete(input, { onInput, onSelect } = {}) {
    if (!input || input.dataset.autocompleteBound === "true") {
      return;
    }

    input.dataset.autocompleteBound = "true";

    const parent = input.parentElement;
    const suggestions = document.createElement("div");
    let matches = [];
    let activeIndex = -1;
    let blurTimer = null;

    parent.classList.add("exercise-autocomplete");
    suggestions.className = "exercise-suggestions hidden";
    suggestions.setAttribute("role", "listbox");
    parent.insertBefore(suggestions, input.nextSibling);

    input.removeAttribute("list");
    input.setAttribute("autocomplete", "off");
    input.setAttribute("aria-autocomplete", "list");
    input.setAttribute("aria-expanded", "false");

    const hide = () => {
      suggestions.classList.add("hidden");
      input.setAttribute("aria-expanded", "false");
      activeIndex = -1;
    };

    const selectExercise = exercise => {
      input.value = exercise.name;
      input.dataset.exerciseId = exercise.id;
      onSelect?.(exercise);
      hide();
    };

    const render = () => {
      matches = this.findMatches(input.value);
      suggestions.innerHTML = "";
      activeIndex = -1;

      if (!matches.length) {
        hide();
        return;
      }

      matches.forEach(exercise => {
        const button = document.createElement("button");

        button.type = "button";
        button.className = "exercise-suggestion";
        button.setAttribute("role", "option");
        button.textContent = exercise.name;
        button.onmousedown = event => {
          event.preventDefault();
          selectExercise(exercise);
        };

        suggestions.appendChild(button);
      });

      suggestions.classList.remove("hidden");
      input.setAttribute("aria-expanded", "true");
    };

    const updateActiveOption = () => {
      const options = suggestions.querySelectorAll(
        ".exercise-suggestion"
      );

      options.forEach((option, index) => {
        option.classList.toggle("active", index === activeIndex);
      });
    };

    input.addEventListener("input", () => {
      delete input.dataset.exerciseId;
      onInput?.(input.value);
      render();
    });

    input.addEventListener("focus", render);

    input.addEventListener("blur", () => {
      blurTimer = window.setTimeout(hide, 150);
    });

    input.addEventListener("keydown", event => {
      if (suggestions.classList.contains("hidden")) {
        return;
      }

      if (event.key === "ArrowDown") {
        event.preventDefault();
        activeIndex = (activeIndex + 1) % matches.length;
        updateActiveOption();
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        activeIndex =
          (activeIndex - 1 + matches.length) % matches.length;
        updateActiveOption();
      } else if (event.key === "Enter" && activeIndex >= 0) {
        event.preventDefault();
        selectExercise(matches[activeIndex]);
      } else if (event.key === "Escape") {
        hide();
      }
    });

    suggestions.addEventListener("mousedown", () => {
      if (blurTimer) {
        window.clearTimeout(blurTimer);
      }
    });
  },

  resetInput(input) {
    if (!input) {
      return;
    }

    input.value = "";
    delete input.dataset.exerciseId;

    const suggestions = input.parentElement?.querySelector(
      ".exercise-suggestions"
    );

    suggestions?.classList.add("hidden");
    input.setAttribute("aria-expanded", "false");
  }
};

window.Exercises = Exercises;
