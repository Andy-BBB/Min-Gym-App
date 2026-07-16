const app = {
  state: {
    plans: [],
    sessions: [],
    exerciseBank: []
  },

  isInitialized: false,
  initializationPromise: null,

  async init() {
    if (this.isInitialized) {
      console.log("Version 2 är redan startad.");
      return;
    }

    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise = this.start();

    try {
      await this.initializationPromise;
      this.isInitialized = true;
    } finally {
      this.initializationPromise = null;
    }
  },

  async start() {
    console.log("Min Gym App Version 2 startar.");

    if (!workspace.id) {
      throw new Error(
        "Version 2 kan inte starta utan ett aktivt workspace."
      );
    }

    this.setupTabs();
    this.setupProfile();
    this.renderAppTitle();

    await Plans.init();
    await Sessions.init();
    await History.init();

    console.log("Min Gym App Version 2 är klar.");
    console.log("Version 2 state:", this.state);
  },

  setupTabs() {
    const tabButtons = document.querySelectorAll(".tab");
    const views = document.querySelectorAll(".view");

    tabButtons.forEach(button => {
      button.onclick = () => {
        tabButtons.forEach(tab => {
          tab.classList.remove("active");
        });

        views.forEach(view => {
          view.classList.remove("active");
        });

        button.classList.add("active");

        const selectedView = document.getElementById(
          button.dataset.tab
        );

        if (selectedView) {
          selectedView.classList.add("active");
        }
      };
    });
  },

  setupProfile() {
    const displayNameInput =
      document.getElementById("displayNameInput");

    const saveDisplayNameButton =
      document.getElementById("saveDisplayNameBtn");

    if (!displayNameInput || !saveDisplayNameButton) {
      console.error(
        "Profilfältet eller knappen för att spara namn saknas."
      );
      return;
    }

    displayNameInput.value = workspace.displayName || "";

    saveDisplayNameButton.onclick = async () => {
      const displayName = displayNameInput.value.trim();

      if (!displayName) {
        alert("Ange ditt namn.");
        return;
      }

      saveDisplayNameButton.disabled = true;
      saveDisplayNameButton.textContent = "Sparar...";

      try {
        await workspace.saveDisplayName(displayName);

        this.renderAppTitle();

        saveDisplayNameButton.textContent = "Sparat ✓";
      } catch (error) {
        console.error("Kunde inte spara namnet:", error);

        alert(`Kunde inte spara namnet: ${error.message}`);

        saveDisplayNameButton.textContent = "Spara namn";
      } finally {
        saveDisplayNameButton.disabled = false;

        window.setTimeout(() => {
          saveDisplayNameButton.textContent = "Spara namn";
        }, 1500);
      }
    };
  },

  renderAppTitle() {
    const appTitle = document.getElementById("appTitle");

    if (!appTitle) {
      console.error("Rubriken #appTitle saknas.");
      return;
    }

    appTitle.textContent =
      workspace.displayName || "Min Gym App";
  }
};

window.app = app;