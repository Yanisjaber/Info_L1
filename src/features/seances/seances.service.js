import { sync } from "../../core/services/store.js";
import { client } from "../../core/services/supabase.client.js";

export async function loadSeances(mid) {
  if (!sync.client || !sync.user) return [];
  const { data, error } = await sync.client.from("seances").select("*").eq("mid", mid).order("date", { ascending: true }).order("numero", { ascending: true });
  if (error) { console.warn("loadSeances", error); return []; }
  return data.map((r) => ({ id: r.id, type: r.type, numero: r.numero, date: r.date, titre: r.titre, resume: r.resume, contenu: r.contenu, pdf: r.pdf_url }));
}

export async function saveSeance(mid, s) {
  const { error } = await client().from("seances").upsert({
    user_id: sync.user.id, mid, id: s.id, type: s.type, numero: s.numero || 1, date: s.date || null,
    titre: s.titre || "", resume: s.resume || "", contenu: s.contenu || "", pdf_url: s.pdf || null,
  }, { onConflict: "user_id,mid,id" });
  if (error) throw error;
}

export async function deleteSeance(mid, id) {
  // Détache d'abord les sujets (QCM/cartes/exercices) et les créneaux d'EDT qui pointaient sur
  // cette séance (pas supprimés).
  const { error: e0 } = await client().from("sujets").update({ sid: null }).eq("mid", mid).eq("sid", id);
  if (e0) throw e0;
  const { error: e1 } = await client().from("edt_events").update({ sid: null }).eq("m", mid).eq("sid", id);
  if (e1) throw e1;
  const { error } = await client().from("seances").delete().eq("mid", mid).eq("id", id);
  if (error) throw error;
}
