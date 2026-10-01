// Matières & séances : contenu des cours, par utilisateur (Supabase).
import { sync } from "./store.js";

function client() {
  if (!sync.client || !sync.user) throw new Error("Non connecté.");
  return sync.client;
}

export async function loadMatieres() {
  if (!sync.client || !sync.user) return [];
  const { data, error } = await sync.client.from("matieres").select("*").order("created_at", { ascending: true });
  if (error) { console.warn("loadMatieres", error); return []; }
  return data.map((r) => ({ id: r.id, nom: r.nom, court: r.court, ue: r.ue, couleur: r.couleur, desc: r.description, cc: r.cc, pdfCC: r.pdf_cc, ects: r.ects || 0, periode: r.periode || null, eval: r.eval || { n: 15, minutes: 15 } }));
}

// ───────────────────────── Périodes (semestres, années…) ─────────────────────────
export async function loadPeriodes() {
  if (!sync.client || !sync.user) return [];
  const { data, error } = await sync.client.from("periodes").select("*").order("created_at", { ascending: true });
  if (error) { console.warn("loadPeriodes", error); return []; }
  return data.map((r) => ({ id: r.id, nom: r.nom, statut: r.statut }));
}

export async function savePeriode(p) {
  const { error } = await client().from("periodes").upsert({ user_id: sync.user.id, id: p.id, nom: p.nom, statut: p.statut || "actif" }, { onConflict: "user_id,id" });
  if (error) throw error;
}

export async function deletePeriode(id) {
  // Détache d'abord les matières de cette période (elles ne sont pas supprimées).
  const { error: e1 } = await client().from("matieres").update({ periode: null }).eq("periode", id);
  if (e1) throw e1;
  const { error } = await client().from("periodes").delete().eq("id", id);
  if (error) throw error;
}

export async function loadSeances(mid) {
  if (!sync.client || !sync.user) return [];
  const { data, error } = await sync.client.from("seances").select("*").eq("mid", mid).order("date", { ascending: true }).order("numero", { ascending: true });
  if (error) { console.warn("loadSeances", error); return []; }
  return data.map((r) => ({ id: r.id, type: r.type, numero: r.numero, date: r.date, titre: r.titre, resume: r.resume, contenu: r.contenu, pdf: r.pdf_url }));
}

export async function saveMatiere(m) {
  const { error } = await client().from("matieres").upsert({
    user_id: sync.user.id, id: m.id, nom: m.nom, court: m.court, ue: m.ue || "", couleur: m.couleur || "#1F3A5F",
    description: m.desc || "", cc: m.cc || "", pdf_cc: m.pdfCC || null, ects: m.ects || 0, periode: m.periode || null, eval: m.eval || { n: 15, minutes: 15 },
  }, { onConflict: "user_id,id" });
  if (error) throw error;
}

export async function deleteMatiere(id) {
  // Détache d'abord les créneaux d'EDT qui pointaient sur cette matière (l'EDT n'est pas supprimé).
  const { error: e1 } = await client().from("edt_events").update({ m: null }).eq("m", id);
  if (e1) throw e1;
  const { error } = await client().from("matieres").delete().eq("id", id);
  if (error) throw error;
}

export async function saveSeance(mid, s) {
  const { error } = await client().from("seances").upsert({
    user_id: sync.user.id, mid, id: s.id, type: s.type, numero: s.numero || 1, date: s.date || null,
    titre: s.titre || "", resume: s.resume || "", contenu: s.contenu || "", pdf_url: s.pdf || null,
  }, { onConflict: "user_id,mid,id" });
  if (error) throw error;
}

export async function deleteSeance(mid, id) {
  const { error } = await client().from("seances").delete().eq("mid", mid).eq("id", id);
  if (error) throw error;
}

