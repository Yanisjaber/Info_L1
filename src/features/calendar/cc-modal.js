import { icon } from "../../core/components/icons.js";
import { toast } from "../../core/components/toast.js";
import { C, D, M } from "../../core/services/app-data.js";
import { loadData } from "../../core/services/data-loader.js";
import { state } from "../../core/services/store.js";
import { $, $$, esc } from "../../core/utils/dom.js";
import { daysUntil, fmt1, fmtLong } from "../../core/utils/format.js";
import { saveCCEvent } from "./cc.service.js";
import { cd, fmtPoids } from "../dashboard/dashboard.utils.js";
import { seanceFor } from "../edt/edt.utils.js";
import { ccReadiness, pctCls } from "../elo/elo.utils.js";
import { calcFor } from "../notes/grades.js";
import { norm } from "../search/search.page.js";
import { rerender } from "../../routing/navigation.js";
import { routerState } from "../../routing/router.store.js";

// ── Ajout d'échéances CC : formulaire manuel, suggestions depuis l'EDT, analyse IA ──
// Case à cocher par séance (CM/TD/TP), groupée par type — "au programme" de ce CC, pour restreindre
// le calcul de préparation (ccReadiness) à ce périmètre plutôt qu'à toute la matière.
function ccSeancesPicker(mid, selected) {
  const c = C(mid);
  if (!c?.seances.length) return `<p class="tiny muted" style="margin:0">Aucune séance dans cette matière.</p>`;
  const sel = new Set(selected || []);
  const groups = {};
  c.seances.forEach((s) => (groups[s.type] || (groups[s.type] = [])).push(s));
  return Object.entries(groups).map(([type, list]) => `
    <div class="tiny muted" style="margin:8px 0 4px;text-transform:uppercase;letter-spacing:.04em">${esc(type)}</div>
    <div class="row" style="gap:10px;flex-wrap:wrap">${list.map((s) => `<label class="row small" style="gap:5px;min-width:0"><input type="checkbox" name="seances" value="${esc(s.id)}" ${sel.has(s.id) ? "checked" : ""}>${esc(s.type)} ${s.numero}</label>`).join("")}</div>`).join("");
}

function ccEntryForm(e) {
  const isNew = !e;
  const v = e || { id: "", matiere: D.matieres[0]?.id || "", titre: "", date: "", poids: "", type: "CC", statut: "", detail: "", edtId: "", seances: [] };
  if (!D.matieres.length) return `<p class="small muted">Crée d'abord une matière (Compte → Mes matières) avant d'ajouter une échéance.</p>`;
  return `<form data-a="savecc">
    <input type="hidden" name="id" value="${esc(v.id)}">
    <input type="hidden" name="edtId" value="${esc(v.edtId || "")}">
    <div class="grid g2">
      <div class="field"><label>Matière</label><select name="matiere" required>${D.matieres.map((m) => `<option value="${esc(m.id)}" ${v.matiere === m.id ? "selected" : ""}>${esc(m.nom)}</option>`).join("")}</select></div>
      <div class="field"><label>Date</label><input type="date" name="date" required value="${esc(v.date || "")}"></div>
      <div class="field"><label>Titre</label><input type="text" name="titre" required value="${esc(v.titre)}" placeholder="ex. CC1"></div>
      <div class="field"><label>Poids</label><input type="text" name="poids" value="${esc(v.poids)}" placeholder="ex. 20 %"></div>
    </div>
    <details style="margin-top:10px" ${v.seances?.length ? "open" : ""}><summary>Séances au programme <span class="tiny muted">(score de préparation)</span></summary>
      <div id="ccSeancesPick" style="margin-top:6px">${ccSeancesPicker(v.matiere, v.seances)}</div>
    </details>
    <details style="margin-top:10px"><summary>Options avancées</summary>
      <div class="grid g2" style="margin-top:10px">
        <div class="field"><label>Type</label><select name="type"><option value="CC" ${v.type !== "2e" ? "selected" : ""}>Normal</option><option value="2e" ${v.type === "2e" ? "selected" : ""}>2e chance</option></select></div>
        <div class="field"><label>Statut</label><select name="statut"><option value="" ${!v.statut ? "selected" : ""}>Confirmé</option><option value="provisoire" ${v.statut === "provisoire" ? "selected" : ""}>Date provisoire</option></select></div>
      </div>
      <div class="field" style="margin-top:10px"><label>Détail</label><input type="text" name="detail" value="${esc(v.detail)}"></div>
    </details>
    <div class="row" style="margin-top:12px">
      <button class="btn pri" type="submit">${icon("check")}${isNew ? "Ajouter" : "Enregistrer"}</button>
      ${isNew ? "" : `<button class="btn" type="button" data-a="delcc" data-id="${esc(v.id)}">Supprimer</button>`}
      <button class="btn ghost" type="button" data-a="cancelcc">Annuler</button>
    </div>
  </form>`;
}

