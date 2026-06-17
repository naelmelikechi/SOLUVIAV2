import type { SignatureProvider } from '@/lib/signature/provider';
import { yousignProvider } from '@/lib/signature/yousign';

/**
 * Registre des prestataires de signature électronique (Feature 5).
 *
 * Renvoie l'implémentation correspondant à `id` UNIQUEMENT si elle est
 * réellement utilisable :
 *   - `'yousign'` : actif seulement si `YOUSIGN_API_KEY` est provisionnée
 *     (sinon on retombe proprement en mode manuel) ;
 *   - `'manuel'` (et tout autre id) : pas de prestataire ; la preuve signée est
 *     uploadée à la main via lib/actions/signatures.ts.
 */
export function getSignatureProvider(id: string): SignatureProvider | null {
  if (id === 'yousign' && process.env.YOUSIGN_API_KEY) {
    return yousignProvider;
  }
  return null;
}