// ───────────────────────── Espace de travail (documents déposés par séance) ─────────────────────────
// Bucket privé "docs" : chaque fichier vit sous <user_id>/<mid>/<sid>/<horodatage>-<nom>, protégé par
// RLS Storage. Les URLs de téléchargement sont signées (expirent) plutôt que publiques.
const DOC_URL_TTL = 3600;
export async function loadSeanceDocs(mid, sid) {
  if (!sync.client || !sync.user) return [];
  const { data, error } = await sync.client.from("seance_docs").select("*").eq("mid", mid).eq("sid", sid).order("created_at", { ascending: true });
  if (error) { console.warn("loadSeanceDocs", error); return []; }
  const paths = data.map((r) => r.path);
  let urls = {};
  if (paths.length) {
    const { data: signed, error: e2 } = await sync.client.storage.from("docs").createSignedUrls(paths, DOC_URL_TTL);
    if (!e2) signed.forEach((s, i) => { urls[paths[i]] = s.signedUrl; });
  }
  return data.map((r) => ({ id: r.id, mid: r.mid, sid: r.sid, nom: r.nom, path: r.path, taille: r.taille, type: r.type, url: urls[r.path] || null, strokes: r.strokes || null, paper: r.paper || null }));
}

// `vector` (optionnel) = { strokes, paper } : présent uniquement pour une note manuscrite, permet
// de la rouvrir en mode vectoriel (trait par trait) au lieu de recharger juste l'image aplatie.
export async function uploadSeanceDoc(mid, sid, file, vector = null) {
  const path = `${sync.user.id}/${mid}/${sid}/${Date.now()}-${file.name}`;
  const { error: e1 } = await client().storage.from("docs").upload(path, file);
  if (e1) throw e1;
  const { error: e2 } = await client().from("seance_docs").insert({ user_id: sync.user.id, mid, sid, nom: file.name, path, taille: file.size, type: file.type || null, strokes: vector?.strokes || null, paper: vector?.paper || null });
  if (e2) throw e2;
}

// Récupère un document via l'API authentifiée (pas une simple URL signée chargée en <img>) et le
// rend comme une URL blob: locale — nécessaire pour pouvoir la redessiner sur un <canvas> sans le
// "tainter" (une image chargée depuis un domaine externe, même avec crossOrigin, bloque toBlob()
// silencieusement si Supabase ne renvoie pas d'en-tête CORS pour ce fichier précis).
export async function getSeanceDocBlobUrl(path) {
  const { data, error } = await client().storage.from("docs").download(path);
  if (error) throw error;
  return URL.createObjectURL(data);
}

// Remplace le contenu d'un document déjà déposé (même chemin, même ligne) — utilisé pour
// reprendre/compléter une page manuscrite existante sans créer un doublon.
export async function updateSeanceDoc(doc, file, vector = null) {
  const { error: e1 } = await client().storage.from("docs").upload(doc.path, file, { upsert: true });
  if (e1) throw e1;
  const patch = { taille: file.size };
  if (vector) { patch.strokes = vector.strokes; patch.paper = vector.paper; }
  const { error: e2 } = await client().from("seance_docs").update(patch).eq("id", doc.id);
  if (e2) throw e2;
}

export async function deleteSeanceDoc(doc) {
  const { error: e1 } = await client().storage.from("docs").remove([doc.path]);
  if (e1) throw e1;
  const { error: e2 } = await client().from("seance_docs").delete().eq("id", doc.id);
  if (e2) throw e2;
}

// ───────────────────────── QCM, cartes, exercices ─────────────────────────
export async function loadQCM() {
  if (!sync.client || !sync.user) return [];
  const { data, error } = await sync.client.from("qcm_items").select("*");
  if (error) { console.warn("loadQCM", error); return []; }
  return data.map((r) => ({ id: r.id, matiere: r.matiere, seance: r.seance, type: r.type, q: r.q, choix: r.choix || [], rep: r.rep || [], expl: r.expl, niveau: r.niveau }));
}

export async function saveQCM(item) {
  const row = { user_id: sync.user.id, matiere: item.matiere, seance: item.seance || null, type: item.type || "unique", q: item.q || "", choix: item.choix || [], rep: item.rep || [], expl: item.expl || "", niveau: item.niveau || 1 };
  if (item.id) row.id = item.id;
  const { data, error } = await client().from("qcm_items").upsert(row, { onConflict: "user_id,id" }).select().single();
  if (error) throw error;
  return data.id;
}

