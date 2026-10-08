import { shell, syncLabel } from "./core/components/shell.js";
import { D } from "./core/services/app-data.js";
import { loadData, resetContent } from "./core/services/data-loader.js";
import { initSync, onChange, state, sync } from "./core/services/store.js";
import { applyTheme } from "./core/services/theme.js";
import { $, esc } from "./core/utils/dom.js";
import { quizState } from "./features/quiz/quiz.store.js";
import { rerender } from "./routing/navigation.js";
import { parse, route } from "./routing/router.js";
import { routerState } from "./routing/router.store.js";
import { navigationActions } from "./routing/navigation.actions.js";
import { seancesActions } from "./features/seances/seances.actions.js";
import { quizActions } from "./features/quiz/quiz.actions.js";
import { evalActions } from "./features/eval/eval.actions.js";
import { exercicesActions } from "./features/exercices/exercices.actions.js";
import { flashcardsActions } from "./features/flashcards/flashcards.actions.js";
import { calendarActions } from "./features/calendar/calendar.actions.js";
import { edtActions } from "./features/edt/edt.actions.js";
import { authActions } from "./features/auth/auth.actions.js";
import { matieresActions } from "./features/matieres/matieres.actions.js";
import { todosActions } from "./features/todos/todos.actions.js";
import { documentsActions } from "./features/documents/documents.actions.js";
import { filesActions } from "./features/files/files.actions.js";
import { initActions } from "./core/services/actions.js";

let lastUid = null;

async function boot() {
  applyTheme();
  await initSync();
  lastUid = sync.user ? sync.user.id : null;
  try { await loadData(); } catch (e) { $("#app").innerHTML = `<div class="empty" style="padding:3rem"><h2>Impossible de charger les données</h2><p>${esc(e.message)}</p><p class="small">Ouvre le site via un serveur web (GitHub Pages, ou <code>python3 -m http.server</code>), pas en double-cliquant sur index.html.</p></div>`; return; }
  shell();
  let sig = "";
  onChange(async () => {
    syncLabel();
    applyTheme(); // une synchro (pull) peut changer state.prefs.theme : il faut réappliquer le rendu
    const uid = sync.user ? sync.user.id : null;
    if (uid !== lastUid) {
      lastUid = uid; D.idx = null;
      // shell() reconstruit aussi la sidebar (liste des matières) : route()/rerender() seul
      // ne touche qu'au contenu de la page, pas au menu de gauche.
      resetContent(); shell(); await route(); // efface tout de suite : jamais de données de l'ancien compte à l'écran, même si le rechargement plante
      try { await loadData(); } catch (e) { console.error("loadData", e); }
      shell(); await route();
      return;
    }
    const s = (sync.user ? sync.user.id : "-") + sync.status + (sync.error || "");
    if (s !== sig) { sig = s; const p0 = parse().parts[0] || ""; if (["", "compte"].includes(p0) && !quizState.Q?.qs?.length) rerender(); else if (p0 === "compte") rerender(); }
  });
  window.addEventListener("hashchange", () => { routerState.navCount++; route(); });
  await route();
  syncLabel();
}

initActions([
  navigationActions,
  seancesActions,
  quizActions,
  evalActions,
  exercicesActions,
  flashcardsActions,
  calendarActions,
  edtActions,
  authActions,
  matieresActions,
  todosActions,
  documentsActions,
  filesActions,
]);
boot();

window.__app = { D, state, route };
