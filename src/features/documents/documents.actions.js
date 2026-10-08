import { appConfirm } from "../../core/components/dialog.js";
import { toast } from "../../core/components/toast.js";
import { D } from "../../core/services/app-data.js";
import { plural } from "../../core/utils/format.js";
import { deleteSeanceDoc, uploadSeanceDoc } from "./documents.service.js";
import { docsState } from "./documents.store.js";
import { redoStroke, redrawAll, resetZoomView, undoStroke } from "./write-canvas.js";
import { closeWriteOverlay, openWriteOverlay, saveWriteNote, syncWriteToolbar } from "./write-overlay.js";
import { rerender } from "../../routing/navigation.js";

// Actions déclenchées par les attributs data-a (clic, change, input) pour cette fonctionnalité.
export const documentsActions = {
  click: {
    deldoc: async (t, e) => { if (await appConfirm(`Supprimer « ${t.dataset.nom} » ?`)) { try { await deleteSeanceDoc({ id: t.dataset.id, path: t.dataset.path }); const sid = docsState.CURRENT_DOCS.find((d) => d.id === t.dataset.id)?.sid; if (sid && !docsState.CURRENT_DOCS.some((d) => d.sid === sid && d.id !== t.dataset.id)) D.docSids.delete(sid); toast("Document supprimé"); rerender(); } catch (err) { toast("Erreur : " + err.message); } } },
    opennote: async (t, e) => { openWriteOverlay(document, t.dataset.mid, t.dataset.sid); },
    editnote: async (t, e) => { openWriteOverlay(document, t.dataset.mid, t.dataset.sid, docsState.CURRENT_DOCS.find((d) => d.id === t.dataset.id)); },
    wtool: async (t, e) => { if (docsState.DRAW) { docsState.DRAW.tool = t.dataset.tool; syncWriteToolbar(docsState.DRAW.el); } },
    wcolor: async (t, e) => { if (docsState.DRAW) { docsState.DRAW.color = t.dataset.c; syncWriteToolbar(docsState.DRAW.el); } },
    wpaper: async (t, e) => { if (docsState.DRAW) { docsState.DRAW.paper = t.dataset.paper; syncWriteToolbar(docsState.DRAW.el); redrawAll(); } },
    wzoomreset: async (t, e) => { resetZoomView(); },
    wundo: async (t, e) => { undoStroke(); },
    wredo: async (t, e) => { redoStroke(); },
    wsave: async (t, e) => { await saveWriteNote(); },
    wclose: async (t, e) => { if (docsState.DRAW?.dirty && !(await appConfirm("Fermer sans enregistrer cette page ?"))) return; if (docsState.DRAW) closeWriteOverlay(docsState.DRAW.el); },
  },
  change: {
    adddoc: async (t, e) => {
      const files = [...t.files]; if (!files.length) return;
      const { mid, sid } = t.dataset;
      (async () => {
        let ok = 0;
        for (const f of files) {
          try { await uploadSeanceDoc(mid, sid, f); D.docSids.add(sid); ok++; } catch (err) { toast("Erreur sur " + f.name + " : " + err.message); }
        }
        if (ok) toast(plural(ok, "document ajouté", "documents ajoutés"));
        rerender();
      })();
    },
  },
  input: {
    wsizeslider: (t, e) => {
      if (docsState.DRAW) { docsState.DRAW.size = +e.target.value; syncWriteToolbar(docsState.DRAW.el); }
    },
  },
  rules: [
    {
      match: (t, a) => a === "wcustomcolor",
      run: (t, e, a) => { if (docsState.DRAW) { docsState.DRAW.color = t.value; syncWriteToolbar(docsState.DRAW.el); } return; },
    },
    {
      match: (t, a) => a === "wsizeslider",
      run: (t, e, a) => { if (docsState.DRAW) { docsState.DRAW.size = +t.value; syncWriteToolbar(docsState.DRAW.el); } return; },
    },
  ],
};