// Les événements CC importés depuis l'ICS n'ont pas de matière rattachée (e.m est null :
// le résumé ne correspond pas au format d'un cours/TD/TP) mais leur libellé (ex. « Bas — CC »)
// contient le nom de la matière avant le tiret : on essaie de le retrouver par ce nom.
export function matiereFromCCLabel(n) {
  if (!n) return null;
  const name = n.split(/\s[-–—]\s/)[0].trim().toLowerCase();
  return D.matieres.find((m) => m.nom.toLowerCase() === name || m.court.toLowerCase() === name) || null;
}

export function ccSuggestionsHtml() {
  const linked = new Set(D.cal.evenements.map((e) => e.edtId).filter(Boolean));
  const have = new Set(D.cal.evenements.map((e) => e.matiere + "|" + e.date));
  const sugg = D.edt.events
    .filter((e) => e.cc && !linked.has(e.id))
    .map((e) => ({ e, mid: e.m || matiereFromCCLabel(e.n)?.id }))
    .filter(({ e, mid }) => mid && !have.has(mid + "|" + e.d));
  if (!sugg.length) return "";
  return `<div class="card" style="margin-bottom:14px"><h3 style="margin-top:0">Suggestions depuis ton emploi du temps</h3>
    <div class="list">${sugg.map(({ e, mid }) => `<div class="item"><div class="sp"><b>${esc(M(mid)?.court || "")}</b> — ${esc((e.n || "Examen").replace(/^.*?[-–—]\s*/, ""))}<div class="tiny muted">${fmtLong(e.d)} · ${e.s}–${e.e}</div></div><button class="btn sm" data-a="addccsugg" data-m="${esc(mid)}" data-date="${e.d}" data-titre="${esc(e.n || "CC")}" data-edt-id="${esc(e.id)}">${icon("check")}Ajouter</button></div>`).join("")}</div></div>`;
}

// Relie une échéance CC (cc_events, saisie dans Notes & CC) au cours qui la contient, si on en
// trouve un : d'abord le créneau EDT marqué cc=true pour cette matière/date (le lien le plus
// précis, posé depuis le crayon de l'EDT), sinon à défaut une séance de la même matière ce jour-là.
export function ccSeance(ev) {
  const edt = (ev.edtId && D.edt.events.find((x) => x.id === ev.edtId)) || D.edt.events.find((x) => x.cc && x.m === ev.matiere && x.d === ev.date);
  if (edt) { const s = seanceFor(edt); if (s) return s; }
  return C(ev.matiere)?.seances.find((s) => s.date === ev.date) || null;
}

// Popup centrée pour ajouter OU modifier une échéance CC — même mécanisme que openEdtModal/
// closeEdtModal (voir plus haut) : overlay ajouté directement au body, fermé par Annuler/Échap/
// clic hors de la boîte, et enregistré dans `cleanup` pour disparaître au changement de route.
export function openCCModal(e) {
  closeCCModal();
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  backdrop.innerHTML = `<div class="modal card" role="dialog" aria-modal="true" aria-label="${e ? "Modifier l'échéance" : "Ajouter une échéance"}">
    <div class="row" style="margin-bottom:12px"><h3 style="margin:0">${e ? "Modifier l'échéance" : "Ajouter une échéance"}</h3><div class="sp"></div><button type="button" class="btn sm ghost" data-a="cancelcc" aria-label="Fermer">✕</button></div>
    ${ccEntryForm(e)}
  </div>`;
  backdrop.addEventListener("mousedown", (ev) => { if (ev.target === backdrop) closeCCModal(); });
  document.addEventListener("keydown", ccModalEsc);
  document.body.appendChild(backdrop);
  // Les séances cochées appartiennent à l'ancienne matière : changer de matière réinitialise la
  // sélection plutôt que de laisser des ids d'une autre matière traîner dans le formulaire.
  $('select[name="matiere"]', backdrop)?.addEventListener("change", (ev) => {
    const pick = $("#ccSeancesPick", backdrop);
    if (pick) pick.innerHTML = ccSeancesPicker(ev.target.value, []);
  });
  $$('form[data-a="savecc"]', backdrop).forEach((f) => f.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const fd = new FormData(f);
    try {
      await saveCCEvent({ id: fd.get("id") || undefined, matiere: fd.get("matiere"), date: fd.get("date"), titre: fd.get("titre"), poids: fd.get("poids"), type: fd.get("type"), statut: fd.get("statut"), detail: fd.get("detail"), edtId: fd.get("edtId") || null, seances: fd.getAll("seances") });
      toast("Échéance enregistrée");
      closeCCModal();
      await loadData(); rerender();
    } catch (err) { toast("Erreur : " + err.message); }
  }));
  routerState.cleanup = closeCCModal;
}

export function closeCCModal() {
  $$(".modal-backdrop").forEach((b) => b.remove());
  document.removeEventListener("keydown", ccModalEsc);
  if (routerState.cleanup === closeCCModal) routerState.cleanup = null;
}

const ccModalEsc = (ev) => { if (ev.key === "Escape") closeCCModal(); };

