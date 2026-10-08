import { icon } from "../../core/components/icons.js";
import { toast } from "../../core/components/toast.js";
import { C, M, seanceOf } from "../../core/services/app-data.js";
import { loadData } from "../../core/services/data-loader.js";
import { $, esc } from "../../core/utils/dom.js";
import { fmtDate } from "../../core/utils/format.js";
import { bindImageInsert, fileFieldHtml, imageInsertHtml } from "../files/files.components.js";
import { readFileField, removeFile } from "../files/files.service.js";
import { seanceTypes } from "../settings/settings.js";
import { saveSeance } from "./seances.service.js";
import { rerender } from "../../routing/navigation.js";

export function mmSeances(mid) {
  const m = M(mid); if (!m) return { html: `<div class="empty">Matière inconnue.</div>` };
  const c = C(mid);
  return {
    html: `<div class="crumbs"><a href="#/compte">Paramètres</a> › ${esc(m.court)}</div>
    <h1 style="margin:0">${esc(m.nom)} — séances</h1>
    <div class="card list" style="margin-top:14px">${c.seances.map((s) => `<a class="item" href="#/mm/${mid}/${s.id}"><span class="badge">${s.type}<br>${s.numero}</span><div class="sp"><b>${esc(s.titre) || "(sans titre)"}</b><div class="tiny muted">${s.date ? fmtDate(s.date) : "date non fixée"}${s.resume ? " · " + esc(s.resume) : ""}</div></div>${icon("arrow")}</a>`).join("") || '<div class="empty">Aucune séance pour l\'instant.</div>'}</div>
    <div class="row" style="margin-top:14px"><a class="btn pri" href="#/mm/${mid}/new">${icon("edit")}Nouvelle séance</a></div>`,
  };
}

function bindSeanceForm(mid) {
  return (el) => {
    const form = $('form[data-a="saveseance"]', el); if (form) bindImageInsert(form, mid);
    $('form[data-a="saveseance"]', el)?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target), id = String(fd.get("id") || "").trim();
      if (!id) return toast("Identifiant requis");
      try {
        const pdf = await readFileField(fd, "pdf", `${mid}/pdf`);
        await saveSeance(mid, { id, type: fd.get("type"), numero: +fd.get("numero") || 1, date: fd.get("date") || null, titre: fd.get("titre"), resume: fd.get("resume"), contenu: fd.get("contenu"), pdf: pdf.value });
        await removeFile(pdf.old);
        toast("Séance enregistrée");
        await loadData();
        // replaceState (pas location.hash) : remplace l'entrée d'édition dans l'historique au lieu
        // d'en empiler une nouvelle, sinon "Retour" (history.back) atterrit sur le formulaire au
        // lieu de la page d'où l'utilisateur avait cliqué "Modifier".
        history.replaceState(null, "", `#/c/${mid}/${id}`);
        rerender();
      } catch (err) { toast("Erreur : " + err.message); }
    });
  };
}

export function mmSeanceForm(mid, sid) {
  const m = M(mid); if (!m) return { html: `<div class="empty">Matière inconnue.</div>` };
  const isNew = !sid || sid === "new";
  const s = isNew ? null : seanceOf(mid, sid);
  if (!isNew && !s) return { html: `<div class="empty">Séance introuvable.</div>` };
  const nextNum = Math.max(0, ...C(mid).seances.map((x) => x.numero || 0)) + 1;
  const v = s || { id: "", type: seanceTypes()[0].id, numero: nextNum, date: "", titre: "", resume: "", contenu: "", pdf: "" };
  return {
    html: `<div class="crumbs"><a href="#/compte">Paramètres</a> › <a href="#/mm/${mid}">${esc(m.court)}</a> › ${isNew ? "Nouvelle séance" : `${v.type} ${v.numero}`}</div>
    <h1 style="margin:0">${isNew ? "Nouvelle séance" : "Modifier la séance"}</h1>
    <form class="card" data-a="saveseance" style="margin-top:14px">
      ${isNew ? "" : `<input type="hidden" name="id" value="${esc(v.id)}">`}
      <div class="grid g3">
        ${isNew ? `<div class="field"><label>Identifiant (ex. cm-4)</label><input type="text" name="id" required pattern="[a-z0-9][a-z0-9-]{1,30}"></div>` : ""}
        <div class="field"><label>Type</label><select name="type">${[...seanceTypes().map((t) => t.id), ...(!v.type || seanceTypes().some((t) => t.id === v.type) ? [] : [v.type])].map((id) => `<option value="${esc(id)}" ${v.type === id ? "selected" : ""}>${esc(id)}</option>`).join("")}</select></div>
        <div class="field"><label>Numéro</label><input type="number" name="numero" min="1" value="${v.numero}"></div>
        <div class="field"><label>Date</label><input type="date" name="date" value="${v.date || ""}"></div>
      </div>
      <div class="field" style="margin-top:10px"><label>Titre</label><input type="text" name="titre" required value="${esc(v.titre)}"></div>
      <div class="field" style="margin-top:10px"><label>Résumé (une phrase)</label><input type="text" name="resume" value="${esc(v.resume)}"></div>
      <div style="margin-top:10px">${fileFieldHtml("pdf", "PDF (optionnel)", v.pdf)}</div>
      <div class="field" style="margin-top:10px"><label>Contenu du cours — HTML (paragraphes, &lt;h2&gt;, &lt;div class="def"&gt;…&lt;/div&gt; pour les encadrés, \\( \\) pour les maths)</label><textarea name="contenu" rows="16" style="width:100%;padding:10px;border:1px solid var(--line);border-radius:10px;background:var(--surface);color:var(--text);font:.88rem/1.5 ui-monospace,monospace">${esc(v.contenu)}</textarea>${imageInsertHtml()}</div>
      <div class="row" style="margin-top:12px">
        <button class="btn pri" type="submit">${icon("check")}Enregistrer</button>
        <a class="btn ghost" data-a="navreplace" href="${isNew ? `#/mm/${mid}` : `#/c/${mid}/${esc(v.id)}`}">Annuler</a>
        ${isNew ? "" : `<button class="btn" type="button" data-a="delseance" data-mid="${mid}" data-sid="${esc(v.id)}">Supprimer</button>`}
      </div>
    </form>`,
    after: bindSeanceForm(mid),
  };
}
