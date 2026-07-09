'use client';
import * as React from 'react';
import { useTransition } from 'react';
import { type ColumnDef } from '@tanstack/react-table';
import { useRouter } from 'next/navigation';
import { runWithToast } from '@/components/crm/shared/run-with-toast';
import { DataTable } from '@/components/crm/shared/data-table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
import { moveOpportuniteStage } from '@/lib/crm/actions/opportunites';
import { label, statutOppLabel } from '@/lib/crm/labels';
import type { Etape, OppCard } from './types';

function exportCsv(rows: OppCard[], etapes: Etape[]) {
  const head = ['Intitulé', 'Compte', 'Probabilité', 'Étape', 'Statut'];
  const lines = rows.map((o) => [
    o.intitule,
    o.compte?.nom ?? '',
    o.probabilite != null ? `${o.probabilite}%` : '',
    etapes.find((e) => e.id === o.etape_id)?.libelle ?? '',
    o.statut,
  ]);
  const csv = [head, ...lines]
    .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';'))
    .join('\n');
  const url = URL.createObjectURL(
    new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' }),
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = 'opportunites.csv';
  a.click();
  URL.revokeObjectURL(url);
}

/** Pastille de couleur d'étape (même code visuel que le kanban). */
function EtapeDot({ couleur }: { couleur: string }) {
  return (
    <span
      className="h-2 w-2 shrink-0 rounded-full"
      style={{ background: couleur }}
    />
  );
}

/** Libellé d'étape précédé de sa pastille, pour le déclencheur ET la liste du sélecteur. */
function etapeLabel(e: Etape): React.ReactNode {
  return (
    <span className="flex items-center gap-1.5">
      <EtapeDot couleur={e.couleur} />
      {e.libelle}
    </span>
  );
}

/** Sélecteur d'étape d'une ligne, avec état `pending` pour éviter les changements
 *  rapides concurrents (course sur `moveOpportuniteStage`). */
function EtapeCell({
  opp,
  etapes,
  etapeItems,
}: {
  opp: OppCard;
  etapes: Etape[];
  etapeItems: { label: React.ReactNode; value: string }[];
}) {
  const [pending, start] = useTransition();
  return (
    <Select
      items={etapeItems}
      defaultValue={opp.etape_id}
      disabled={pending}
      onValueChange={(v) => {
        if (typeof v !== 'string') return;
        const e = etapes.find((x) => x.id === v);
        if (!e) return;
        // moveOpportuniteStage revalide /pipeline (route courante) : pas de refresh redondant.
        start(() =>
          runWithToast(() => moveOpportuniteStage(opp.id, v, e.libelle), {
            success: 'Étape mise à jour',
            error: 'Déplacement impossible',
          }),
        );
      }}
    >
      <SelectTrigger className="h-8 w-44">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {etapes.map((e) => (
          <SelectItem key={e.id} value={e.id}>
            {etapeLabel(e)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function OppTable({
  opportunites,
  etapes,
}: {
  opportunites: OppCard[];
  etapes: Etape[];
}) {
  const router = useRouter();
  const etapeItems = etapes.map((e) => ({ label: etapeLabel(e), value: e.id }));
  const columns: ColumnDef<OppCard>[] = [
    {
      accessorKey: 'intitule',
      header: 'Intitulé',
      cell: ({ row }) => (
        <button
          className="font-medium hover:underline"
          onClick={() => router.push(`/crm/pipeline?opp=${row.original.id}`)}
        >
          {row.original.intitule}
        </button>
      ),
    },
    {
      id: 'compte',
      header: 'Compte',
      cell: ({ row }) => row.original.compte?.nom ?? '-',
    },
    {
      accessorKey: 'probabilite',
      header: 'Prob.',
      cell: ({ row }) =>
        row.original.probabilite != null
          ? `${row.original.probabilite} %`
          : '-',
    },
    {
      id: 'etape',
      header: 'Étape',
      cell: ({ row }) => (
        <EtapeCell opp={row.original} etapes={etapes} etapeItems={etapeItems} />
      ),
    },
    {
      accessorKey: 'statut',
      header: 'Statut',
      cell: ({ row }) => {
        const s = row.original.statut;
        const cls =
          s === 'gagnee'
            ? 'text-success'
            : s === 'perdue'
              ? 'text-destructive'
              : '';
        return <span className={cls}>{label(statutOppLabel, s)}</span>;
      },
    },
  ];
  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <Button
          variant="outline"
          size="sm"
          onClick={() => exportCsv(opportunites, etapes)}
        >
          <Download className="mr-1 h-4 w-4" />
          Export CSV
        </Button>
      </div>
      <DataTable
        columns={columns}
        data={opportunites}
        rowTint={(o) => etapes.find((e) => e.id === o.etape_id)?.couleur}
        filterPlaceholder="Filtrer les opportunités…"
        emptyState={
          <>
            Aucune opportunité pour l&apos;instant. Utilisez le bouton «
            Nouvelle opportunité » pour démarrer.
          </>
        }
      />
    </div>
  );
}
