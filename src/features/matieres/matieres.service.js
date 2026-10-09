import { sync } from "../../core/services/store.js";
import { client } from "../../core/services/supabase.client.js";

export async function loadMatieres() {
  if (!sync.client || !sync.user) return [];
  const { data, error } = await sync.client.from("matieres").select("*").order("created_at", { ascending: true });
  if (error) { console.warn("loadMatieres", error); return []; }
  return data.map((r) => ({ id: r.id, nom: r.nom, court: r.court, ue: r.ue, couleur: r.couleur, desc: r.description, cc: r.cc, pdfCC: r.pdf_cc, ects: r.ects || 0, periode: r.periode || null, eval: r.eval || { n: 15, minutes: 15 },
    // Configuration du calculateur de note (voir features/notes/grades.js). `undefined` = colonne absente
    // de la base (supabase/schema_grading.sql pas encore exécuté), `null` = pas de calculateur.
    grading: "grading" in r ? r.grading || null : undefined }));
}

export async function loadPeriodes() {
  if (!sync.client || !sync.user) return [];
  const { data, error } = await sync.client.from("periodes").select("*").order("created_at", { ascending: true });
  if (error) { console.warn("loadPeriodes", error); return []; }
  return data.map((r) => ({ id: r.id, nom: r.nom, statut: r.statut }));
}

export async function savePeriode(p) {
  const { error } = await client().from("periodes").upsert({ user_id: sync.user.id, id: p.id, nom: p.nom, statut: p.statut || "actif" }, { onConflict: "user_id,id" });
  if (error) throw error;
}

export async function deletePeriode(id) {
  // Détache d'abord les matières de cette période (elles ne sont pas supprimées).
  const { error: e1 } = await client().from("matieres").update({ periode: null }).eq("periode", id);
  if (e1) throw e1;
  const { error } = await client().from("periodes").delete().eq("id", id);
  if (error) throw error;
}

export async function saveMatiere(m) {
  const { error } = await client().from("matieres").upsert({
    user_id: sync.user.id, id: m.id, nom: m.nom, court: m.court, ue: m.ue || "", couleur: m.couleur || "#1F3A5F",
    description: m.desc || "", cc: m.cc || "", pdf_cc: m.pdfCC || null, ects: m.ects || 0, periode: m.periode || null, eval: m.eval || { n: 15, minutes: 15 },
    // Envoyé seulement si connu : évite une erreur tant que la colonne n'existe pas en base.
    ...(m.grading !== undefined ? { grading: m.grading } : {}),
  }, { onConflict: "user_id,id" });
  if (error) throw error;
}

export async function deleteMatiere(id) {
  // Détache d'abord les créneaux d'EDT qui pointaient sur cette matière (l'EDT n'est pas supprimé).
  const { error: e1 } = await client().from("edt_events").update({ m: null }).eq("m", id);
  if (e1) throw e1;
  const { error } = await client().from("matieres").delete().eq("id", id);
  if (error) throw error;
}
