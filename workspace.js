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

  async load(context) {
    app.assertCurrent(context);
    const {
      data: { user },
      error: userError
    } = await supabaseClient.auth.getUser(context.accessToken);
    app.assertCurrent(context);

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

    if (user.id !== context.userId) throw new Error("Sessionens identitet stämmer inte.");

    /*
     * Säkerställ att användaren har ett eget personligt
     * workspace.
     */
    const {
      data: personalWorkspaceId,
      error: personalWorkspaceError
    } = await supabaseClient.rpc(
      "get_or_create_personal_workspace"
    ).abortSignal(context.controller.signal).setHeader("Authorization", `Bearer ${context.accessToken}`);
    app.assertCurrent(context);

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
    ).abortSignal(context.controller.signal).setHeader("Authorization", `Bearer ${context.accessToken}`);
    app.assertCurrent(context);

    if (workspacesError) {
      console.error(
        "Kunde inte hämta användarens workspaces:",
        workspacesError
      );

      throw workspacesError;
    }

    const availableWorkspaces = workspaces || [];

    if (!availableWorkspaces.length) {
      throw new Error(
        "Användaren har inte tillgång till något workspace."
      );
    }

    /*
     * Försök återanvända tidigare valt workspace.
     */
    const storageKey = `activeWorkspaceId:${context.userId}`;

    const savedWorkspaceId = storageKey
      ? window.localStorage.getItem(storageKey)
      : null;

    let activeWorkspace =
      availableWorkspaces.find(item => {
        return item.workspace_id === savedWorkspaceId;
      });

    /*
     * Om inget tidigare val finns används användarens
     * personliga workspace.
     */
    if (!activeWorkspace) {
      activeWorkspace =
        availableWorkspaces.find(item => {
          return item.workspace_id === personalWorkspaceId;
        });
    }

    /*
     * Reservlösning om det personliga workspacet av någon
     * anledning inte finns i listan.
     */
    if (!activeWorkspace) {
      activeWorkspace = availableWorkspaces[0];
    }

    const workspaceId = activeWorkspace.workspace_id;

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
      .eq("workspace_id", workspaceId)
      .eq("user_id", user.id)
      .abortSignal(context.controller.signal)
      .setHeader("Authorization", `Bearer ${context.accessToken}`)
      .single();
    app.assertCurrent(context);

    if (memberError) {
      console.error(
        "Kunde inte läsa användarens visningsnamn:",
        memberError
      );

      throw memberError;
    }

    Object.assign(this, {
      id: workspaceId, userId: user.id, availableWorkspaces,
      displayName: member.display_name || null
    });
    context.workspaceId = workspaceId;
    window.localStorage.setItem(storageKey, workspaceId);
    return workspaceId;
  },

  async select(workspaceId) {
    app.requireContext(true);
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
    app.resetSession();
    window.location.reload();
  },

  async saveDisplayName(displayName) {
    const context = app.requireContext(true);
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
    } = await supabaseClient.auth.getUser(context.accessToken);
    app.assertCurrent(context);

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
      .eq("workspace_id", context.workspaceId)
      .eq("user_id", user.id)
      .abortSignal(context.controller.signal)
      .setHeader("Authorization", `Bearer ${context.accessToken}`);
    app.assertCurrent(context);

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
    this.id = null;
    this.displayName = null;
    this.userId = null;
    this.availableWorkspaces = [];
  }
};

window.workspace = workspace;