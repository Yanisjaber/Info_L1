import { sync } from "../../core/services/store.js";
import { client } from "../../core/services/supabase.client.js";

// Fichiers de l'utilisateur (PDF de cours, images insérées dans les cours) : stockés dans le bucket
// privé « docs » de Supabase, sous <user_id>/files/…, protégé par les mêmes règles RLS que les
// documents de séance. En base, un fichier est référencé par « storage:files/<dossier>/<nom> »
// (sans le user_id) ; les URLs de téléchargement sont signées et expirent.
export const BUCKET = "docs";
export const REF = "storage:";
const URL_TTL = 7 * 24 * 3600;

export const isRef = (v) => typeof v === "string" && v.startsWith(REF);
const pathOf = (ref) => `${sync.user.id}/${ref.slice(REF.length)}`;

// Un nom accentué ou avec des caractères spéciaux se fait rejeter par Storage (400) : on assainit le
// chemin, le nom d'origine n'est de toute façon pas conservé en base.
export const sanitize = (name) => String(name).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9._-]/g, "_");

export async function uploadFile(file, folder) {
  const ref = `${REF}files/${folder}/${Date.now()}-${sanitize(file.name || "fichier")}`;
  const { error } = await client().storage.from(BUCKET).upload(pathOf(ref), file, { contentType: file.type || undefined });
  if (error) throw error;
  return ref;
}

export async function removeFile(ref) {
  if (!isRef(ref)) return;
  const { error } = await client().storage.from(BUCKET).remove([pathOf(ref)]);
  if (error) console.warn("removeFile", error);
}

// Signe un lot de références -> { ref: url }. En cas d'échec, renvoie ce qui a pu l'être.
export async function signRefs(refs) {
  const out = {};
  if (!sync.client || !sync.user || !refs.length) return out;
  for (let i = 0; i < refs.length; i += 100) {
    const part = refs.slice(i, i + 100);
    const { data, error } = await sync.client.storage.from(BUCKET).createSignedUrls(part.map(pathOf), URL_TTL);
    if (error) { console.warn("signRefs", error); continue; }
    data.forEach((s, k) => { if (s.signedUrl) out[part[k]] = s.signedUrl; });
  }
  return out;
}

// Lit un champ « fichier » de formulaire (voir fileFieldHtml) et renvoie la nouvelle référence + l'ancienne
// à supprimer si elle est remplacée ou retirée.
export async function readFileField(fd, name, folder) {
  const cur = String(fd.get(name) || "") || null;
  const file = fd.get(name + "file");
  if (file && file.size) return { value: await uploadFile(file, folder), old: cur };
  if (fd.get(name + "del")) return { value: null, old: cur };
  return { value: cur, old: null };
}
