import { appConfirm } from "../../core/components/dialog.js";
import { toast } from "../../core/components/toast.js";
import { loadData } from "../../core/services/data-loader.js";
import { deleteItem } from "../../core/services/items.service.js";
import { shuffle } from "../../core/utils/format.js";
import { finishQuiz, startQuiz } from "./quiz.session.js";
import { quizState } from "./quiz.store.js";
import { okQ } from "./quiz.utils.js";
import { rerender, rerenderKeep } from "../../routing/navigation.js";

// Actions déclenchées par les attributs data-a (clic, change, input) pour cette fonctionnalité.
export const quizActions = {
  click: {
    choose: async (t, e) => { const x = quizState.Q.qs[quizState.Q.i]; if (x.checked) return; const i = +t.dataset.i; if (x.q.type === "multiple") { x.ans.has(i) ? x.ans.delete(i) : x.ans.add(i); } else { x.ans = new Set([i]); } rerenderKeep(); },
    check: async (t, e) => { const x = quizState.Q.qs[quizState.Q.i]; if (!x.ans.size) return; x.checked = true; rerenderKeep(); },
    next: async (t, e) => { if (quizState.Q.i < quizState.Q.qs.length - 1) { quizState.Q.i++; rerender(); } },
    prev: async (t, e) => { if (quizState.Q.i > 0) { quizState.Q.i--; rerender(); } },
    goto: async (t, e) => { quizState.Q.i = +t.dataset.i; rerender(); },
    flag: async (t, e) => { quizState.Q.qs[quizState.Q.i].flag = !quizState.Q.qs[quizState.Q.i].flag; rerenderKeep(); },
    finish: async (t, e) => { const un = quizState.Q.qs.filter((x) => !x.ans.size).length; if (quizState.Q.mode === "exam" && un && !(await appConfirm(`${un} question(s) sans réponse. Terminer quand même ?`))) return; finishQuiz(false); },
    retry: async (t, e) => { const w = quizState.Q.qs.filter((x) => !okQ(x)).map((x) => x.q); startQuiz(shuffle(w), { mode: "train", title: "Mes erreurs", mid: null }); },
    delqcm: async (t, e) => { if (await appConfirm("Supprimer cette question ?")) { await deleteItem("qcm", t.dataset.id); toast("Question supprimée"); await loadData(); location.hash = `#/aq/${t.dataset.mid}`; } },
  },
};
