import { clearEdt, saveEdtEvents } from "./edt.service.js";
import { saveMatiere } from "../matieres/matieres.service.js";
import { edtDefaultType, edtIsOff, edtToSeanceType, icsCcRule, icsTypeRules } from "../settings/settings.js";

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

// Un CC n'est plus un type d'EDT à part entière : c'est un vrai créneau de cours (Cours/TD/TP, le
// plus souvent Cours puisqu'un CC a généralement lieu en amphi) qui contient EN PLUS un contrôle
// continu — d'où le drapeau `cc` séparé de `t`, détecté par guessCC ci-dessous.
// Les règles de détection (mots-clés -> type de créneau, motif d'un contrôle) viennent des
// réglages de l'utilisateur : voir icsTypeRules / icsCcRule.
function guessType(summary, description) {
  for (const [re, t] of icsTypeRules()) {
    if (re.test(`${summary || ""} ${description || ""}`)) return t;
  }
  return edtDefaultType();
}

// La description contient souvent des notes informatives (« CC1 sem 41 + 46... ») qui annoncent
// des examens à venir SANS que la séance elle-même en soit une : on ne se base donc que sur le
// résumé, jamais sur la description, pour ne pas étiqueter à tort un cours normal.
const guessCC = (summary) => !!icsCcRule()?.test(summary || "");

// Retire le suffixe « type de séance » du résumé pour ne garder que le nom de la matière
// (ex. « Bas - Réunion » → « Bas », « Devenir étudiant - Cours/TD » → « Devenir étudiant »).
const TITRE_SUFFIX = /[-–—:]\s*(Cours\/TD|Cours\/TP|TD\/TP|Cours magistral|R[ée]union|Contr[ôo]le(?:\s+continu)?|Examen|Partiel|Test|TD|TP|CM|CC\d*|Cours)\s*\d*\s*$/i;

function guessTitle(summary) {
  let s = String(summary || "");
  let prev;
  do { prev = s; s = s.replace(TITRE_SUFFIX, "").trim(); } while (s !== prev && s);
  return s || summary || edtDefaultType();
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
    if (!byTitre.has(e.titre)) byTitre.set(e.titre, { nom: e.titre, counts: {} });
    const c = byTitre.get(e.titre), st = edtToSeanceType(e.t);
    if (st) c.counts[st] = (c.counts[st] || 0) + 1;
  }
  const ccCount = events.filter((e) => e.cc).length;
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
    const cc = guessCC(summary);
    const titre = edtIsOff(type) ? null : guessTitle(summary);
    const dates = ev.RRULE ? expandRecurrence(start.d, ev.RRULE, ev.EXDATE) : [start.d];
    for (const d of dates) {
      events.push({ d, s: start.time || "00:00", e: (end && end.time) || start.time || "23:59", t: type, titre, r: location || null, n: cc ? summary : null, cc, allday: start.allday });
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
  const rows = analysis.events.map((e) => ({ d: e.d, s: e.s, e: e.e, t: e.t, m: e.titre ? titreToMid.get(e.titre) : null, r: e.r, p: e.p, g: e.g, n: e.n, cc: e.cc, allday: e.allday }));
  await clearEdt();
  await saveEdtEvents(rows);
  return { matieresCreees: created, evenements: rows.length };
}
