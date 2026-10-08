import { D, M } from "../../core/services/app-data.js";
import { stats } from "../../core/services/stats.js";
import { daysUntil } from "../../core/utils/format.js";

export function nextEvents(n = 4) {
  return D.cal.evenements.filter((e) => M(e.matiere) && daysUntil(e.date) >= 0).slice(0, n);
}

export const cd = (e) => { const d = daysUntil(e.date); return d === 0 ? "aujourd'hui" : d === 1 ? "demain" : d < 0 ? "passé" : `dans ${d} jours`; };

// Poids du CC en 0..1, pour évaluer l'importance d'une échéance : "20 %" ou "1/3" ; à défaut
// (ex. "à confirmer") on suppose un poids moyen plutôt que de l'ignorer complètement.
function parsePoidsNum(s) {
  const m = String(s || "").match(/(\d+(?:[.,]\d+)?)\s*%/); if (m) return parseFloat(m[1].replace(",", ".")) / 100;
  const m2 = String(s || "").match(/^(\d+)\s*\/\s*(\d+)$/); if (m2) return +m2[1] / +m2[2];
  return 0.15;
}

// Affichage : une note "1/3" (une note parmi trois, pas un pourcentage du CC) se lit plus
// naturellement en "33 %" qu'en fraction — tout le reste (poids réels, "à confirmer") est inchangé.
export function fmtPoids(s) {
  const m = String(s || "").match(/^(\d+)\s*\/\s*(\d+)$/);
  return m ? `${Math.round((+m[1] / +m[2]) * 100)} %` : s;
}

export const nearestEvent = (mid) => D.cal.evenements.filter((e) => e.matiere === mid && daysUntil(e.date) >= 0).sort((a, b) => daysUntil(a.date) - daysUntil(b.date))[0];

// Priorité = poids du CC × urgence (proche = plus urgent) × marge de progression (peu avancé = plus prioritaire).
export function prioScore(mid) {
  const ev = nearestEvent(mid); if (!ev) return null;
  const d = Math.max(0, daysUntil(ev.date)), prog = stats(mid).prog;
  const urgency = Math.max(0.2, 1 - d / 45), gap = Math.max(0.2, 1 - prog / 100);
  return { ev, score: parsePoidsNum(ev.poids) * urgency * gap };
}
