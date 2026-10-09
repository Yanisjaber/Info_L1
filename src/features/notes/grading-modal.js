import { appConfirm } from "../../core/components/dialog.js";
import { toast } from "../../core/components/toast.js";
import { M } from "../../core/services/app-data.js";
import { loadData } from "../../core/services/data-loader.js";
import { $, $$, esc } from "../../core/utils/dom.js";
import { rerenderKeep } from "../../routing/navigation.js";
import { routerState } from "../../routing/router.store.js";
import { saveMatiere } from "../matieres/matieres.service.js";
import { bindGradingEditor, gradingEditorHtml, readGradingEditor } from "./grading-editor.js";

// Pop-up « calculateur de notes » d'une matière : épreuves, poids, note sur, 2e chance.
// Même principe que la pop-up des CC : overlay ajouté au body, fermé par ✕, Échap ou clic à côté,
// et enregistré dans `cleanup` pour disparaître au changement de page.
export function openGradingModal(mid) {
  const m = M(mid);
  if (!m) return;
  closeGradingModal();
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  backdrop.innerHTML = `<div class="modal card" role="dialog" aria-modal="true" aria-label="Calculateur de notes — ${esc(m.nom)}" style="max-width:720px">
    <div class="row nowrap" style="margin-bottom:4px"><h3 style="margin:0">${esc(m.nom)}</h3><div class="sp"></div><button type="button" class="btn sm ghost" data-a="closegrading" aria-label="Fermer">✕</button></div>
    <form class="gr-form" data-m="${esc(m.id)}">${gradingEditorHtml(m, { bare: true })}
      <div class="row" style="margin-top:14px"><button class="btn pri" type="submit">Enregistrer</button><button class="btn ghost" type="button" data-a="closegrading">Annuler</button></div>
    </form>
  </div>`;
  backdrop.addEventListener("mousedown", (ev) => { if (ev.target === backdrop) closeGradingModal(); });
  document.addEventListener("keydown", gradingModalEsc);
  document.body.appendChild(backdrop);

  const f = $("form.gr-form", backdrop);
  bindGradingEditor(f);
  f.addEventListener("submit", async (e) => {
    e.preventDefault();
    let grading;
    try { grading = readGradingEditor(f); } catch (err) { return toast(err.message); }
    if (!grading && !m.grading) return toast("Ajoute au moins une épreuve avec un nom et un poids");
    if (!grading && !(await appConfirm("Aucune épreuve : le calculateur de cette matière sera supprimé. Continuer ?"))) return;
    try {
      await saveMatiere({ ...M(mid), grading });
      toast("Calculateur enregistré");
      closeGradingModal();
      await loadData(); rerenderKeep();
    } catch (err) { toast("Erreur : " + err.message); }
  });
  routerState.cleanup = closeGradingModal;
}

export function closeGradingModal() {
  $$(".modal-backdrop").forEach((b) => b.remove());
  document.removeEventListener("keydown", gradingModalEsc);
  if (routerState.cleanup === closeGradingModal) routerState.cleanup = null;
}

const gradingModalEsc = (ev) => { if (ev.key === "Escape") closeGradingModal(); };
