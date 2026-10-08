import { appConfirm } from "../../core/components/dialog.js";
import { toast } from "../../core/components/toast.js";
import { loadData } from "../../core/services/data-loader.js";
import { commit, exportJSON, importJSON, pull, push, resetAll, signOut, state, sync } from "../../core/services/store.js";
import { applyTheme } from "../../core/services/theme.js";
import { $, download } from "../../core/utils/dom.js";
import { SET } from "../settings/settings.js";
import { doAuth } from "./account.page.js";
import { wipeAccount } from "./account.service.js";
import { refreshShell, rerender } from "../../routing/navigation.js";

// Actions déclenchées par les attributs data-a (clic, change, input) pour cette fonctionnalité.
export const authActions = {
  click: {
    login: async (t, e) => { /* submit géré */ },
    signup: async (t, e) => { doAuth("signup", $("#lf")); },
    magic: async (t, e) => { doAuth("magic", $("#lf")); },
    logout: async (t, e) => { await signOut(); rerender(); },
    pull: async (t, e) => { await pull(); rerender(); toast("Données récupérées"); },
    push: async (t, e) => { await push(); rerender(); toast("Données envoyées"); },
    export: async (t, e) => { download(`progression-${SET().slug}.json`, exportJSON(), "application/json"); },
    reset: async (t, e) => {
      const msg = sync.user
        ? "Tout effacer ? Supprime IMMÉDIATEMENT et définitivement (y compris dans le cloud) toutes tes matières, séances/cours et ton emploi du temps, en plus de ta progression locale. Irréversible."
        : "Effacer toute ta progression sur cet appareil ?";
      if (!(await appConfirm(msg))) return;
      resetAll();
      if (sync.user) {
        try { await wipeAccount(); } catch (err) { toast("Erreur : " + err.message); }
        await loadData(); refreshShell();
      } else rerender();
      toast("Tout a été effacé");
    },
  },
  change: {
    theme: async (t, e) => { state.prefs.theme = t.value; state.prefs.ts = Date.now(); applyTheme(); commit(); },
    import: async (t, e) => { const f = t.files[0]; if (!f) return; f.text().then((s) => { try { importJSON(s); toast("Progression importée"); rerender(); } catch (err) { toast("Fichier invalide"); } }); },
  },
};
