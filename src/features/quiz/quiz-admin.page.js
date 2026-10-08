import { icon } from "../../core/components/icons.js";
import { toast } from "../../core/components/toast.js";
import { C, M } from "../../core/services/app-data.js";
import { loadData } from "../../core/services/data-loader.js";
import { saveItem } from "../../core/services/items.service.js";
import { $, esc } from "../../core/utils/dom.js";
import { TA_STYLE, seanceOptions, strip } from "../admin/admin-form.utils.js";

export function qcmAdminList(mid) {
  const m = M(mid); if (!m) return { html: `<div class="empty">Matière inconnue.</div>` };
  const items = C(mid).qcm;
  return { html: `<div class="crumbs"><a href="#/compte">Paramètres</a> › ${esc(m.court)} › QCM</div>
    <h1 style="margin:0">${esc(m.nom)} — QCM</h1>
    <div class="card list" style="margin-top:14px">${items.map((it) => `<a class="item" href="#/aq/${mid}/${it.id}"><div class="sp"><b>${esc(strip(it.q)) || "(sans texte)"}</b><div class="tiny muted">${it.choix.length} choix · niveau ${it.niveau}</div></div>${icon("arrow")}</a>`).join("") || '<div class="empty">Aucune question pour l\'instant.</div>'}</div>
    <div class="row" style="margin-top:14px"><a class="btn pri" href="#/aq/${mid}/new">${icon("edit")}Nouvelle question</a></div>` };
}

function bindQcmForm(mid, id) {
  return (el) => {
    $('form[data-a="saveqcm"]', el)?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const checked = new Set(fd.getAll("correct").map(Number));
      const pairs = fd.getAll("choix").map((s, i) => ({ text: String(s).trim(), ok: checked.has(i) })).filter((p) => p.text);
      const choix = pairs.map((p) => p.text);
      const rep = pairs.map((p, i) => (p.ok ? i : -1)).filter((i) => i >= 0);
      if (!choix.length) return toast("Au moins un choix est requis");
      if (!rep.length) return toast("Coche au moins une bonne réponse");
      try {
        await saveItem("qcm", { id: id === "new" ? null : id, matiere: mid, seance: fd.get("seance") || null, type: rep.length > 1 ? "multiple" : "unique", q: fd.get("q"), choix, rep, expl: fd.get("expl"), niveau: +fd.get("niveau") || 1 });
        toast("Question enregistrée");
        await loadData();
        location.hash = `#/aq/${mid}`;
      } catch (err) { toast("Erreur : " + err.message); }
    });
  };
}

export function qcmAdminForm(mid, id) {
  const m = M(mid); if (!m) return { html: `<div class="empty">Matière inconnue.</div>` };
  const isNew = id === "new";
  const it = isNew ? null : C(mid).qcm.find((x) => x.id === id);
  if (!isNew && !it) return { html: `<div class="empty">Question introuvable.</div>` };
  const v = it || { seance: "", q: "", choix: ["", "", "", ""], rep: [], expl: "", niveau: 1 };
  const slots = Math.max(4, v.choix.length);
  return { html: `<div class="crumbs"><a href="#/compte">Paramètres</a> › <a href="#/aq/${mid}">${esc(m.court)} — QCM</a> › ${isNew ? "Nouvelle" : "Modifier"}</div>
    <h1 style="margin:0">${isNew ? "Nouvelle question" : "Modifier la question"}</h1>
    <form class="card" data-a="saveqcm" style="margin-top:14px">
      <div class="field"><label>Question</label><textarea name="q" rows="2" required style="${TA_STYLE}">${esc(v.q)}</textarea></div>
      <div class="grid g3" style="margin-top:10px">
        <div class="field"><label>Séance (optionnel)</label><select name="seance">${seanceOptions(mid, v.seance)}</select></div>
        <div class="field"><label>Niveau</label><input type="number" name="niveau" min="1" max="5" value="${v.niveau}"></div>
      </div>
      <p class="small muted" style="margin:14px 0 4px">Choix de réponse — coche la ou les bonnes réponses :</p>
      ${Array.from({ length: slots }, (_, i) => `<div class="row nowrap" style="margin-top:6px"><label class="row small" style="gap:6px"><input type="checkbox" name="correct" value="${i}" ${v.rep.includes(i) ? "checked" : ""}></label><input type="text" name="choix" placeholder="Choix ${i + 1}" value="${esc(v.choix[i] || "")}" style="flex:1"></div>`).join("")}
      <div class="field" style="margin-top:10px"><label>Explication (affichée après réponse)</label><textarea name="expl" rows="3" style="${TA_STYLE}">${esc(v.expl)}</textarea></div>
      <div class="row" style="margin-top:12px">
        <button class="btn pri" type="submit">${icon("check")}Enregistrer</button>
        ${isNew ? "" : `<button class="btn" type="button" data-a="delqcm" data-mid="${mid}" data-id="${esc(v.id)}">Supprimer</button>`}
      </div>
    </form>`, after: bindQcmForm(mid, id) };
}
