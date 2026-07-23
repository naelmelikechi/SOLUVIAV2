import { createClient } from '@/lib/supabase/server';
import { AppError } from '@/lib/errors';
import { logger } from '@/lib/utils/logger';

// Charge tout le lancement d'un projet en un aller-retour parallele :
// statuts d'etapes (rows creees a la demande), documents et commentaires.
export async function getLancementByProjetId(projetId: string) {
  const supabase = await createClient();

  const [etapesRes, documentsRes, commentairesRes] = await Promise.all([
    supabase
      .from('projet_lancement_etapes')
      .select('id, etape_key, statut, updated_at')
      .eq('projet_id', projetId),
    supabase
      .from('projet_lancement_documents')
      .select(
        '*, user:users!projet_lancement_documents_user_id_fkey(id, nom, prenom)',
      )
      .eq('projet_id', projetId)
      .order('created_at', { ascending: false }),
    supabase
      .from('projet_lancement_commentaires')
      .select(
        '*, user:users!projet_lancement_commentaires_user_id_fkey(id, nom, prenom)',
      )
      .eq('projet_id', projetId)
      .order('created_at', { ascending: true }),
  ]);

  const error = etapesRes.error ?? documentsRes.error ?? commentairesRes.error;
  if (error) {
    logger.error('queries.projet-lancement', 'getLancementByProjetId failed', {
      projetId,
      error,
    });
    throw new AppError(
      'PROJET_LANCEMENT_FETCH_FAILED',
      'Impossible de charger la timeline de lancement',
      { cause: error },
    );
  }

  return {
    etapes: etapesRes.data ?? [],
    documents: documentsRes.data ?? [],
    commentaires: commentairesRes.data ?? [],
  };
}

export type ProjetLancement = Awaited<
  ReturnType<typeof getLancementByProjetId>
>;
export type LancementEtapeRow = ProjetLancement['etapes'][number];
export type LancementDocument = ProjetLancement['documents'][number];
export type LancementCommentaire = ProjetLancement['commentaires'][number];
