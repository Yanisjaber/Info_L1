import { icon } from "../../core/components/icons.js";
import { toast } from "../../core/components/toast.js";
import { C, M } from "../../core/services/app-data.js";
import { loadData } from "../../core/services/data-loader.js";
import { saveItem } from "../../core/services/items.service.js";
import { $, esc } from "../../core/utils/dom.js";
import { TA_STYLE, seanceOptions, strip } from "../admin/admin-form.utils.js";

export function flashAdminList(mid) {
  const m = M(mid); if (!m) return { html: `<div class="empty">Matière inconnue.</div>` };
  const items = C(mid).flashcards;
  return { html: `<div class="crumbs"><a href="#/compte">Paramètres</a> › ${esc(m.court)} › Cartes</div>
    <h1 style="margin:0">${esc(m.nom)} — Cartes</h1>
    <div class="card list" style="margin-top:14px">${items.map((it) => `<a class="item" href="#/af/${mid}/${it.id}"><div class="sp"><b>${esc(strip(it.recto)) || "(sans texte)"}</b></div>${icon("arrow")}</a>`).join("") || '<div class="empty">Aucune carte pour l\'instant.</div>'}</div>
    <div class="row" style="margin-top:14px"><a class="btn pri" href="#/af/${mid}/new">${icon("edit")}Nouvelle carte</a></div>` };
}

function bindFlashForm(mid, id) {
  return (el) => {
    $('form[data-a="saveflash"]', el)?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      if (!String(fd.get("recto") || "").trim()) return toast("Le recto est requis");
      try {
        await saveItem("carte", { id: id === "new" ? null : id, matiere: mid, seance: fd.get("seance") || null, recto: fd.get("recto"), verso: fd.get("verso") });
        toast("Carte enregistrée");
        await loadData();
        location.hash = `#/af/${mid}`;
      } catch (err) { toast("Erreur : " + err.message); }
    });
  };
}

export function flashAdminForm(mid, id) {
  const m = M(mid); if (!m) return { html: `<div class="empty">Matière inconnue.</div>` };
  const isNew = id === "new";
  const it = isNew ? null : C(mid).flashcards.find((x) => x.id === id);
  if (!isNew && !it) return { html: `<div class="empty">Carte introuvable.</div>` };
  const v = it || { seance: "", recto: "", verso: "" };
  return { html: `<div class="crumbs"><a href="#/compte">Paramètres</a> › <a href="#/af/${mid}">${esc(m.court)} — Cartes</a> › ${isNew ? "Nouvelle" : "Modifier"}</div>
    <h1 style="margin:0">${isNew ? "Nouvelle carte" : "Modifier la carte"}</h1>
    <form class="card" data-a="saveflash" style="margin-top:14px">
      <div class="field"><label>Séance (optionnel)</label><select name="seance">${seanceOptions(mid, v.seance)}</select></div>
      <div class="field" style="margin-top:10px"><label>Recto (question)</label><textarea name="recto" rows="2" required style="${TA_STYLE}">${esc(v.recto)}</textarea></div>
      <div class="field" style="margin-top:10px"><label>Verso (réponse)</label><textarea name="verso" rows="3" style="${TA_STYLE}">${esc(v.verso)}</textarea></div>
      <div class="row" style="margin-top:12px">
        <button class="btn pri" type="submit">${icon("check")}Enregistrer</button>
        ${isNew ? "" : `<button class="btn" type="button" data-a="delflash" data-mid="${mid}" data-id="${esc(v.id)}">Supprimer</button>`}
      </div>
    </form>`, after: bindFlashForm(mid, id) };
}
