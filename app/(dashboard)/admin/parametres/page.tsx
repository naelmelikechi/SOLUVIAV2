import {
  getParametresByCategorie,
  getTypologies,
  getAxesTemps,
  getJoursFeries,
} from '@/lib/queries/parametres';
import { PageHeader } from '@/components/shared/page-header';
import { ParametresForm } from '@/components/admin/parametres-form';

export default async function ParametresPage() {
  const [entrepriseParams, facturationParams, typologies, axes, joursFeries] =
    await Promise.all([
      getParametresByCategorie('entreprise'),
      getParametresByCategorie('facturation'),
      getTypologies(),
      getAxesTemps(),
      getJoursFeries(2026),
    ]);

  // Convert params arrays to key-value maps
  const entreprise = Object.fromEntries(
    entrepriseParams.map((p) => [p.cle.replace('entreprise.', ''), p.valeur]),
  );
  const facturation = Object.fromEntries(
    facturationParams.map((p) => [p.cle.replace('facturation.', ''), p.valeur]),
  );

  return (
    <div>
      <PageHeader
        title="Paramètres"
        description="Configuration du système — Admin uniquement"
      />
      <ParametresForm
        entreprise={entreprise}
        facturation={facturation}
        typologies={typologies}
        axes={axes}
        joursFeries={joursFeries}
      />
    </div>
  );
}
