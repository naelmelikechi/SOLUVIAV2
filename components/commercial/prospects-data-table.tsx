'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Download } from 'lucide-react';
import { DataTable, type FilterOption } from '@/components/shared/data-table';
import { prospectListColumns } from '@/components/commercial/prospect-list-columns';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatDate } from '@/lib/utils/formatters';
import {
  STAGE_PROSPECT_LABELS,
  STAGE_PROSPECT_ORDER,
  TYPE_PROSPECT_LABELS,
  CANAL_ORIGINE_LABELS,
  SANTE_PROSPECT_LABELS,
  type SanteProspect,
} from '@/lib/utils/constants';
import type { ProspectListItem } from '@/lib/queries/prospects';

// Cle de persistance du choix « Mes prospects / Tous » (Feature 1 §4).
const VIEW_STORAGE_KEY = 'pipeline_default_view';

const TYPE_OPTIONS = (['cfa', 'entreprise'] as const).map((t) => ({
  label: TYPE_PROSPECT_LABELS[t],
  value: t,
}));

const STAGE_OPTIONS = STAGE_PROSPECT_ORDER.map((s) => ({
  label: STAGE_PROSPECT_LABELS[s],
  value: s,
}));

const SANTE_OPTIONS = (['vert', 'orange', 'rouge'] as SanteProspect[]).map(
  (s) => ({ label: SANTE_PROSPECT_LABELS[s], value: s }),
);

const CANAL_OPTIONS = Object.entries(CANAL_ORIGINE_LABELS).map(
  ([value, label]) => ({ value, label }),
);

const TOGGLE_BASE =
  'flex h-8 items-center rounded-md border px-3 text-xs font-medium transition-colors';
const TOGGLE_ACTIVE = 'border-primary/40 bg-primary/10 text-primary';
const TOGGLE_INACTIVE =
  'border-border/60 text-muted-foreground hover:bg-muted/60 bg-transparent';

interface ProspectsDataTableProps {
  data: ProspectListItem[];
  commerciaux: { id: string; nom: string; prenom: string }[];
  currentUserId: string;
}

export function ProspectsDataTable({
  data,
  commerciaux,
  currentUserId,
}: ProspectsDataTableProps) {
  const { push } = useRouter();

  const [view, setView] = useState<'me' | 'all'>(() => {
    if (typeof window === 'undefined') return 'all';
    return localStorage.getItem(VIEW_STORAGE_KEY) === 'me' ? 'me' : 'all';
  });

  useEffect(() => {
    localStorage.setItem(VIEW_STORAGE_KEY, view);
  }, [view]);

  const filteredData = useMemo(
    () =>
      view === 'me'
        ? data.filter((p) => p.commercial_id === currentUserId)
        : data,
    [data, view, currentUserId],
  );

  const filters = useMemo<FilterOption[]>(
    () => [
      { column: 'type_prospect', label: 'Tunnel', options: TYPE_OPTIONS },
      { column: 'stage', label: 'Étape', options: STAGE_OPTIONS },
      { column: 'sante', label: 'Santé', options: SANTE_OPTIONS },
      { column: 'canal_origine', label: 'Canal', options: CANAL_OPTIONS },
      {
        column: 'commercial',
        label: 'Développeur',
        options: commerciaux.map((c) => {
          const name = `${c.prenom} ${c.nom}`;
          return { label: name, value: name };
        }),
      },
    ],
    [commerciaux],
  );

  const handleExport = async () => {
    // xlsx est volumineux : import differe pour ne pas l'embarquer dans le
    // bundle initial de la page (charge uniquement au clic sur Export).
    const XLSX = await import('xlsx');
    const rows = filteredData.map((p) => ({
      'Raison sociale': p.nom,
      Tunnel: TYPE_PROSPECT_LABELS[p.type_prospect] ?? p.type_prospect,
      Étape: STAGE_PROSPECT_LABELS[p.stage] ?? p.stage,
      Canal: p.canal_origine
        ? (CANAL_ORIGINE_LABELS[p.canal_origine] ?? p.canal_origine)
        : '',
      'Dernière action': formatDate(p.derniere_action_at),
      'Prochaine action': p.prochaine_action_at
        ? formatDate(p.prochaine_action_at)
        : '',
      Volume: p.volume_apprenants ?? '',
      Développeur: p.commercial
        ? `${p.commercial.prenom} ${p.commercial.nom}`
        : '',
      'Contact mail': p.contact_principal?.email ?? p.dirigeant_email ?? '',
      'Contact tél':
        p.contact_principal?.telephone ?? p.dirigeant_telephone ?? '',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Prospects');
    XLSX.writeFile(
      wb,
      `prospects_export_${new Date().toISOString().split('T')[0]}.xlsx`,
    );
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="border-border/60 inline-flex items-center gap-1 rounded-lg border p-0.5">
          <button
            type="button"
            onClick={() => setView('me')}
            className={cn(
              TOGGLE_BASE,
              view === 'me' ? TOGGLE_ACTIVE : TOGGLE_INACTIVE,
            )}
            aria-pressed={view === 'me'}
          >
            Mes prospects
          </button>
          <button
            type="button"
            onClick={() => setView('all')}
            className={cn(
              TOGGLE_BASE,
              view === 'all' ? TOGGLE_ACTIVE : TOGGLE_INACTIVE,
            )}
            aria-pressed={view === 'all'}
          >
            Tous
          </button>
        </div>
        <Button variant="outline" size="sm" onClick={handleExport}>
          <Download className="mr-1.5 size-4" />
          Export Excel
        </Button>
      </div>
      <DataTable
        columns={prospectListColumns}
        data={filteredData}
        filters={filters}
        searchPlaceholder="Rechercher un prospect..."
        defaultSort={{ id: 'sante', desc: true }}
        onRowClick={(row) => push(`/commercial/prospects/${row.id}`)}
      />
    </div>
  );
}
