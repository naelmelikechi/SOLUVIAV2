import {
  listEtapes,
  listOpportunites,
  getOpportunite,
} from '@/lib/crm/queries/opportunites';
import { isKnownRegion } from '@/lib/crm/domain/geo';
import { commercialOptions } from '@/lib/crm/queries/rdv';
import { cachedGetUser } from '@/lib/crm/auth/roles';
import { isHiddenEmail } from '@/lib/crm/auth/hidden';
import { PipelineView } from '@/components/crm/pipeline/pipeline-view';
import { OppCreateForm } from '@/components/crm/pipeline/opp-create-form';
import {
  OppDrawer,
  type OppDetail,
} from '@/components/crm/pipeline/opp-drawer';
import { Fab } from '@/components/crm/ui/fab';
import { Plus } from 'lucide-react';

export default async function PipelinePage({
  searchParams,
}: {
  searchParams: Promise<{ opp?: string; region?: string }>;
}) {
  const { opp, region } = await searchParams;
  const initialRegion = isKnownRegion(region) ? region! : null;
  // Tout en parallèle, y compris le détail si un drawer est ouvert (?opp=).
  const [etapes, opportunites, selected, mentionOptions, user] =
    await Promise.all([
      listEtapes(),
      listOpportunites(),
      opp ? getOpportunite(opp).catch(() => null) : Promise.resolve(null),
      opp ? commercialOptions().catch(() => []) : Promise.resolve([]),
      cachedGetUser(),
    ]);
  // Compte fantôme : le composeur de notes est masqué (zéro trace, cf. addNote).
  const canNote = !isHiddenEmail(user?.email);
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold tracking-tight">Pipeline</h1>
      <PipelineView
        etapes={etapes}
        opportunites={opportunites}
        initialRegion={initialRegion}
      />
      {/* Supabase joined-row type is structurally compatible but not unifiable with OppDetail */}
      {/* key par id : remonte le drawer (et réinitialise son état local) au changement d'opportunité. */}
      {selected && (
        <OppDrawer
          key={selected.id}
          opp={selected as unknown as OppDetail}
          etapes={etapes}
          mentionOptions={mentionOptions}
          canNote={canNote}
        />
      )}
      {/* Bouton flottant : création unifiée (société + contacts + opportunité + RDV) */}
      <OppCreateForm
        trigger={
          <Fab>
            <Plus className="mr-1 h-4 w-4" />
            Nouvelle opportunité
          </Fab>
        }
      />
    </div>
  );
}
