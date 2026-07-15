const workspace = {
  id: null,

  async load() {
    const { data, error } = await supabaseClient.rpc(
      "get_or_create_personal_workspace"
    );

    if (error) {
      console.error("Kunde inte hämta eller skapa workspace:", error);
      throw error;
    }

    this.id = data;

    console.log("Aktivt workspace:", this.id);

    return this.id;
  },

  clear() {
    this.id = null;
  }
};