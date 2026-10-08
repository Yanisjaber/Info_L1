// État partagé (variables modifiables) — regroupé dans un objet car un module ES ne peut pas réassigner un import.
export const exoState = {
  openExoId: null,
  codeResults: {}, // id -> dernier résultat d'exécution (mémoire seulement, pour survivre à un rerender)
};
