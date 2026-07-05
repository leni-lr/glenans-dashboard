// Escape a value for safe interpolation into HTML text/attribute contexts.
const MAP = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, (c) => MAP[c]);
}