export async function deleteQCM(id) {
  const { error } = await client().from("qcm_items").delete().eq("id", id);
  if (error) throw error;
}

export async function loadFlashcards() {
  if (!sync.client || !sync.user) return [];
  const { data, error } = await sync.client.from("flashcards").select("*");
  if (error) { console.warn("loadFlashcards", error); return []; }
  return data.map((r) => ({ id: r.id, matiere: r.matiere, seance: r.seance, recto: r.recto, verso: r.verso }));
}

export async function saveFlashcard(item) {
  const row = { user_id: sync.user.id, matiere: item.matiere, seance: item.seance || null, recto: item.recto || "", verso: item.verso || "" };
  if (item.id) row.id = item.id;
  const { data, error } = await client().from("flashcards").upsert(row, { onConflict: "user_id,id" }).select().single();
  if (error) throw error;
  return data.id;
}

export async function deleteFlashcard(id) {
  const { error } = await client().from("flashcards").delete().eq("id", id);
  if (error) throw error;
}

export async function loadExercices() {
  if (!sync.client || !sync.user) return [];
  const { data, error } = await sync.client.from("exercices").select("*");
  if (error) { console.warn("loadExercices", error); return []; }
  return data.map((r) => ({ id: r.id, matiere: r.matiere, seance: r.seance, titre: r.titre, difficulte: r.difficulte, enonce: r.enonce, indice: r.indice, corrige: r.corrige, type: r.type || "redaction", codeStarter: r.code_starter || "", codeTests: r.code_tests || "", reponse: r.reponse || "" }));
}

export async function saveExercice(item) {
  const row = { user_id: sync.user.id, matiere: item.matiere, seance: item.seance || null, titre: item.titre || "", difficulte: item.difficulte || 1, enonce: item.enonce || "", indice: item.indice || "", corrige: item.corrige || "", type: item.type || "redaction", code_starter: item.codeStarter || "", code_tests: item.codeTests || "", reponse: item.reponse || "" };
  if (item.id) row.id = item.id;
  const { data, error } = await client().from("exercices").upsert(row, { onConflict: "user_id,id" }).select().single();
  if (error) throw error;
  return data.id;
}

export async function deleteExercice(id) {
  const { error } = await client().from("exercices").delete().eq("id", id);
  if (error) throw error;
}

// ───────────────────────── Emploi du temps ─────────────────────────
export async function loadEdt() {
  if (!sync.client || !sync.user) return { events: [] };
  const { data, error } = await sync.client.from("edt_events").select("*").order("d", { ascending: true }).order("s", { ascending: true });
  if (error) { console.warn("loadEdt", error); return { events: [] }; }
  return { source: "Import personnel", events: data.map((r) => ({ id: r.id, d: r.d, s: (r.s || "").slice(0, 5), e: (r.e || "").slice(0, 5), t: r.t, m: r.m, r: r.r, p: r.p, g: r.g, n: r.n, allday: r.allday })) };
}

export async function clearEdt() {
  const { error } = await client().from("edt_events").delete().neq("user_id", "00000000-0000-0000-0000-000000000000");
  if (error) throw error;
}

// Corrige un créneau importé à tort (ex. « CC » détecté sur un mot comme « Test » qui n'en
// était pas un) : change son type sans toucher au reste de l'emploi du temps.
export async function updateEdtEvent(id, patch) {
  const { error } = await client().from("edt_events").update(patch).eq("id", id);
  if (error) throw error;
}

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

// ───────────────────────── Calendrier des CC ─────────────────────────
export async function loadCC() {
  if (!sync.client || !sync.user) return { evenements: [], remarques: [] };
  const { data, error } = await sync.client.from("cc_events").select("*").order("date", { ascending: true });
  if (error) { console.warn("loadCC", error); return { evenements: [], remarques: [] }; }
  return { evenements: data.map((r) => ({ id: r.id, matiere: r.matiere, titre: r.titre, date: r.date, poids: r.poids, type: r.type, statut: r.statut, detail: r.detail })), remarques: [] };
}

