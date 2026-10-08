import { appConfirm } from "../../core/components/dialog.js";
import { toast } from "../../core/components/toast.js";
import { loadData } from "../../core/services/data-loader.js";
import { saveResult } from "../../core/services/results.service.js";
import { state } from "../../core/services/store.js";
import { snapshotCcProg, snapshotElo } from "../elo/elo.utils.js";
import { deleteEval } from "./eval.service.js";
import { finishEval, saveEvalRecord } from "./eval.session.js";
import { evalState } from "./eval.store.js";
import { rerender, rerenderKeep } from "../../routing/navigation.js";

// Actions déclenchées par les attributs data-a (clic, change, input) pour cette fonctionnalité.
export const evalActions = {
  click: {
    enext: async (t, e) => { if (evalState.EV.i < evalState.EV.items.length - 1) { evalState.EV.i++; rerender(); } },
    eprev: async (t, e) => { if (evalState.EV.i > 0) { evalState.EV.i--; rerender(); } },
    egoto: async (t, e) => { evalState.EV.i = +t.dataset.i; rerender(); },
    efinish: async (t, e) => { const un = evalState.EV.items.length; if (!(await appConfirm(`Terminer l'épreuve (${evalState.EV.i + 1}/${un}) ?`))) return; finishEval(false); },
    emark: async (t, e) => {
      const it = evalState.EV.items[+t.dataset.i]; it.mark = t.dataset.v;
      await saveEvalRecord();
      state.exos[it.e.id] = { v: it.mark, ts: Date.now() };
      await saveResult("exercice", it.e.id, { v: it.mark }, evalState.EV.id);
      snapshotElo(it.e.mid);
      snapshotCcProg(it.e.mid, it.e.seance);
      rerenderKeep();
    },
    delevaL: async (t, e) => {
      if (await appConfirm("Supprimer cet essai d'éval blanche ? (abandonné, test, ou à ne pas garder dans l'historique)")) {
        // Les résultats d'exercice encore liés à cet eval sont supprimés en cascade côté base
        // (FK eval_id, voir supabase/schema_results.sql) : loadData() les recharge donc déjà à jour.
        await deleteEval(t.dataset.id);
        toast("Essai supprimé");
        await loadData();
        rerender();
      }
    },
  },
};
