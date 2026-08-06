import { computeQualiopiCompletionForClients } from '@/lib/queries/qualiopi-stats';
import { buildCarteQualite } from '@/lib/projets/synthese';
import { ProjetCarteTile } from '@/components/projets/projet-synthese-cards';

/**
 * Carte Qualite isolee dans son propre composant async : le score Qualiopi
 * vient d'une cascade d'appels HTTP vers Eduvia (un par critere, puis un par
 * indicateur) sans timeout cote client. Enveloppee dans un <Suspense> par la
 * synthese, elle ne bloque plus l'affichage des 4 autres cartes.
 */
export async function ProjetCarteQualite({
  projetRef,
  clientId,
}: {
  projetRef: string;
  clientId: string | null;
}) {
  const completion = clientId
    ? ((await computeQualiopiCompletionForClients([clientId])).get(clientId) ??
      null)
    : null;

  return (
    <ProjetCarteTile
      carte={buildCarteQualite(
        projetRef,
        completion ?? { realise: 0, total: 0 },
      )}
    />
  );
}
