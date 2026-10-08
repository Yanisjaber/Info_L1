import { sync } from "../../core/services/store.js";
import { client } from "../../core/services/supabase.client.js";

export async function loadTodos() {
  if (!sync.client || !sync.user) return [];
  const { data, error } = await sync.client.from("todos").select("*").order("date", { ascending: true });
  if (error) { console.warn("loadTodos", error); return []; }
  return data.map((r) => ({ id: r.id, texte: r.texte, date: r.date, done: r.done }));
}

export async function saveTodo(t) {
  const row = { user_id: sync.user.id, texte: t.texte || "", date: t.date, done: !!t.done };
  if (t.id) row.id = t.id;
  const { data, error } = await client().from("todos").upsert(row, { onConflict: "user_id,id" }).select().single();
  if (error) throw error;
  return data.id;
}

export async function setTodoDone(id, done) {
  const { error } = await client().from("todos").update({ done }).eq("id", id);
  if (error) throw error;
}

export async function deleteTodo(id) {
  const { error } = await client().from("todos").delete().eq("id", id);
  if (error) throw error;
}
