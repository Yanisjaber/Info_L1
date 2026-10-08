import { icon } from "../../core/components/icons.js";
import { toast } from "../../core/components/toast.js";
import { C, D, activeMatieres, archivedMatieres } from "../../core/services/app-data.js";
import { loadData } from "../../core/services/data-loader.js";
import { $$, esc } from "../../core/utils/dom.js";
import { plural } from "../../core/utils/format.js";
import { fileFieldHtml } from "../files/files.components.js";
import { readFileField, removeFile } from "../files/files.service.js";
import { bindGradingEditor, gradingEditorHtml, readGradingEditor } from "../notes/grading-editor.js";
import { saveMatiere, savePeriode } from "./matieres.service.js";
import { refreshShell } from "../../routing/navigation.js";

function slugify(s, existingIds = D.matieres.map((m) => m.id)) {
  const base = String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 24) || "item";
  let id = base, i = 2;
  while (existingIds.includes(id)) id = `${base}-${i++}`;
  return id;
}

const PALETTE = ["#1F3A5F", "#2E7D6B", "#7A5FB0", "#C28A1E", "#3457A6", "#2F8FBF", "#C0507F", "#B4432F", "#4B6B3A", "#8A5A44"];

function paletteHtml(v) {
  return `<div class="palette" role="radiogroup" aria-label="Couleur">${PALETTE.map((c) => `<label class="swatch" style="--c:${c}"><input type="radio" name="couleur" value="${c}" ${v === c ? "checked" : ""}><span></span></label>`).join("")}</div>`;
}

function matiereFormHtml(m) {
  const isNew = !m;
  const v = m || { id: "", nom: "", court: "", ue: "", couleur: PALETTE[0], desc: "", cc: "", pdfCC: "", ects: 0, periode: D.periodes.find((p) => p.statut === "actif")?.id || "", eval: { n: 15, minutes: 15 } };
  return `<form data-a="savematiere">
    <input type="hidden" name="id" value="${esc(v.id)}">
    <div class="grid g2">
      <div class="field"><label>Nom</label><input type="text" name="nom" required value="${esc(v.nom)}" placeholder="ex. Philosophie"></div>
      <div class="field"><label>Période</label><select name="periode"><option value="">Aucune (toujours visible)</option>${D.periodes.map((p) => `<option value="${esc(p.id)}" ${v.periode === p.id ? "selected" : ""}>${esc(p.nom)}${p.statut === "termine" ? " (terminée)" : ""}</option>`).join("")}</select></div>
      <div class="field"><label>ECTS</label><input type="number" name="ects" min="0" step="1" value="${v.ects || 0}"></div>
      <div class="field"><label>Couleur</label>${paletteHtml(v.couleur)}</div>
    </div>
    <details style="margin-top:10px"><summary>Options avancées</summary>
      <div class="grid g2" style="margin-top:10px">
        <div class="field"><label>Nom court (menu)</label><input type="text" name="court" value="${esc(v.court)}" placeholder="par défaut : identique au nom"></div>
        <div class="field"><label>UE / sous-titre</label><input type="text" name="ue" value="${esc(v.ue)}"></div>
        <div class="field"><label>Description courte</label><input type="text" name="desc" value="${esc(v.desc)}"></div>
        <div class="field"><label>Barème CC (texte libre)</label><input type="text" name="cc" value="${esc(v.cc)}"></div>
        ${fileFieldHtml("pdfCC", "PDF fiche CC (optionnel)", v.pdfCC)}
        <div class="field"><label>Questions par éval blanche</label><input type="number" name="evaln" min="1" value="${v.eval.n}"></div>
        <div class="field"><label>Durée éval blanche (min)</label><input type="number" name="evalmin" min="1" value="${v.eval.minutes}"></div>
      </div>
    </details>
    ${gradingEditorHtml(m)}
    <div class="row" style="margin-top:12px">
      <button class="btn pri" type="submit">${icon("check")}${isNew ? "Créer la matière" : "Enregistrer"}</button>
      ${isNew ? "" : `<button class="btn" type="button" data-a="delmatiere" data-mid="${esc(v.id)}">Supprimer</button>`}
    </div>
  </form>`;
}

export function bindMM(el) {
  $$('form[data-a="savematiere"]', el).forEach((f) => { bindGradingEditor(f); f.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(f), nom = String(fd.get("nom") || "").trim();
    if (!nom) return toast("Le nom est requis");
    const id = String(fd.get("id") || "").trim() || slugify(nom);
    let grading;
    try { grading = readGradingEditor(f); } catch (err) { return toast(err.message); }
    try {
      const pdfCC = await readFileField(fd, "pdfCC", `${id}/pdf`);
      const payload = { id, nom, court: fd.get("court") || nom, ue: fd.get("ue"), couleur: fd.get("couleur") || PALETTE[0], desc: fd.get("desc"), cc: fd.get("cc"), pdfCC: pdfCC.value, ects: Math.max(0, +fd.get("ects") || 0), periode: fd.get("periode") || null, eval: { n: +fd.get("evaln") || 15, minutes: +fd.get("evalmin") || 15 } };
      // La colonne `grading` n'existe qu'après supabase/schema_grading.sql : tant qu'elle est inconnue
      // et que rien n'est configuré, on n'envoie rien (sinon la base refuserait l'enregistrement).
      if (grading !== undefined && (grading !== null || D.matieres.some((x) => x.grading !== undefined))) payload.grading = grading;
      await saveMatiere(payload);
      await removeFile(pdfCC.old);
      toast("Matière enregistrée");
      await loadData(); refreshShell();
    } catch (err) { toast("Erreur : " + err.message); }
  }); });
}

