const workspace = {
  id: null,
  displayName: null,
  userId: null,
  availableWorkspaces: [],

  getStorageKey() {
    if (!this.userId) {
      return null;
    }

    return `activeWorkspaceId:${this.userId}`;
  },

  async load() {
    const {
      data: { user },
      error: userError
    } = await supabaseClient.auth.getUser();

    if (userError) {
      console.error(
        "Kunde inte hämta den inloggade användaren:",
        userError
      );

      throw userError;
    }

    if (!user) {
      throw new Error("Ingen inloggad användare hittades.");
    }

    this.userId = user.id;

    /*
     * Säkerställ att användaren har ett eget personligt
     * workspace.
     */
    const {
      data: personalWorkspaceId,
      error: personalWorkspaceError
    } = await supabaseClient.rpc(
      "get_or_create_personal_workspace"
    );

    if (personalWorkspaceError) {
      console.error(
        "Kunde inte hämta eller skapa personligt workspace:",
        personalWorkspaceError
      );

      throw personalWorkspaceError;
    }

    /*
     * Hämta alla workspaces där användaren är medlem.
     */
    const {
      data: workspaces,
      error: workspacesError
    } = await supabaseClient.rpc(
      "list_my_workspaces"
    );

    if (workspacesError) {
      console.error(
        "Kunde inte hämta användarens workspaces:",
        workspacesError
      );

      throw workspacesError;
    }

    this.availableWorkspaces = workspaces || [];

    if (!this.availableWorkspaces.length) {
      throw new Error(
        "Användaren har inte tillgång till något workspace."
      );
    }

    /*
     * Försök återanvända tidigare valt workspace.
     */
    const storageKey = this.getStorageKey();

    const savedWorkspaceId = storageKey
      ? window.localStorage.getItem(storageKey)
      : null;

    let activeWorkspace =
      this.availableWorkspaces.find(item => {
        return item.workspace_id === savedWorkspaceId;
      });

    /*
     * Om inget tidigare val finns används användarens
     * personliga workspace.
     */
    if (!activeWorkspace) {
      activeWorkspace =
        this.availableWorkspaces.find(item => {
          return item.workspace_id === personalWorkspaceId;
        });
    }

    /*
     * Reservlösning om det personliga workspacet av någon
     * anledning inte finns i listan.
     */
    if (!activeWorkspace) {
      activeWorkspace = this.availableWorkspaces[0];
    }

    this.id = activeWorkspace.workspace_id;

    if (storageKey) {
      window.localStorage.setItem(
        storageKey,
        this.id
      );
    }

    /*
     * Hämta den inloggade användarens visningsnamn i det
     * aktiva workspacet.
     */
    const {
      data: member,
      error: memberError
    } = await supabaseClient
      .from("workspace_members")
      .select("display_name")
      .eq("workspace_id", this.id)
      .eq("user_id", user.id)
      .single();

    if (memberError) {
      console.error(
        "Kunde inte läsa användarens visningsnamn:",
        memberError
      );

      throw memberError;
    }

    this.displayName = member.display_name || null;

    console.log("Tillgängliga workspaces:", this.availableWorkspaces);
    console.log("Aktivt workspace:", this.id);
    console.log("Visningsnamn:", this.displayName);

    return this.id;
  },

  async select(workspaceId) {
    if (!workspaceId) {
      throw new Error("Workspace-id saknas.");
    }

    const selectedWorkspace =
      this.availableWorkspaces.find(item => {
        return item.workspace_id === workspaceId;
      });

    if (!selectedWorkspace) {
      throw new Error(
        "Du har inte tillgång till detta workspace."
      );
    }

    this.id = selectedWorkspace.workspace_id;

    const storageKey = this.getStorageKey();

    if (storageKey) {
      window.localStorage.setItem(
        storageKey,
        this.id
      );
    }

    /*
     * En omladdning gör att upplägg, pass, historik,
     * medlemmar och profil laddas om för det nya
     * workspacet.
     */
    window.location.reload();
  },

  async saveDisplayName(displayName) {
    if (!this.id) {
      throw new Error("Aktivt workspace saknas.");
    }

    const cleanDisplayName =
      String(displayName || "").trim();

    if (!cleanDisplayName) {
      throw new Error("Ange ett namn.");
    }

    const {
      data: { user },
      error: userError
    } = await supabaseClient.auth.getUser();

    if (userError) {
      console.error(
        "Kunde inte hämta den inloggade användaren:",
        userError
      );

      throw userError;
    }

    if (!user) {
      throw new Error("Ingen inloggad användare hittades.");
    }

    const { error: updateError } = await supabaseClient
      .from("workspace_members")
      .update({
        display_name: cleanDisplayName
      })
      .eq("workspace_id", this.id)
      .eq("user_id", user.id);

    if (updateError) {
      console.error(
        "Kunde inte spara användarens visningsnamn:",
        updateError
      );

      throw updateError;
    }

    this.displayName = cleanDisplayName;

    return this.displayName;
  },

  clear() {
    const storageKey = this.getStorageKey();

    if (storageKey) {
      window.localStorage.removeItem(storageKey);
    }

    this.id = null;
    this.displayName = null;
    this.userId = null;
    this.availableWorkspaces = [];
  }
};

window.workspace = workspace;