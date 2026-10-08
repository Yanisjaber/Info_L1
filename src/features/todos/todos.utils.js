import { D } from "../../core/services/app-data.js";
import { daysUntil } from "../../core/utils/format.js";

// Juste trois états visuels, calculés à la volée depuis `done`/`date` — rien à stocker en plus :
// faite (vert), en retard (rouge, date passée et pas faite), ou normale (ni l'un ni l'autre).
export const todoLate = (t) => !t.done && daysUntil(t.date) < 0;

export const todoChip = (t) => (t.done ? "ok" : todoLate(t) ? "ko" : "gr");

export const todosSorted = () => D.todos.slice().sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
