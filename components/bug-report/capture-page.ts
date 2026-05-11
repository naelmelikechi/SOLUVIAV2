/**
 * Capture la page courante en image PNG (Blob).
 *
 * Utilise html2canvas-pro pour supporter les couleurs OKLCH/lab/lch de
 * Tailwind v4 (html2canvas classique echoue dessus). On capture le body
 * entier mais on limite la largeur effective au viewport pour eviter les
 * images geantes sur les pages a scroll infini.
 *
 * Retourne null en cas d'echec (CSP, taille, erreur lib). L'appelant
 * affiche un fallback ("Capture echouee, ajoute-en une manuellement").
 */

export async function capturePageScreenshot(): Promise<Blob | null> {
  if (typeof window === 'undefined') return null;
  try {
    const { default: html2canvas } = await import('html2canvas-pro');
    const canvas = await html2canvas(document.body, {
      backgroundColor: null,
      useCORS: true,
      logging: false,
      // Compromis taille/qualite : on capture en DPR x1 meme sur retina pour
      // garder le PNG < 1-2 Mo. Suffisant pour debug visuel.
      scale: 1,
      // Limite a la zone visible + ce qui est au-dessus/dessous dans le DOM
      // mais on ne capture pas la partie hors viewport horizontal.
      windowWidth: document.documentElement.clientWidth,
      windowHeight: document.documentElement.clientHeight,
      // Capture la zone visible (pas tout le scroll de la page)
      x: window.scrollX,
      y: window.scrollY,
      width: document.documentElement.clientWidth,
      height: document.documentElement.clientHeight,
    });

    return await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(
        (blob) => resolve(blob),
        'image/png',
        // qualite ignoree pour PNG mais on passe quand meme
        0.92,
      );
    });
  } catch (err) {
    if (typeof console !== 'undefined') {
      console.warn('[bug-report] capturePageScreenshot failed', err);
    }
    return null;
  }
}
