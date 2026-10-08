import { state } from "./store.js";

export function applyTheme() {
  const t = state.prefs.theme;
  if (t && t !== "auto") document.documentElement.setAttribute("data-theme", t); else document.documentElement.removeAttribute("data-theme");
  try { localStorage.setItem("l1s1_theme", t || "auto"); } catch (e) {}
}
