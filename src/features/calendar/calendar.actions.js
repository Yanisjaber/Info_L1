import { appConfirm } from "../../core/components/dialog.js";
import { toast } from "../../core/components/toast.js";
import { D, M } from "../../core/services/app-data.js";
import { loadData } from "../../core/services/data-loader.js";
import { icsExport } from "./calendar.page.js";
import { calState } from "./calendar.store.js";
import { closeCCModal, openCCInfoModal, openCCModal } from "./cc-modal.js";
import { deleteCCWithEpreuve } from "./cc.service.js";
import { epreuveOf } from "../notes/grading.utils.js";
import { rerender } from "../../routing/navigation.js";

// Actions déclenchées par les attributs data-a (clic, change, input) pour cette fonctionnalité.
export const calendarActions = {
  click: {
    calprev: async (t, e) => { calState.calMonth = new Date(calState.calMonth.getFullYear(), calState.calMonth.getMonth() - 1, 1); rerender(); },
    calnext: async (t, e) => { calState.calMonth = new Date(calState.calMonth.getFullYear(), calState.calMonth.getMonth() + 1, 1); rerender(); },
    caltoday: async (t, e) => { calState.calMonth = null; rerender(); },
    ics: async (t, e) => { icsExport(); },
    evt: async (t, e) => { const ev = D.cal.evenements.find((x) => x.id === t.dataset.id); if (ev) openCCInfoModal(ev); },
    editcc: async (t, e) => { const ev = D.cal.evenements.find((x) => x.id === t.dataset.id); if (ev) openCCModal(ev); },
    addcc: async (t, e) => { openCCModal(null); },
    cancelcc: async (t, e) => { closeCCModal(); },
    delcc: async (t, e) => {
      const ev = D.cal.evenements.find((x) => x.id === t.dataset.id);
      if (!ev || !(await appConfirm("Supprimer cette échéance ?"))) return;
      // Reliée à une épreuve du calculateur : on demande si elle part aussi (sa note ne serait alors plus comptée).
      const ep = ev.epreuve && epreuveOf(M(ev.matiere)?.grading, ev.epreuve);
      const withEpreuve = ep ? await appConfirm(`Supprimer aussi l'épreuve « ${ep.label} » du calculateur ? La note saisie pour elle ne sera plus comptée.`) : false;
      try { await deleteCCWithEpreuve(ev, withEpreuve); toast("Échéance supprimée"); closeCCModal(); await loadData(); rerender(); } catch (err) { toast("Erreur : " + err.message); }
    },
    // Un CC a besoin de toutes ses informations (poids, « Sur »…) : on ouvre le formulaire prérempli plutôt que de créer à moitié.
    addccsugg: async (t, e) => { openCCModal(null, { matiere: t.dataset.m, date: t.dataset.date, titre: t.dataset.titre || "", edtId: t.dataset.edtId || "" }); },
  },
  change: {
    calses: async (t, e) => { calState.calSeances = t.checked; rerender(); },
  },
};
