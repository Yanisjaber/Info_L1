import { saveResult } from "../../core/services/results.service.js";
import { bump, commit, setEntry, state } from "../../core/services/store.js";
import { snapshotCcProg, snapshotElo } from "../elo/elo.utils.js";
import { saveEval } from "./eval.service.js";
import { evalState } from "./eval.store.js";
import { evalItemSnapshot, evalScore } from "./eval.utils.js";
import { exoState } from "../exercices/exercices.store.js";
import { checkTextAnswer, expectedAnswers } from "../exercices/exercices.utils.js";
import { rerender } from "../../routing/navigation.js";
import { routerState } from "../../routing/router.store.js";

export function startEval(pool, opt) {
  evalState.EV = { ...opt, i: 0, done: false, start: Date.now(), deadline: Date.now() + opt.minutes * 60000, items: pool.map((e) => ({ e, mark: null })) };
  location.hash = "#/eval/run";
  if (location.hash.endsWith("/run")) rerender();
}

// Corrige automatiquement tous les exercices de la session (code : on relance les tests ;
// texte : on recompare la réponse) à partir de la dernière version enregistrée de chacun —
// aucune action manuelle par exercice n'est nécessaire, comme un vrai rendu de copie.
export async function finishEval(timeout) {
  if (!evalState.EV || evalState.EV.done) return;
  evalState.EV.done = true; evalState.EV.end = Date.now(); evalState.EV.timeout = !!timeout; evalState.EV.grading = true;
  if (routerState.cleanup) { routerState.cleanup(); routerState.cleanup = null; }
  rerender();
  await saveEvalRecord();
  for (const it of evalState.EV.items) {
    const e = it.e;
    if (e.type === "code") {
      const code = state.reponses[e.id]?.value ?? e.codeStarter ?? "";
      try {
        const { runPythonExercise } = await import("./pyrun.js");
        const r = await runPythonExercise(code, e.codeTests);
        exoState.codeResults[e.id] = r;
        const ran = r.results.length || r.error;
        it.mark = ran && !r.error && r.results.every((x) => x.ok) ? "ok" : "redo";
      } catch (err) {
        it.mark = "redo";
      }
    } else if (e.type === "texte") {
      const answers = expectedAnswers(e), values = state.reponses[e.id]?.values || [];
      const oks = answers.map((a, i) => checkTextAnswer(values[i] ?? "", a));
      const ok = answers.length > 0 && oks.every(Boolean);
      setEntry("reponses", e.id, { values, oks, ok });
      it.mark = ok ? "ok" : "redo";
    }
    if (it.mark) { state.exos[e.id] = { v: it.mark, ts: Date.now() }; await saveResult("exercice", e.id, { v: it.mark }, evalState.EV.id); snapshotElo(e.mid); snapshotCcProg(e.mid, e.seance); }
  }
  await saveEvalRecord();
  evalState.EV.grading = false;
  rerender();
}

// Upserte la ligne `evals` (même id serveur réutilisé à chaque rappel, stocké sur EV.id dès la
// première sauvegarde) : appelée avant toute correction d'exercice dans finishEval pour que
// saveResult() puisse déjà rattacher ses résultats à cet eval via eval_id.
export async function saveEvalRecord() {
  const { n, ok } = evalScore();
  const by = {}; evalState.EV.items.forEach((it) => { const s = by[it.e.seance] || (by[it.e.seance] = [0, 0]); s[1]++; if (it.mark === "ok") s[0]++; });
  const rec = { id: evalState.EV.id, mid: evalState.EV.mid, n, ok, score20: (ok / n) * 20, dur: Math.round(((evalState.EV.end || Date.now()) - evalState.EV.start) / 1000), seances: by, items: evalState.EV.items.map(evalItemSnapshot) };
  evalState.EV.id = await saveEval(rec);
  state.evals[evalState.EV.id] = { ...rec, id: evalState.EV.id, ts: Date.now() };
  bump(3, "eval");
  commit();
}
