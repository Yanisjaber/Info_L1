import { M } from "../../core/services/app-data.js";
import { sync } from "../../core/services/store.js";
import { client } from "../../core/services/supabase.client.js";
import { fmt1 } from "../../core/utils/format.js";
import { saveMatiere } from "../matieres/matieres.service.js";
import { calcFor, shareText } from "../notes/grades.js";
import { epreuveOf, removeEpreuve, upsertEpreuve } from "../notes/grading.utils.js";

export async function loadCC() {
  if (!sync.client || !sync.user) return { evenements: [], remarques: [] };
  const { data, error } = await sync.client.from("cc_events").select("*").order("date", { ascending: true });
  if (error) { console.warn("loadCC", error); return { evenements: [], remarques: [] }; }
  return { evenements: data.map((r) => ({ id: r.id, matiere: r.matiere, titre: r.titre, date: r.date, poids: r.poids, type: r.type, statut: r.statut, detail: r.detail, edtId: r.edt_id, epreuve: r.epreuve || null, seances: r.seances || [] })), remarques: [] };
}

// Une échéance reliée à une épreuve du calculateur affiche TOUJOURS le nom et le coef de cette épreuve : ils remplacent le
// titre et le poids saisis à la main, pour qu'ils ne puissent plus contredire le calculateur (un seul nom, un seul coef).
// À appeler une fois les matières chargées.
export function applyEpreuve(evenements) {
  for (const e of evenements) {
    const ep = e.epreuve ? epreuveOf(M(e.matiere)?.grading, e.epreuve) : null;
    if (!ep) continue;
    e.titre = ep.label;
    const share = calcFor(e.matiere)?.epShares?.[e.epreuve];
    if (share !== undefined) e.poids = shareText(share);
  }
}

export async function saveCCEvent(e) {
  const row = { user_id: sync.user.id, matiere: e.matiere, titre: e.titre || "", date: e.date, poids: e.poids || "", type: e.type || "CC", statut: e.statut || "", detail: e.detail || "", edt_id: e.edtId || null, epreuve: e.epreuve || null, seances: e.seances || [] };
  if (e.id) row.id = e.id;
  const { data, error } = await client().from("cc_events").upsert(row, { onConflict: "user_id,id" }).select().single();
  if (error) throw error;
  return data.id;
}

// Crée ou met à jour une échéance ET son épreuve dans le calculateur, d'un seul geste : un CC n'existe jamais sans l'autre.
// `label` est à la fois le titre de l'échéance et le nom de l'épreuve ; `epreuve` : identifiant d'une épreuve existante
// à relier (sinon une nouvelle est créée). Si l'enregistrement de l'échéance échoue, l'épreuve est remise comme avant.
export async function saveCCWithEpreuve({ epreuve, label, weight, max, second, ...ev }) {
  const m = M(ev.matiere);
  if (!m) throw new Error("Matière introuvable");
  const { grading, id } = upsertEpreuve(m.grading, { id: epreuve, label, weight, max, second });
  await saveMatiere({ ...m, grading });
  try {
    return await saveCCEvent({ ...ev, titre: String(label).trim(), poids: `${fmt1(Number(weight))} %`, type: second ? "2e" : "CC", epreuve: id });
  } catch (err) {
    try { await saveMatiere({ ...m }); } catch (e2) { console.warn("Retour en arrière du calculateur impossible", e2); }
    throw err;
  }
}

export async function deleteCCEvent(id) {
  const { error } = await client().from("cc_events").delete().eq("id", id);
  if (error) throw error;
}

// Supprime l'échéance, et si `withEpreuve` aussi son épreuve du calculateur (la note saisie pour elle n'est alors plus comptée).
export async function deleteCCWithEpreuve(ev, withEpreuve) {
  await deleteCCEvent(ev.id);
  const m = M(ev.matiere);
  if (withEpreuve && ev.epreuve && m) await saveMatiere({ ...m, grading: removeEpreuve(m.grading, ev.epreuve) });
}
