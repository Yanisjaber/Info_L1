import { sync } from "../../core/services/store.js";
import { client } from "../../core/services/supabase.client.js";

export async function loadCC() {
  if (!sync.client || !sync.user) return { evenements: [], remarques: [] };
  const { data, error } = await sync.client.from("cc_events").select("*").order("date", { ascending: true });
  if (error) { console.warn("loadCC", error); return { evenements: [], remarques: [] }; }
  return { evenements: data.map((r) => ({ id: r.id, matiere: r.matiere, titre: r.titre, date: r.date, poids: r.poids, type: r.type, statut: r.statut, detail: r.detail, edtId: r.edt_id, seances: r.seances || [] })), remarques: [] };
}

export async function saveCCEvent(e) {
  const row = { user_id: sync.user.id, matiere: e.matiere, titre: e.titre || "", date: e.date, poids: e.poids || "", type: e.type || "CC", statut: e.statut || "", detail: e.detail || "", edt_id: e.edtId || null, seances: e.seances || [] };
  if (e.id) row.id = e.id;
  const { data, error } = await client().from("cc_events").upsert(row, { onConflict: "user_id,id" }).select().single();
  if (error) throw error;
  return data.id;
}

export async function deleteCCEvent(id) {
  const { error } = await client().from("cc_events").delete().eq("id", id);
  if (error) throw error;
}
