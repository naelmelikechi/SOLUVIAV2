import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import {
  getProjetByRef,
  getContratsByProjetIdAvecArchives,
} from '@/lib/queries/projets';
import { getRegleNomsParIds } from '@/lib/queries/contrats-regles';
import { computeContractSchedule } from '@/lib/queries/production';
import { resolveTauxCommission } from '@/lib/utils/commission';
import { categorieContrat } from '@/lib/contrats/categories';
import { round2 } from '@/lib/utils/number';
import { ProjetContratsCategories } from '@/components/projets/projet-contrats-categories';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ ref: string }>;
}): Promise<Metadata> {
  const { ref } = await params;
  return { title: `Contrats - ${ref} - SOLUVIA` };
}

export default async function ProjetContratsPage({
  params,
}: {
  params: Promise<{ ref: string }>;
}) {
  const { ref } = await params;
  const projet = await getProjetByRef(ref);
  if (!projet) notFound();

  const contrats = await getContratsByProjetIdAvecArchives(projet.id);

  // Ruptures : ce qui a ete produit AVANT l'arret, c'est ce qui distingue
  // cette categorie d'un archive (qui n'a rien produit). Le calcul existe
  // deja (computeContractSchedule, lib/queries/production.ts) - on le
  // reutilise tel quel plutot que de recopier la formule NPEC/commission/
  // prorata. C'est une fonction pure (aucun I/O), donc appelable directement
  // ici sans requete dediee.
  const tauxCommission = resolveTauxCommission(projet.taux_commission);
  const productionAvantRupture: Record<string, number> = {};
  for (const c of contrats) {
    if (categorieContrat(c.contract_state, c.archive) !== 'ruptures') continue;
    if (!c.date_debut || !c.duree_mois || !c.npec_amount) continue;
    const schedule = computeContractSchedule(
      c.date_debut,
      c.duree_mois,
      c.npec_amount,
      tauxCommission,
      c.date_rupture,
    );
    const total = round2(
      schedule.soluvia.reduce((sum, entry) => sum + entry.amount, 0),
    );
    if (total > 0) productionAvantRupture[c.id] = total;
  }

  // Nom des regles d'archivage automatique, pour les contrats archives par le
  // cron (archive_regle_id). contrats_regles_archivage est admin-only en RLS,
  // getRegleNomsParIds passe donc par le client service-role - lecture
  // minimale (id+nom) pour que le CDP comprenne pourquoi son contrat a
  // disparu, sans lui ouvrir l'ecran d'administration des regles.
  const regleIds = contrats
    .map((c) => c.archive_regle_id)
    .filter((id): id is string => id != null);
  const reglesNomsMap = await getRegleNomsParIds(regleIds);
  const reglesNoms = Object.fromEntries(reglesNomsMap);

  return (
    <ProjetContratsCategories
      contrats={contrats}
      productionAvantRupture={productionAvantRupture}
      reglesNoms={reglesNoms}
    />
  );
}
