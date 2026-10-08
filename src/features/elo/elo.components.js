import { state } from "../../core/services/store.js";
import { esc } from "../../core/utils/dom.js";
import { ELO_MAX_PER_MATIERE, coverage, getElo, tierFor } from "./elo.utils.js";

// Petit graphique en aire, en SVG pur (pas de dépendance externe) : points = [{ts, v}].
export function sparklineSvg(points, opts = {}) {
  const w = opts.w || 600, h = opts.h || 160, pad = 10;
  if (points.length < 2) return `<div class="empty" style="padding:20px">Pas encore assez de données.</div>`;
  const vals = points.map((p) => p.v);
  const minV = opts.min ?? Math.min(...vals), maxV = opts.max ?? Math.max(...vals);
  const span = Math.max(1e-6, maxV - minV);
  const stepX = (w - pad * 2) / (points.length - 1);
  const y = (v) => h - pad - ((v - minV) / span) * (h - pad * 2);
  const pathD = points.map((p, i) => `${i === 0 ? "M" : "L"} ${(pad + i * stepX).toFixed(1)} ${y(p.v).toFixed(1)}`).join(" ");
  const areaD = `${pathD} L ${(pad + (points.length - 1) * stepX).toFixed(1)} ${h - pad} L ${pad} ${h - pad} Z`;
  const last = points[points.length - 1];
  return `<svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}" preserveAspectRatio="none" style="display:block">
    <path d="${areaD}" fill="var(--acc)" opacity="0.12"></path>
    <path d="${pathD}" fill="none" stroke="var(--acc)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"></path>
    <circle cx="${(pad + (points.length - 1) * stepX).toFixed(1)}" cy="${y(last.v).toFixed(1)}" r="4" fill="var(--acc)"></circle>
  </svg>`;
}

// Graphique d'évolution avec vrais axes : points = [{ts, v}] (% cumulé, croissant dans le temps),
// courbe pleine reliant chaque vraie mesure, marqueurs + valeur au-dessus de chacun, grille
// horizontale en pointillés avec repères %, axe des dates en bas. Un segment pointillé mène d'un
// point de départ synthétique à 0 % (quelques jours avant la première vraie mesure) jusqu'au
// premier point réel, pour donner un vrai fil de continuité même avec une seule mesure enregistrée
// — sans jamais faire passer ce segment-là pour une donnée réelle (pointillé + pas de marqueur).
export function lineChartSvg(points, opts = {}) {
  const w = opts.w || 800, h = opts.h || 260;
  if (!points.length) return `<div class="empty" style="padding:20px">Pas encore de données.</div>`;
  const padL = 36, padR = 16, padTop = 28, padBottom = 28;
  const min = opts.min ?? 0, max = opts.max ?? 100;
  const plotW = w - padL - padR, plotH = h - padTop - padBottom;
  const lead = { ts: points[0].ts - 12 * 86400000, v: 0, synthetic: true };
  const all = [lead, ...points];
  const x = (i) => padL + (all.length > 1 ? (i / (all.length - 1)) * plotW : plotW / 2);
  const y = (v) => padTop + plotH - ((v - min) / (max - min)) * plotH;
  const grid = [0, 25, 50, 75, 100].map((gv) => `
    <line x1="${padL}" y1="${y(gv).toFixed(1)}" x2="${w - padR}" y2="${y(gv).toFixed(1)}" stroke="var(--line)" stroke-width="1" stroke-dasharray="3,3"></line>
    <text x="${(padL - 8).toFixed(1)}" y="${(y(gv) + 4).toFixed(1)}" text-anchor="end" font-size="10" fill="var(--muted)">${gv}%</text>`).join("");
  const dottedD = `M ${x(0).toFixed(1)} ${y(all[0].v).toFixed(1)} L ${x(1).toFixed(1)} ${y(all[1].v).toFixed(1)}`;
  const solidD = points.map((p, i) => `${i === 0 ? "M" : "L"} ${x(i + 1).toFixed(1)} ${y(p.v).toFixed(1)}`).join(" ");
  const areaD = `${solidD} L ${x(all.length - 1).toFixed(1)} ${(h - padBottom).toFixed(1)} L ${x(1).toFixed(1)} ${(h - padBottom).toFixed(1)} Z`;
  const dayLabel = (ts) => new Date(ts).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
  const showEvery = Math.max(1, Math.ceil(all.length / 8));
  const xLabels = all.map((p, i) => (i % showEvery === 0 || i === all.length - 1
    ? `<text x="${x(i).toFixed(1)}" y="${h - 8}" text-anchor="middle" font-size="10" fill="var(--muted)">${p.synthetic ? "départ" : dayLabel(p.ts)}</text>` : "")).join("");
  const markers = points.map((p, i) => `
    <circle cx="${x(i + 1).toFixed(1)}" cy="${y(p.v).toFixed(1)}" r="4" fill="var(--acc)" stroke="var(--surface)" stroke-width="2"><title>${dayLabel(p.ts)} : ${p.v}%</title></circle>
    <text x="${x(i + 1).toFixed(1)}" y="${(y(p.v) - 11).toFixed(1)}" text-anchor="middle" font-size="11" font-weight="700" fill="var(--text)">${p.v}%</text>`).join("");
  return `<svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}" preserveAspectRatio="none" style="display:block">
    ${grid}
    <path d="${areaD}" fill="var(--acc)" opacity="0.08"></path>
    <path d="${dottedD}" fill="none" stroke="var(--muted)" stroke-width="2" stroke-dasharray="4,4" stroke-linecap="round"></path>
    <path d="${solidD}" fill="none" stroke="var(--acc)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"></path>
    ${markers}
    ${xLabels}
  </svg>`;
}

export function eloCardHtml(m) {
  const rating = getElo(m.id), cov = coverage(m.id), tier = tierFor(rating);
  const hist = (state.elo[m.id]?.history || []).slice(-24);
  const pts = hist.map((h) => ({ ts: h.ts, v: h.rating }));
  const delta = pts.length > 1 ? rating - pts[0].v : 0;
  return `<a class="card" href="#/elo/${m.id}" style="--acc:${m.couleur};display:block;text-decoration:none;color:inherit">
    <div class="row nowrap"><i class="dot" style="--c:${m.couleur}"></i><b>${esc(m.court)}</b><div class="sp"></div><span class="chip ${tier.cls}">${esc(tier.name)}</span></div>
    <div class="row nowrap" style="margin-top:10px;align-items:baseline;gap:8px"><div style="font-size:1.9rem;font-weight:800">${rating}<span class="tiny muted" style="font-weight:600"> / ${ELO_MAX_PER_MATIERE}</span></div>${pts.length > 1 ? `<span class="tiny" style="color:${delta >= 0 ? "var(--ok)" : "var(--ko)"}">${delta >= 0 ? "+" : ""}${delta}</span>` : ""}</div>
    <div class="bar" style="margin-top:10px"><i style="width:${Math.min(100, Math.round((rating / ELO_MAX_PER_MATIERE) * 100))}%;background:${m.couleur}"></i></div>
    <div class="tiny muted" style="margin-top:4px">${Math.round(cov * 100)}% du cours couvert</div>
    <div style="margin-top:10px">${pts.length > 1 ? sparklineSvg(pts, { w: 280, h: 46 }) : `<div class="tiny muted">Entraîne-toi pour voir ta progression.</div>`}</div>
  </a>`;
}
