import { listRdv, commercialOptions } from '@/lib/crm/queries/rdv';
import { PageHeader } from '@/components/shared/page-header';
import { compteOptions } from '@/lib/crm/queries/comptes';
import { RdvCalendar } from '@/components/crm/rdv/rdv-calendar-lazy';
import { RdvLists } from '@/components/crm/rdv/rdv-list';
import { RdvForm } from '@/components/crm/rdv/rdv-form';
import { RdvDetail } from '@/components/crm/rdv/rdv-detail';
import { Fab } from '@/components/crm/fab';
import { Plus } from 'lucide-react';

export default async function RdvPage({
  searchParams,
}: {
  searchParams: Promise<{ rdv?: string }>;
}) {
  const { rdv: rdvId } = await searchParams;
  const [rdv, comptes, commerciaux] = await Promise.all([
    listRdv(),
    compteOptions(),
    commercialOptions(),
  ]);
  const selected = rdvId ? (rdv.find((r) => r.id === rdvId) ?? null) : null;
  const nowIso = new Date().toISOString();
  return (
    <div className="space-y-6">
      <PageHeader title="RDV" description="Rendez-vous commerciaux" />
      <RdvCalendar rdv={rdv} />
      <RdvLists rdv={rdv} nowIso={nowIso} />
      {/* key par id : remonte le détail (état local compte-rendu) au changement de RDV. */}
      {selected && <RdvDetail key={selected.id} rdv={selected} />}
      <RdvForm
        comptes={comptes}
        commerciaux={commerciaux}
        trigger={
          <Fab>
            <Plus className="mr-1 h-4 w-4" />
            Nouveau RDV
          </Fab>
        }
      />
    </div>
  );
}
