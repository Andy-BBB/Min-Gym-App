const workspace = {
  id: null,
  displayName: null,

  async load() {
    const { data: workspaceId, error: workspaceError } =
      await supabaseClient.rpc(
        "get_or_create_personal_workspace"
      );

    if (workspaceError) {
      console.error(
        "Kunde inte hämta eller skapa workspace:",
        workspaceError
      );

      throw workspaceError;
    }

    this.id = workspaceId;

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

    const { data: member, error: memberError } =
      await supabaseClient
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

    console.log("Aktivt workspace:", this.id);
    console.log("Visningsnamn:", this.displayName);

    return this.id;
  },

  async saveDisplayName(displayName) {
    if (!this.id) {
      throw new Error("Aktivt workspace saknas.");
    }

    const cleanDisplayName = String(displayName || "").trim();

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
    this.id = null;
    this.displayName = null;
  }
};

window.workspace = workspace;