import { toast } from "../../core/components/toast.js";
import { loadData } from "../../core/services/data-loader.js";
import { migrateLegacyFiles } from "./files-migration.js";
import { rerender } from "../../routing/navigation.js";

// Actions déclenchées par les attributs data-a (clic, change, input) pour cette fonctionnalité.
export const filesActions = {
  click: {
    migratefiles: async (t, e) => {
      t.disabled = true;
      try {
        const r = await migrateLegacyFiles((i, n) => { t.textContent = `Envoi ${i}/${n}…`; });
        await loadData(); rerender();
        toast(r.echecs.length ? `${r.fichiers} fichier(s) migré(s), ${r.echecs.length} en échec : ${r.echecs[0]}` : `${r.fichiers} fichier(s) migré(s) vers ton stockage`);
      } catch (err) { t.disabled = false; toast("Erreur : " + err.message); }
    },
  },
};