export async function saveCCEvent(e) {
  const row = { user_id: sync.user.id, matiere: e.matiere, titre: e.titre || "", date: e.date, poids: e.poids || "", type: e.type || "CC", statut: e.statut || "", detail: e.detail || "" };
  if (e.id) row.id = e.id;
  const { data, error } = await client().from("cc_events").upsert(row, { onConflict: "user_id,id" }).select().single();
  if (error) throw error;
  return data.id;
}

export async function deleteCCEvent(id) {
  const { error } = await client().from("cc_events").delete().eq("id", id);
  if (error) throw error;
}

// ───────────────────────── To-do list ─────────────────────────
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

export async function saveEdtEvents(rows) {
  if (!rows.length) return;
  const payload = rows.map((x) => ({ user_id: sync.user.id, d: x.d, s: x.s, e: x.e, t: x.t, m: x.m || null, r: x.r || null, p: x.p || null, g: x.g || null, n: x.n || null, allday: !!x.allday }));
  for (let i = 0; i < payload.length; i += 500) {
    const { error } = await client().from("edt_events").insert(payload.slice(i, i + 500));
    if (error) throw error;
  }
}

// ── Import d'un fichier .ics (export de calendrier universitaire type Celcat) ──
function unfoldIcs(text) {
  return text.replace(/\r\n/g, "\n").replace(/\n[ \t]/g, "");
}
function parseIcsEvents(text) {
  const lines = unfoldIcs(text).split("\n");
  const out = [];
  let cur = null;
  for (const raw of lines) {
    const line = raw.trim();
    if (line === "BEGIN:VEVENT") cur = {};
    else if (line === "END:VEVENT") { if (cur) out.push(cur); cur = null; }
    else if (cur) {
      const idx = line.indexOf(":");
      if (idx < 0) continue;
      const key = line.slice(0, idx).split(";")[0].toUpperCase();
      const val = line.slice(idx + 1);
      if (key === "EXDATE") (cur.EXDATE ||= []).push(...val.split(","));
      else cur[key] = val;
    }
  }
  return out;
}
// Développe une règle de récurrence hebdomadaire (RRULE:FREQ=WEEKLY...) en une date par
// occurrence. De nombreux emplois du temps décrivent un TD/TP répété chaque semaine comme
// un seul évènement récurrent plutôt qu'un évènement par séance : sans ça, seule la toute
// première occurrence serait importée.
const DAY_CODES = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
function icsDateOnly(v) {
  const m = /^(\d{4})(\d{2})(\d{2})/.exec(v || "");
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}
function expandRecurrence(baseDateStr, rruleStr, exdates) {
  const params = {};
  String(rruleStr || "").split(";").forEach((p) => { const [k, v] = p.split("="); if (k) params[k.toUpperCase()] = v; });
  if ((params.FREQ || "").toUpperCase() !== "WEEKLY") return [baseDateStr]; // autres fréquences : hors scope, on garde juste la 1re date
  const interval = Math.max(1, +params.INTERVAL || 1);
  const [by, bm, bd] = baseDateStr.split("-").map(Number);
  const base = new Date(by, bm - 1, bd);
  const days = params.BYDAY ? params.BYDAY.split(",").map((s) => DAY_CODES[s.trim().slice(-2)]).filter((n) => n !== undefined) : [base.getDay()];
  let limitDate = null, limitCount = null;
  if (params.UNTIL) { const ds = icsDateOnly(params.UNTIL); if (ds) { const [uy, um, ud] = ds.split("-").map(Number); limitDate = new Date(uy, um - 1, ud); } }
  if (params.COUNT) limitCount = +params.COUNT;
  const excluded = new Set((exdates || []).map(icsDateOnly).filter(Boolean));
  const pad = (n) => String(n).padStart(2, "0");
  const weekStart = new Date(base); weekStart.setDate(weekStart.getDate() - base.getDay());
  const out = [];
  for (let w = 0; w < 400; w += interval) {
    const thisWeek = new Date(weekStart); thisWeek.setDate(thisWeek.getDate() + w * 7);
    for (const dow of days) {
      const occ = new Date(thisWeek); occ.setDate(occ.getDate() + dow);
      if (occ < base) continue;
      if (limitDate && occ > limitDate) return out.length ? out : [baseDateStr];
      const ds = `${occ.getFullYear()}-${pad(occ.getMonth() + 1)}-${pad(occ.getDate())}`;
      if (!excluded.has(ds)) out.push(ds);
      if (limitCount && out.length >= limitCount) return out;
    }
    if (!limitDate && !limitCount && w > 60) break; // pas de fin définie : ~1 an, garde-fou
  }
  return out.length ? out : [baseDateStr];
}
function icsDate(v) {
  if (!v) return null;
  // Un « Z » final veut dire que l'heure est en UTC (ex. 20261007T083000Z) : il faut la
  // convertir vers l'heure locale, sinon tout apparaît décalé (2h en ce moment, heure d'été).
  // Sans « Z » (avec ou sans TZID), l'heure du fichier est déjà l'heure locale à utiliser telle quelle.
  const m = /^(\d{4})(\d{2})(\d{2})(T(\d{2})(\d{2})(\d{2})?(Z)?)?/.exec(v);
  if (!m) return null;
  if (!m[4]) return { d: `${m[1]}-${m[2]}-${m[3]}`, time: null, allday: true };
  const pad = (n) => String(n).padStart(2, "0");
  if (m[8]) {
    const utc = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[5], +m[6], +(m[7] || 0)));
    return { d: `${utc.getFullYear()}-${pad(utc.getMonth() + 1)}-${pad(utc.getDate())}`, time: `${pad(utc.getHours())}:${pad(utc.getMinutes())}`, allday: false };
  }
  return { d: `${m[1]}-${m[2]}-${m[3]}`, time: `${m[5]}:${m[6]}`, allday: false };
}
const TYPE_KEYWORDS = [
  [/\b(CC\d*|EXAMEN|PARTIEL|CONTR[OÔ]LE|DEVOIR SURVEILL[EÉ]|DS|TEST)\b/i, "CC"],
  [/\bR[EÉ]UNION\b/i, "Réunion"],
  [/\bTD\b/i, "TD"],
  [/\bTP\b/i, "TP"],
  [/\b(F[EÉ]RI[EÉ]|FERMETURE)\b/i, "Férié"],
];
// La description contient souvent des notes informatives (« CC1 sem 41 + 46... ») qui
// annoncent des examens à venir SANS que la séance elle-même en soit une : le type « CC »
// ne doit donc se déclencher que si le mot apparaît dans le résumé, pas juste en note.
function guessType(summary, description) {
  for (const [re, t] of TYPE_KEYWORDS) {
    if (t === "CC") { if (re.test(summary || "")) return t; continue; }
    if (re.test(`${summary || ""} ${description || ""}`)) return t;
  }
  return "Cours";
}
// Retire le suffixe « type de séance » du résumé pour ne garder que le nom de la matière
// (ex. « Bas - Réunion » → « Bas », « Devenir étudiant - Cours/TD » → « Devenir étudiant »).
const TITRE_SUFFIX = /[-–—:]\s*(Cours\/TD|Cours\/TP|TD\/TP|Cours magistral|R[ée]union|Contr[ôo]le(?:\s+continu)?|Examen|Partiel|Test|TD|TP|CM|CC\d*|Cours)\s*\d*\s*$/i;
function guessTitle(summary) {
  let s = String(summary || "");
  let prev;
  do { prev = s; s = s.replace(TITRE_SUFFIX, "").trim(); } while (s !== prev && s);
  return s || summary || "Cours";
}
function unescapeIcsText(s) {
  return String(s || "").replace(/\\n/gi, " ").replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\\\/g, "\\").trim();
}

