import { toast } from "../../core/components/toast.js";
import { saveResult } from "../../core/services/results.service.js";
import { bump, commit, state } from "../../core/services/store.js";
import { shuffle } from "../../core/utils/format.js";
import { snapshotCcProg, snapshotElo } from "../elo/elo.utils.js";
import { quizState } from "./quiz.store.js";
import { isRef, okQ } from "./quiz.utils.js";
import { rerender } from "../../routing/navigation.js";
import { routerState } from "../../routing/router.store.js";

export function startQuiz(pool, opt) {
  quizState.Q = {
    ...opt, i: 0, done: false, start: Date.now(), deadline: opt.timed ? Date.now() + opt.minutes * 60000 : 0,
    qs: pool.map((q) => ({ q, order: isRef(q) ? q.choix.map((_, k) => k) : shuffle(q.choix.map((_, k) => k)), ans: new Set(), checked: false, flag: false })),
  };
  location.hash = "#/qcm/run";
  if (location.hash.endsWith("/run")) rerender();
}

// N'est appelée qu'en mode examen (voir finishQuiz) : l'entraînement (correction immédiate,
// sans enjeu, pensé pour être fait n'importe où) ne doit laisser aucune trace, ni dans les stats
// de précision/progression ni dans l'Elo — seul l'examen (chronométré, correction à la fin) compte.
async function recordQ(x) {
  const cur = state.qcm[x.q.id] || { n: 0, ok: 0, last: false };
  const good = okQ(x);
  const entry = { n: cur.n + 1, ok: cur.ok + (good ? 1 : 0), last: good };
  state.qcm[x.q.id] = entry;
  await saveResult("qcm", x.q.id, entry);
  snapshotElo(x.q.mid);
  snapshotCcProg(x.q.mid, x.q.seance);
  bump(1, "qcm");
}

export function finishQuiz(timeout) {
  if (!quizState.Q || quizState.Q.done) return;
  quizState.Q.done = true; quizState.Q.end = Date.now(); quizState.Q.timeout = !!timeout;
  const exam = quizState.Q.mode === "exam";
  if (exam) quizState.Q.qs.forEach((x) => { if (x.ans.size) { x.checked = true; recordQ(x).catch((err) => toast("Erreur : " + err.message)); } });
  const ok = quizState.Q.qs.filter(okQ).length, n = quizState.Q.qs.length;
  quizState.Q.ok = ok;
  commit();
  if (routerState.cleanup) { routerState.cleanup(); routerState.cleanup = null; }
  rerender();
}
