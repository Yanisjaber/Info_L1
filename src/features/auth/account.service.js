import { client } from "../../core/services/supabase.client.js";

// Efface tout le contenu du compte (EDT, matières, séances, périodes) — outil de test,
// à retirer plus tard. Ne touche pas à la progression locale (gérée séparément par resetAll).
export async function wipeAccount() {
  const noop = "00000000-0000-0000-0000-000000000000";
  const { error: e0 } = await client().from("cc_events").delete().neq("user_id", noop);
  if (e0) throw e0;
  const { error: e1 } = await client().from("edt_events").delete().neq("user_id", noop);
  if (e1) throw e1;
  const { error: e2 } = await client().from("matieres").delete().neq("user_id", noop);
  if (e2) throw e2;
  const { error: e3 } = await client().from("periodes").delete().neq("user_id", noop);
  if (e3) throw e3;
}
