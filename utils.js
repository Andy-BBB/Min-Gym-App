function id() {
  return "id-" +
    Date.now().toString(36) +
    "-" +
    Math.random().toString(36).slice(2, 8);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function unique(array) {
  const map = new Map();

  array.forEach(name => {
    const clean = String(name || "").trim();

    if (clean) {
      map.set(clean.toLowerCase(), clean);
    }
  });

  return [...map.values()].sort((a, b) => a.localeCompare(b, "sv"));
}

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}