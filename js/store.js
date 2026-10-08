// Progression : local-first (localStorage) + synchronisation Supabase optionnelle.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

const KEY = "l1s1_v1";
const OWNER_KEY = "l1s1_owner";
const MAPS = ["read", "notes", "activity", "reponses", "elo", "seanceNotes", "ccProg"];
const listeners = new Set();

function blank() {
  // qcm/cards/exos/evals vivent dans de vraies tables Supabase (results/evals, voir content.js) et
  // sont rechargées à chaque session par loadData() — pas dans MAPS (pas de sync jsonb générique
  // pour elles), mais toujours initialisées ici pour ne jamais être `undefined` avant ce chargement.
  const s = { prefs: { theme: "auto", ts: 0 }, qcm: {}, cards: {}, exos: {}, evals: {} };
  MAPS.forEach((k) => (s[k] = {}));
  return s;
}
function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "null");
    if (raw) {
      const b = blank();
      MAPS.forEach((k) => (b[k] = raw[k] || {}));
      b.prefs = Object.assign(b.prefs, raw.prefs || {});
      return b;
    }
  } catch (e) {}
  return blank();
}
export const state = load();
export const sync = { client: null, user: null, status: "off", error: "", last: 0, configured: !!(SUPABASE_URL && SUPABASE_ANON_KEY) };

export function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit() { listeners.forEach((f) => { try { f(); } catch (e) {} }); }

let saveTimer = null, pushTimer = null;
export function commit() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
  clearTimeout(pushTimer);
  if (sync.user) pushTimer = setTimeout(push, 1500);
  emit();
}
const day = (d = new Date()) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
export const todayKey = day;

// `type` alimente le détail par nature d'action (lecture, qcm, carte, exercice, eval) affiché
// dans le graphique d'activité — `n` seul reste le total utilisé pour la série et le streak.
export function bump(n = 1, type = "autre") {
  const k = day();
  const a = state.activity[k] || { n: 0, ts: 0, by: {} };
  a.n += n; a.ts = Date.now();
  a.by = a.by || {};
  a.by[type] = (a.by[type] || 0) + n;
  state.activity[k] = a;
}
export function setEntry(map, id, entry) {
  entry.ts = Date.now();
  state[map][id] = entry;
}

// ── Fusion (par entrée, le plus récent gagne ; activité = max) ──
export function mergeInto(local, remote, isActivity) {
  for (const [id, r] of Object.entries(remote || {})) {
    const l = local[id];
    if (!l) local[id] = r;
    else if (isActivity) {
      const by = { ...(l.by || {}) };
      for (const [type, v] of Object.entries(r.by || {})) by[type] = Math.max(by[type] || 0, v);
      local[id] = { n: Math.max(l.n || 0, r.n || 0), ts: Math.max(l.ts || 0, r.ts || 0), by };
    }
    else if ((r.ts || 0) > (l.ts || 0)) local[id] = r;
  }
}

// Si les données locales appartiennent à un autre compte que celui qui vient de se
// connecter, on repart propre : sinon la progression (voire pire) d'un compte fuiterait
// vers un autre en se connectant successivement à plusieurs comptes sur le même appareil.
function resetIfDifferentOwner(uid) {
  let owner = null;
  try { owner = localStorage.getItem(OWNER_KEY); } catch (e) {}
  if (owner && owner !== uid) {
    const b = blank();
    Object.keys(b).forEach((k) => (state[k] = b[k]));
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
  }
  try { localStorage.setItem(OWNER_KEY, uid); } catch (e) {}
}

// ── Supabase ──
export async function initSync() {
  if (!sync.configured || !window.supabase) return;
  try {
    sync.client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
    const { data } = await sync.client.auth.getSession();
    sync.user = data.session ? data.session.user : null;
    sync.client.auth.onAuthStateChange((_e, session) => {
      const was = sync.user && sync.user.id;
      sync.user = session ? session.user : null;
      if (sync.user && sync.user.id !== was) { resetIfDifferentOwner(sync.user.id); pull().then(push); }
      if (!sync.user) sync.status = "off";
      emit();
    });
    if (sync.user) { resetIfDifferentOwner(sync.user.id); await pull(); await push(); }
  } catch (e) { sync.status = "error"; sync.error = String(e.message || e); }
  emit();
}
export async function pull() {
  if (!sync.client || !sync.user) return;
  sync.status = "sync";
  emit();
  const { data, error } = await sync.client.from("state").select("key,value");
  if (error) { sync.status = "error"; sync.error = error.message; emit(); return; }
  for (const row of data || []) {
    if (MAPS.includes(row.key)) mergeInto(state[row.key], row.value, row.key === "activity");
    else if (row.key === "prefs" && (row.value.ts || 0) > (state.prefs.ts || 0)) state.prefs = row.value;
  }
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
  sync.status = "ok"; sync.last = Date.now(); sync.error = "";
  emit();
}
export async function push() {
  if (!sync.client || !sync.user) return;
  sync.status = "sync"; emit();
  const now = new Date().toISOString();
  const rows = [...MAPS, "prefs"].map((k) => ({ key: k, value: state[k], updated_at: now, user_id: sync.user.id }));
  const { error } = await sync.client.from("state").upsert(rows, { onConflict: "user_id,key" });
  if (error) { sync.status = "error"; sync.error = error.message; }
  else { sync.status = "ok"; sync.last = Date.now(); sync.error = ""; }
  emit();
}
export async function signIn(email, password) {
  return sync.client.auth.signInWithPassword({ email, password });
}
export async function signUp(email, password) {
  return sync.client.auth.signUp({ email, password });
}
export async function magicLink(email) {
  return sync.client.auth.signInWithOtp({ email, options: { emailRedirectTo: location.href.split("#")[0] } });
}
export async function signOut() { await sync.client.auth.signOut(); sync.user = null; sync.status = "off"; emit(); }

// ── Export / import / reset ──
export function exportJSON() { return JSON.stringify(state, null, 1); }
export function importJSON(text) {
  const o = JSON.parse(text);
  MAPS.forEach((k) => mergeInto(state[k], o[k] || {}, k === "activity"));
  commit();
}
export function resetAll() {
  const b = blank();
  Object.keys(b).forEach((k) => (state[k] = b[k]));
  commit();
}
