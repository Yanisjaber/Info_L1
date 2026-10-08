import { appConfirm } from "../../core/components/dialog.js";
import { toast } from "../../core/components/toast.js";
import { C, D } from "../../core/services/app-data.js";
import { loadData } from "../../core/services/data-loader.js";
import { plural } from "../../core/utils/format.js";
import { closeEdtModal, openEdtModal } from "./edt-modal.js";
import { deleteEdtEvent, saveEdtEvent } from "./edt.service.js";
import { edtViewState } from "./edt.store.js";
import { mondayOf, toMin } from "./edt.utils.js";
import { edtToSeanceType } from "../settings/settings.js";
import { analyzeIcs, commitIcsImport } from "./ics-import.service.js";
import { saveSeance } from "../seances/seances.service.js";
import { refreshShell, rerender } from "../../routing/navigation.js";

// Actions déclenchées par les attributs data-a (clic, change, input) pour cette fonctionnalité.
export const edtActions = {
  click: {
    edtprev: async (t, e) => { edtViewState.edtWeek.setDate(edtViewState.edtWeek.getDate() - 7); rerender(); },
    edtnext: async (t, e) => { edtViewState.edtWeek.setDate(edtViewState.edtWeek.getDate() + 7); rerender(); },
    edttoday: async (t, e) => { edtViewState.edtWeek = mondayOf(new Date()); rerender(); },
    edtedit: async (t, e) => { const ev = D.edt.events.find((x) => x.id === t.dataset.id); if (ev) openEdtModal(ev); },
    addedt: async (t, e) => { openEdtModal(null); },
    canceledt: async (t, e) => { closeEdtModal(); },
    deledt: async (t, e) => {
      if (await appConfirm("Supprimer ce créneau ?")) {
        try { await deleteEdtEvent(t.dataset.id); toast("Créneau supprimé"); closeEdtModal(); await loadData(); rerender(); }
        catch (err) { toast("Erreur : " + err.message); }
      }
    },
    creerseance: async (t, e) => {
      const mid = t.dataset.m, d = t.dataset.d, want = edtToSeanceType(t.dataset.t);
      const edtEv = D.edt.events.find((x) => x.id === t.dataset.id);
      // Deux créneaux du même type peuvent tomber le même jour (ex. deux CM à la suite) : se contenter
      // de "la première séance de ce type à cette date" les faisait tous les deux retomber sur la même
      // séance, indétachables l'un de l'autre (bug trouvé et corrigé le 2026-10-07). Même ordre
      // temps → numero que seanceFor() : on choisit, parmi les séances déjà créées ce jour-là pour ce
      // type, celle à la position du créneau cliqué dans l'ordre chronologique des créneaux du jour.
      const cands = C(mid).seances.filter((x) => x.type === want && x.date === d).sort((a, b) => a.numero - b.numero);
      const sameDay = D.edt.events.filter((x) => x.d === d && x.m === mid && x.t === t.dataset.t).sort((a, b) => toMin(a.s) - toMin(b.s));
      let s = cands[sameDay.findIndex((x) => x.id === edtEv?.id)];
      try {
        if (!s) {
          const sameType = C(mid).seances.filter((x) => x.type === want);
          const numero = sameType.length ? Math.max(...sameType.map((x) => x.numero)) + 1 : 1;
          const id = `${want.toLowerCase()}-${numero}`;
          await saveSeance(mid, { id, type: want, numero, date: d, titre: `${want} ${numero}`, resume: "", contenu: "" });
          s = { id };
        }
        // Pose le lien explicite EDT → séance sur le créneau d'origine, pour que seanceFor()
        // n'ait plus besoin de deviner par date+type+matière.
        if (edtEv && edtEv.sid !== s.id) await saveEdtEvent({ ...edtEv, sid: s.id });
        await loadData();
        location.hash = `#/c/${mid}/${s.id}`;
      } catch (err) { toast("Erreur : " + err.message); }
    },
    confirmics: async (t, e) => { if (!edtViewState.icsPreview) return; toast("Import en cours…"); try { const r = await commitIcsImport(edtViewState.icsPreview, D.matieres); edtViewState.icsPreview = null; toast(`Importé : ${plural(r.matieresCreees, "matière créée", "matières créées")}, ${plural(r.evenements, "créneau")}`); await loadData(); refreshShell(); } catch (err) { toast("Erreur : " + err.message); } },
    cancelics: async (t, e) => { edtViewState.icsPreview = null; rerender(); },
  },
  change: {
    icsfile: async (t, e) => { const f = t.files[0]; if (!f) return; f.text().then((s) => { try { edtViewState.icsPreview = analyzeIcs(s); rerender(); } catch (err) { toast("Fichier .ics invalide"); } }); },
  },
  rules: [
    {
      match: (t, a) => t.dataset.ccnoteId,
      run: (t, e, a) => {
        const ev = D.edt.events.find((x) => x.id === t.dataset.ccnoteId);
        if (ev) { ev.n = t.value; saveEdtEvent(ev).catch((err) => toast("Erreur : " + err.message)); }
        return;
      },
    },
  ],
};
