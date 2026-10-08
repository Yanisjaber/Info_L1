import { icon } from "../../core/components/icons.js";
import { toast } from "../../core/components/toast.js";
import { C, D, M } from "../../core/services/app-data.js";
import { loadData } from "../../core/services/data-loader.js";
import { todayKey } from "../../core/services/store.js";
import { $$, esc } from "../../core/utils/dom.js";
import { matiereFromCCLabel } from "../calendar/cc-modal.js";
import { saveCCEvent } from "../calendar/cc.service.js";
import { saveEdtEvent } from "./edt.service.js";
import { edtDefaultType, edtTypeIds } from "../settings/settings.js";
import { saveSeance } from "../seances/seances.service.js";
import { rerender } from "../../routing/navigation.js";
import { routerState } from "../../routing/router.store.js";

// Formulaire unique pour ajouter OU modifier un créneau à la main (bouton "+" du header, ou
// crayon sur une carte de la grille) — remplace l'ancien sélecteur "changer le type" isolé.
function edtEventForm(e) {
  const isNew = !e;
  const v = e || { id: "", d: todayKey(), s: "08:00", e: "10:00", t: edtDefaultType(), m: "", r: "", p: "", g: "", n: "", cc: false, allday: false };
  const ccMatiere = !isNew && v.cc ? (M(v.m) || matiereFromCCLabel(v.n)) : null;
  const ccLinked = !isNew && (D.cal.evenements.find((x) => x.edtId === v.id) || D.cal.evenements.find((x) => x.matiere === v.m && x.date === v.d));
  return `${ccMatiere ? `<div class="row" style="margin-bottom:12px">${ccLinked ? `<a class="btn sm ghost" href="#/cal">${icon("cal")}Voir dans Notes &amp; CC</a>` : `<button class="btn sm pri" type="button" data-a="addccsugg" data-m="${esc(ccMatiere.id)}" data-date="${v.d}" data-titre="${esc(v.n || "CC")}" data-edt-id="${esc(v.id)}">${icon("check")}Ajouter à mes échéances (${esc(ccMatiere.court)})</button>`}</div>` : ""}
  <form data-a="saveedt">
    <input type="hidden" name="id" value="${esc(v.id)}">
    <div class="grid g2">
      <div class="field"><label>Matière</label><select name="m"><option value="">(aucune)</option>${D.matieres.map((mm) => `<option value="${esc(mm.id)}" ${v.m === mm.id ? "selected" : ""}>${esc(mm.nom)}</option>`).join("")}</select></div>
      <div class="field"><label>Type</label><select name="t">${edtTypeIds().map((t) => `<option value="${t}" ${v.t === t ? "selected" : ""}>${t}</option>`).join("")}</select></div>
      <div class="field"><label>Date</label><input type="date" name="d" required value="${esc(v.d || "")}"></div>
      <div class="field" style="align-self:end"><label class="row small" style="gap:6px"><input type="checkbox" name="allday" ${v.allday ? "checked" : ""}> Toute la journée</label></div>
      <div class="field"><label>Début</label><input type="time" name="s" value="${esc(v.s || "")}"></div>
      <div class="field"><label>Fin</label><input type="time" name="e" value="${esc(v.e || "")}"></div>
      <div class="field"><label>Salle</label><input type="text" name="r" value="${esc(v.r || "")}" placeholder="ex. B204"></div>
      <div class="field"><label>Groupe</label><input type="text" name="g" value="${esc(v.g || "")}" placeholder="ex. TD2"></div>
    </div>
    <label class="row small" style="gap:6px;margin-top:10px"><input type="checkbox" name="cc" ${v.cc ? "checked" : ""}> Contrôle continu pendant ce créneau</label>
    <div class="field" style="margin-top:10px"><label>Note</label><input type="text" name="n" value="${esc(v.n || "")}" placeholder="intitulé affiché sous le créneau, ou détails du CC"></div>
    <div class="row" style="margin-top:12px">
      <button class="btn pri" type="submit">${icon("check")}${isNew ? "Ajouter" : "Enregistrer"}</button>
      ${isNew ? "" : `<button class="btn" type="button" data-a="deledt" data-id="${esc(v.id)}">Supprimer</button>`}
      <button class="btn ghost" type="button" data-a="canceledt">Annuler</button>
    </div>
  </form>`;
}

// Popup centrée (pas un panneau en bas de page) pour ajouter OU modifier un créneau — ouverte par
// le "+" de l'en-tête ou le crayon d'une carte, fermée par Annuler/Échap/clic hors de la boîte.
// Même mécanisme que l'overlay d'écriture manuscrite pour être retirée au changement de route :
// elle s'enregistre dans `cleanup`, rappelé au tout début de route().
export function openEdtModal(e) {
  closeEdtModal();
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  backdrop.innerHTML = `<div class="modal card" role="dialog" aria-modal="true" aria-label="${e ? "Modifier le créneau" : "Ajouter un créneau"}">
    <div class="row" style="margin-bottom:12px"><h3 style="margin:0">${e ? "Modifier le créneau" : "Ajouter un créneau"}</h3><div class="sp"></div><button type="button" class="btn sm ghost" data-a="canceledt" aria-label="Fermer">✕</button></div>
    ${edtEventForm(e)}
  </div>`;
  backdrop.addEventListener("mousedown", (ev) => { if (ev.target === backdrop) closeEdtModal(); });
  document.addEventListener("keydown", edtModalEsc);
  document.body.appendChild(backdrop);
  $$('form[data-a="saveedt"]', backdrop).forEach((f) => f.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const fd = new FormData(f);
    try {
      const d = fd.get("d");
      const id = await saveEdtEvent({ id: fd.get("id") || undefined, d, s: fd.get("s"), e: fd.get("e"), t: fd.get("t"), m: fd.get("m") || null, sid: e?.sid, r: fd.get("r"), p: fd.get("p"), g: fd.get("g"), n: fd.get("n"), cc: fd.get("cc") === "on", allday: fd.get("allday") === "on" });
      // Un créneau déplacé/modifié répercute sa date sur l'échéance CC liée (edtId), pour que les
      // deux restent coordonnés sans avoir à les modifier séparément à chaque changement d'horaire.
      const linkedCC = D.cal.evenements.find((x) => x.edtId === id);
      if (linkedCC && linkedCC.date !== d) await saveCCEvent({ ...linkedCC, date: d });
      // Même chose pour la séance de cours liée (lien explicite e.sid, plus besoin de deviner par
      // date+type+matière) : sans ça elle reste sur l'ancienne date, se détache du créneau dans
      // l'EDT (qui propose alors de "recréer" un cours) et continue de s'afficher à l'ancienne
      // date dans la vue matière.
      const linkedSeance = e?.sid && e.m ? C(e.m)?.seances.find((s) => s.id === e.sid) : null;
      if (linkedSeance && d !== e.d) await saveSeance(e.m, { ...linkedSeance, date: d });
      toast("Créneau enregistré");
      closeEdtModal();
      await loadData(); rerender();
    } catch (err) { toast("Erreur : " + err.message); }
  }));
  routerState.cleanup = closeEdtModal;
}

export function closeEdtModal() {
  $$(".modal-backdrop").forEach((b) => b.remove());
  document.removeEventListener("keydown", edtModalEsc);
  if (routerState.cleanup === closeEdtModal) routerState.cleanup = null;
}

const edtModalEsc = (ev) => { if (ev.key === "Escape") closeEdtModal(); };
