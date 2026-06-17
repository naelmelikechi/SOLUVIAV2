'use client';

import { Suspense, useCallback, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { FicheOverview } from './fiche-overview';
import { FicheInterlocuteurs } from './fiche-interlocuteurs';
import { FicheRdvTab } from './fiche-rdv-tab';
import { FicheCommunications } from './fiche-communications';
import { FicheNegociation } from './fiche-negociation';
import { FicheHistorique } from './fiche-historique';
import type {
  ProspectDetail,
  ProspectContact,
  ProspectNote,
  ProspectCommunication,
  ProspectStageHistoryItem,
} from '@/lib/queries/prospects';
import type { RdvCommercialWithRefs } from '@/lib/queries/rdv';

export interface FicheCommercial {
  id: string;
  nom: string;
  prenom: string;
  role: string;
}

const TAB_VALUES = [
  'overview',
  'interlocuteurs',
  'rdv',
  'communications',
  'negociation',
  'historique',
] as const;
type TabValue = (typeof TAB_VALUES)[number];

interface FicheTabsProps {
  prospect: ProspectDetail;
  contacts: ProspectContact[];
  rdvs: RdvCommercialWithRefs[];
  notes: ProspectNote[];
  communications: ProspectCommunication[];
  stageHistory: ProspectStageHistoryItem[];
  commerciaux: FicheCommercial[];
  currentUserId: string;
  isAdmin: boolean;
}

export function FicheTabs(props: FicheTabsProps) {
  return (
    <Suspense fallback={null}>
      <FicheTabsInner {...props} />
    </Suspense>
  );
}

function FicheTabsInner({
  prospect,
  contacts,
  rdvs,
  notes,
  communications,
  stageHistory,
  commerciaux,
  currentUserId,
}: FicheTabsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const initial = searchParams.get('tab');
  const [value, setValue] = useState<TabValue>(
    TAB_VALUES.includes(initial as TabValue)
      ? (initial as TabValue)
      : 'overview',
  );

  const onValueChange = useCallback(
    (v: string) => {
      setValue(v as TabValue);
      const params = new URLSearchParams(searchParams.toString());
      params.set('tab', v);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const locked = prospect.client_id != null;

  return (
    <Tabs value={value} onValueChange={onValueChange}>
      <TabsList>
        <TabsTrigger value="overview">Vue d&apos;ensemble</TabsTrigger>
        <TabsTrigger value="interlocuteurs">Interlocuteurs</TabsTrigger>
        <TabsTrigger value="rdv">RDV</TabsTrigger>
        <TabsTrigger value="communications">Communications</TabsTrigger>
        <TabsTrigger value="negociation">Négociation</TabsTrigger>
        <TabsTrigger value="historique">Historique</TabsTrigger>
      </TabsList>

      <TabsContent value="overview" className="mt-4">
        <FicheOverview
          prospect={prospect}
          contacts={contacts}
          rdvs={rdvs}
          notes={notes}
          communications={communications}
          stageHistory={stageHistory}
          locked={locked}
        />
      </TabsContent>

      <TabsContent value="interlocuteurs" className="mt-4">
        <FicheInterlocuteurs
          prospectId={prospect.id}
          contacts={contacts}
          contactPrincipalId={prospect.contact_principal_id}
          locked={locked}
        />
      </TabsContent>

      <TabsContent value="rdv" className="mt-4">
        <FicheRdvTab
          prospect={prospect}
          rdvs={rdvs}
          contacts={contacts}
          commerciaux={commerciaux}
          currentUserId={currentUserId}
        />
      </TabsContent>

      <TabsContent value="communications" className="mt-4">
        <FicheCommunications communications={communications} />
      </TabsContent>

      <TabsContent value="negociation" className="mt-4">
        <FicheNegociation prospect={prospect} locked={locked} />
      </TabsContent>

      <TabsContent value="historique" className="mt-4">
        <FicheHistorique prospect={prospect} stageHistory={stageHistory} />
      </TabsContent>
    </Tabs>
  );
}
