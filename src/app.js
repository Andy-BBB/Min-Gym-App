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
    this.setupMembers();
    this.renderAppTitle();

    await Plans.init();
    await Sessions.init();
    await History.init();
    await this.renderMembers();

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
        await this.renderMembers();

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

  setupMembers() {
    const inviteMemberButton =
      document.getElementById("invite-member-btn");

    if (!inviteMemberButton) {
      console.error("Knappen #invite-member-btn saknas.");
      return;
    }

    inviteMemberButton.onclick = () => {
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
        event.preventDefault();

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

          dialog.close();

await this.renderMembers();

        } catch (error) {
          console.error(
            "Kunde inte bjuda in medlem:",
            error
          );

          errorMessage.hidden = false;
          errorMessage.textContent =
            error.message;
        } finally {
          confirmButton.disabled = false;
          confirmButton.textContent = "Bjud in";
        }
      };
    };
  },

  async renderMembers() {
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
          !member.is_owner &&
          !member.is_current_user
        ) {
          const removeButton =
            document.createElement("button");

          removeButton.type = "button";
          removeButton.className = "secondary";
          removeButton.textContent = "Ta bort";

          removeButton.onclick = async () => {
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

              await this.renderMembers();
            } catch (error) {
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
      console.error(
        "Kunde inte ladda medlemmar:",
        error
      );

      membersList.textContent =
        "Kunde inte ladda medlemmarna.";
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