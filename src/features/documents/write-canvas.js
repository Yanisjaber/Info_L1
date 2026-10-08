import { $ } from "../../core/utils/dom.js";
import { docsState } from "./documents.store.js";
import { SHAPES, paperPattern } from "./write-overlay.js";

// Trace lissée par courbes quadratiques passant par les points-milieux : évite l'aspect "brisé"
// d'un simple enchaînement de segments droits point à point.
function pathThrough(ctx, pts) {
  if (pts.length < 2) return;
  ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i].x + pts[i + 1].x) / 2, my = (pts[i].y + pts[i + 1].y) / 2;
    ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
  }
  ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
}

function drawArrowHead(ctx, s) {
  const ang = Math.atan2(s.y2 - s.y1, s.x2 - s.x1), len = 9 + s.size;
  ctx.beginPath();
  ctx.moveTo(s.x2 - len * Math.cos(ang - Math.PI / 7), s.y2 - len * Math.sin(ang - Math.PI / 7));
  ctx.lineTo(s.x2, s.y2);
  ctx.lineTo(s.x2 - len * Math.cos(ang + Math.PI / 7), s.y2 - len * Math.sin(ang + Math.PI / 7));
  ctx.stroke();
}

function drawStroke(ctx, s) {
  ctx.lineCap = "round"; ctx.lineJoin = "round";
  ctx.strokeStyle = s.color;
  if (s.tool === "pen" || s.tool === "highlighter") {
    ctx.globalAlpha = s.tool === "highlighter" ? .35 : 1;
    ctx.lineWidth = s.tool === "highlighter" ? s.size * 3 : s.size;
    pathThrough(ctx, s.pts); ctx.stroke();
    ctx.globalAlpha = 1;
  } else if (s.tool === "line" || s.tool === "arrow") {
    ctx.lineWidth = s.size;
    ctx.beginPath(); ctx.moveTo(s.x1, s.y1); ctx.lineTo(s.x2, s.y2); ctx.stroke();
    if (s.tool === "arrow") drawArrowHead(ctx, s);
  } else if (s.tool === "rect") {
    ctx.lineWidth = s.size;
    ctx.strokeRect(Math.min(s.x1, s.x2), Math.min(s.y1, s.y2), Math.abs(s.x2 - s.x1), Math.abs(s.y2 - s.y1));
  } else if (s.tool === "ellipse") {
    ctx.lineWidth = s.size;
    const cx = (s.x1 + s.x2) / 2, cy = (s.y1 + s.y2) / 2, rx = Math.abs(s.x2 - s.x1) / 2, ry = Math.abs(s.y2 - s.y1) / 2;
    ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); ctx.stroke();
  }
}

export function redrawAll() {
  if (!docsState.DRAW) return;
  const { ctx, w, h, dpr, view, canvas } = docsState.DRAW;
  // Reset complet avant de reposer la transform : sinon une zone qui sort du cadre (dézoom, pan)
  // garderait les pixels bruts de la frame précédente au lieu d'être vide.
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(dpr * view.scale, 0, 0, dpr * view.scale, dpr * view.ox, dpr * view.oy);
  // Feuille "presque infinie" : on peint du blanc + le quadrillage sur toute la zone PAGE
  // actuellement visible (dépend du pan/zoom), pas seulement sur le rectangle initial — se déplacer
  // ne révèle donc jamais de vide, la feuille continue dans toutes les directions.
  const vis = { left: -view.ox / view.scale, top: -view.oy / view.scale, right: (w - view.ox) / view.scale, bottom: (h - view.oy) / view.scale };
  ctx.fillStyle = "#fff"; ctx.fillRect(vis.left, vis.top, vis.right - vis.left, vis.bottom - vis.top);
  if (docsState.DRAW.backdropImg) ctx.drawImage(docsState.DRAW.backdropImg, 0, 0, w, h);
  paperPattern(ctx, vis, docsState.DRAW.paper);
  docsState.DRAW.strokes.forEach((s) => drawStroke(ctx, s));
  if (docsState.DRAW.cur) drawStroke(ctx, docsState.DRAW.cur);
}

