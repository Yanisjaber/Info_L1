import { icon } from "../../core/components/icons.js";
import { C, D, M, sKey, seanceOf } from "../../core/services/app-data.js";
import { state } from "../../core/services/store.js";
import { $, $$, esc } from "../../core/utils/dom.js";
import { fmtLong } from "../../core/utils/format.js";
import { TA_STYLE } from "../admin/admin-form.utils.js";
import { docRowHtml } from "../documents/documents.components.js";
import { loadSeanceDocs } from "../documents/documents.service.js";
import { docsState } from "../documents/documents.store.js";
import { wireWriteCanvas } from "../documents/write-canvas.js";
import { PEN_PALETTE } from "../documents/write-overlay.js";
import { seanceFor, seanceHasContent } from "../edt/edt.utils.js";
import { fileUrl, resolveHtml } from "../files/files.js";
import { typeLabel } from "../settings/settings.js";

export async function cours(mid, sid) {
  const m = M(mid), s = m && seanceOf(mid, sid);
  if (!s) return { html: `<div class="empty">Séance introuvable.</div>` };
  const c = C(mid), i = c.seances.findIndex((x) => x.id === sid);
  const prev = c.seances[i - 1], next = c.seances[i + 1];
  const nq = c.qcm.filter((q) => q.seance === sid).length, nf = c.flashcards.filter((f) => f.seance === sid).length, ne = c.exercices.filter((e) => e.seance === sid).length;
  const rd = state.read[sKey(mid, sid)]?.v;
  const key = sKey(mid, sid);
  const hasContent = seanceHasContent(s);
  const docs = await loadSeanceDocs(mid, sid);
  docsState.CURRENT_DOCS = docs;
  const notes = state.seanceNotes[key]?.text || "";
  // Un créneau EDT marqué cc=true peut être rattaché à cette séance (un CC a lieu pendant ce
  // cours) : on le retrouve en inversant seanceFor, pour afficher un bandeau avec sa note éditable
  // directement ici — pas besoin de repasser par l'EDT pour noter les modalités du CC.
  const ccEvt = D.edt.events.find((x) => x.cc && x.m === mid && seanceFor(x)?.id === sid);
  const ccDeadline = D.cal.evenements.find((x) => x.edtId === ccEvt?.id) || D.cal.evenements.find((x) => x.matiere === mid && x.date === s.date);
  const ccBanner = ccEvt ? `<div class="card" style="margin:12px 0;border-left:4px solid var(--amber)">
    <div class="row nowrap"><span class="chip wa">CC</span><b>Contrôle continu pendant ce cours</b><div class="sp"></div>${ccDeadline ? `<a class="btn sm ghost" href="#/cal">${icon("cal")}Voir dans Notes &amp; CC</a>` : `<button type="button" class="btn sm ghost" data-a="addccsugg" data-m="${esc(mid)}" data-date="${s.date}" data-titre="${esc(ccEvt.n || "CC")}" data-edt-id="${esc(ccEvt.id)}">${icon("check")}Ajouter à mes échéances</button>`}</div>
    <div class="field" style="margin-top:10px"><label>Détails du CC</label><textarea data-ccnote-id="${esc(ccEvt.id)}" rows="2" placeholder="Modalités, durée, barème…" style="${TA_STYLE}">${esc(ccEvt.n || "")}</textarea></div>
  </div>` : "";
  const docBody = `<div class="doc-layout"><article class="prose" id="doc">${resolveHtml(s.contenu)}</article><aside class="toc" id="toc"></aside></div>`;
  const emptyBody = `<div class="empty" style="text-align:left;padding:20px 22px"><b>Pas encore de cours rédigé pour cette séance.</b><p class="small muted" style="margin:6px 0 0">Utilise l'espace de travail ci-dessous pour déposer un support ou prendre des notes en attendant — tu pourras toujours demander la rédaction d'une vraie fiche à partir de ça plus tard.</p></div>`;
  return {
    html: `<div class="crumbs"><a href="#/m">Matières</a> › <a href="#/m/${mid}">${esc(m.court)}</a> › ${s.type} ${s.numero}</div>
    <div class="row"><div><h1 style="margin:0">${s.titre}</h1><div class="muted">${s.date ? fmtLong(s.date) + " · " : ""}${esc(typeLabel(s.type))}</div></div><div class="sp"></div>
      ${s.pdf ? `<a class="btn sm" href="${esc(fileUrl(s.pdf))}" download>${icon("dl")}PDF</a>` : ""}<a class="btn sm" data-a="navreplace" href="#/mm/${mid}/${sid}">${icon("edit")}Modifier</a><button class="btn sm ${rd ? "" : "pri"}" data-a="read" data-k="${sKey(mid, sid)}">${rd ? "✓ Lu" : "Marquer comme lu"}</button></div>
    <p class="muted">${s.resume}</p>
    ${ccBanner}
    ${hasContent ? docBody : emptyBody}
    <div class="card" style="margin-top:26px"><h3 style="margin-top:0">Espace de travail</h3><p class="tiny muted" style="margin-top:-6px">Tes notes et tes documents pour cette séance — rien de tout ça n'est un cours rédigé, juste un endroit pour garder ce que tu as sous la main.</p>
      <div class="field"><label>Tes notes</label><textarea data-note-key="${key}" rows="6" placeholder="Notes prises en séance, points à retenir…" style="${TA_STYLE}">${esc(notes)}</textarea></div>
      <div style="margin-top:16px"><label class="tiny muted" style="display:block;margin-bottom:6px">Documents</label>
        <div class="list" style="border:1px solid var(--line);border-radius:var(--radius);overflow:hidden;margin-bottom:10px">${docs.map(docRowHtml).join("") || '<div class="empty" style="padding:16px">Aucun document déposé.</div>'}</div>
        <div class="row" style="gap:8px"><label class="btn sm">${icon("upload")}Ajouter un document<input type="file" multiple data-a="adddoc" data-mid="${mid}" data-sid="${sid}" class="sr"></label>
        <button type="button" class="btn sm" data-a="opennote" data-mid="${mid}" data-sid="${sid}">${icon("edit")}Écrire à la main</button></div>
      </div></div>
    <div class="write-overlay" id="writeOverlay" hidden>
      <div class="write-tb">
        <button type="button" data-a="wtool" data-tool="pen" class="on" aria-label="Stylo">${icon("edit")}Stylo</button>
        <button type="button" data-a="wtool" data-tool="highlighter" aria-label="Surligneur">Surligneur</button>
        <button type="button" data-a="wtool" data-tool="eraser" aria-label="Gomme">Gomme</button>
        <span class="write-sep"></span>
        <button type="button" data-a="wtool" data-tool="line">Ligne</button>
        <button type="button" data-a="wtool" data-tool="rect">Rectangle</button>
        <button type="button" data-a="wtool" data-tool="ellipse">Cercle</button>
        <button type="button" data-a="wtool" data-tool="arrow">Flèche</button>
        <span class="write-sep"></span>
        <button type="button" data-a="wundo" aria-label="Annuler">${icon("back")}</button>
        <button type="button" data-a="wredo" aria-label="Rétablir">${icon("arrow")}</button>
      </div>
      <div class="write-tb">
        ${PEN_PALETTE.map((c, i) => `<button type="button" data-a="wcolor" data-c="${c}" class="sw${i === 0 ? " on" : ""}" style="background:${c}" aria-label="Couleur ${c}"></button>`).join("")}
        <label class="sw sw-custom" aria-label="Couleur personnalisée"><input type="color" data-a="wcustomcolor" value="#111111"></label>
        <span class="write-sep"></span>
        <span class="tiny muted">Taille</span>
        <input type="range" class="write-slider" data-a="wsizeslider" min="1" max="24" step="1" value="4">
        <span class="tiny" id="wsizeval" style="width:1.4em;text-align:right">4</span>
        <span class="write-sep"></span>
        <button type="button" data-a="wpaper" data-paper="blank" class="on">Blanc</button>
        <button type="button" data-a="wpaper" data-paper="lined">Ligné</button>
        <button type="button" data-a="wpaper" data-paper="grid">Quadrillé</button>
        <span class="write-sep"></span>
        <button type="button" data-a="wzoomreset" aria-label="Réinitialiser le zoom">${icon("search")}100 %</button>
        <div class="sp"></div>
        <button type="button" data-a="wclose">Fermer</button>
        <button type="button" class="pri" data-a="wsave">${icon("check")}Enregistrer dans les documents</button>
      </div>
      <div class="write-canvas-wrap"><canvas id="writeCanvas"></canvas></div>
    </div>
    <div class="card" style="margin-top:16px"><h3 style="margin-top:0">S'entraîner sur cette séance</h3><div class="row">
      ${nq ? `<a class="btn pri" href="#/qcm?m=${mid}&s=${sid}">${icon("check")}${nq} QCM</a>` : ""}
      ${nf ? `<a class="btn" href="#/cards?m=${mid}&s=${sid}">${icon("cards")}${nf} cartes</a>` : ""}
      ${ne ? `<a class="btn" href="#/m/${mid}/exos?s=${sid}">${icon("edit")}${ne} exercices</a>` : ""}</div></div>
    <div class="row" style="margin-top:16px">${prev ? `<a class="btn" href="#/c/${mid}/${prev.id}">${icon("back")}${prev.type} ${prev.numero}</a>` : ""}<div class="sp"></div>${next ? `<a class="btn" href="#/c/${mid}/${next.id}">${next.type} ${next.numero}${icon("arrow")}</a>` : ""}</div>`,
    after: (el) => {
      wireWriteCanvas(el);
      if (!hasContent) return;
      const hs = $$("#doc h2, #doc h3", el);
      $("#toc", el).innerHTML = hs.length > 2 ? `<b>Sommaire</b>` + hs.map((h, k) => { h.id = "s" + k; const cl = h.cloneNode(true); $$(".katex-mathml", cl).forEach((n) => n.remove()); return `<a class="${h.tagName === "H3" ? "l3" : ""}" href="#/c/${mid}/${sid}" data-scroll="s${k}">${esc(cl.textContent.replace(/\s+/g, " ").trim())}</a>`; }).join("") : "";
      $$("[data-scroll]", el).forEach((a) => a.addEventListener("click", (e) => { e.preventDefault(); document.getElementById(a.dataset.scroll).scrollIntoView({ behavior: "smooth", block: "start" }); }));
    },
  };
}
