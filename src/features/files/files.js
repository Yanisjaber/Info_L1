import { D } from "../../core/services/app-data.js";
import { REF, isRef } from "./files.service.js";

// URL utilisable dans un href/src pour une référence de fichier : fichier du stockage -> URL signée,
// ancien chemin du dépôt (pdf/…, assets/…) ou URL externe -> inchangé.
export const fileUrl = (ref) => (isRef(ref) ? D.files[ref] || "" : ref || "");

const IN_HTML = /storage:files\/[^"'\s<>)]+/g;

// Remplace, dans le HTML d'un cours, les références du stockage par leur URL signée.
export const resolveHtml = (html) => String(html || "").replace(IN_HTML, (r) => D.files[r] || "");

// Toutes les références du stockage utilisées par les données chargées.
export function collectFileRefs() {
  const refs = new Set();
  D.matieres.forEach((m) => { if (isRef(m.pdfCC)) refs.add(m.pdfCC); });
  Object.values(D.content).forEach((c) => c.seances.forEach((s) => {
    if (isRef(s.pdf)) refs.add(s.pdf);
    (String(s.contenu || "").match(IN_HTML) || []).forEach((r) => refs.add(r));
  }));
  return [...refs];
}

export const fileLabel = (ref) => String(ref || "").split("/").pop().replace(/^\d+-/, "");
export { REF };
