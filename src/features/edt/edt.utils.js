import { C, D, M, sKey } from "../../core/services/app-data.js";
import { state } from "../../core/services/store.js";
import { esc } from "../../core/utils/dom.js";
import { daysUntil, fmtLong, startOfDay } from "../../core/utils/format.js";
import { edtToSeanceType, edtTypeLabel } from "../settings/settings.js";

export const pd = (d, hm) => { const [y, m, dd] = d.split("-").map(Number), [h, mi] = (hm || "0:0").split(":").map(Number); return new Date(y, m - 1, dd, h, mi); };

export const toMin = (hm) => { const [h, m] = (hm || "0:0").split(":").map(Number); return h * 60 + m; };

export const edtOf = (iso) => D.edt.events.filter((e) => e.d === iso).sort((a, b) => (a.s || "").localeCompare(b.s || ""));

export const edtLabel = (e) => edtTypeLabel(e.t);

export const edtColor = (e) => (e.m && M(e.m) ? M(e.m).couleur : "var(--muted)");

export const edtName = (e) => (e.m && M(e.m) ? M(e.m).court : e.t);

export const edtMeta = (e) => [e.r, e.p, e.g].filter(Boolean).map(esc).join(" · ");

export const edtMetaRaw = (e) => [e.r, e.p, e.g].filter(Boolean).join(" · ");

export const edtState = (e, now) => (e.e ? (pd(e.d, e.e) <= now ? "past" : pd(e.d, e.s) <= now ? "live" : "") : "");

// Une séance peut exister en base (créée vide dès le premier clic sur "Rédiger ce cours", via
// edtDraft — voir plus bas) sans qu'aucun cours y ait jamais été rédigé : le seul fait qu'une ligne
// existe ne veut rien dire pour l'utilisateur, seul `contenu` compte.
export const seanceHasContent = (s) => !!(s?.contenu && s.contenu.replace(/<[^>]+>/g, "").trim());

// A-t-on déjà déposé de la matière (document, note manuscrite ou tapée) pour cette séance, même si
// elle n'a pas encore été rédigée (`contenu` vide) ? Sert à distinguer "rien n'a été fait" de
// "j'ai de quoi écrire le cours, il ne reste qu'à le rédiger".
export const seanceHasMaterial = (mid, s) => !!(s && (D.docSids.has(s.id) || (state.seanceNotes[sKey(mid, s.id)]?.text || "").trim()));

// Associe un créneau de l'EDT à la séance de cours correspondante (même matière, même date, même
// type). Un CC n'est plus un type d'EDT à part (voir e.cc) : c'est un vrai créneau Cours/TD/TP qui
// se comporte exactement pareil pour ce qui est de s'y attacher une séance. La correspondance
// créneau -> type de séance (ex. Cours -> CM) vient des réglages de l'utilisateur (edtToSeanceType).

// `e.sid` (lien explicite, posé à la création de la séance — voir "creerseance") prime toujours.
// Le matching par date+type+matière ne reste qu'un repli pour les créneaux pas encore liés
// (anciens essais .ics, ou créés avant l'ajout de sid).
export function seanceFor(e) {
  const want = edtToSeanceType(e.t);
  if (!want || !e.m) return null;
  const c = C(e.m);
  if (!c) return null;
  if (e.sid) { const s = c.seances.find((x) => x.id === e.sid); if (s) return s; }
  const cands = c.seances.filter((s) => s.date === e.d && s.type === want).sort((a, b) => a.numero - b.numero);
  if (!cands.length) return null;
  if (cands.length === 1) return cands[0];
  const sameDay = D.edt.events.filter((x) => x.d === e.d && x.m === e.m && x.t === e.t).sort((a, b) => toMin(a.s) - toMin(b.s));
  return cands[sameDay.indexOf(e)] ?? cands[0];
}

export function draftHrefFor(e) {
  const want = edtToSeanceType(e.t);
  if (!want || !e.m) return null;
  return `#/todo?id=${e.id}&m=${e.m}&d=${e.d}&t=${encodeURIComponent(e.t)}&s=${e.s}&e=${e.e}&r=${encodeURIComponent(e.r || "")}&p=${encodeURIComponent(e.p || "")}&g=${encodeURIComponent(e.g || "")}`;
}

export const edtRel = (iso) => { const d = daysUntil(iso); return d === 0 ? "aujourd'hui" : d === 1 ? "demain" : fmtLong(iso); };

// Nombre de créneaux visés dans la carte "Aujourd'hui" : si la journée en a moins, on complète
// avec les prochains cours à venir (jusqu'à EDT_UPCOMING_MAX) pour ne jamais laisser la carte
// à moitié vide — sans jamais dépasser EDT_HOME_MAX créneaux au total (journée + prochains cours).
export const EDT_HOME_MAX = 5, EDT_UPCOMING_MAX = 3;

export const mondayOf = (d) => { const x = startOfDay(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };

export const EDT_HOUR_PX = 64;
