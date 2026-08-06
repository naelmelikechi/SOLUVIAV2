import type { Metadata } from 'next';
import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import {
  getProjetByRef,
  getContratsByProjetId,
  getProjetFinance,
} from '@/lib/queries/projets';
import { getLancementByProjetId } from '@/lib/queries/projet-lancement';
import { getProjetPerformance } from '@/lib/queries/projet-performance';
import {
  ProjetSyntheseGrille,
  ProjetCarteTile,
  ProjetCarteChargement,
} from '@/components/projets/projet-synthese-cards';
import { ProjetCarteQualite } from '@/components/projets/projet-carte-qualite';
import { ProjetSuiviPanel } from '@/components/projets/projet-suivi-panel';
import { buildSyntheseCards } from '@/lib/projets/synthese';
import { productionSoluviaHt } from '@/lib/utils/montant-ht';
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

  const [contrats, finance, performance, lancement] = await Promise.all([
    getContratsByProjetId(projet.id),
    getProjetFinance(projet.id),
    getProjetPerformance(projet.id),
    getLancementByProjetId(projet.id),
  ]);

  const produitHt = finance
    ? productionSoluviaHt(finance.production_opco, finance.taux_commission)
    : 0;

  const apprentisActifs = contrats.filter((c) =>
    isContratActif(c.contract_state),
  ).length;

  // Les noms sont prefixes "carte" : lancement / finance / contrats designent
  // deja les donnees brutes plus haut dans ce composant.
  const [carteLancement, carteProduction, carteFinance, carteContrats] =
    buildSyntheseCards({
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
      contrats: {
        total: contrats.length,
        actifs: apprentisActifs,
      },
    });

  return (
    <div className="space-y-6">
      <ProjetSyntheseGrille>
        <ProjetCarteTile carte={carteLancement!} />
        <ProjetCarteTile carte={carteProduction!} />
        <ProjetCarteTile carte={carteFinance!} />
        <Suspense fallback={<ProjetCarteChargement titre="Qualité" />}>
          <ProjetCarteQualite
            projetRef={ref}
            clientId={projet.client?.id ?? null}
          />
        </Suspense>
        <ProjetCarteTile carte={carteContrats!} />
      </ProjetSyntheseGrille>
      <ProjetSuiviPanel projetId={projet.id} projetRef={ref} />
    </div>
  );
}
