import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import {
  getProjetByRef,
  getContratsByProjetId,
  getProjetFinance,
} from '@/lib/queries/projets';
import { getLancementByProjetId } from '@/lib/queries/projet-lancement';
import { getProjetPerformance } from '@/lib/queries/projet-performance';
import {
  computeQualiopiCompletionForClients,
  type QualiopiCompletion,
} from '@/lib/queries/qualiopi-stats';
import { ProjetSyntheseCards } from '@/components/projets/projet-synthese-cards';
import { ProjetSuiviPanel } from '@/components/projets/projet-suivi-panel';
import { buildSyntheseCards } from '@/lib/projets/synthese';
import { ttcToHt } from '@/lib/utils/montant-ht';
import { isContratActif } from '@/lib/utils/contrat-states';
import { LANCEMENT_ETAPES } from '@/lib/lancement/constants';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ ref: string }>;
}): Promise<Metadata> {
  const { ref } = await params;
  return { title: `${ref} - Projets - SOLUVIA` };
}

export default async function ProjetSynthesePage({
  params,
}: {
  params: Promise<{ ref: string }>;
}) {
  const { ref } = await params;
  const projet = await getProjetByRef(ref);
  if (!projet) notFound();

  const [contrats, finance, performance, lancement, qualiopiParClient] =
    await Promise.all([
      getContratsByProjetId(projet.id),
      getProjetFinance(projet.id),
      getProjetPerformance(projet.id),
      getLancementByProjetId(projet.id),
      projet.client?.id
        ? computeQualiopiCompletionForClients([projet.client.id])
        : Promise.resolve(new Map<string, QualiopiCompletion>()),
    ]);

  const qualite = (projet.client?.id
    ? qualiopiParClient.get(projet.client.id)
    : null) ?? { realise: 0, total: 0 };

  // Production SOLUVIA en HT : le taux de commission donne un montant TTC,
  // ttcToHt en deduit le HT (convention d'affichage du projet).
  const produitHt = finance
    ? finance.production_opco * ttcToHt(finance.taux_commission / 100)
    : 0;

  const apprentisActifs = contrats.filter((c) =>
    isContratActif(c.contract_state),
  ).length;

  const cartes = buildSyntheseCards({
    projetRef: ref,
    lancement: {
      terminees: lancement.etapes.filter((e) => e.statut === 'lance').length,
      total: LANCEMENT_ETAPES.length,
    },
    production: {
      apprentisActifs,
      progressionPct: performance.pedagogie.value,
    },
    finance: {
      produitHt,
      factureHt: finance?.facture_soluvia ?? 0,
    },
    qualite,
    contrats: {
      total: contrats.length,
      actifs: apprentisActifs,
    },
  });

  return (
    <div className="space-y-6">
      <ProjetSyntheseCards cartes={cartes} />
      <ProjetSuiviPanel projetId={projet.id} projetRef={ref} />
    </div>
  );
}
