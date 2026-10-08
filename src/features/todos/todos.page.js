import { datePickerHtml, wireDatePickers } from "../../core/components/date-picker.js";
import { icon } from "../../core/components/icons.js";
import { toast } from "../../core/components/toast.js";
import { D } from "../../core/services/app-data.js";
import { loadData } from "../../core/services/data-loader.js";
import { sync, todayKey } from "../../core/services/store.js";
import { $, esc } from "../../core/utils/dom.js";
import { todoRowHtml } from "./todos.components.js";
import { saveTodo } from "./todos.service.js";
import { todosState } from "./todos.store.js";
import { todoLate, todosSorted } from "./todos.utils.js";
import { rerender } from "../../routing/navigation.js";

// Page complète : ajout, petit calendrier (quels jours ont des tâches), et la liste groupée
// par état (en retard d'abord, puis à venir, puis terminées repliées).
export function todosPage() {
  if (!sync.user) return { html: `<h1>To do list</h1><div class="empty">Connecte-toi pour voir ta liste de tâches.<div style="margin-top:10px"><a class="btn pri" href="#/compte">Se connecter</a></div></div>` };
  if (!todosState.todoMonth) todosState.todoMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const y = todosState.todoMonth.getFullYear(), mo = todosState.todoMonth.getMonth();
  const first = new Date(y, mo, 1), off = (first.getDay() + 6) % 7, dim = new Date(y, mo + 1, 0).getDate();
  const today = todayKey();
  let cells = "";
  for (let i = 0; i < off; i++) cells += `<div class="d out"></div>`;
  for (let d = 1; d <= dim; d++) {
    const iso = `${y}-${String(mo + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const ts = D.todos.filter((t) => t.date === iso);
    const chipColor = (t) => t.done ? "var(--ok)" : todoLate(t) ? "var(--ko)" : "var(--muted)";
    const chips = ts.slice(0, 2).map((t) => `<button type="button" class="ev" style="--c:${chipColor(t)};${t.done ? "text-decoration:line-through" : ""}" data-a="caltodo" data-id="${t.id}" title="${esc(t.texte)}">${esc(t.texte)}</button>`).join("");
    const extra = ts.length > 2 ? `<div class="tiny muted" style="padding-left:2px">+${ts.length - 2}</div>` : "";
    cells += `<div class="d ${iso === today ? "today" : ""}"><b>${d}</b>${chips}${extra}</div>`;
  }
  const monthName = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" }).format(todosState.todoMonth);

  const all = todosSorted();
  const late = all.filter((t) => todoLate(t));
  const upcoming = all.filter((t) => !t.done && !todoLate(t));
  const done = all.filter((t) => t.done);

  return {
    html: `<h1>To do list</h1>
    <div class="card" style="margin-bottom:16px">
      <form data-a="addtodo" class="row" style="gap:8px;flex-wrap:wrap">
        <input type="text" name="texte" placeholder="Nouvelle tâche…" required style="flex:1;min-width:180px">
        ${datePickerHtml("date", today)}
        <button class="btn pri" type="submit">${icon("check")}Ajouter</button>
      </form>
    </div>
    <div class="card" style="margin-bottom:16px">
      <div class="row" style="margin-bottom:10px"><button type="button" class="btn sm" data-a="todoprev" aria-label="Mois précédent">${icon("back")}</button><b style="min-width:150px;text-align:center;text-transform:capitalize">${monthName}</b><button type="button" class="btn sm" data-a="todonext" aria-label="Mois suivant">${icon("arrow")}</button><button type="button" class="btn sm ghost" data-a="todotoday">Aujourd'hui</button></div>
      <div class="cal mini">${["lun", "mar", "mer", "jeu", "ven", "sam", "dim"].map((d) => `<div class="dh">${d}</div>`).join("")}${cells}</div>
    </div>
    ${late.length ? `<h2>En retard</h2><div class="card list" style="margin-bottom:16px">${late.map((t) => todoRowHtml(t)).join("")}</div>` : ""}
    <h2>À venir</h2><div class="card list">${upcoming.map((t) => todoRowHtml(t)).join("") || `<div class="empty">Rien de prévu.</div>`}</div>
    ${done.length ? `<details style="margin-top:16px"><summary>Tâches terminées (${done.length})</summary><div class="card list" style="margin-top:10px">${done.map((t) => todoRowHtml(t)).join("")}</div></details>` : ""}`,
    after: (el) => {
      wireDatePickers(el);
      $('form[data-a="addtodo"]', el)?.addEventListener("submit", async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target), texte = fd.get("texte").trim();
        if (!texte) return;
        try { await saveTodo({ texte, date: fd.get("date") }); toast("Tâche ajoutée"); await loadData(); rerender(); } catch (err) { toast("Erreur : " + err.message); }
      });
    },
  };
}
