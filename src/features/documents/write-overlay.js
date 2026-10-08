import { toast } from "../../core/components/toast.js";
import { D } from "../../core/services/app-data.js";
import { $, $$ } from "../../core/utils/dom.js";
import { getSeanceDocBlobUrl, updateSeanceDoc, uploadSeanceDoc } from "./documents.service.js";
import { docsState } from "./documents.store.js";
import { redrawAll } from "./write-canvas.js";
import { rerender } from "../../routing/navigation.js";

export const PEN_PALETTE = ["#111111", "#C4342B", "#E08A2B", "#B8960C", "#2E8B57", "#2454C7", "#7C4DBE", "#C6427E"];

export const SHAPES = ["line", "rect", "ellipse", "arrow"];

export function openWriteOverlay(el, mid, sid, doc = null) {
  const overlay = $("#writeOverlay", el), canvas = $("#writeCanvas", el);
  overlay.hidden = false;
  document.body.style.overflow = "hidden";
  const dpr = window.devicePixelRatio || 1, rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr; canvas.height = rect.height * dpr;
  const ctx = canvas.getContext("2d");
  // Pas de ctx.scale ici : redrawAll() pose la transform en entier à chaque frame (dpr + zoom/pan),
  // pour pouvoir zoomer/déplacer la vue sans jamais toucher aux coordonnées stockées des traits.
  docsState.DRAW = {
    el, ctx, canvas, mid, sid, w: rect.width, h: rect.height, dpr, editingDoc: doc,
    tool: "pen", color: "#111111", size: 4, paper: "blank",
    strokes: [], log: [], redoLog: [], eraseGesture: null, cur: null, drawing: false, dirty: false,
    view: { scale: 1, ox: 0, oy: 0 }, touches: new Map(), pinch: null, sawPen: false, touchDrawing: false, backdropImg: null,
  };
  if (doc?.strokes?.length) {
    docsState.DRAW.strokes = JSON.parse(JSON.stringify(doc.strokes)); // copie : jamais l'objet du doc d'origine
    docsState.DRAW.paper = doc.paper || "blank";
    redrawAll();
  } else if (doc?.path) {
    // Page enregistrée avant l'écriture vectorielle : plus moyen de retoucher trait par trait,
    // mais on peut continuer à écrire par-dessus l'image telle quelle.
    toast("Page d'avant cette mise à jour : les traits ne sont plus modifiables un par un, mais tu peux continuer à écrire dessus.");
    getSeanceDocBlobUrl(doc.path).then((blobUrl) => {
      const img = new Image();
      img.onload = () => { docsState.DRAW.backdropImg = img; redrawAll(); URL.revokeObjectURL(blobUrl); };
      img.onerror = () => toast("Impossible de charger cette page pour la modifier.");
      img.src = blobUrl;
    }).catch((err) => toast("Erreur : " + err.message));
  } else {
    redrawAll();
  }
  syncWriteToolbar(el);
}

export function closeWriteOverlay(el) {
  $("#writeOverlay", el).hidden = true;
  document.body.style.overflow = "";
  docsState.DRAW = null;
}

export function syncWriteToolbar(el) {
  $$("[data-a='wtool']", el).forEach((b) => b.classList.toggle("on", b.dataset.tool === docsState.DRAW.tool));
  const slider = $("[data-a='wsizeslider']", el); if (slider) slider.value = docsState.DRAW.size;
  const sv = $("#wsizeval", el); if (sv) sv.textContent = docsState.DRAW.size;
  $$("[data-a='wpaper']", el).forEach((b) => b.classList.toggle("on", b.dataset.paper === docsState.DRAW.paper));
  $$("[data-a='wcolor']", el).forEach((b) => b.classList.toggle("on", b.dataset.c === docsState.DRAW.color));
}

// `rect` est la zone PAGE actuellement visible (dépend du pan/zoom) : le quadrillage/lignage est
// calculé par modulo à partir de l'origine absolue, pas depuis le coin du rect, pour qu'il continue
// à l'identique quand on se déplace — c'est ce qui donne l'impression d'une feuille "infinie".
export function paperPattern(ctx, rect, paper) {
  if (paper === "blank") return;
  const { left, top, right, bottom } = rect;
  ctx.save();
  ctx.strokeStyle = "rgba(0,0,0,.12)"; ctx.lineWidth = 1;
  if (paper === "lined") {
    const step = 30;
    for (let y = Math.floor((top - 6) / step) * step + 6; y < bottom; y += step) { ctx.beginPath(); ctx.moveTo(left, y + .5); ctx.lineTo(right, y + .5); ctx.stroke(); }
  } else if (paper === "grid") {
    const step = 24;
    for (let x = Math.floor(left / step) * step; x < right; x += step) { ctx.beginPath(); ctx.moveTo(x + .5, top); ctx.lineTo(x + .5, bottom); ctx.stroke(); }
    for (let y = Math.floor(top / step) * step; y < bottom; y += step) { ctx.beginPath(); ctx.moveTo(left, y + .5); ctx.lineTo(right, y + .5); ctx.stroke(); }
  }
  ctx.restore();
}

export async function saveWriteNote() {
  if (!docsState.DRAW) return;
  const { el, canvas, mid, sid, editingDoc, strokes, paper } = docsState.DRAW;
  const savedView = docsState.DRAW.view;
  docsState.DRAW.view = { scale: 1, ox: 0, oy: 0 }; // export toujours la page entière à 100%, peu importe le zoom/pan en cours
  redrawAll(); // s'assure aussi qu'aucun trait/forme en cours de tracé n'est exporté à moitié
  const blob = await new Promise((res) => canvas.toBlob(res, "image/png"));
  docsState.DRAW.view = savedView; redrawAll();
  if (!blob) { toast("Erreur : impossible d'enregistrer cette page."); return; }
  const vector = { strokes, paper };
  try {
    if (editingDoc) {
      await updateSeanceDoc(editingDoc, new File([blob], editingDoc.nom, { type: "image/png" }), vector);
    } else {
      const d = new Date(), pad = (n) => String(n).padStart(2, "0");
      const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}h${pad(d.getMinutes())}`;
      await uploadSeanceDoc(mid, sid, new File([blob], `Note manuscrite ${stamp}.png`, { type: "image/png" }), vector);
      D.docSids.add(sid);
    }
  } catch (err) { toast("Erreur : " + err.message); return; }
  closeWriteOverlay(el);
  toast(editingDoc ? "Modifications enregistrées" : "Note enregistrée dans les documents");
  rerender();
}
