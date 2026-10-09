import { openCCModal } from "../calendar/cc-modal.js";
import { closeGradingModal, openGradingModal } from "./grading-modal.js";

// Actions déclenchées par les attributs data-a (clic, change, input) pour cette fonctionnalité.
export const notesActions = {
  click: {
    // Crayon (ou « Créer le calculateur ») d'une matière : ouvre la pop-up du calculateur.
    editgrading: async (t, e) => { openGradingModal(t.dataset.m); },
    closegrading: async (t, e) => { closeGradingModal(); },
    // « + Date » sous une épreuve : le formulaire d'échéance s'ouvre avec cette épreuve déjà choisie.
    addccdate: async (t, e) => { openCCModal(null, { matiere: t.dataset.m, epreuve: t.dataset.e }); },
  },
};