// Regroupe une liste de créneaux normalisés en résumé par matière (utilisé par l'import
// .ics et par l'analyse de capture d'écran, qui produisent tous les deux cette forme).
function summarizeEvents(events) {
  events.sort((a, b) => (a.d + a.s).localeCompare(b.d + b.s));
  const byTitre = new Map();
  for (const e of events) {
    if (!e.titre) continue;
    if (!byTitre.has(e.titre)) byTitre.set(e.titre, { nom: e.titre, cm: 0, td: 0, tp: 0 });
    const c = byTitre.get(e.titre);
    if (e.t === "Cours") c.cm++; else if (e.t === "TD") c.td++; else if (e.t === "TP") c.tp++;
  }
  // Les CC n'ont pas toujours de titre de matière clair : on les compte à part.
  const ccCount = events.filter((e) => e.t === "CC").length;
  const dates = events.map((e) => e.d).sort();
  return { events, courses: [...byTitre.values()].sort((a, b) => a.nom.localeCompare(b.nom)), ccCount, range: dates.length ? [dates[0], dates[dates.length - 1]] : null };
}

// Analyse un fichier .ics et renvoie un résumé par matière détectée + les créneaux normalisés.
export function analyzeIcs(text) {
  const raw = parseIcsEvents(text);
  const events = [];
  for (const ev of raw) {
    const start = icsDate(ev.DTSTART), end = icsDate(ev.DTEND);
    if (!start) continue;
    const summary = unescapeIcsText(ev.SUMMARY);
    const description = unescapeIcsText(ev.DESCRIPTION);
    const location = unescapeIcsText(ev.LOCATION);
    const type = guessType(summary, description);
    const titre = type === "CC" || type === "Férié" ? null : guessTitle(summary);
    const dates = ev.RRULE ? expandRecurrence(start.d, ev.RRULE, ev.EXDATE) : [start.d];
    for (const d of dates) {
      events.push({ d, s: start.time || "00:00", e: (end && end.time) || start.time || "23:59", t: type, titre, r: location || null, n: type === "CC" ? summary : null, allday: start.allday });
    }
  }
  return summarizeEvents(events);
}