function periodeFormHtml(p) {
  const isNew = !p;
  const v = p || { id: "", nom: "", statut: "actif" };
  return `<form data-a="saveperiode">
    <input type="hidden" name="id" value="${esc(v.id)}">
    <input type="hidden" name="statut" value="${esc(v.statut)}">
    <div class="field"><label>Nom</label><input type="text" name="nom" required value="${esc(v.nom)}" placeholder="ex. L3 — Semestre 1"></div>
    <div class="row" style="margin-top:10px">
      <button class="btn pri" type="submit">${icon("check")}${isNew ? "Créer la période" : "Enregistrer"}</button>
      ${isNew ? "" : `<button class="btn" type="button" data-a="toggleperiode" data-pid="${esc(v.id)}" data-statut="${v.statut}">${v.statut === "actif" ? "Marquer comme terminée" : "Remettre active"}</button><button class="btn" type="button" data-a="delperiode" data-pid="${esc(v.id)}">Supprimer</button>`}
    </div>
  </form>`;
}

export function periodesAdminHtml() {
  const sansPeriode = D.matieres.filter((m) => !m.periode);
  return `<p class="small muted">Une période terminée sort ses matières du menu principal (elles restent consultables dans les archives). Créer une période ne fait rien à elle seule : il faut ensuite lui rattacher des matières (à la création d'une matière, ou en une fois avec le bouton ci-dessous).</p>
    ${D.periodes.map((p) => `<div class="card" style="margin-bottom:10px">
      <div class="row nowrap"><b>${esc(p.nom)}</b><span class="chip ${p.statut === "actif" ? "ok" : "gr"}">${p.statut === "actif" ? "Active" : "Terminée"}</span><div class="sp"></div><span class="tiny muted">${plural(D.matieres.filter((m) => m.periode === p.id).length, "matière")}</span></div>
      ${sansPeriode.length ? `<div class="tiny muted" style="margin-top:8px">${plural(sansPeriode.length, "matière")} pas encore rattachée à une période.</div><button class="btn sm" style="margin-top:6px" data-a="assignall" data-pid="${esc(p.id)}">${icon("edit")}Y rattacher ces ${sansPeriode.length} matière${sansPeriode.length > 1 ? "s" : ""}</button>` : ""}
      <details style="margin-top:10px"><summary>Modifier</summary><div style="margin-top:10px">${periodeFormHtml(p)}</div></details>
    </div>`).join("")}
    <details ${D.periodes.length ? "" : "open"}><summary>Ajouter une période</summary><div class="card" style="margin-top:10px">${periodeFormHtml(null)}</div></details>`;
}

export function bindPeriodes(el) {
  $$('form[data-a="saveperiode"]', el).forEach((f) => f.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(f), nom = String(fd.get("nom") || "").trim();
    if (!nom) return toast("Le nom est requis");
    const id = String(fd.get("id") || "").trim() || slugify(nom, D.periodes.map((p) => p.id));
    try {
      await savePeriode({ id, nom, statut: fd.get("statut") || "actif" });
      toast("Période enregistrée");
      await loadData(); refreshShell();
    } catch (err) { toast("Erreur : " + err.message); }
  }));
}

function matiereAdminCard(m) {
  const p = D.periodes.find((x) => x.id === m.periode);
  return `<div class="card" style="margin-bottom:10px">
      <div class="row nowrap"><i class="dot" style="--c:${m.couleur}"></i><div class="sp"><b>${esc(m.nom)}</b><div class="tiny muted">${plural(C(m.id).seances.length, "séance")}${p ? ` · ${esc(p.nom)}` : ""}</div></div></div>
      <div class="row" style="margin-top:8px;flex-wrap:wrap">
        <a class="btn sm" href="#/mm/${m.id}">${icon("book")}Séances</a>
        <a class="btn sm" href="#/aq/${m.id}">${icon("check")}QCM</a>
        <a class="btn sm" href="#/af/${m.id}">${icon("cards")}Cartes</a>
        <a class="btn sm" href="#/ax/${m.id}">${icon("edit")}Exercices</a>
      </div>
      <details style="margin-top:10px"><summary>Modifier</summary><div style="margin-top:10px">${matiereFormHtml(m)}</div></details>
    </div>`;
}

export function matieresAdminHtml() {
  const archived = archivedMatieres();
  const byPeriode = new Map();
  archived.forEach((m) => { const k = m.periode; if (!byPeriode.has(k)) byPeriode.set(k, []); byPeriode.get(k).push(m); });
  const archivedHtml = [...byPeriode.entries()].map(([pid, ms]) => {
    const p = D.periodes.find((x) => x.id === pid);
    return `<details style="margin-bottom:10px"><summary>${esc(p ? p.nom : "Sans période")} — ${plural(ms.length, "matière archivée", "matières archivées")}</summary><div style="margin-top:10px">${ms.map(matiereAdminCard).join("")}</div></details>`;
  }).join("");
  return `${activeMatieres().map(matiereAdminCard).join("")}
    ${archivedHtml ? `<h3 style="margin:18px 0 10px;font-size:.95rem">Matières archivées</h3>${archivedHtml}` : ""}
    <details ${D.matieres.length ? "" : "open"}><summary>Ajouter une matière</summary><div class="card" style="margin-top:10px">${matiereFormHtml(null)}</div></details>`;
}
