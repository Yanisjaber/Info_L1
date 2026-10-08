import { appConfirm } from "../../core/components/dialog.js";
import { toast } from "../../core/components/toast.js";
import { D } from "../../core/services/app-data.js";
import { loadData } from "../../core/services/data-loader.js";
import { icsExport } from "./calendar.page.js";
import { calState } from "./calendar.store.js";
import { closeCCModal, openCCInfoModal, openCCModal } from "./cc-modal.js";
import { deleteCCEvent, saveCCEvent } from "./cc.service.js";
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
    delcc: async (t, e) => { if (await appConfirm("Supprimer cette échéance ?")) { try { await deleteCCEvent(t.dataset.id); toast("Échéance supprimée"); closeCCModal(); await loadData(); rerender(); } catch (err) { toast("Erreur : " + err.message); } } },
    addccsugg: async (t, e) => {
      try { await saveCCEvent({ matiere: t.dataset.m, date: t.dataset.date, titre: t.dataset.titre, poids: "", edtId: t.dataset.edtId || null }); toast("Échéance ajoutée"); await loadData(); rerender(); }
      catch (err) { toast("Erreur : " + err.message); }
    },
  },
  change: {
    calses: async (t, e) => { calState.calSeances = t.checked; rerender(); },
  },
};
