// État partagé (variables modifiables) — regroupé dans un objet car un module ES ne peut pas réassigner un import.
export const routerState = {
  cleanup: null,
  // Compte les navigations RÉELLES (hashchange) de la session, pas les rerenders déclenchés par une
  // simple modif de données (rerender() appelle route() directement, sans hashchange) : sert à savoir
  // si "Retour" a un sens (0 ou 1 = on vient d'arriver, rien à quoi revenir) sans dépendre de
  // history.length, peu fiable d'un navigateur à l'autre.
  navCount: 0,
};
