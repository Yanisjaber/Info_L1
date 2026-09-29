// Exécute du code Python dans le navigateur (Pyodide, WebAssembly) pour corriger
// automatiquement les exercices de code : pas de serveur, tout tourne en local.
// Chargé à la demande (10 Mo) seulement quand un exercice de code est ouvert.

let pyodidePromise = null;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error("Impossible de charger " + src));
    document.head.appendChild(s);
  });
}

function getPyodide() {
  if (!pyodidePromise) {
    pyodidePromise = (async () => {
      if (!window.loadPyodide) await loadScript("vendor/pyodide/pyodide.js");
      return window.loadPyodide({ indexURL: "vendor/pyodide/" });
    })();
  }
  return pyodidePromise;
}

// Petit harnais de test : le champ "code_tests" d'un exercice n'est qu'une suite
// d'appels à check(description, condition) — pas besoin d'écrire un framework de test.
// On y ajoute aussi creer_tableau/creer_matrice : certains énoncés du cours (type abstrait
// Tableau/Matrice) demandent explicitement de les utiliser pour construire le résultat —
// sans elles, un code qui suit l'énoncé à la lettre plante avec une erreur de nom inconnu.
const HARNESS = `
import builtins
__test_results = []
def check(desc, cond):
    __test_results.append((str(desc), bool(cond)))
builtins.check = check

def creer_tableau(longueur, defaut):
    assert longueur >= 0, 'Pré-condition'
    return [defaut] * longueur
builtins.creer_tableau = creer_tableau

def creer_matrice(nb_lignes, nb_colonnes, defaut):
    assert nb_lignes > 0 and nb_colonnes > 0, 'Pré-condition'
    matrice = [None] * nb_lignes
    for i in range(nb_lignes):
        matrice[i] = [defaut] * nb_colonnes
    return matrice
builtins.creer_matrice = creer_matrice
`;

export async function runPythonExercise(studentCode, testsCode) {
  const pyodide = await getPyodide();
  let stdout = "", stderr = "";
  try {
    pyodide.setStdout({ batched: (s) => { stdout += s + "\n"; } });
    pyodide.setStderr({ batched: (s) => { stderr += s + "\n"; } });
  } catch (e) { /* API absente selon version : on continue sans capture de sortie */ }
  let error = null;
  try {
    pyodide.runPython(HARNESS);
    pyodide.runPython(studentCode || "");
    pyodide.runPython(testsCode || "");
  } catch (e) {
    error = String(e.message || e).split("\n").slice(-6).join("\n");
  }
  let results = [];
  try {
    const raw = pyodide.runPython("__test_results");
    results = raw.toJs().map(([desc, ok]) => ({ desc, ok }));
    raw.destroy?.();
  } catch (e) { /* pas de résultats exploitables (ex. erreur avant le harnais) */ }
  return { results, error, stdout, stderr };
}
