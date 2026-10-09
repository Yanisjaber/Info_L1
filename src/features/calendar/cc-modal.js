import { icon } from "../../core/components/icons.js";
import { toast } from "../../core/components/toast.js";
import { C, D, M } from "../../core/services/app-data.js";
import { loadData } from "../../core/services/data-loader.js";
import { state } from "../../core/services/store.js";
import { $, $$, esc } from "../../core/utils/dom.js";
import { daysUntil, fmt1, fmtLong } from "../../core/utils/format.js";
import { setDateValue } from "../../core/components/date-picker.js";
import { saveCCDate, saveCCWithEpreuve } from "./cc.service.js";
import { cd, fmtPoids } from "../dashboard/dashboard.utils.js";
import { seanceFor } from "../edt/edt.utils.js";
import { ccReadiness, pctCls } from "../elo/elo.utils.js";
import { calcFor } from "../notes/grades.js";
import { epreuveOf, freeEpreuves, listEpreuves } from "../notes/grading.utils.js";
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

// Valeurs de départ du formulaire : une échéance existante (reliée ou non à une épreuve), un préremplissage
// (suggestion de l'emploi du temps), ou rien. Une épreuve reliée donne le nom, le poids, le « Sur » et le type.
export function ccFormValues(e, preset) {
  const v = { id: "", matiere: D.matieres[0]?.id || "", titre: "", date: "", type: "CC", statut: "", detail: "", edtId: "", seances: [], epreuve: "", poids: "", max: 20, ...(preset || {}), ...(e || {}) };
  const ep = v.epreuve ? epreuveOf(M(v.matiere)?.grading, v.epreuve) : null;
  if (ep) return { ...v, titre: ep.label, poids: ep.weight, max: ep.max, type: ep.second ? "2e" : "CC" };
  const m = String(v.poids).match(/(\d+(?:[.,]\d+)?)\s*%/); // ancien texte « 20 % » → nombre
  return { ...v, epreuve: "", poids: m ? m[1].replace(",", ".") : "", max: 20 };
}

// Épreuves de la matière qui n'ont pas encore d'échéance (plus celle de l'échéance qu'on modifie), pour la relier.
function epreuveOptions(mid, current, selfId) {
  const linked = new Set(D.cal.evenements.filter((x) => x.matiere === mid && x.epreuve && x.id !== selfId).map((x) => x.epreuve));
  return `<option value="">+ Nouvelle épreuve</option>` + freeEpreuves(M(mid)?.grading, linked).map((p) => `<option value="${esc(p.id)}" data-label="${esc(p.label)}" data-weight="${p.weight}" data-max="${p.max}" data-second="${p.second ? 1 : 0}" ${p.id === current ? "selected" : ""}>${esc(p.label)}</option>`).join("");
}

// Les champs d'un CC qui sont aussi ceux de son épreuve du calculateur : tous obligatoires. Partagés par le formulaire
// du calendrier et celui de l'emploi du temps (`v` : valeurs de ccFormValues).
export function ccFieldsHtml(v) {
  return `<div class="grid g2">
      <div class="field"><label>Épreuve du calculateur</label><select name="epreuve">${epreuveOptions(v.matiere, v.epreuve, v.id)}</select></div>
      <div class="field"><label>Titre</label><input type="text" name="titre" required maxlength="80" value="${esc(v.titre)}" placeholder="ex. CC1 — QCM"></div>
      <div class="field"><label>Poids (% de la note)</label><input type="number" name="poids" required min="0.01" step="any" value="${esc(v.poids)}" placeholder="ex. 20"></div>
      <div class="field"><label>Noté sur</label><input type="number" name="max" required min="1" step="any" value="${esc(v.max)}"></div>
      <div class="field"><label>Type</label><select name="type"><option value="CC" ${v.type !== "2e" ? "selected" : ""}>Normal</option><option value="2e" ${v.type === "2e" ? "selected" : ""}>2e chance</option></select></div>
    </div>
    <p class="tiny muted" id="ccTotal" style="margin:8px 0 0"></p>`;
}

// Comportement de ces champs : choisir une épreuve existante remplit titre, poids, « Sur » et type, et le total des poids
// de la matière se met à jour. `mid()` donne la matière choisie ; le retour `refresh()` est à appeler quand elle change.
export function wireCCFields(root, { mid, selfId }) {
  const q = (n) => root.querySelector(`[name="${n}"]`);
  const total = () => {
    const self = q("epreuve").value, w = parseFloat(q("poids").value) || 0;
    const t = listEpreuves(M(mid())?.grading).filter((p) => p.id !== self).reduce((sum, p) => sum + p.weight, 0) + w;
    $("#ccTotal", root).textContent = `Total des poids de cette matière avec ce CC : ${fmt1(t)} %${Math.abs(t - 100) < 0.01 ? "" : " (ramené à 100 %)"}`;
  };
  q("epreuve").addEventListener("change", () => {
    const o = q("epreuve").selectedOptions[0];
    if (o && o.value) { q("titre").value = o.dataset.label; q("poids").value = o.dataset.weight; q("max").value = o.dataset.max; q("type").value = o.dataset.second === "1" ? "2e" : "CC"; }
    total();
  });
  q("poids").addEventListener("input", total);
  total();
  return { refresh() { q("epreuve").innerHTML = epreuveOptions(mid(), "", selfId); total(); } };
}

