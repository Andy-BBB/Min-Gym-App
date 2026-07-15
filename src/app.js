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
  }
};

window.app = app;