import { D, activeMatieres, periodeLabel } from "../../core/services/app-data.js";
import { state } from "../../core/services/store.js";
import { esc } from "../../core/utils/dom.js";
import { fmt1, fmtNote } from "../../core/utils/format.js";
import { SET } from "../settings/settings.js";
import { calcFor, shareText } from "./grades.js";

// « Exporter les résultats » : une feuille de relevé propre, dans une nouvelle fenêtre, à imprimer ou à enregistrer en PDF
// (bouton « Imprimer » → destination « Enregistrer au format PDF »). Tout vient des notes saisies et du calculateur ;
// c'est un relevé calculé par l'appli, pas un document de l'université (écrit en pied de page).
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const num = (x) => (x === "" || x === null || x === undefined || Number.isNaN(+x) ? null : +x);

// Données du relevé : une entrée par matière active, avec ses lignes (épreuves), sa moyenne et son état.
function sheetData() {
  const pass = SET().passMark;
  const mats = activeMatieres().map((m) => {
    const K = calcFor(m.id), v = state.notes[m.id]?.v || {};
    if (!K) return { m, K: null, rows: [], r: null, etat: "Pas de calculateur", ok: null };
    const rows = K.champs.map(([k, label, max]) => ({ label, coef: K.shares?.[k] === undefined ? "" : shareText(K.shares[k]), note: num(v[k]), max: max || 20 }));
    const r = K.calc(v);
    const etat = !r ? "Pas encore notée" : r.complet ? (r.note >= pass ? cap(SET().passLabel) : "Sous la moyenne") : `Estimation (${fmt1(r.poids)} % saisi)`;
    return { m, K, rows, r, etat, ok: r && r.complet ? r.note >= pass : null };
  });
  const got = mats.filter((x) => x.r), mean = got.length ? got.reduce((s, x) => s + x.r.note, 0) / got.length : null;
  const valid = mats.filter((x) => x.ok === true), calc = mats.filter((x) => x.K);
  const ects = { got: valid.reduce((s, x) => s + (x.m.ects || 0), 0), total: calc.reduce((s, x) => s + (x.m.ects || 0), 0) };
  return { mats, mean, valid: valid.length, total: calc.length, ects, pass };
}

const CSS = `
@page{size:A4;margin:16mm 15mm}
*{box-sizing:border-box}
body{margin:0;background:#EEF1F5;color:#1C2633;font:14px/1.5 "Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.bar{position:sticky;top:0;display:flex;gap:10px;align-items:center;justify-content:flex-end;padding:10px 18px;background:#1F3A5F;color:#fff;font:600 14px -apple-system,Segoe UI,sans-serif}
.bar span{margin-right:auto;font-weight:500;opacity:.85}
.bar button{padding:8px 16px;border:0;border-radius:8px;background:#fff;color:#1F3A5F;font:inherit;cursor:pointer}
.page{max-width:210mm;margin:18px auto;padding:16mm 15mm;background:#fff;box-shadow:0 2px 18px rgba(20,35,60,.15)}
header{border-bottom:3px solid #1F3A5F;padding-bottom:10px;margin-bottom:18px}
h1{margin:0;font-size:26px;letter-spacing:.01em;color:#1F3A5F}
header p{margin:4px 0 0;color:#5A6675;font-size:13px}
.sum{display:grid;grid-template-columns:repeat(3,1fr);gap:0;margin-bottom:22px;border:1px solid #D9E1EA}
.sum div{padding:10px 14px;border-right:1px solid #D9E1EA}.sum div:last-child{border-right:0}
.sum small{display:block;font:600 10.5px -apple-system,Segoe UI,sans-serif;text-transform:uppercase;letter-spacing:.07em;color:#5A6675}
.sum b{font-size:24px;font-variant-numeric:tabular-nums}.sum b i{font-style:normal;font-size:13px;color:#5A6675;font-weight:400}
section{break-inside:avoid;margin-bottom:18px}
h2{display:flex;align-items:baseline;gap:10px;margin:0 0 6px;font-size:16px;color:#1C2633}
h2 .ue{font:400 12px -apple-system,Segoe UI,sans-serif;color:#5A6675}
h2 .moy{margin-left:auto;font-variant-numeric:tabular-nums}
h2 .etat{font:600 11px -apple-system,Segoe UI,sans-serif;text-transform:uppercase;letter-spacing:.05em;padding:2px 8px;border:1px solid #D9E1EA;border-radius:99px;color:#5A6675}
h2 .etat.ok{color:#1E8E5A;border-color:#1E8E5A}h2 .etat.ko{color:#B4432F;border-color:#B4432F}
table{width:100%;border-collapse:collapse;table-layout:fixed;font-variant-numeric:tabular-nums}
th.r:nth-child(2),td.r:nth-child(2){width:90px}th.r:nth-child(3),td.r:nth-child(3){width:120px}
th{font:600 10.5px -apple-system,Segoe UI,sans-serif;text-transform:uppercase;letter-spacing:.07em;color:#5A6675;text-align:left;padding:4px 8px;border-bottom:1px solid #1F3A5F}
td{padding:5px 8px;border-bottom:1px solid #E3E9F0}
th.r,td.r{text-align:right}td.none{color:#9AA9BA}
.nocalc{color:#5A6675;font-style:italic;margin:4px 0 0}
footer{margin-top:24px;padding-top:8px;border-top:1px solid #D9E1EA;color:#5A6675;font-size:11.5px}
@media print{body{background:#fff}.bar{display:none}.page{margin:0;padding:0;box-shadow:none;max-width:none}}
`;