// Un CC et son épreuve du calculateur ne font qu'un : tous ces champs sont obligatoires, car l'épreuve en a besoin.
function ccEntryForm(e, preset) {
  const isNew = !e;
  if (!D.matieres.length) return `<p class="small muted">Crée d'abord une matière (Compte → Mes matières) avant d'ajouter une échéance.</p>`;
  const v = ccFormValues(e, preset);
  const locked = !isNew && !!v.epreuve; // l'épreuve appartient à une matière : on ne la change plus
  return `<form data-a="savecc">
    <input type="hidden" name="id" value="${esc(v.id)}">
    <input type="hidden" name="edtId" value="${esc(v.edtId || "")}">
    ${locked ? `<input type="hidden" name="matiere" value="${esc(v.matiere)}">` : ""}
    <div class="grid g2" style="margin-bottom:14px">
      <div class="field"><label>Matière</label><select ${locked ? "disabled" : 'name="matiere"'} required>${D.matieres.map((m) => `<option value="${esc(m.id)}" ${v.matiere === m.id ? "selected" : ""}>${esc(m.nom)}</option>`).join("")}</select></div>
      <div class="field"><label>Date</label><input type="date" name="date" required value="${esc(v.date || "")}"></div>
    </div>
    ${ccFieldsHtml(v)}
    <details style="margin-top:10px" ${v.seances?.length ? "open" : ""}><summary>Séances au programme <span class="tiny muted">(score de préparation)</span></summary>
      <div id="ccSeancesPick" style="margin-top:6px">${ccSeancesPicker(v.matiere, v.seances)}</div>
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

// Échéances pas encore reliées à une épreuve du calculateur : on les liste, et c'est TOI qui choisis l'épreuve
// (bouton « Relier » → le formulaire s'ouvre, tu sélectionnes l'épreuve). Rien n'est deviné d'après le titre.
export function ccLinkHtml() {
  const orphans = D.cal.evenements.filter((e) => !e.epreuve && M(e.matiere));
  if (!orphans.length) return "";
  const nm = (ev) => `<b>${esc(M(ev.matiere)?.court || "")}</b> — ${esc(ev.titre)}`;
  return `<div class="card" style="margin-bottom:14px"><h3 style="margin:0">Échéances à relier à une épreuve</h3>
    <p class="small muted" style="margin:6px 0 10px">Chaque CC doit être relié à une épreuve du calculateur : le nom, le poids et la note viennent alors de l'épreuve.</p>
    <div class="list">
      ${orphans.map((ev) => `<div class="item"><div class="sp">${nm(ev)}<div class="tiny muted">${esc(fmtLong(ev.date))} · pas encore reliée</div></div><button class="btn sm" type="button" data-a="editcc" data-id="${esc(ev.id)}">Relier</button></div>`).join("")}
    </div></div>`;
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
export function openCCModal(e, preset) {
  closeCCModal();
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  backdrop.innerHTML = `<div class="modal card" role="dialog" aria-modal="true" aria-label="${e ? "Modifier l'échéance" : "Ajouter une échéance"}">
    <div class="row" style="margin-bottom:12px"><h3 style="margin:0">${e ? "Modifier l'échéance" : "Ajouter une échéance"}</h3><div class="sp"></div><button type="button" class="btn sm ghost" data-a="cancelcc" aria-label="Fermer">✕</button></div>
    ${ccEntryForm(e, preset)}
  </div>`;
  backdrop.addEventListener("mousedown", (ev) => { if (ev.target === backdrop) closeCCModal(); });
  document.addEventListener("keydown", ccModalEsc);
  document.body.appendChild(backdrop);
  const f = $('form[data-a="savecc"]', backdrop);
  if (f) wireCCForm(f, e);
  routerState.cleanup = closeCCModal;
}

// Mini pop-up de « + Date » (Notes & CC) : l'épreuve existe déjà avec son nom, son poids et son « Sur », on ne demande
// que QUAND. Soit un créneau de l'emploi du temps de la matière (liste), soit une simple date.
export function openCCDateModal({ matiere, epreuve }) {
  const ep = epreuveOf(M(matiere)?.grading, epreuve);
  if (!ep) return;
  closeCCModal();
  const taken = new Set(D.cal.evenements.map((x) => x.edtId).filter(Boolean));
  const slots = (D.edt?.events || []).filter((x) => x.m === matiere && !x.allday && daysUntil(x.d) >= 0 && !taken.has(x.id)).slice(0, 60);
  const label = (x) => `${fmtLong(x.d)} · ${x.s}–${x.e}${x.n ? " · " + x.n : ""}`;
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  backdrop.innerHTML = `<div class="modal card" role="dialog" aria-modal="true" aria-label="Date de ${esc(ep.label)}">
    <div class="row" style="margin-bottom:12px"><h3 style="margin:0">Date de « ${esc(ep.label)} »</h3><div class="sp"></div><button type="button" class="btn sm ghost" data-a="cancelcc" aria-label="Fermer">✕</button></div>
    <form data-a="saveccdate">
      ${slots.length ? `<div class="field"><label>Cours de l'emploi du temps</label><select name="slot"><option value="">Aucun, je choisis une date</option>${slots.map((x) => `<option value="${esc(x.id)}" data-d="${esc(x.d)}">${esc(label(x))}</option>`).join("")}</select></div>` : ""}
      <div class="field"><label>Date</label><input type="date" name="date" required></div>
      <div class="row" style="margin-top:12px">
        <button class="btn pri" type="submit">${icon("check")}Ajouter la date</button>
        <button class="btn ghost" type="button" data-a="cancelcc">Annuler</button>
      </div>
    </form>
  </div>`;
  backdrop.addEventListener("mousedown", (ev) => { if (ev.target === backdrop) closeCCModal(); });
  document.addEventListener("keydown", ccModalEsc);
  document.body.appendChild(backdrop);
  routerState.cleanup = closeCCModal;
  const f = $('form[data-a="saveccdate"]', backdrop), sel = f.elements.slot, inp = f.elements.date;
  // Choisir un cours remplit la date et la verrouille (elle vient du cours) ; « aucun » la rend libre.
  if (sel) sel.addEventListener("change", () => {
    setDateValue(inp, sel.selectedOptions[0]?.dataset.d || "", !!sel.value);
  });
  f.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const btn = $('button[type="submit"]', f);
    if (btn.disabled) return; // un seul enregistrement à la fois (double clic)
    btn.disabled = true;
    try {
      const slot = sel?.value ? D.edt.events.find((x) => x.id === sel.value) : null;
      await saveCCDate({ matiere, epreuve, date: inp.value, slot });
      toast("Date ajoutée");
      closeCCModal();
      await loadData(); rerender();
    } catch (err) { btn.disabled = false; toast("Erreur : " + err.message); }
  });
}

// Comportement du formulaire d'échéance : changer de matière recharge les séances et les épreuves proposées.
function wireCCForm(f, e) {
  const field = (n) => f.elements[n];
  const mid = () => field("matiere").value;
  const fields = wireCCFields(f, { mid, selfId: e?.id });
  const selectEl = $('select[name="matiere"]', f);
  if (selectEl) selectEl.addEventListener("change", () => {
    // Les séances cochées et l'épreuve choisie appartiennent à l'ancienne matière : on repart de zéro.
    $("#ccSeancesPick", f).innerHTML = ccSeancesPicker(mid(), []);
    fields.refresh();
  });
  f.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const fd = new FormData(f), btn = $('button[type="submit"]', f);
    if (btn.disabled) return; // un seul enregistrement à la fois (double clic)
    btn.disabled = true;
    try {
      const before = D.cal.evenements.find((x) => x.id === fd.get("id")); // statut et détail existants conservés tels quels
      await saveCCWithEpreuve({
        id: fd.get("id") || undefined, epreuve: fd.get("epreuve") || undefined, matiere: fd.get("matiere"), date: fd.get("date"),
        label: fd.get("titre"), weight: fd.get("poids"), max: fd.get("max"), second: fd.get("type") === "2e",
        statut: before?.statut || "", detail: before?.detail || "", edtId: fd.get("edtId") || null, seances: fd.getAll("seances"),
      });
      toast("Échéance enregistrée");
      closeCCModal();
      await loadData(); rerender();
    } catch (err) { btn.disabled = false; toast("Erreur : " + err.message); }
  });
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

// Note obtenue à une épreuve CC, retrouvée dans le calculateur (state.notes) par l'identifiant de l'épreuve reliée.
// Une échéance non reliée n'a pas de note (aucun rapprochement par le titre). Renvoie { v, max } ou null.
export function ccNote(ev) {
  const K = calcFor(ev.matiere); if (!K) return null;
  // Échéance reliée à une épreuve : on retrouve sa note par l'identifiant (moyenne des saisies si l'épreuve en a plusieurs).
  const ids = ev.epreuve && K.groups?.[ev.epreuve];
  if (ids) {
    const vals = ids.map((k) => state.notes[ev.matiere]?.v?.[k]);
    if (vals.some((x) => x === "" || x === null || x === undefined || isNaN(+x))) return null;
    return { v: vals.reduce((t, x) => t + +x, 0) / vals.length, max: K.champs.find(([k]) => k === ids[0])?.[2] || 20 };
  }
  return null;
}

export const ccNoteChip = (n) => `<span class="chip ${n.v >= n.max / 2 ? "ok" : "ko"}">${fmt1(n.v)}/${n.max}</span>`;
