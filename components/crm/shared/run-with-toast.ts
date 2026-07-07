import { toast } from 'sonner';

/**
 * Exécute une action serveur avec le feedback standard (toast succès/erreur
 * neutre). Remplace le try/toast recopié à la main dans ~18 composants
 * (audit 2026-07-06). Pour un rollback ou un message d'erreur dynamique,
 * garder un try/catch local.
 */
export async function runWithToast(
  fn: () => Promise<void>,
  opts: { success?: string; error?: string; onSuccess?: () => void } = {},
): Promise<void> {
  try {
    await fn();
    if (opts.success) toast.success(opts.success);
    opts.onSuccess?.();
  } catch {
    toast.error(opts.error ?? 'Action impossible');
  }
}