// Historique d'actions unifié (ajout ET gomme) : gommer un morceau par erreur doit pouvoir s'annuler
// exactement comme un trait de trop, donc les deux passent par la même pile plutôt que par un
// simple "dernier trait" — sinon effacer serait irréversible.
export function undoStroke() {
  if (!docsState.DRAW || !docsState.DRAW.log.length) return;
  const last = docsState.DRAW.log.pop();
  if (last.type === "add") { const i = docsState.DRAW.strokes.indexOf(last.stroke); if (i >= 0) docsState.DRAW.strokes.splice(i, 1); }
  else last.items.slice().sort((a, b) => a.originalIndex - b.originalIndex).forEach(({ original, originalIndex, pieces }) => {
    pieces.forEach((pc) => { const i = docsState.DRAW.strokes.indexOf(pc); if (i >= 0) docsState.DRAW.strokes.splice(i, 1); });
    docsState.DRAW.strokes.splice(Math.min(originalIndex, docsState.DRAW.strokes.length), 0, original);
  });
  docsState.DRAW.redoLog.push(last); docsState.DRAW.dirty = true; redrawAll();
}

export function redoStroke() {
  if (!docsState.DRAW || !docsState.DRAW.redoLog.length) return;
  const last = docsState.DRAW.redoLog.pop();
  if (last.type === "add") docsState.DRAW.strokes.push(last.stroke);
  else last.items.forEach(({ original, originalIndex, pieces }) => {
    const i = docsState.DRAW.strokes.indexOf(original); if (i >= 0) docsState.DRAW.strokes.splice(i, 1);
    docsState.DRAW.strokes.splice(Math.min(originalIndex, docsState.DRAW.strokes.length), 0, ...pieces);
  });
  docsState.DRAW.log.push(last); docsState.DRAW.dirty = true; redrawAll();
}

