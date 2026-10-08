import { appConfirm } from "../../core/components/dialog.js";
import { toast } from "../../core/components/toast.js";
import { loadData } from "../../core/services/data-loader.js";
import { deleteItem } from "../../core/services/items.service.js";
import { rate } from "./flashcards.session.js";
import { cardsState } from "./flashcards.store.js";
import { rerender } from "../../routing/navigation.js";

// Actions déclenchées par les attributs data-a (clic, change, input) pour cette fonctionnalité.
export const flashcardsActions = {
  click: {
    flip: async (t, e) => { cardsState.FC.flip = !cardsState.FC.flip; rerender(); },
    rate: async (t, e) => { rate(t.dataset.r); },
    delflash: async (t, e) => { if (await appConfirm("Supprimer cette carte ?")) { await deleteItem("carte", t.dataset.id); toast("Carte supprimée"); await loadData(); location.hash = `#/af/${t.dataset.mid}`; } },
  },
};
