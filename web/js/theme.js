export const THEME_PREFS = ["auto", "light", "dark"];

// Pure: given a stored preference and whether the OS prefers dark, return the
// concrete theme to apply.
export function resolveTheme(pref, prefersDark) {
  if (pref === "dark") return "dark";
  if (pref === "light") return "light";
  return prefersDark ? "dark" : "light";
}

// DOM: resolve against the live media query and stamp the root element.
export function applyTheme(pref) {
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  document.documentElement.dataset.theme = resolveTheme(pref, prefersDark);
}

// DOM: apply now and keep following the system while pref stays "auto".
export function initTheme(pref) {
  applyTheme(pref);
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener("change", () => {
    if ((document.documentElement.dataset.themePref || "auto") === "auto") {
      applyTheme("auto");
    }
  });
}
