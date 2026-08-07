'use client';

import { useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Card } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DataTable,
  DataTableColumnHeader,
} from '@/components/shared/data-table';
import { formatCurrency } from '@/lib/utils/formatters';
import type {
  LigneFinance,
  ProjetFinanceDetail,
} from '@/lib/queries/projet-finance-detail';

type CleFlux = 'commission' | 'opco';
type CleMontant =
  | 'produit'
  | 'facture'
  | 'retardFacturation'
  | 'retardEncaissement';

const FLUX_LABELS: Record<CleFlux, string> = {
  commission: 'Notre commission',
  opco: 'Financement OPCO',
};

const MONTANT_LABELS: Record<CleMontant, string> = {
  produit: 'Produit',
  facture: 'Facturé',
  retardFacturation: 'Retard de facturation',
  retardEncaissement: "Retard d'encaissement",
};

// Seuls les deux retards ont un decompte ligne a ligne : produit et facture
// sont des totaux agreges deja affiches dans le bandeau, sans reconstitution
// contrat par contrat exposee par la query.
const MONTANTS_AVEC_LIGNES: ReadonlySet<CleMontant> = new Set([
  'retardFacturation',
  'retardEncaissement',
]);

function lignesPour(
  detail: ProjetFinanceDetail,
  flux: CleFlux,
  montant: CleMontant,
): LigneFinance[] {
  const f = detail[flux];
  if (montant === 'retardFacturation') return f.lignesRetardFacturation;
  if (montant === 'retardEncaissement') return f.lignesRetardEncaissement;
  return [];
}

function montantTotal(
  detail: ProjetFinanceDetail,
  flux: CleFlux,
  montant: CleMontant,
): number {
  return detail[flux][montant];
}

const columns: ColumnDef<LigneFinance>[] = [
  {
    accessorKey: 'label',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Contrat" />
    ),
    cell: ({ row }) => (
      <span className="text-sm font-medium">{row.original.label}</span>
    ),
  },
  {
    accessorKey: 'detail',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Détail" />
    ),
    cell: ({ row }) => (
      <span className="text-muted-foreground text-xs">
        {row.original.detail}
      </span>
    ),
  },
  {
    accessorKey: 'montant',
    header: ({ column }) => (
      <DataTableColumnHeader
        column={column}
        title="Montant"
        className="justify-end"
      />
    ),
    cell: ({ row }) => (
      <div className="text-right font-mono text-sm tabular-nums">
        {formatCurrency(row.original.montant)}
      </div>
    ),
  },
];

/** Une ligne du bandeau "4 montants" d'un bloc. */
function StatItem({
  label,
  valeur,
  alerte,
}: {
  label: string;
  valeur: string;
  alerte?: boolean;
}) {
  return (
    <div>
      <div className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">
        {label}
      </div>
      <div
        className={`font-mono text-lg font-semibold tabular-nums ${
          alerte ? 'text-[var(--warning)]' : 'text-foreground'
        }`}
      >
        {valeur}
      </div>
    </div>
  );
}

function BlocFlux({
  titre,
  sousTitre,
  flux,
}: {
  titre: string;
  sousTitre?: string;
  flux: ProjetFinanceDetail['commission'];
}) {
  return (
    <Card className="p-6">
      <h3 className="text-sm font-semibold">{titre}</h3>
      {sousTitre && (
        <p className="text-muted-foreground mt-0.5 text-xs">{sousTitre}</p>
      )}
      <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatItem label="Produit" valeur={formatCurrency(flux.produit)} />
        <StatItem label="Facturé" valeur={formatCurrency(flux.facture)} />
        <StatItem
          label="Retard facturation"
          valeur={formatCurrency(flux.retardFacturation)}
          alerte={flux.retardFacturation > 0}
        />
        <StatItem
          label="Retard encaissement"
          valeur={formatCurrency(flux.retardEncaissement)}
          alerte={flux.retardEncaissement > 0}
        />
      </div>
    </Card>
  );
}

/**
 * Detail financier d'un projet sur ses deux flux : la commission que SOLUVIA
 * facture au client, et le financement que le CFA facture a l'OPCO dans
 * Eduvia. Deux blocs bien separes en bandeau, et EN DESSOUS un seul tableau
 * a la fois - deux selecteurs (flux, montant) plutot que huit chiffres et
 * deux tableaux affiches en meme temps.
 */
export function ProjetFinanceFlux({ detail }: { detail: ProjetFinanceDetail }) {
  const [flux, setFlux] = useState<CleFlux>('commission');
  const [montant, setMontant] = useState<CleMontant>('retardFacturation');

  const lignes = useMemo(
    () => lignesPour(detail, flux, montant),
    [detail, flux, montant],
  );
  const total = montantTotal(detail, flux, montant);
  const avecLignes = MONTANTS_AVEC_LIGNES.has(montant);

  return (
    <div className="space-y-6">
      <BlocFlux titre="Notre commission" flux={detail.commission} />
      <BlocFlux
        titre="Financement OPCO"
        sousTitre="Montants transmis à l'OPCO dans Eduvia, dans leur unité d'origine - non convertis, non comparables aux montants HT de la commission."
        flux={detail.opco}
      />

      <Card className="p-6">
        <div className="mb-4 flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground text-sm">Flux :</span>
            <Select
              value={flux}
              onValueChange={(v) => v && setFlux(v as CleFlux)}
            >
              <SelectTrigger className="min-w-[180px]">
                <SelectValue>{() => FLUX_LABELS[flux]}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(FLUX_LABELS) as CleFlux[]).map((k) => (
                  <SelectItem key={k} value={k}>
                    {FLUX_LABELS[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground text-sm">Montant :</span>
            <Select
              value={montant}
              onValueChange={(v) => v && setMontant(v as CleMontant)}
            >
              <SelectTrigger className="min-w-[220px]">
                <SelectValue>{() => MONTANT_LABELS[montant]}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(MONTANT_LABELS) as CleMontant[]).map((k) => (
                  <SelectItem key={k} value={k}>
                    {MONTANT_LABELS[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <span className="text-muted-foreground ml-auto text-sm">
            Total :{' '}
            <span className="font-mono font-semibold tabular-nums">
              {formatCurrency(total)}
            </span>
          </span>
        </div>

        <DataTable
          columns={columns}
          data={lignes}
          paginationMode="auto"
          searchPlaceholder="Rechercher..."
          emptyMessage={
            avecLignes
              ? 'Aucune ligne : rien en retard sur ce montant.'
              : 'Montant total agrégé, sans décompte ligne à ligne pour cet indicateur.'
          }
        />
      </Card>
    </div>
  );
}
