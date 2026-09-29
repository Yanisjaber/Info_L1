// Formules de calcul de la note finale (d'après les fiches MCCC de chaque UE).
// Chaque calculateur : champs (notes /20 sauf mention), fonction calc(valeurs) -> {note, detail, partiel}
const M = (...a) => Math.max(...a);
const num = (v) => (v === "" || v === null || v === undefined || isNaN(+v) ? null : +v);

// moyenne pondérée sur les champs renseignés
function wavg(pairs) {
  let s = 0, w = 0;
  pairs.forEach(([v, p]) => { if (v !== null) { s += v * p; w += p; } });
  return w ? { note: s / w, poids: w } : null;
}

export const CALC = {
  algo1: {
    titre: "Algorithmique 1",
    formule: "Note = 10 % × max(QCM1, CC4) + 15 % × max(QCM2, CC4) + 30 % × max(CC2, CC4) + 35 % × max(CC3, CC4) + 10 % × CC4  (validée si ≥ 10)",
    champs: [["q1", "CC1 — QCM 1 (10 %)"], ["q2", "CC1 — QCM 2 (15 %)"], ["cc2", "CC2 — devoir (30 %)"], ["cc3", "CC3 — programmes (35 %)"], ["cc4", "CC4 — 2e chance (10 %)"]],
    calc(v) {
      const [q1, q2, c2, c3, c4] = ["q1", "q2", "cc2", "cc3", "cc4"].map((k) => num(v[k]));
      if ([q1, q2, c2, c3, c4].every((x) => x !== null)) {
        return { note: 0.10 * M(q1, c4) + 0.15 * M(q2, c4) + 0.30 * M(c2, c4) + 0.35 * M(c3, c4) + 0.10 * c4, complet: true };
      }
      const e = wavg([[q1, 10], [q2, 15], [c2, 30], [c3, 35]]);
      return e ? { note: e.note, complet: false, poids: e.poids } : null;
    },
  },
  bas: {
    titre: "Bas",
    formule: "Note = 5 % × max(CCI1, CCI4) + 20 % × max(CCI2, CCI4) + 25 % × max(CCI3, CCI4) + 50 % × CCI4",
    champs: [["c1", "CCI1 — Systèmes (5 %)"], ["c2", "CCI2 — Systèmes (20 %)"], ["c3", "CCI3 — Architecture (25 %)"], ["c4", "CCI4 — 2e chance (50 %)"]],
    calc(v) {
      const [a, b, c, d] = ["c1", "c2", "c3", "c4"].map((k) => num(v[k]));
      if ([a, b, c, d].every((x) => x !== null)) return { note: 0.05 * M(a, d) + 0.20 * M(b, d) + 0.25 * M(c, d) + 0.5 * d, complet: true };
      const e = wavg([[a, 5], [b, 20], [c, 25]]);
      return e ? { note: e.note, complet: false, poids: e.poids } : null;
    },
  },
  bases2: {
    titre: "Math1 Bases 2",
    formule: "Sans note 4 : (N1 + N2 + N3) / 3. Avec note 4 : (max(N1,N4) + max(N2,N4) + max(N3,N4)) / 3",
    champs: [["n1", "Note 1 (TD)"], ["n2", "Note 2 (TD)"], ["n3", "Note 3 (amphi)"], ["n4", "Note 4 — 2e chance (facultative)"]],
    calc(v) {
      const [a, b, c, d] = ["n1", "n2", "n3", "n4"].map((k) => num(v[k]));
      if ([a, b, c].every((x) => x !== null)) {
        const x = d === null ? (a + b + c) / 3 : (M(a, d) + M(b, d) + M(c, d)) / 3;
        return { note: x, complet: true };
      }
      const e = wavg([[a, 1], [b, 1], [c, 1]]);
      return e ? { note: e.note, complet: false, poids: e.poids } : null;
    },
  },
  calc1: {
    titre: "Math1 Calc 1",
    formule: "CC2 = moyenne des 2 interros. Note = 15 % × max(CC1, CC4) + 40 % × max(CC2, CC4) + 45 % × max(CC3, CC4)",
    champs: [["cc1", "CC1 — interro (15 %)"], ["cc21", "CC2.1 — interro (20 %)"], ["cc22", "CC2.2 — interro (20 %)"], ["cc3", "CC3 — devoir amphi (45 %)"], ["cc4", "CC4 — 2e chance"]],
    calc(v) {
      const [c1, a, b, c3, c4] = ["cc1", "cc21", "cc22", "cc3", "cc4"].map((k) => num(v[k]));
      const cc2 = a !== null && b !== null ? (a + b) / 2 : null;
      if (c1 !== null && cc2 !== null && c3 !== null) {
        const f = c4 === null ? -Infinity : c4;
        return { note: 0.15 * M(c1, f) + 0.40 * M(cc2, f) + 0.45 * M(c3, f), complet: true };
      }
      const e = wavg([[c1, 15], [a, 20], [b, 20], [c3, 45]]);
      return e ? { note: e.note, complet: false, poids: e.poids } : null;
    },
  },
  sn: {
    titre: "Science du numérique",
    formule: "Note = 0,5 × max(CC1, CC3) + 0,5 × max(CC2, CC3)  (notes plafonnées à 20)",
    champs: [["c1", "CC1 — QCM partie A"], ["c2", "CC2 — QCM partie B"], ["c3", "CC3 — 2e chance (facultative)"]],
    calc(v) {
      const [a, b, c] = ["c1", "c2", "c3"].map((k) => num(v[k]));
      if (a !== null && b !== null) { const f = c === null ? -Infinity : c; return { note: 0.5 * M(a, f) + 0.5 * M(b, f), complet: true }; }
      const e = wavg([[a, 1], [b, 1]]);
      return e ? { note: e.note, complet: false, poids: e.poids } : null;
    },
  },
  devenir: {
    titre: "Devenir étudiant",
    formule: "Note /20 = 35 % × (CC1 /40) + 15 % × (CC2 /50) + 50 % × (CC3 /40), ramené sur 20 — pas de 2e chance",
    champs: [["c1", "CC1 — poster + oral (/40)", 40], ["c2", "CC2 — QCM + rapport d'étonnement (/50)", 50], ["c3", "CC3 — rapport individuel (/40)", 40]],
    calc(v) {
      const a = num(v.c1), b = num(v.c2), c = num(v.c3);
      const n = (x, m) => (x === null ? null : (x / m) * 20);
      const A = n(a, 40), B = n(b, 50), C = n(c, 40);
      if (A !== null && B !== null && C !== null) return { note: 0.35 * A + 0.15 * B + 0.5 * C, complet: true };
      const e = wavg([[A, 35], [B, 15], [C, 50]]);
      return e ? { note: e.note, complet: false, poids: e.poids } : null;
    },
  },
};
