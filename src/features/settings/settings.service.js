import { sync } from "../../core/services/store.js";
import { client } from "../../core/services/supabase.client.js";
import { mergeSettings } from "./settings.js";

// Réglages de l'utilisateur (table user_settings, une ligne par compte). Si la table ou la ligne
// n'existe pas encore, on renvoie les valeurs de repli : l'application reste utilisable.
export async function loadSettings() {
  if (!sync.client || !sync.user) return mergeSettings(null);
  const { data, error } = await sync.client.from("user_settings").select("config").maybeSingle();
  if (error) { console.warn("loadSettings", error); return mergeSettings(null); }
  return mergeSettings(data?.config);
}

export async function saveSettings(config) {
  const { error } = await client().from("user_settings").upsert({ user_id: sync.user.id, config, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (error) throw error;
}