// La gomme est un stylo qui gomme : son rayon suit le même curseur de taille que le stylo, et elle
// efface au pixel près — un trait touché est DÉCOUPÉ à l'endroit du contact (les morceaux de part et
// d'autre redeviennent deux traits indépendants), il ne disparaît pas en entier comme un objet qu'on
// aurait cliqué. Les formes (ligne/rectangle/cercle/flèche) n'ont pas de "pixels" à découper : elles
// s'effacent toujours entières au contact, comme avant.
// `DRAW.eraseGesture` suit, pour tout le geste (du pointerdown au pointerup), quel trait ORIGINAL est
// à l'origine de quel morceau actuellement affiché — via une Map indexée par référence d'objet — afin
// qu'annuler restaure le trait d'origine intact même s'il a été redécoupé plusieurs fois en chemin.
// Distance d'un point au SEGMENT [a,b] (pas juste à ses deux extrémités) : avec des points de trait
// parfois espacés (trait rapide, événements pointeur peu fréquents), tester seulement les sommets
// laisserait passer un clic pourtant visuellement en plein sur le trait, entre deux points stockés.
function distToSeg(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function eraseAt(p) {
  const r = docsState.DRAW.size * 3 + 6;
  const { records, pieceGid } = docsState.DRAW.eraseGesture;
  let i = 0;
  while (i < docsState.DRAW.strokes.length) {
    const s = docsState.DRAW.strokes[i];
    let hit = false, pieces = null;
    if (s.tool === "pen" || s.tool === "highlighter") {
      const pts = s.pts;
      if (pts.length < 2) {
        hit = Math.hypot(pts[0].x - p.x, pts[0].y - p.y) < r;
        if (hit) pieces = [];
      } else {
        const runs = []; let cur = [pts[0]];
        for (let k = 0; k < pts.length - 1; k++) {
          if (distToSeg(p, pts[k], pts[k + 1]) < r) { hit = true; if (cur.length >= 2) runs.push(cur); cur = [pts[k + 1]]; }
          else cur.push(pts[k + 1]);
        }
        if (cur.length >= 2) runs.push(cur);
        if (hit) pieces = runs.map((run) => ({ tool: s.tool, color: s.color, size: s.size, pts: run }));
      }
    } else {
      const pts = [{ x: s.x1, y: s.y1 }, { x: s.x2, y: s.y2 }, { x: (s.x1 + s.x2) / 2, y: (s.y1 + s.y2) / 2 }];
      hit = pts.some((pt) => Math.hypot(pt.x - p.x, pt.y - p.y) < r);
      if (hit) pieces = [];
    }
    if (!hit) { i++; continue; }
    let recIdx = pieceGid.get(s);
    if (recIdx === undefined) { recIdx = records.length; records.push({ original: s, originalIndex: i }); }
    pieces.forEach((pc) => pieceGid.set(pc, recIdx));
    docsState.DRAW.strokes.splice(i, 1, ...pieces);
    i += pieces.length;
    docsState.DRAW.dirty = true;
  }
}

// Convertit un point écran (CSS px) en coordonnées page (celles stockées dans les traits), en
// inversant la transform de vue courante — indispensable pour dessiner juste sous le stylet une
// fois qu'on a zoomé/déplacé la vue.
function ptFromEvent(e, canvas) {
  const r = canvas.getBoundingClientRect(), { scale, ox, oy } = docsState.DRAW.view;
  return { x: (e.clientX - r.left - ox) / scale, y: (e.clientY - r.top - oy) / scale, p: e.pressure || .5 };
}

function isShapeTool(t) { return SHAPES.includes(t); }

function touchPt(e, canvas) {
  const r = canvas.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}

// Fige le point de la PAGE actuellement sous le milieu des deux doigts : tant que ce point reste
// sous le milieu courant pendant tout le geste, pincer zoome/déplace naturellement en une seule fois
// (pas besoin de logique séparée pour le pan).
function startPinch() {
  const [a, b] = [...docsState.DRAW.touches.values()];
  const d0 = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const midX = (a.x + b.x) / 2, midY = (a.y + b.y) / 2;
  const { scale, ox, oy } = docsState.DRAW.view;
  docsState.DRAW.pinch = { d0, scale0: scale, anchor: { x: (midX - ox) / scale, y: (midY - oy) / scale } };
}

export function resetZoomView() { if (!docsState.DRAW) return; docsState.DRAW.view = { scale: 1, ox: 0, oy: 0 }; redrawAll(); }

export function wireWriteCanvas(el) {
  const canvas = $("#writeCanvas", el); if (!canvas) return;
  const start = (e, p) => {
    if (docsState.DRAW.tool === "eraser") { docsState.DRAW.drawing = true; docsState.DRAW.eraseGesture = { records: [], pieceGid: new Map() }; eraseAt(p); return; }
    if (isShapeTool(docsState.DRAW.tool)) { docsState.DRAW.cur = { tool: docsState.DRAW.tool, color: docsState.DRAW.color, size: docsState.DRAW.size, x1: p.x, y1: p.y, x2: p.x, y2: p.y }; docsState.DRAW.drawing = true; return; }
    docsState.DRAW.cur = { tool: docsState.DRAW.tool, color: docsState.DRAW.color, size: docsState.DRAW.size, pts: [p] }; docsState.DRAW.drawing = true;
  };
  const move = (e, p) => {
    if (docsState.DRAW.tool === "eraser") { eraseAt(p); return; }
    if (isShapeTool(docsState.DRAW.tool)) { docsState.DRAW.cur.x2 = p.x; docsState.DRAW.cur.y2 = p.y; }
    else docsState.DRAW.cur.pts.push(p);
    docsState.DRAW.dirty = true;
  };
  const end = () => {
    if (!docsState.DRAW.drawing) return;
    docsState.DRAW.drawing = false;
    if (docsState.DRAW.tool === "eraser") {
      const { records, pieceGid } = docsState.DRAW.eraseGesture;
      if (records.length) {
        const items = records.map((rec, idx) => ({ original: rec.original, originalIndex: rec.originalIndex, pieces: docsState.DRAW.strokes.filter((x) => pieceGid.get(x) === idx) }));
        docsState.DRAW.log.push({ type: "erase", items }); docsState.DRAW.redoLog = [];
      }
      docsState.DRAW.eraseGesture = null;
    } else if (docsState.DRAW.cur) {
      docsState.DRAW.strokes.push(docsState.DRAW.cur); docsState.DRAW.log.push({ type: "add", stroke: docsState.DRAW.cur }); docsState.DRAW.redoLog = []; docsState.DRAW.cur = null; docsState.DRAW.dirty = true;
    }
  };
  // Pincer à deux doigts zoome/déplace la VUE du canevas (jamais la barre d'outils, qui est en
  // dehors du canevas). Un seul doigt dessine SAUF si un vrai stylet a déjà touché l'écran cette
  // session (DRAW.sawPen) — c'est le rejet de paume adaptatif décrit plus haut.
  const touchStart = (e) => {
    docsState.DRAW.touches.set(e.pointerId, touchPt(e, canvas));
    if (docsState.DRAW.touches.size === 2) {
      // un 2e doigt arrive pendant qu'on dessinait au 1er : on finalise ce trait avant de pincer,
      // sinon le pincement laisserait un trait fantôme au point de contact du 1er doigt.
      if (docsState.DRAW.touchDrawing) { end(); docsState.DRAW.touchDrawing = false; }
      startPinch();
    } else if (docsState.DRAW.touches.size === 1) {
      docsState.DRAW.pinch = null;
      if (!docsState.DRAW.sawPen) { docsState.DRAW.touchDrawing = true; start(e, ptFromEvent(e, canvas)); }
    }
    redrawAll();
  };
  const touchMove = (e) => {
    if (!docsState.DRAW.touches.has(e.pointerId)) return;
    docsState.DRAW.touches.set(e.pointerId, touchPt(e, canvas));
    if (docsState.DRAW.touches.size === 2 && docsState.DRAW.pinch) {
      const [a, b] = [...docsState.DRAW.touches.values()];
      const d = Math.hypot(b.x - a.x, b.y - a.y);
      const midX = (a.x + b.x) / 2, midY = (a.y + b.y) / 2;
      const scale = Math.min(6, Math.max(.4, docsState.DRAW.pinch.scale0 * (d / docsState.DRAW.pinch.d0)));
      docsState.DRAW.view = { scale, ox: midX - docsState.DRAW.pinch.anchor.x * scale, oy: midY - docsState.DRAW.pinch.anchor.y * scale };
      redrawAll();
    } else if (docsState.DRAW.touches.size === 1 && docsState.DRAW.touchDrawing) {
      move(e, ptFromEvent(e, canvas)); redrawAll();
    }
  };
  const touchEnd = (e) => {
    docsState.DRAW.touches.delete(e.pointerId);
    if (docsState.DRAW.touchDrawing && docsState.DRAW.touches.size === 0) { end(); docsState.DRAW.touchDrawing = false; }
    docsState.DRAW.pinch = null;
    if (docsState.DRAW.touches.size === 2) startPinch(); // un 3e doigt levé en premier : le pincement à 2 continue sans à-coup
    redrawAll();
  };
  canvas.addEventListener("pointerdown", (e) => {
    if (!docsState.DRAW) return;
    if (e.pointerType === "pen") docsState.DRAW.sawPen = true;
    if (e.pointerType === "touch") { canvas.setPointerCapture(e.pointerId); touchStart(e); return; }
    canvas.setPointerCapture(e.pointerId);
    start(e, ptFromEvent(e, canvas)); redrawAll();
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!docsState.DRAW) return;
    if (e.pointerType === "touch") { touchMove(e); return; }
    if (!docsState.DRAW.drawing) return;
    move(e, ptFromEvent(e, canvas)); redrawAll();
  });
  const endMain = (e) => {
    if (!docsState.DRAW) return;
    if (e.pointerType === "touch") { touchEnd(e); return; }
    end(); redrawAll();
  };
  canvas.addEventListener("pointerup", endMain);
  canvas.addEventListener("pointercancel", endMain);
  canvas.addEventListener("pointerleave", endMain);
  // Trackpad (Mac/PC) : un pincement à deux doigts arrive au navigateur comme un `wheel` avec
  // `ctrlKey` à true — il n'y a pas d'évènement dédié pour ce geste sur ordinateur. On l'intercepte
  // sur TOUT l'overlay (pas juste le canevas) pour empêcher le zoom natif de la page — qui zoomerait
  // aussi la barre d'outils — et on l'applique nous-mêmes à `DRAW.view`. Un défilement à deux doigts
  // sans ctrl déplace la vue (pan) : au trackpad/souris comme au doigt, on peut ainsi se balader sur
  // une feuille sans bord plutôt que rester coincé sur le rectangle de départ.
  const overlay = $("#writeOverlay", el) || canvas;
  overlay.addEventListener("wheel", (e) => {
    if (!docsState.DRAW) return;
    e.preventDefault();
    const r = canvas.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
    const { scale, ox, oy } = docsState.DRAW.view;
    if (e.ctrlKey || e.metaKey) {
      const anchor = { x: (mx - ox) / scale, y: (my - oy) / scale };
      const ns = Math.min(6, Math.max(.4, scale * Math.exp(-e.deltaY * 0.01)));
      docsState.DRAW.view = { scale: ns, ox: mx - anchor.x * ns, oy: my - anchor.y * ns };
    } else {
      docsState.DRAW.view = { scale, ox: ox - e.deltaX, oy: oy - e.deltaY };
    }
    redrawAll();
  }, { passive: false });
}