export function sheetHtml() {
  const d = sheetData(), today = new Date(), date = today.toLocaleDateString("fr-FR", { dateStyle: "long" });
  const section = (x) => `<section><h2><span>${esc(x.m.nom)}</span>${x.m.ue ? `<span class="ue">${esc(x.m.ue)}</span>` : ""}${x.m.ects ? `<span class="ue">${esc(x.m.ects)} ECTS</span>` : ""}<span class="moy">${x.r ? `<b>${fmtNote(x.r.note)}</b> / 20` : "—"}</span><span class="etat ${x.ok === true ? "ok" : x.ok === false ? "ko" : ""}">${esc(x.etat)}</span></h2>
    ${x.K ? `<table><thead><tr><th>Épreuve</th><th class="r">Coef.</th><th class="r">Note</th></tr></thead><tbody>${x.rows.map((l) => `<tr><td>${esc(l.label)}</td><td class="r">${esc(l.coef)}</td>${l.note === null ? '<td class="r none">—</td>' : `<td class="r">${fmtNote(l.note)} / ${esc(l.max)}</td>`}</tr>`).join("")}</tbody></table>` : `<p class="nocalc">Aucun calculateur de note pour cette matière.</p>`}</section>`;
  const title = `releve-${SET().slug}-${today.toISOString().slice(0, 10)}`;
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>${CSS}</style></head><body>
    <div class="bar"><span>Aperçu du relevé</span><button type="button" onclick="window.print()">Imprimer / Enregistrer en PDF</button></div>
    <div class="page"><header><h1>Relevé de résultats</h1><p>${esc(periodeLabel())} · édité le ${esc(date)}</p></header>
    <div class="sum"><div><small>Moyenne générale</small><b>${d.mean === null ? "—" : fmtNote(d.mean)}</b> <i>/ 20</i></div><div><small>Matières validées</small><b>${d.valid}</b> <i>/ ${d.total}</i></div><div><small>Note de validation</small><b>${fmtNote(d.pass)}</b> <i>/ 20</i></div></div>
    ${d.mats.map(section).join("")}
    ${d.ects.total ? `<p><b>ECTS acquis :</b> ${d.ects.got} / ${d.ects.total}</p>` : ""}
    <footer>Relevé calculé par Révise à partir des notes saisies et des coefficients du calculateur. Ce n'est pas un document officiel de l'université.</footer></div></body></html>`;
}

export function openResultsSheet() {
  const w = window.open("", "_blank");
  if (!w) return false; // fenêtre bloquée par le navigateur
  w.document.open(); w.document.write(sheetHtml()); w.document.close();
  return true;
}