const PALETTE = ["#1F3A5F", "#2E7D6B", "#7A5FB0", "#C28A1E", "#3457A6", "#2F8FBF", "#C0507F", "#B4432F", "#4B6B3A", "#8A5A44"];
function slugifyName(s, existing) {
  const base = String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 24) || "matiere";
  let id = base, i = 2;
  while (existing.has(id)) id = `${base}-${i++}`;
  return id;
}

// Crée les matières manquantes détectées dans l'analyse, puis enregistre tous les créneaux.
export async function commitIcsImport(analysis, currentMatieres) {
  // On indexe par nom ET par nom court : une matière peut avoir été renommée en un nom plus
  // complet après sa création (ex. « Bas » -> « Bas — Systèmes et Architecture ») alors que le
  // titre deviné depuis l'ICS reste le nom court d'origine, sans quoi le rapprochement échoue
  // silencieusement et les séances importées restent orphelines (sans matière).
  const byName = new Map();
  currentMatieres.forEach((m) => { byName.set(m.nom.toLowerCase(), m); byName.set(m.court.toLowerCase(), m); });
  const usedIds = new Set(currentMatieres.map((m) => m.id));
  const titreToMid = new Map();
  let created = 0;
  for (const c of analysis.courses) {
    const existing = byName.get(c.nom.toLowerCase());
    if (existing) { titreToMid.set(c.nom, existing.id); continue; }
    const id = slugifyName(c.nom, usedIds);
    usedIds.add(id);
    const couleur = PALETTE[created % PALETTE.length];
    await saveMatiere({ id, nom: c.nom, court: c.nom, couleur });
    titreToMid.set(c.nom, id);
    created++;
  }
  const rows = analysis.events.map((e) => ({ d: e.d, s: e.s, e: e.e, t: e.t, m: e.titre ? titreToMid.get(e.titre) : null, r: e.r, p: e.p, g: e.g, n: e.n, allday: e.allday }));
  await clearEdt();
  await saveEdtEvents(rows);
  return { matieresCreees: created, evenements: rows.length };
}
