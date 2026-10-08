import { sync } from "../../core/services/store.js";
import { client } from "../../core/services/supabase.client.js";

// Bucket privé "docs" : chaque fichier vit sous <user_id>/<mid>/<sid>/<horodatage>-<nom>, protégé par
// RLS Storage. Les URLs de téléchargement sont signées (expirent) plutôt que publiques.
const DOC_URL_TTL = 3600;

// Version allégée de loadSeanceDocs : juste les sid ayant au moins un document, sans signer d'URLs.
// Sert à savoir en un coup d'œil (EDT, accueil) si une séance a déjà de la matière déposée, sans
// attendre l'ouverture de sa page.
export async function loadSeanceDocSids() {
  if (!sync.client || !sync.user) return new Set();
  const { data, error } = await sync.client.from("seance_docs").select("sid");
  if (error) { console.warn("loadSeanceDocSids", error); return new Set(); }
  return new Set(data.map((r) => r.sid));
}

export async function loadSeanceDocs(mid, sid) {
  if (!sync.client || !sync.user) return [];
  const { data, error } = await sync.client.from("seance_docs").select("*").eq("mid", mid).eq("sid", sid).order("created_at", { ascending: true });
  if (error) { console.warn("loadSeanceDocs", error); return []; }
  const paths = data.map((r) => r.path);
  let urls = {};
  if (paths.length) {
    const { data: signed, error: e2 } = await sync.client.storage.from("docs").createSignedUrls(paths, DOC_URL_TTL);
    if (!e2) signed.forEach((s, i) => { urls[paths[i]] = s.signedUrl; });
  }
  return data.map((r) => ({ id: r.id, mid: r.mid, sid: r.sid, nom: r.nom, path: r.path, taille: r.taille, type: r.type, url: urls[r.path] || null, strokes: r.strokes || null, paper: r.paper || null }));
}

// Un nom de fichier accentué ou avec des caractères spéciaux (ex. "2èmes-V2018.pdf") peut arriver
// corrompu une fois mis dans l'URL de la requête de Storage et se faire rejeter avec une 400 — on
// n'utilise donc jamais `file.name` tel quel dans le chemin de stockage. Le nom d'origine reste
// affiché normalement : il est gardé intact dans la colonne `nom`, seul le chemin est assaini.
function sanitizeFilename(name) {
  const stripped = name.normalize("NFD").replace(/[̀-ͯ]/g, "");
  return stripped.replace(/[^A-Za-z0-9._-]/g, "_");
}

// `vector` (optionnel) = { strokes, paper } : présent uniquement pour une note manuscrite, permet
// de la rouvrir en mode vectoriel (trait par trait) au lieu de recharger juste l'image aplatie.
export async function uploadSeanceDoc(mid, sid, file, vector = null) {
  const c = client();
  const path = `${sync.user.id}/${mid}/${sid}/${Date.now()}-${sanitizeFilename(file.name)}`;
  const { error: e1 } = await c.storage.from("docs").upload(path, file);
  if (e1) throw e1;
  const { error: e2 } = await c.from("seance_docs").insert({ user_id: sync.user.id, mid, sid, nom: file.name, path, taille: file.size, type: file.type || null, strokes: vector?.strokes || null, paper: vector?.paper || null });
  if (e2) throw e2;
}

// Récupère un document via l'API authentifiée (pas une simple URL signée chargée en <img>) et le
// rend comme une URL blob: locale — nécessaire pour pouvoir la redessiner sur un <canvas> sans le
// "tainter" (une image chargée depuis un domaine externe, même avec crossOrigin, bloque toBlob()
// silencieusement si Supabase ne renvoie pas d'en-tête CORS pour ce fichier précis).
export async function getSeanceDocBlobUrl(path) {
  const { data, error } = await client().storage.from("docs").download(path);
  if (error) throw error;
  return URL.createObjectURL(data);
}

// Remplace le contenu d'un document déjà déposé (même chemin, même ligne) — utilisé pour
// reprendre/compléter une page manuscrite existante sans créer un doublon.
export async function updateSeanceDoc(doc, file, vector = null) {
  const { error: e1 } = await client().storage.from("docs").upload(doc.path, file, { upsert: true });
  if (e1) throw e1;
  const patch = { taille: file.size };
  if (vector) { patch.strokes = vector.strokes; patch.paper = vector.paper; }
  const { error: e2 } = await client().from("seance_docs").update(patch).eq("id", doc.id);
  if (e2) throw e2;
}

export async function deleteSeanceDoc(doc) {
  const { error: e1 } = await client().storage.from("docs").remove([doc.path]);
  if (e1) throw e1;
  const { error: e2 } = await client().from("seance_docs").delete().eq("id", doc.id);
  if (e2) throw e2;
}
