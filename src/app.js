const app = {
  state: {
    plans: [],
    sessions: [],
    exerciseLibrary: []
  },

  isInitialized: false,
  initializationPromise: null,

  context: null,
  generation: 0,
  initializedKey: null,
  // Untouched markup, captured before the first authenticated render.
  pristineNodes: [...document.querySelectorAll("main.app-shell, body > dialog")]
    .map(node => ({ node, template: node.cloneNode(true) })),

  isCurrent(context) {
    return !!context && this.context === context &&
      !context.controller.signal.aborted &&
      (!context.workspaceId || workspace.id === context.workspaceId);
  },

  assertCurrent(context) {
    if (!this.isCurrent(context)) {
      const error = new Error("Sessionen eller arbetsytan har ändrats.");
      error.name = "StaleSessionError";
      throw error;
    }
  },

  requireContext(ready = false) {
    const context = this.context;
    this.assertCurrent(context);
    if (!context.workspaceId || (ready && !this.isInitialized)) {
      throw new Error("Appen verifierar fortfarande din session.");
    }
    return context;
  },

  isStale(error, context) {
    return error?.name === "StaleSessionError" || !this.isCurrent(context);
  },

  resetSession(session = null) {
    this.context?.controller.abort();
    this.generation += 1;
    this.context = null;
    this.isInitialized = false;
    this.initializedKey = null;
    this.initializationPromise = null;
    // Hide and disable the old UI synchronously, before any asynchronous work.
    document.getElementById("loginOverlay").style.display = "flex";
    this.pristineNodes.forEach(entry => {
      entry.node.inert = true;
      entry.node.style.display = "none";
      if (entry.node.open) entry.node.close();
    });
    Sessions.celebrationTimeoutIds.forEach(id => clearTimeout(id));
    Sessions.celebrationTimeoutIds = [];
    document.querySelectorAll(".pb-celebration").forEach(node => node.remove());
    this.state = { plans: [], sessions: [], exerciseLibrary: [] };
    Exercises.items = [];
    Plans.draft = null;
    Sessions.activeSession = null;
    Object.assign(Statistics, {
      period: "threeMonths", activeTab: "overview", strengthExerciseId: null,
      strengthGoals: [], weeklySessionGoal: 3, goalsAvailable: true,
      loadError: null, isBound: false
    });
    workspace.clear();
    // Replacement also discards form values, dialogs, suggestions and old listeners.
    this.pristineNodes.forEach(entry => {
      const fresh = entry.template.cloneNode(true);
      fresh.inert = true;
      if (fresh.matches("main")) fresh.style.display = "none";
      entry.node.replaceWith(fresh);
      entry.node = fresh;
    });
    document.getElementById("invite-member-btn").hidden = true;
    if (session) {
      this.context = {
        generation: this.generation, userId: session.user.id,
        workspaceId: null, accessToken: session.access_token,
        controller: new AbortController(), started: false
      };
    }
    return this.context;
  },

  async init(context) {
    this.assertCurrent(context);
    const key = `${context.userId}:${context.workspaceId}`;
    if (!context.workspaceId) throw new Error("Aktivt workspace saknas.");
    if (this.isInitialized && this.initializedKey === key) return;
    if (this.initializationPromise?.context === context) {
      return this.initializationPromise.promise;
    }
    const pending = { context, promise: this.start(context) };
    this.initializationPromise = pending;
    try {
      await pending.promise;
      this.assertCurrent(context);
      this.initializedKey = key;
      this.isInitialized = true;
    } finally {
      if (this.initializationPromise === pending) this.initializationPromise = null;
    }
  },

  async start(context) {
    this.assertCurrent(context);
    this.setupTabs();
    this.setupProfile();
    this.setupMembers();
    this.setupWorkspaceSelector();
    this.renderAppTitle();
    for (const module of [Exercises, Plans, Sessions, History, Statistics]) {
      await module.init();
      this.assertCurrent(context);
    }
    await this.renderMembers();
    this.assertCurrent(context);
  },

  reveal(context) {
    this.assertCurrent(context);
    if (!this.isInitialized || this.initializedKey !== `${context.userId}:${context.workspaceId}`) {
      throw new Error("Appens session är inte färdigverifierad.");
    }
    this.pristineNodes.forEach(entry => { entry.node.inert = false; });
    document.querySelector("main.app-shell").style.display = "";
    document.getElementById("loginOverlay").style.display = "none";
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
      const context = this.requireContext(true);
      const displayName = displayNameInput.value.trim();

      if (!displayName) {
        alert("Ange ditt namn.");
        return;
      }

      saveDisplayNameButton.disabled = true;
      saveDisplayNameButton.textContent = "Sparar...";

      try {
        await workspace.saveDisplayName(displayName);
      this.assertCurrent(context);

        this.renderAppTitle();
        await this.renderMembers();
      this.assertCurrent(context);

        saveDisplayNameButton.textContent = "Sparat ✓";
      } catch (error) {
        if (this.isStale(error, context)) return;
        console.error("Kunde inte spara namnet:", error);

        alert(`Kunde inte spara namnet: ${error.message}`);

        saveDisplayNameButton.textContent = "Spara namn";
      } finally {
        if (!this.isCurrent(context)) return;
        saveDisplayNameButton.disabled = false;

        window.setTimeout(() => {
          if (!this.isCurrent(context)) return;
          saveDisplayNameButton.textContent = "Spara namn";
        }, 1500);
      }
    };
  },

  isActiveWorkspaceOwner() {
    const activeWorkspace = workspace.availableWorkspaces.find(item => {
      return item.workspace_id === workspace.id;
    });

    return activeWorkspace?.is_owner === true;
  },

  setupMembers() {
    const inviteMemberButton =
      document.getElementById("invite-member-btn");

    if (!inviteMemberButton) {
      console.error("Knappen #invite-member-btn saknas.");
      return;
    }

    inviteMemberButton.hidden = !this.isActiveWorkspaceOwner();
    inviteMemberButton.onclick = null;

    if (inviteMemberButton.hidden) {
      return;
    }

    inviteMemberButton.onclick = () => {
      if (!this.isActiveWorkspaceOwner()) {
        return;
      }

      const dialog =
        document.getElementById("inviteMemberDialog");

      const emailInput =
        document.getElementById("inviteMemberEmail");

      const errorMessage =
        document.getElementById("inviteMemberError");

      const cancelButton =
        document.getElementById("cancelInviteMemberBtn");

      const confirmButton =
        document.getElementById("confirmInviteMemberBtn");

      if (
        !dialog ||
        !emailInput ||
        !errorMessage ||
        !cancelButton ||
        !confirmButton
      ) {
        console.error(
          "En eller flera delar av medlemsdialogen saknas."
        );
        return;
      }

      emailInput.value = "";
      errorMessage.hidden = true;
      errorMessage.textContent = "";

      confirmButton.disabled = false;
      confirmButton.textContent = "Bjud in";

      dialog.showModal();
      emailInput.focus();

      cancelButton.onclick = () => {
        dialog.close();
      };

      confirmButton.onclick = async event => {
        const context = this.requireContext(true);
        event.preventDefault();

        if (!this.isActiveWorkspaceOwner()) {
          return;
        }

        const normalizedEmail =
          emailInput.value.trim();

        if (!normalizedEmail) {
          errorMessage.hidden = false;
          errorMessage.textContent =
            "Ange en e-postadress.";
          return;
        }

        errorMessage.hidden = true;
        errorMessage.textContent = "";

        confirmButton.disabled = true;
        confirmButton.textContent = "Bjuder in...";

        try {
          await Storage.inviteMember(
            workspace.id,
            normalizedEmail
          );
      this.assertCurrent(context);

          dialog.close();

          await this.renderMembers();
      this.assertCurrent(context);
        } catch (error) {
          if (this.isStale(error, context)) return;
          console.error(
            "Kunde inte bjuda in medlem:",
            error
          );

          errorMessage.hidden = false;
          errorMessage.textContent =
            error.message;
        } finally {
          if (!this.isCurrent(context)) return;
          confirmButton.disabled = false;
          confirmButton.textContent = "Bjud in";
        }
      };
    };
  },

  setupWorkspaceSelector() {
    const switcher =
      document.getElementById("workspaceSwitcher");

    const select =
      document.getElementById("workspaceSelect");

    if (!switcher || !select) {
      console.error(
        "Workspace-väljaren saknas i index.html."
      );
      return;
    }

    const workspaces =
      workspace.availableWorkspaces || [];

    if (workspaces.length <= 1) {
      switcher.hidden = true;
      return;
    }

    switcher.hidden = false;
    select.innerHTML = "";

    workspaces.forEach(item => {
      const option =
        document.createElement("option");

      option.value = item.workspace_id;

      option.textContent =
        item.owner_display_name ||
        item.owner_email ||
        item.workspace_name ||
        "Workspace";

      option.selected =
        item.workspace_id === workspace.id;

      select.appendChild(option);
    });

    select.onchange = async () => {
      const context = this.requireContext(true);
      select.disabled = true;

      try {
        await workspace.select(select.value);
      this.assertCurrent(context);
      } catch (error) {
        if (this.isStale(error, context)) return;
        console.error(
          "Kunde inte byta workspace:",
          error
        );

        alert(
          `Kunde inte byta workspace: ${error.message}`
        );

        select.value = workspace.id;
        select.disabled = false;
      }
    };
  },

  async renderMembers() {
    const context = this.requireContext();
    const membersList =
      document.getElementById("members-list");

    if (!membersList) {
      console.error("Medlemslistan #members-list saknas.");
      return;
    }

    membersList.textContent = "Laddar medlemmar...";

    try {
      const members =
        await Storage.listMembers(workspace.id);
      this.assertCurrent(context);

      if (!members.length) {
        membersList.textContent =
          "Inga medlemmar hittades.";
        return;
      }

      membersList.innerHTML = "";

      members.forEach(member => {
        const memberRow =
          document.createElement("div");

        memberRow.className = "member-row";

        const memberInfo =
          document.createElement("div");

        const memberName =
          document.createElement("strong");

        memberName.textContent =
          member.display_name ||
          member.email ||
          "Namn saknas";

        const memberRole =
          document.createElement("div");

        memberRole.className = "muted small";

        if (member.is_owner) {
          memberRole.textContent =
            member.is_current_user
              ? "Ägare · Du"
              : "Ägare";
        } else {
          memberRole.textContent =
            member.is_current_user
              ? "Medlem · Du"
              : "Medlem";
        }

        memberInfo.appendChild(memberName);
        memberInfo.appendChild(memberRole);

        memberRow.appendChild(memberInfo);

        if (
          this.isActiveWorkspaceOwner() &&
          !member.is_owner &&
          !member.is_current_user
        ) {
          const removeButton =
            document.createElement("button");

          removeButton.type = "button";
          removeButton.className = "secondary";
          removeButton.textContent = "Ta bort";

          removeButton.onclick = async () => {
      const context = this.requireContext(true);
            if (!this.isActiveWorkspaceOwner()) {
              return;
            }

            const memberLabel =
              member.display_name ||
              member.email ||
              "medlemmen";

            const confirmed = window.confirm(
              `Vill du ta bort ${memberLabel} från workspacet?`
            );

            if (!confirmed) {
              return;
            }

            removeButton.disabled = true;
            removeButton.textContent = "Tar bort...";

            try {
              await Storage.removeMember(
                workspace.id,
                member.user_id
              );
      this.assertCurrent(context);

              await this.renderMembers();
      this.assertCurrent(context);
            } catch (error) {
              if (this.isStale(error, context)) return;
              console.error(
                "Kunde inte ta bort medlem:",
                error
              );

              alert(
                `Kunde inte ta bort medlem: ${error.message}`
              );

              removeButton.disabled = false;
              removeButton.textContent = "Ta bort";
            }
          };

          memberRow.appendChild(removeButton);
        }

        membersList.appendChild(memberRow);
      });
    } catch (error) {
      if (this.isStale(error, context)) return;
      console.error(
        "Kunde inte ladda medlemmar:",
        error
      );

      membersList.textContent =
        "Kunde inte ladda medlemmarna.";
      throw error;
    }
  },

  renderAppTitle() {
    const appTitle =
      document.getElementById("appTitle");

    if (!appTitle) {
      console.error("Rubriken #appTitle saknas.");
      return;
    }

    appTitle.textContent =
      workspace.displayName || "Min Gym App";
  }
};

window.app = app;