// Popup déclenchée en cliquant une échéance CC dans la grille mensuelle (remplace l'ancien
// panneau générique #evd, qui n'avait ni la même DA que les autres popups ni de vraie mise en
// forme). Réutilise closeCCModal/ccModalEsc, génériques (ferment n'importe quel .modal-backdrop).
export function openCCInfoModal(ev) {
  closeCCModal();
  const m = M(ev.matiere), sc = ccSeance(ev), rd = ccReadiness(ev);
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  backdrop.innerHTML = `<div class="modal card" role="dialog" aria-modal="true" aria-label="${esc(ev.titre)}" style="border-left:4px solid ${m.couleur}">
    <div class="row nowrap" style="margin-bottom:4px"><i class="dot" style="--c:${m.couleur}"></i><b>${esc(m.nom)}</b><div class="sp"></div><button type="button" class="btn sm ghost" data-a="cancelcc" aria-label="Fermer">✕</button></div>
    <h3 style="margin:4px 0 2px">${esc(ev.titre)}</h3>
    <div class="row small muted" style="gap:6px;flex-wrap:wrap">${esc(fmtLong(ev.date))}<span class="chip gr">${esc(fmtPoids(ev.poids))}</span>${ev.type === "2e" ? '<span class="chip wa">2e chance</span>' : ""}${ev.statut === "provisoire" ? '<span class="chip wa">date provisoire</span>' : ""}<span class="chip ${daysUntil(ev.date) < 0 ? "gr" : "ok"}">${cd(ev)}</span>${daysUntil(ev.date) < 0 && ccNote(ev) ? ccNoteChip(ccNote(ev)) : ""}</div>
    ${rd ? `<div class="row small" style="margin-top:8px;gap:6px"><span class="muted">Préparation (${ev.seances.length} séance${ev.seances.length > 1 ? "s" : ""})</span><span class="chip ${rd.filled ? pctCls(rd.pct) : rd.tier.cls}">${rd.filled ? `${rd.pct}% connu` : `${rd.rating} · ${esc(rd.tier.name)}`}</span></div>` : ""}
    ${ev.detail ? `<p class="small" style="margin-top:10px">${esc(ev.detail)}</p>` : ""}
    ${sc ? `<a class="btn sm ghost" style="margin-top:6px" href="#/m/${ev.matiere}">${icon("book")}Voir la matière</a>` : ""}
    <div class="row" style="margin-top:14px">
      <a class="btn sm pri" href="#/ccprep/${esc(ev.id)}">${icon("flag")}Se préparer</a>
      <a class="btn sm" href="#/qcm?m=${ev.matiere}">QCM</a>
      <a class="btn sm" href="#/m/${ev.matiere}/cc">Fiche CC</a>
      <div class="sp"></div>
      <button type="button" class="btn sm ghost" data-a="editcc" data-id="${esc(ev.id)}" aria-label="Modifier ${esc(ev.titre)}">${icon("edit")}</button>
    </div>
  </div>`;
  backdrop.addEventListener("mousedown", (e) => { if (e.target === backdrop) closeCCModal(); });
  document.addEventListener("keydown", ccModalEsc);
  document.body.appendChild(backdrop);
  routerState.cleanup = closeCCModal;
}

// Note obtenue à une épreuve CC, retrouvée dans le calculateur (state.notes) : on rapproche le
// code du titre (« CC2 », « CCI1 », « Note 3 »…, avant le tiret) de celui des champs du
// calculateur ; si plusieurs champs partagent le code (Algo CC1 — QCM 1 / QCM 2), on départage
// avec le reste du titre. Renvoie { v, max } ou null si pas de champ ou pas de note saisie.
export function ccNote(ev) {
  const K = calcFor(ev.matiere); if (!K) return null;
  const nm = (x) => norm(x || "").replace(/\s+/g, " ").trim();
  // Le code d'une échéance ("CC1", "CCI2", "Note 3"…) n'est pas toujours suivi d'un tiret dans le
  // titre saisi à la main ("CC1 Système" vs "CC1 — QCM 1") : on extrait lettres+chiffre en tête
  // de chaîne plutôt que de dépendre d'un séparateur, et on ramène "CCI" (libellés du
  // calculateur) à "CC" (libellés des échéances) pour que les deux conventions se rejoignent.
  const codeMatch = (s) => nm(s).match(/^([a-zéèêàù]+)\s?(\d+(?:\.\d+)?)?/);
  const codeOf = (m) => (m ? m[1].replace(/^cci/, "cc") + (m[2] || "") : "");
  const tm = codeMatch(ev.titre), titreCode = codeOf(tm);
  const tail = tm ? nm(ev.titre).slice(tm[0].length).trim() : "";
  let cands = K.champs.filter(([, l]) => codeOf(codeMatch(l.split(/\s[-–—]\s|\s\(/)[0])) === titreCode);
  if (cands.length > 1) cands = cands.filter(([, l]) => tail && nm(l).includes(tail));
  if (cands.length !== 1) return null;
  const [k, , mx] = cands[0], v = state.notes[ev.matiere]?.v?.[k];
  return v === "" || v === null || v === undefined || isNaN(+v) ? null : { v: +v, max: mx || 20 };
}

export const ccNoteChip = (n) => `<span class="chip ${n.v >= n.max / 2 ? "ok" : "ko"}">${fmt1(n.v)}/${n.max}</span>`;
