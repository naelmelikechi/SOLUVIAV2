/**
 * Capture la page courante en image PNG (Blob).
 *
 * Utilise `modern-screenshot` qui s'appuie sur SVG foreignObject pour un
 * rendu plus fidele que html2canvas (couleurs OKLCH / Tailwind v4,
 * box-shadows, gradients, blur). Sortie : fond blanc solide pour eviter
 * l'effet "image transparente" delavee dans les viewers d'email/dashboard.
 *
 * Retourne null en cas d'echec (CSP, taille, erreur lib). L'appelant
 * affiche un fallback ("Capture echouee, ajoute-en une manuellement").
 */

export async function capturePageScreenshot(): Promise<Blob | null> {
  if (typeof window === 'undefined') return null;
  try {
    const { domToBlob } = await import('modern-screenshot');
    const blob = await domToBlob(document.body, {
      type: 'image/png',
      backgroundColor: '#ffffff',
      // DPR 1 pour rester sous ~1-2 Mo meme sur retina. Suffisant pour debug.
      scale: 1,
      width: document.documentElement.clientWidth,
      height: document.documentElement.clientHeight,
    });
    return blob ?? null;
  } catch (err) {
    if (typeof console !== 'undefined') {
      console.warn('[bug-report] capturePageScreenshot failed', err);
    }
    return null;
  }
}
