import { sync } from "./store.js";
import { client } from "./supabase.client.js";

// Une ligne par item = état courant (pas un historique d'événements), avec un lien optionnel vers
// l'éval blanche qui l'a posé (`eval_id`) — supprimer cet eval supprime en cascade (FK, voir
// supabase/schema_results.sql) les résultats d'exercice encore liés, au lieu de laisser des marques
// fantômes comme avant (quand tout vivait dans des blobs jsonb sans traçabilité de provenance).
export async function loadResults() {
  const out = { qcm: {}, cards: {}, exos: {} };
  if (!sync.client || !sync.user) return out;
  const { data, error } = await sync.client.from("results").select("*");
  if (error) { console.warn("loadResults", error); return out; }
  for (const r of data) {
    if (r.kind === "qcm") out.qcm[r.item_id] = { n: r.n || 0, ok: r.ok || 0, last: !!r.last, ts: +new Date(r.updated_at) };
    else if (r.kind === "carte") out.cards[r.item_id] = { box: r.box || 0, n: r.n || 0, ok: r.ok || 0, due: +new Date(r.due), ts: +new Date(r.updated_at) };
    else if (r.kind === "exercice") out.exos[r.item_id] = { v: r.mark, ts: +new Date(r.updated_at) };
  }
  return out;
}

export async function saveResult(kind, itemId, data, evalId = null) {
  const row = { user_id: sync.user.id, item_id: itemId, kind, eval_id: evalId };
  if (kind === "qcm") Object.assign(row, { n: data.n, ok: data.ok, last: data.last });
  else if (kind === "carte") Object.assign(row, { box: data.box, n: data.n, ok: data.ok, due: new Date(data.due).toISOString() });
  else if (kind === "exercice") Object.assign(row, { mark: data.v });
  const { error } = await client().from("results").upsert(row, { onConflict: "user_id,item_id" });
  if (error) throw error;
}
