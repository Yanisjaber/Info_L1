// État partagé (variables modifiables) — regroupé dans un objet car un module ES ne peut pas réassigner un import.
export const docsState = {
  // Chaque trait est un objet {tool,color,size,pts:[{x,y,p}]} (ou une forme {tool,x1,y1,x2,y2}), pas
  // des pixels figés : ça permet un rendu net à tout zoom et une gomme qui efface un trait entier
  // plutôt que des pixels. La vue (DRAW.view = {scale,ox,oy}) est un pur zoom/pan d'affichage appliqué
  // dans redrawAll() — les coordonnées stockées des traits restent toujours en espace "page" à 100 %.
  // Rejet de paume ADAPTATIF : tant qu'aucun vrai stylet (pointerType "pen") n'a touché l'écran cette
  // session d'écriture, un seul doigt dessine normalement (sinon personne sans Apple Pencil ne pourrait
  // rien écrire) ; dès qu'un stylet est détecté, le rejet de paume classique s'active et le doigt ne
  // sert plus qu'à pincer/déplacer la vue — poser la main pendant qu'on écrit au stylet ne laisse plus
  // de traits. Deux doigts pincent/déplacent la vue dans tous les cas ; la souris dessine toujours.
  DRAW: null,
  CURRENT_DOCS: [], // docs (avec strokes/paper) de la séance affichée — évite de stocker du JSON dans un data-attribut
};
