const utils = {
  id() {
    return `id-${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;
  },

  clone(value) {
    return JSON.parse(JSON.stringify(value));
  },

  unique(values) {
    const map = new Map();

    values.forEach(value => {
      const cleanValue = String(value || "").trim();

      if (cleanValue) {
        map.set(cleanValue.toLowerCase(), cleanValue);
      }
    });

    return [...map.values()].sort((a, b) =>
      a.localeCompare(b, "sv")
    );
  },

  escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }
};

window.utils = utils;