import { icon } from "../../core/components/icons.js";
import { esc } from "../../core/utils/dom.js";
import { fmtDate } from "../../core/utils/format.js";
import { todoChip, todoLate, todosSorted } from "./todos.utils.js";

export function todoRowHtml(t, compact = false) {
  return `<div class="item"><input type="checkbox" data-a="todotoggle" data-id="${t.id}" ${t.done ? "checked" : ""} aria-label="Marquer « ${esc(t.texte)} » comme faite">
    <div class="sp"><b class="${t.done ? "muted" : ""}" style="${t.done ? "text-decoration:line-through" : ""}">${esc(t.texte)}</b></div>
    <span class="chip ${todoChip(t)}">${t.done ? "Faite" : todoLate(t) ? "En retard" : fmtDate(t.date)}</span>
    ${compact ? "" : `<button type="button" class="btn sm ghost" data-a="deltodo" data-id="${t.id}" aria-label="Supprimer « ${esc(t.texte)} »">✕</button>`}</div>`;
}

// Aperçu sur l'accueil : les 6 tâches les plus urgentes (en retard d'abord, puis les plus proches),
// réparties en 2 colonnes de 3 — la liste complète (ajout/suppression, petit calendrier) est sur sa
// propre page, ici on ne fait que montrer et cocher.
export function todoPreviewCard() {
  const pending = todosSorted().filter((t) => !t.done).slice(0, 6);
  const col1 = pending.slice(0, 3), col2 = pending.slice(3, 6);
  const body = pending.length
    ? `<div class="grid g2">
        <div class="list">${col1.map((t) => todoRowHtml(t, true)).join("")}</div>
        <div class="list">${col2.map((t) => todoRowHtml(t, true)).join("")}</div>
      </div>`
    : `<div class="empty">Rien à faire pour l'instant.</div>`;
  return `<div class="card" style="margin:16px 0">
    <div class="row nowrap"><h3 style="margin:0">To do list</h3><div class="sp"></div><a class="btn sm ghost" href="#/todos">Page complète ${icon("arrow")}</a></div>
    ${body}
  </div>`;
}
