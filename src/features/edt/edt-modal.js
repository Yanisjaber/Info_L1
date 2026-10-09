import { icon } from "../../core/components/icons.js";
import { toast } from "../../core/components/toast.js";
import { C, D, M } from "../../core/services/app-data.js";
import { loadData } from "../../core/services/data-loader.js";
import { todayKey } from "../../core/services/store.js";
import { $, $$, esc } from "../../core/utils/dom.js";
import { ccFieldsHtml, ccFormValues, matiereFromCCLabel, wireCCFields } from "../calendar/cc-modal.js";
import { saveCCEvent, saveCCWithEpreuve } from "../calendar/cc.service.js";
import { saveEdtEvent } from "./edt.service.js";
import { edtDefaultType, edtTypeIds } from "../settings/settings.js";
import { saveSeance } from "../seances/seances.service.js";
import { rerender } from "../../routing/navigation.js";
import { routerState } from "../../routing/router.store.js";

// L'échéance CC d'un créneau : uniquement celle reliée par `edtId` (aucune adoption d'une échéance « qui ressemble »).
const ccOfSlot = (slot) => (slot.id && D.cal.evenements.find((x) => x.edtId === slot.id)) || null;

// Formulaire unique pour ajouter OU modifier un créneau à la main (bouton "+" du header, ou
// crayon sur une carte de la grille) — remplace l'ancien sélecteur "changer le type" isolé.
function edtEventForm(e) {
  const isNew = !e;
  const v = e || { id: "", d: todayKey(), s: "08:00", e: "10:00", t: edtDefaultType(), m: "", r: "", p: "", g: "", n: "", cc: false, allday: false };
  const linked = ccOfSlot(v);
  // Le CC de ce créneau : ses champs (épreuve, titre, poids, « Sur », type) viennent de l'échéance reliée, sinon du créneau.
  const ccVals = ccFormValues(linked, { matiere: v.m || matiereFromCCLabel(v.n)?.id || "", date: v.d, titre: v.n || "", edtId: v.id });
  return `${linked ? `<div class="row" style="margin-bottom:12px"><a class="btn sm ghost" href="#/cal">${icon("cal")}Voir dans le calendrier</a></div>` : ""}
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
    <div id="edtCC" ${v.cc ? "" : "hidden"} style="margin-top:10px">${ccFieldsHtml(ccVals)}</div>
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
  const f = $('form[data-a="saveedt"]', backdrop);
  // Bloc « Contrôle continu » : visible et obligatoire seulement quand la case est cochée (les champs masqués sont
  // désactivés, sinon le navigateur bloquerait l'envoi sur un champ invisible).
  const ccBox = $("#edtCC", f), fields = wireCCFields(ccBox, { mid: () => f.elements.m.value, selfId: ccOfSlot(e || {})?.id });
  const toggleCC = () => { const on = f.elements.cc.checked; ccBox.hidden = !on; $$("input,select", ccBox).forEach((x) => { x.disabled = !on; }); };
  f.elements.cc.addEventListener("change", toggleCC);
  f.elements.m.addEventListener("change", () => fields.refresh());
  toggleCC();
  f.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const fd = new FormData(f), btn = $('button[type="submit"]', f);
    if (btn.disabled) return; // un seul enregistrement à la fois (double clic)
    btn.disabled = true;
    try {
      const d = fd.get("d"), m = fd.get("m") || null, wantCC = fd.get("cc") === "on";
      const before = ccOfSlot({ id: fd.get("id"), m, d, cc: wantCC });
      if (wantCC) {
        if (!m) throw new Error("Choisis la matière du CC");
        if (before?.epreuve && before.matiere !== m) throw new Error(`Ce créneau est relié au CC « ${before.titre} » d'une autre matière : change d'abord ce CC dans le calendrier.`);
      }
      const id = await saveEdtEvent({ id: fd.get("id") || undefined, d, s: fd.get("s"), e: fd.get("e"), t: fd.get("t"), m, sid: e?.sid, r: fd.get("r"), p: fd.get("p"), g: fd.get("g"), n: fd.get("n"), cc: wantCC, allday: fd.get("allday") === "on" });
      f.elements.id.value = id; // si la suite échoue, un nouvel envoi met à jour ce créneau au lieu d'en créer un autre
      if (wantCC) {
        // Le CC est créé ou mis à jour avec son épreuve du calculateur, relié à ce créneau.
        await saveCCWithEpreuve({
          id: before?.id, epreuve: fd.get("epreuve") || undefined, matiere: m, date: d, label: fd.get("titre"), weight: fd.get("poids"), max: fd.get("max"), second: fd.get("type") === "2e",
          edtId: id, statut: before?.statut || "", detail: before?.detail || "", seances: before?.seances || [],
        });
      } else {
        // Un créneau déplacé répercute sa date sur l'échéance CC liée (edtId), pour que les deux restent coordonnés.
        const linkedCC = D.cal.evenements.find((x) => x.edtId === id);
        if (linkedCC && linkedCC.date !== d) await saveCCEvent({ ...linkedCC, date: d });
      }
      // Même chose pour la séance de cours liée (lien explicite e.sid, plus besoin de deviner par
      // date+type+matière) : sans ça elle reste sur l'ancienne date, se détache du créneau dans
      // l'EDT (qui propose alors de "recréer" un cours) et continue de s'afficher à l'ancienne
      // date dans la vue matière.
      const linkedSeance = e?.sid && e.m ? C(e.m)?.seances.find((s) => s.id === e.sid) : null;
      if (linkedSeance && d !== e.d) await saveSeance(e.m, { ...linkedSeance, date: d });
      toast("Créneau enregistré");
      closeEdtModal();
      await loadData(); rerender();
    } catch (err) { btn.disabled = false; toast("Erreur : " + err.message); }
  });
  routerState.cleanup = closeEdtModal;
}

export function closeEdtModal() {
  $$(".modal-backdrop").forEach((b) => b.remove());
  document.removeEventListener("keydown", edtModalEsc);
  if (routerState.cleanup === closeEdtModal) routerState.cleanup = null;
}

const edtModalEsc = (ev) => { if (ev.key === "Escape") closeEdtModal(); };
