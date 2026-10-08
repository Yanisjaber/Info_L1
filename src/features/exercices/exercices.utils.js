// Normalise une réponse texte pour une comparaison tolérante (casse, accents, espaces).
function normText(s) {
  // Les espaces autour de la ponctuation ne comptent pas : « [1,3,5] » = « [1, 3, 5] », « f(a, b) » = « f(a,b) ».
  return String(s ?? "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").replace(/\s*([,;:()\[\]{}])\s*/g, "$1");
}

function toNum(s) {
  const t = String(s ?? "").trim().replace(",", ".");
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null; // parseFloat tronque sinon "1/3" en 1 (faux positif)
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : null;
}

// Une réponse texte accepte plusieurs formes valides séparées par « | » (ex. « 6|6.0|six »),
// comparées soit littéralement (texte normalisé), soit numériquement si les deux sont des nombres.
export function checkTextAnswer(input, expected) {
  const accepted = String(expected ?? "").split("|").map((s) => s.trim()).filter(Boolean);
  const normInput = normText(input), numInput = toNum(input);
  return accepted.some((a) => normText(a) === normInput || (numInput !== null && toNum(a) === numInput));
}

// Un exercice "texte" a une ou plusieurs réponses attendues (`reponses`, une par sous-question de
// l'énoncé) — `reponse` (singulier) est l'ancien format à une seule réponse, conservé en repli pour
// les exercices jamais réédités depuis, afin de ne rien casser sans migration de données.
export const expectedAnswers = (e) => (e.reponses?.length ? e.reponses : e.reponse ? [e.reponse] : []);
