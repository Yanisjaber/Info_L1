import { sync } from "../../core/services/store.js";
import { client } from "../../core/services/supabase.client.js";
import { edtDefaultType } from "../settings/settings.js";

export async function loadEdt() {
  if (!sync.client || !sync.user) return { events: [] };
  const { data, error } = await sync.client.from("edt_events").select("*").order("d", { ascending: true }).order("s", { ascending: true });
  if (error) { console.warn("loadEdt", error); return { events: [] }; }
  return { source: "Import personnel", events: data.map((r) => ({ id: r.id, d: r.d, s: (r.s || "").slice(0, 5), e: (r.e || "").slice(0, 5), t: r.t, m: r.m, sid: r.sid, r: r.r, p: r.p, g: r.g, n: r.n, cc: r.cc, allday: r.allday })) };
}

export async function clearEdt() {
  const { error } = await client().from("edt_events").delete().neq("user_id", "00000000-0000-0000-0000-000000000000");
  if (error) throw error;
}

// Création/modification manuelle d'un seul créneau (bouton "+" ou crayon sur la grille) —
// à distinguer de saveEdtEvents (import .ics en masse, pas d'id, que des insert).
export async function saveEdtEvent(ev) {
  const row = { user_id: sync.user.id, d: ev.d, s: ev.s || "00:00", e: ev.e || "00:00", t: ev.t || edtDefaultType(), m: ev.m || null, sid: ev.sid || null, r: ev.r || null, p: ev.p || null, g: ev.g || null, n: ev.n || null, cc: !!ev.cc, allday: !!ev.allday };
  if (ev.id) row.id = ev.id;
  const { data, error } = await client().from("edt_events").upsert(row, { onConflict: "user_id,id" }).select().single();
  if (error) throw error;
  return data.id;
}

export async function deleteEdtEvent(id) {
  const { error } = await client().from("edt_events").delete().eq("id", id);
  if (error) throw error;
}

export async function saveEdtEvents(rows) {
  if (!rows.length) return;
  const payload = rows.map((x) => ({ user_id: sync.user.id, d: x.d, s: x.s, e: x.e, t: x.t, m: x.m || null, r: x.r || null, p: x.p || null, g: x.g || null, n: x.n || null, cc: !!x.cc, allday: !!x.allday }));
  for (let i = 0; i < payload.length; i += 500) {
    const { error } = await client().from("edt_events").insert(payload.slice(i, i + 500));
    if (error) throw error;
  }
}
