/**
 * Capture la page courante en image PNG (Blob).
 *
 * Utilise `html-to-image` (toBlob) avec un pixelRatio x2 pour un rendu
 * net et fidele (couleurs plus saturees qu'a scale 1). Fond blanc solide
 * pour eviter l'effet "image semi-transparente" dans les viewers.
 *
 * Retourne null en cas d'echec (CSP, taille, lib). L'appelant affiche
 * un fallback.
 */

export async function capturePageScreenshot(): Promise<Blob | null> {
  if (typeof window === 'undefined') return null;
  try {
    const { toBlob } = await import('html-to-image');
    const blob = await toBlob(document.body, {
      pixelRatio: 2,
      backgroundColor: '#ffffff',
      cacheBust: true,
      // On capture la zone visible uniquement, en evitant le scroll complet
      // (sinon screenshot enorme et peu utile pour un debug).
      width: document.documentElement.clientWidth,
      height: document.documentElement.clientHeight,
      style: {
        // Force l'opacite a 1 au niveau racine pour eviter qu'un parent
        // semi-transparent (transition, animation) ne degrade la capture.
        opacity: '1',
      },
    });
    return blob;
  } catch (err) {
    if (typeof console !== 'undefined') {
      console.warn('[bug-report] capturePageScreenshot failed', err);
    }
    return null;
  }
}
