import {
  listRelances,
  listRelancesArchivees,
} from '@/lib/crm/queries/relances';
import { compteOptions } from '@/lib/crm/queries/comptes';
import { commercialOptions } from '@/lib/crm/queries/rdv';
import { RelanceList } from '@/components/crm/relances/relance-list';
import { RelanceArchive } from '@/components/crm/relances/relance-archive';
import { RelanceForm } from '@/components/crm/relances/relance-form';
import { todayInParis } from '@/lib/utils/formatters';
import { Fab } from '@/components/crm/fab';
import { Plus } from 'lucide-react';

export default async function RelancesPage() {
  const [relances, archivees, comptes, commerciaux] = await Promise.all([
    listRelances(),
    listRelancesArchivees(),
    compteOptions(),
    commercialOptions(),
  ]);
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold tracking-tight">Relances</h1>
      <RelanceList relances={relances} today={todayInParis()} />
      <RelanceArchive relances={archivees} />
      <RelanceForm
        comptes={comptes}
        commerciaux={commerciaux}
        trigger={
          <Fab>
            <Plus className="mr-1 h-4 w-4" />
            Nouvelle relance
          </Fab>
        }
      />
    </div>
  );
}
