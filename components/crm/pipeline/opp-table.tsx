'use client';
import * as React from 'react';
import { useMemo, useTransition } from 'react';
import { type ColumnDef } from '@tanstack/react-table';
import { useRouter } from 'next/navigation';
import { runWithToast } from '@/components/crm/shared/run-with-toast';
import {
  DataTable,
  DataTableColumnHeader,
  type FilterOption,
} from '@/components/shared/data-table';
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
import { textFilterFn } from '@/lib/utils/table-filters';
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

/** Couleur d'étape validée avant injection dans un bloc <style> (hex uniquement). */
const HEX_COLOR = /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

export function OppTable({
  opportunites,
  etapes,
}: {
  opportunites: OppCard[];
  etapes: Etape[];
}) {
  const router = useRouter();
  const etapeItems = etapes.map((e) => ({ label: etapeLabel(e), value: e.id }));

  // Teinte de fond par étape : rowClassName ne porte que des classes, donc on
  // génère une classe par étape (couleur DB inconnue au build de Tailwind) et
  // les règles CSS correspondantes - mêmes ratios color-mix que l'ancien socle
  // CRM (18/28 % clair, 16/24 % sombre, hover inclus).
  const { tintCss, tintClassByEtape } = useMemo(() => {
    const rules: string[] = [];
    const byEtape = new Map<string, string>();
    etapes.forEach((e, i) => {
      if (!HEX_COLOR.test(e.couleur)) return;
      const cls = `crm-opp-tint-${i}`;
      byEtape.set(e.id, cls);
      rules.push(
        `.${cls}{background-color:color-mix(in srgb,${e.couleur} 18%,transparent)}` +
          `.${cls}:hover{background-color:color-mix(in srgb,${e.couleur} 28%,transparent)}` +
          `.dark .${cls}{background-color:color-mix(in srgb,${e.couleur} 16%,transparent)}` +
          `.dark .${cls}:hover{background-color:color-mix(in srgb,${e.couleur} 24%,transparent)}`,
      );
    });
    return { tintCss: rules.join('\n'), tintClassByEtape: byEtape };
  }, [etapes]);

  const etapeById = useMemo(
    () => new Map(etapes.map((e) => [e.id, e])),
    [etapes],
  );

  const columns: ColumnDef<OppCard>[] = [
    {
      accessorKey: 'intitule',
      enableHiding: false,
      meta: { label: 'Intitulé' },
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Intitulé" />
      ),
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
      meta: { label: 'Compte' },
      accessorFn: (row) => row.compte?.nom ?? '',
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title="Compte"
          filterVariant="text"
        />
      ),
      cell: ({ row }) => row.original.compte?.nom ?? '-',
      enableColumnFilter: true,
      filterFn: textFilterFn,
    },
    {
      accessorKey: 'probabilite',
      meta: {
        label: 'Probabilité',
        aggregate: 'avg',
        aggregateFormat: (v) => `${Math.round(v)} %`,
      },
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Prob." />
      ),
      cell: ({ row }) =>
        row.original.probabilite != null
          ? `${row.original.probabilite} %`
          : '-',
    },
    {
      id: 'etape',
      meta: { label: 'Étape' },
      accessorFn: (row) => etapeById.get(row.etape_id)?.libelle ?? '',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Étape" />
      ),
      cell: ({ row }) => (
        <EtapeCell opp={row.original} etapes={etapes} etapeItems={etapeItems} />
      ),
      enableColumnFilter: true,
      filterFn: textFilterFn,
      // Tri par ordre du pipeline plutôt qu'alphabétique sur le libellé.
      sortingFn: (a, b) =>
        (etapeById.get(a.original.etape_id)?.ordre ?? 0) -
        (etapeById.get(b.original.etape_id)?.ordre ?? 0),
    },
    {
      accessorKey: 'statut',
      meta: { label: 'Statut' },
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Statut" />
      ),
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

  const filters: FilterOption[] = [
    {
      column: 'etape',
      label: 'Étape',
      options: etapes.map((e) => ({ label: e.libelle, value: e.libelle })),
    },
  ];

  return (
    <>
      {tintCss && <style>{tintCss}</style>}
      <DataTable
        columns={columns}
        data={opportunites}
        searchPlaceholder="Rechercher une opportunité..."
        filters={filters}
        paginationMode="auto"
        rowClassName={(o) => tintClassByEtape.get(o.etape_id)}
        toolbarExtra={
          <Button
            variant="outline"
            size="sm"
            onClick={() => exportCsv(opportunites, etapes)}
          >
            <Download className="mr-1 h-4 w-4" />
            Export CSV
          </Button>
        }
        emptyMessage={
          <>
            Aucune opportunité pour l&apos;instant. Utilisez le bouton «
            Nouvelle opportunité » pour démarrer.
          </>
        }
      />
    </>
  );
}
