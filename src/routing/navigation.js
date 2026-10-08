import { shell } from "../core/components/shell.js";
import { route } from "./router.js";

export const rerender = () => route();

// À utiliser (au lieu de rerender seul) après toute modif qui peut changer la liste des
// matières visibles dans le menu (créer/supprimer une matière, changer une période…).
export const refreshShell = () => { shell(); return rerender(); };

export function rerenderKeep() { const y = window.scrollY; rerender().then?.(() => 0); requestAnimationFrame(() => window.scrollTo(0, y)); }
