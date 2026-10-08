import { rerender } from "./navigation.js";

// Actions déclenchées par les attributs data-a (clic, change, input) pour cette fonctionnalité.
export const navigationActions = {
  click: {
    navback: async (t, e) => { history.back(); },
    // Bascule lecture/édition d'une séance : remplace l'entrée d'historique au lieu d'en empiler une
    // nouvelle, pour que "Retour" retrouve la page d'où on a cliqué "Modifier", pas le formulaire.
    navreplace: async (t, e) => { e.preventDefault(); history.replaceState(null, "", t.getAttribute("href")); rerender(); },
  },
};
