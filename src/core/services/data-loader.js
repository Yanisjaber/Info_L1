import { C, D, activeMatieres } from "./app-data.js";
import { dataState } from "./app-data.store.js";
import { loadItems } from "./items.service.js";
import { loadResults } from "./results.service.js";
import { state, sync } from "./store.js";
import { loadCC } from "../../features/calendar/cc.service.js";
import { collectFileRefs } from "../../features/files/files.js";
import { signRefs } from "../../features/files/files.service.js";
import { loadSeanceDocSids } from "../../features/documents/documents.service.js";
import { loadEdt } from "../../features/edt/edt.service.js";
import { loadEvals } from "../../features/eval/eval.service.js";
import { loadMatieres, loadPeriodes } from "../../features/matieres/matieres.service.js";
import { mergeSettings } from "../../features/settings/settings.js";
import { loadSettings } from "../../features/settings/settings.service.js";
import { loadSeances } from "../../features/seances/seances.service.js";
import { loadTodos } from "../../features/todos/todos.service.js";

// Vide tout le contenu propre à un compte (matières, cours, EDT). Toujours synchrone et
// appelé AVANT toute requête réseau : si le rechargement qui suit échoue, l'écran reste
// vide (sûr) plutôt que de garder affichées les données du compte précédent (pas sûr).
export function resetContent() {
  D.settings = mergeSettings(null); D.files = {}; D.matieres = []; D.periodes = []; D.content = {}; D.docSids = new Set(); D.Q = []; D.F = []; D.E = []; D.todos = []; dataState.IDS = []; D.edt = { events: [] }; D.cal = { evenements: [], remarques: [] };
  state.qcm = {}; state.cards = {}; state.exos = {}; state.evals = {};
}

export async function loadData() {
  resetContent();
  if (sync.user) {
    D.settings = await loadSettings();
    D.edt = await loadEdt();
    D.periodes = await loadPeriodes();
    D.matieres = await loadMatieres();
    const allIds = D.matieres.map((m) => m.id);
    const [allSeances, allQcm, allFlash, allExo, results, evals] = await Promise.all([
      Promise.all(allIds.map((id) => loadSeances(id))),
      loadItems("qcm"), loadItems("carte"), loadItems("exercice"),
      loadResults(), loadEvals(),
    ]);
    allIds.forEach((id, i) => {
      D.content[id] = {
        id, seances: allSeances[i],
        qcm: allQcm.filter((x) => x.matiere === id),
        flashcards: allFlash.filter((x) => x.matiere === id),
        exercices: allExo.filter((x) => x.matiere === id),
      };
    });
    D.files = await signRefs(collectFileRefs());
    dataState.IDS = activeMatieres().map((m) => m.id);
    D.cal = await loadCC();
    D.todos = await loadTodos();
    D.docSids = await loadSeanceDocSids();
    state.qcm = results.qcm; state.cards = results.cards; state.exos = results.exos;
    state.evals = evals;
  }
  dataState.IDS.forEach((id) => {
    C(id).qcm.forEach((q) => D.Q.push({ ...q, mid: id }));
    C(id).flashcards.forEach((f) => D.F.push({ ...f, mid: id }));
    C(id).exercices.forEach((e) => D.E.push({ ...e, mid: id }));
  });
}
