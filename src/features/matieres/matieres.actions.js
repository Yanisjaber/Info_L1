import { appConfirm } from "../../core/components/dialog.js";
import { toast } from "../../core/components/toast.js";
import { D } from "../../core/services/app-data.js";
import { loadData } from "../../core/services/data-loader.js";
import { plural } from "../../core/utils/format.js";
import { deleteMatiere, deletePeriode, saveMatiere, savePeriode } from "./matieres.service.js";
import { refreshShell } from "../../routing/navigation.js";

// Actions déclenchées par les attributs data-a (clic, change, input) pour cette fonctionnalité.
export const matieresActions = {
  click: {
    delmatiere: async (t, e) => { if (await appConfirm("Supprimer cette matière et toutes ses séances ?")) { await deleteMatiere(t.dataset.mid); toast("Matière supprimée"); await loadData(); location.hash = "#/compte"; refreshShell(); } },
    toggleperiode: async (t, e) => {
      const newStatut = t.dataset.statut === "actif" ? "termine" : "actif";
      try { await savePeriode({ id: t.dataset.pid, nom: D.periodes.find((p) => p.id === t.dataset.pid)?.nom || "", statut: newStatut }); toast(newStatut === "termine" ? "Période marquée comme terminée" : "Période remise active"); await loadData(); refreshShell(); }
      catch (err) { toast("Erreur : " + err.message); }
    },
    delperiode: async (t, e) => { if (await appConfirm("Supprimer cette période ? Les matières associées ne sont pas supprimées, juste détachées.")) { try { await deletePeriode(t.dataset.pid); toast("Période supprimée"); await loadData(); refreshShell(); } catch (err) { toast("Erreur : " + err.message); } } },
    assignall: async (t, e) => {
      const sans = D.matieres.filter((m) => !m.periode);
      if (!sans.length) return;
      if (!(await appConfirm(`Rattacher ${plural(sans.length, "matière")} à cette période ?`))) return;
      toast("Mise à jour…");
      try {
        for (const m of sans) await saveMatiere({ ...m, periode: t.dataset.pid });
        toast("Matières rattachées");
        await loadData(); refreshShell();
      } catch (err) { toast("Erreur : " + err.message); }
    },
  },
};
