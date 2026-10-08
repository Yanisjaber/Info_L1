import { icon } from "../../core/components/icons.js";
import { toast } from "../../core/components/toast.js";
import { C, M } from "../../core/services/app-data.js";
import { loadData } from "../../core/services/data-loader.js";
import { saveItem } from "../../core/services/items.service.js";
import { $, $$, esc } from "../../core/utils/dom.js";
import { TA_STYLE, seanceOptions, strip } from "../admin/admin-form.utils.js";

export function exoAdminList(mid) {
  const m = M(mid); if (!m) return { html: `<div class="empty">Matière inconnue.</div>` };
  const items = C(mid).exercices;
  return { html: `<div class="crumbs"><a href="#/compte">Paramètres</a> › ${esc(m.court)} › Exercices</div>
    <h1 style="margin:0">${esc(m.nom)} — Exercices</h1>
    <div class="card list" style="margin-top:14px">${items.map((it) => `<a class="item" href="#/ax/${mid}/${it.id}"><div class="sp"><b>${esc(strip(it.titre)) || "(sans titre)"}</b><div class="tiny muted">difficulté ${it.difficulte} · ${it.type === "code" ? "code Python" : it.type === "texte" ? "réponse courte" : "ancien format"}</div></div>${icon("arrow")}</a>`).join("") || '<div class="empty">Aucun exercice pour l\'instant.</div>'}</div>
    <div class="row" style="margin-top:14px"><a class="btn pri" href="#/ax/${mid}/new">${icon("edit")}Nouvel exercice</a></div>` };
}

function bindExoForm(mid, id) {
  return (el) => {
    const f = $('form[data-a="saveexo"]', el);
    const toggleType = () => {
      $$(".exo-code-field", el).forEach((x) => (x.style.display = f?.type.value === "code" ? "" : "none"));
      $$(".exo-texte-field", el).forEach((x) => (x.style.display = f?.type.value === "texte" ? "" : "none"));
    };
    f?.type.addEventListener("change", toggleType);
    toggleType();
    f?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      if (!String(fd.get("titre") || "").trim()) return toast("Le titre est requis");
      try {
        const reponses = String(fd.get("reponses") || "").split("\n").map((s) => s.trim()).filter(Boolean);
        await saveItem("exercice", { id: id === "new" ? null : id, matiere: mid, seance: fd.get("seance") || null, titre: fd.get("titre"), difficulte: +fd.get("difficulte") || 1, enonce: fd.get("enonce"), indice: fd.get("indice"), corrige: fd.get("corrige"), type: fd.get("type") || "texte", codeStarter: fd.get("code_starter"), codeTests: fd.get("code_tests"), reponse: "", reponses, officiel: fd.get("officiel") === "on" });
        toast("Exercice enregistré");
        await loadData();
        location.hash = `#/ax/${mid}`;
      } catch (err) { toast("Erreur : " + err.message); }
    });
  };
}

export function exoAdminForm(mid, id) {
  const m = M(mid); if (!m) return { html: `<div class="empty">Matière inconnue.</div>` };
  const isNew = id === "new";
  const it = isNew ? null : C(mid).exercices.find((x) => x.id === id);
  if (!isNew && !it) return { html: `<div class="empty">Exercice introuvable.</div>` };
  const v = it || { seance: "", titre: "", difficulte: 1, enonce: "", indice: "", corrige: "", type: "texte", codeStarter: "", codeTests: "", reponse: "", reponses: [], officiel: false };
  return { html: `<div class="crumbs"><a href="#/compte">Paramètres</a> › <a href="#/ax/${mid}">${esc(m.court)} — Exercices</a> › ${isNew ? "Nouveau" : "Modifier"}</div>
    <h1 style="margin:0">${isNew ? "Nouvel exercice" : "Modifier l'exercice"}</h1>
    <p class="small muted">Chaque exercice est corrigé automatiquement par l'app : une réponse courte comparée au texte attendu, ou du code Python vérifié par des tests.</p>
    <form class="card" data-a="saveexo" style="margin-top:14px">
      <div class="field"><label>Titre</label><input type="text" name="titre" required value="${esc(v.titre)}"></div>
      <div class="grid g3" style="margin-top:10px">
        <div class="field"><label>Séance (optionnel)</label><select name="seance">${seanceOptions(mid, v.seance)}</select></div>
        <div class="field"><label>Difficulté</label><input type="number" name="difficulte" min="1" max="3" value="${v.difficulte}"></div>
        <div class="field"><label>Type</label><select name="type">${v.type === "redaction" ? '<option value="redaction" selected disabled>Rédaction (ancien format, à convertir)</option>' : ""}<option value="texte" ${v.type === "texte" ? "selected" : ""}>Zone de texte (réponse courte, corrigée auto)</option><option value="code" ${v.type === "code" ? "selected" : ""}>Code Python (corrigé auto par des tests)</option></select></div>
      </div>
      <div class="field" style="margin-top:10px"><label><input type="checkbox" name="officiel" ${v.officiel ? "checked" : ""}> Officiel — énoncé réellement extrait d'un sujet de TD fourni (pas un exercice ajouté en plus)</label></div>
      <div class="field" style="margin-top:10px"><label>Énoncé — HTML</label><textarea name="enonce" rows="8" style="${TA_STYLE}">${esc(v.enonce)}</textarea></div>
      <div class="field" style="margin-top:10px"><label>Indice (optionnel) — HTML</label><textarea name="indice" rows="3" style="${TA_STYLE}">${esc(v.indice)}</textarea></div>
      <div class="field" style="margin-top:10px"><label>Corrigé — HTML (explication, affichée après correction)</label><textarea name="corrige" rows="8" style="${TA_STYLE}">${esc(v.corrige)}</textarea></div>
      <div class="field exo-texte-field" style="margin-top:10px"><label>Réponses attendues — une par ligne si l'énoncé a plusieurs sous-questions (une zone par ligne sera affichée à l'étudiant), plusieurs formes acceptées par ligne séparées par « | » (ex. <code>6|6.0|six</code>)</label><textarea name="reponses" rows="3" style="${TA_STYLE}">${esc((v.reponses?.length ? v.reponses : v.reponse ? [v.reponse] : []).join("\n"))}</textarea></div>
      <div class="field exo-code-field" style="margin-top:10px"><label>Code de départ (affiché à l'étudiant)</label><textarea name="code_starter" rows="4" style="${TA_STYLE}">${esc(v.codeStarter)}</textarea></div>
      <div class="field exo-code-field" style="margin-top:10px"><label>Tests — un appel à <code>check("description", condition)</code> par ligne</label><textarea name="code_tests" rows="6" style="${TA_STYLE}">${esc(v.codeTests)}</textarea></div>
      <div class="row" style="margin-top:12px">
        <button class="btn pri" type="submit">${icon("check")}Enregistrer</button>
        ${isNew ? "" : `<button class="btn" type="button" data-a="delexo" data-mid="${mid}" data-id="${esc(v.id)}">Supprimer</button>`}
      </div>
    </form>`, after: bindExoForm(mid, id) };
}
