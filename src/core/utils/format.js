const dfmt = new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short" });

const dlong = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

export const parseDay = (iso) => { const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d); };

export const fmtDate = (iso) => dfmt.format(parseDay(iso)).replace(".", "");

export const fmtLong = (iso) => dlong.format(parseDay(iso));

export const startOfDay = (d = new Date()) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

export const daysUntil = (iso) => Math.round((parseDay(iso) - startOfDay()) / 864e5);

export const pct = (a, b) => (b ? Math.round((100 * a) / b) : 0);

export const shuffle = (a) => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

export const plural = (n, s, p) => `${n} ${n > 1 ? p || s + "s" : s}`;

export const fmtMMSS = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };

// Note ou moyenne affichée à 0,05 près (10,77 → « 10,75 », 10,78 → « 10,8 ») ; l'affichage seul est arrondi, les calculs gardent la valeur exacte.
export const fmtNote = (x) => (Math.round(x * 20) / 20).toString().replace(".", ",");
export const fmt1 = (x) => (Math.round(x * 10) / 10).toString().replace(".", ",");
