import { openCCDateModal } from "../calendar/cc-modal.js";
import { closeGradingModal, openGradingModal } from "./grading-modal.js";

// Actions déclenchées par les attributs data-a (clic, change, input) pour cette fonctionnalité.
export const notesActions = {
  click: {
    // Crayon (ou « Créer le calculateur ») d'une matière : ouvre la pop-up du calculateur.
    editgrading: async (t, e) => { openGradingModal(t.dataset.m); },
    closegrading: async (t, e) => { closeGradingModal(); },
    // « + Date » sous une épreuve : mini pop-up (cours de l'EDT ou simple date), le reste vient de l'épreuve.
    addccdate: async (t, e) => { openCCDateModal({ matiere: t.dataset.m, epreuve: t.dataset.e }); },
  },
};
