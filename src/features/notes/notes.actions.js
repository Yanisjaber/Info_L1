import { $ } from "../../core/utils/dom.js";

// Actions déclenchées par les attributs data-a (clic, change, input) pour cette fonctionnalité.
export const notesActions = {
  click: {
    // Crayon d'une matière : affiche ou cache l'éditeur de son calculateur.
    togglegrading: async (t, e) => {
      const form = $(`form.gr-form[data-m="${CSS.escape(t.dataset.m)}"]`);
      if (!form) return;
      form.hidden = !form.hidden;
      t.setAttribute("aria-expanded", String(!form.hidden));
    },
  },
};
