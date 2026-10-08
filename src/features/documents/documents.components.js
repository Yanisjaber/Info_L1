import { icon } from "../../core/components/icons.js";
import { esc } from "../../core/utils/dom.js";

const fmtSize = (b) => !b ? "" : b < 1024 ? `${b} o` : b < 1048576 ? `${Math.round(b / 1024)} Ko` : `${(b / 1048576).toFixed(1)} Mo`;

const isHandNote = (d) => d.type === "image/png" && d.nom.startsWith("Note manuscrite");

export function docRowHtml(d) {
  return `<div class="item"><span class="badge">${icon("dl")}</span><div class="sp"><b class="small">${esc(d.nom)}</b><div class="tiny muted">${fmtSize(d.taille)}</div></div>
    ${isHandNote(d) ? `<button class="btn sm" data-a="editnote" data-id="${d.id}" aria-label="Modifier ${esc(d.nom)}">${icon("edit")}</button>` : ""}
    ${d.url ? `<a class="btn sm" href="${d.url}" download="${esc(d.nom)}" target="_blank" rel="noopener">${icon("dl")}</a>` : ""}<button class="btn sm ghost" data-a="deldoc" data-id="${d.id}" data-path="${esc(d.path)}" data-nom="${esc(d.nom)}" aria-label="Supprimer ${esc(d.nom)}">✕</button></div>`;
}
