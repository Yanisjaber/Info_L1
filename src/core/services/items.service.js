import { sync } from "./store.js";
import { client } from "./supabase.client.js";

// Les 3 natures partagent la même table (voir supabase/schema_items.sql) — seuls les champs
// pertinents pour `kind` sont renseignés par `KIND_FIELDS`, le reste reste vide/null en base.
const KIND_FIELDS = {
  qcm: (item) => ({ type: item.type || "unique", q: item.q || "", choix: item.choix || [], rep: item.rep || [], expl: item.expl || "", niveau: item.niveau || 1 }),
  carte: (item) => ({ recto: item.recto || "", verso: item.verso || "" }),
  exercice: (item) => ({ titre: item.titre || "", difficulte: item.difficulte || 1, enonce: item.enonce || "", indice: item.indice || "", corrige: item.corrige || "", type: item.type || "redaction", code_starter: item.codeStarter || "", code_tests: item.codeTests || "", reponse: item.reponse || "", reponses: item.reponses || [], officiel: !!item.officiel }),
};

export async function loadItems(kind) {
  if (!sync.client || !sync.user) return [];
  const { data, error } = await sync.client.from("sujets").select("*").eq("kind", kind);
  if (error) { console.warn("loadItems", kind, error); return []; }
  return data.map((r) => ({
    id: r.id, matiere: r.mid, seance: r.sid,
    type: r.type, q: r.q, choix: r.choix || [], rep: r.rep || [], expl: r.expl, niveau: r.niveau,
    recto: r.recto, verso: r.verso,
    titre: r.titre, difficulte: r.difficulte, enonce: r.enonce, indice: r.indice, corrige: r.corrige,
    codeStarter: r.code_starter || "", codeTests: r.code_tests || "", reponse: r.reponse || "", reponses: r.reponses || [], officiel: !!r.officiel,
  }));
}

export async function saveItem(kind, item) {
  const row = { user_id: sync.user.id, kind, mid: item.matiere, sid: item.seance || null, ...KIND_FIELDS[kind](item) };
  if (item.id) row.id = item.id;
  const { data, error } = await client().from("sujets").upsert(row, { onConflict: "user_id,id" }).select().single();
  if (error) throw error;
  return data.id;
}

export async function deleteItem(kind, id) {
  const { error } = await client().from("sujets").delete().eq("kind", kind).eq("id", id);
  if (error) throw error;
}
