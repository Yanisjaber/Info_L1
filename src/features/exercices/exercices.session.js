import { D } from "../../core/services/app-data.js";
import { saveResult } from "../../core/services/results.service.js";
import { bump, state } from "../../core/services/store.js";
import { snapshotCcProg, snapshotElo } from "../elo/elo.utils.js";
import { saveEvalRecord } from "../eval/eval.session.js";
import { evalState } from "../eval/eval.store.js";

// Note le résultat d'une correction automatique (code ou texte) : progression + éval en cours si active.
// Si un eval est en cours, la ligne `evals` est upsertée EN PREMIER (pour obtenir/retrouver son id
// serveur) afin que le résultat de l'exercice porte bien `eval_id` — c'est ce lien qui permet à la
// suppression de cet eval depuis l'historique de reprendre automatiquement (cascade) cette marque.
export async function autoMark(id, ok) {
  const ex = D.E.find((e) => e.id === id);
  const mark = ok ? "ok" : "redo";
  let it = null;
  if (evalState.EV) {
    it = evalState.EV.items.find((x) => x.e.id === id);
    if (it) { it.mark = mark; await saveEvalRecord(); }
  }
  state.exos[id] = { v: mark, ts: Date.now() };
  await saveResult("exercice", id, { v: mark }, it ? evalState.EV.id : null);
  bump(2, "exercice");
  if (ex) { snapshotElo(ex.mid); snapshotCcProg(ex.mid, ex.seance); }
  if (it) {
    const idx = evalState.EV.items.indexOf(it);
    const card = document.getElementById(`ev-${idx}`);
    const chip = card?.querySelector(".chip");
    if (chip) { chip.className = `chip ${it.mark === "ok" ? "ok" : "wa"}`; chip.textContent = it.mark === "ok" ? "réussi" : "à refaire"; }
  }
}
