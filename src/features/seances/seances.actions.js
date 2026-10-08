import { appConfirm } from "../../core/components/dialog.js";
import { toast } from "../../core/components/toast.js";
import { seanceOf } from "../../core/services/app-data.js";
import { loadData } from "../../core/services/data-loader.js";
import { bump, commit, setEntry, state } from "../../core/services/store.js";
import { deleteSeance } from "./seances.service.js";

// Actions déclenchées par les attributs data-a (clic, change, input) pour cette fonctionnalité.
export const seancesActions = {
  click: {
    read: async (t, e) => { const k = t.dataset.k, cur = state.read[k]?.v; setEntry("read", k, { v: !cur }); if (!cur) bump(3, "lecture"); commit(); const [mid, sid] = k.split("/"); const s = seanceOf(mid, sid); t.textContent = !cur ? "✓ Lu" : "Marquer comme lu"; t.classList.toggle("pri", cur); toast(!cur ? "Marqué comme lu" : "Marqué comme non lu"); },
    delseance: async (t, e) => { if (await appConfirm("Supprimer cette séance ?")) { await deleteSeance(t.dataset.mid, t.dataset.sid); toast("Séance supprimée"); await loadData(); location.hash = `#/m/${t.dataset.mid}`; } },
  },
  rules: [
    {
      match: (t, a) => t.dataset.noteKey,
      run: (t, e, a) => { setEntry("seanceNotes", t.dataset.noteKey, { text: t.value }); commit(); return; },
    },
  ],
};
