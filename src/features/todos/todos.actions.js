import { appConfirm } from "../../core/components/dialog.js";
import { toast } from "../../core/components/toast.js";
import { D } from "../../core/services/app-data.js";
import { loadData } from "../../core/services/data-loader.js";
import { deleteTodo, setTodoDone } from "./todos.service.js";
import { todosState } from "./todos.store.js";
import { rerender } from "../../routing/navigation.js";

// Actions déclenchées par les attributs data-a (clic, change, input) pour cette fonctionnalité.
export const todosActions = {
  click: {
    deltodo: async (t, e) => { if (await appConfirm("Supprimer cette tâche ?")) { try { await deleteTodo(t.dataset.id); toast("Tâche supprimée"); await loadData(); rerender(); } catch (err) { toast("Erreur : " + err.message); } } },
    caltodo: async (t, e) => {
      const todo = D.todos.find((x) => x.id === t.dataset.id); if (!todo) return;
      try { await setTodoDone(todo.id, !todo.done); todo.done = !todo.done; rerender(); } catch (err) { toast("Erreur : " + err.message); }
    },
    todoprev: async (t, e) => { todosState.todoMonth = new Date(todosState.todoMonth.getFullYear(), todosState.todoMonth.getMonth() - 1, 1); rerender(); },
    todonext: async (t, e) => { todosState.todoMonth = new Date(todosState.todoMonth.getFullYear(), todosState.todoMonth.getMonth() + 1, 1); rerender(); },
    todotoday: async (t, e) => { todosState.todoMonth = null; rerender(); },
  },
  change: {
    todotoggle: async (t, e) => {
      const id = t.dataset.id, done = t.checked;
      (async () => {
        try {
          await setTodoDone(id, done);
          const todo = D.todos.find((x) => x.id === id); if (todo) todo.done = done;
          rerender();
        } catch (err) { toast("Erreur : " + err.message); }
      })();
    },
  },
};
