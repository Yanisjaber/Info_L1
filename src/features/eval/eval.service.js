import { sync } from "../../core/services/store.js";
import { client } from "../../core/services/supabase.client.js";

// Un eval est une ligne `results` de plus (kind="eval", item_id null) — pas une table à part,
// voir supabase/schema_results_merge.sql.
export async function loadEvals() {
  if (!sync.client || !sync.user) return {};
  const { data, error } = await sync.client.from("results").select("*").eq("kind", "eval");
  if (error) { console.warn("loadEvals", error); return {}; }
  const out = {};
  for (const r of data) out[r.id] = { id: r.id, mid: r.mid, n: r.n, ok: r.ok, score20: r.score20, dur: r.dur, seances: r.seances || {}, items: r.items || [], ts: +new Date(r.updated_at) };
  return out;
}

export async function saveEval(rec) {
  const row = { user_id: sync.user.id, kind: "eval", mid: rec.mid, n: rec.n, ok: rec.ok, score20: rec.score20, dur: rec.dur, seances: rec.seances || {}, items: rec.items || [] };
  if (rec.id) row.id = rec.id;
  const { data, error } = await client().from("results").upsert(row, { onConflict: "user_id,id" }).select().single();
  if (error) throw error;
  return data.id;
}

export async function deleteEval(id) {
  const { error } = await client().from("results").delete().eq("kind", "eval").eq("id", id);
  if (error) throw error;
}
