import { C, D } from "../../core/services/app-data.js";
import { saveMatiere } from "../matieres/matieres.service.js";
import { saveSeance } from "../seances/seances.service.js";
import { REF, sanitize, uploadAt } from "./files.service.js";

// Migration, une fois, des fichiers qui vivaient dans le dépôt du site (pdf/…, assets/…) vers le
// stockage Supabase de l'utilisateur. Chaque fichier est récupéré depuis le site puis envoyé ; les
// références en base ne sont réécrites qu'une fois l'envoi réussi. Relançable sans risque.
const LEGACY = /^(assets|pdf)\/\S+$/;
const IMG = /(src=")((?:assets|pdf)\/[^"]+)(")/g;

const newRef = (p) => `${REF}files/legacy/${p.split("/").map(sanitize).join("/")}`;

export function legacyPaths() {
  const set = new Set();
  D.matieres.forEach((m) => { if (LEGACY.test(m.pdfCC || "")) set.add(m.pdfCC); });
  D.matieres.forEach((m) => C(m.id).seances.forEach((s) => {
    if (LEGACY.test(s.pdf || "")) set.add(s.pdf);
    for (const x of String(s.contenu || "").matchAll(IMG)) set.add(x[2]);
  }));
  return [...set];
}

export async function migrateLegacyFiles(onProgress = () => {}) {
  const paths = legacyPaths(), done = new Map(), failed = [];
  for (const [i, p] of paths.entries()) {
    onProgress(i + 1, paths.length);
    try {
      const r = await fetch(new URL(p, document.baseURI));
      if (!r.ok) throw new Error("HTTP " + r.status);
      await uploadAt(newRef(p), await r.blob());
      done.set(p, newRef(p));
    } catch (err) { failed.push(`${p} (${err.message})`); }
  }
  let nm = 0, ns = 0;
  for (const m of D.matieres) {
    if (done.has(m.pdfCC)) { await saveMatiere({ ...m, pdfCC: done.get(m.pdfCC) }); nm++; }
    for (const s of C(m.id).seances) {
      const contenu = String(s.contenu || "").replace(IMG, (all, a, p, c) => (done.has(p) ? a + done.get(p) + c : all));
      const pdf = done.has(s.pdf) ? done.get(s.pdf) : s.pdf;
      if (contenu !== (s.contenu || "") || pdf !== s.pdf) { await saveSeance(m.id, { ...s, contenu, pdf }); ns++; }
    }
  }
  return { fichiers: done.size, matieres: nm, seances: ns, echecs: failed };
}
