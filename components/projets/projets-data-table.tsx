'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Download, ClipboardList, Star, Sparkles, Clock } from 'lucide-react';
import type { ColumnDef } from '@tanstack/react-table';
import type { ProjetListEnriched } from '@/lib/queries/projets';
import { DataTable } from '@/components/shared/data-table';
import type { FilterOption } from '@/components/shared/data-table';
import { projetListColumns } from '@/components/projets/projet-list-columns';
import { Button, buttonVariants } from '@/components/ui/button';
import { EmptyState } from '@/components/shared/empty-state';
import { formatDate } from '@/lib/utils/formatters';
import { STATUT_PROJET_LABELS } from '@/lib/utils/constants';
import { useFavorites } from '@/hooks/use-favorites';

const PROJET_FILTERS: FilterOption[] = [
  {
    column: 'statut',
    label: 'Statut',
    options: [
      { label: 'Actif', value: 'actif' },
      { label: 'En pause', value: 'en_pause' },
      { label: 'Terminé', value: 'termine' },
      { label: 'Archivé', value: 'archive' },
    ],
  },
  {
    column: 'typologie',
    label: 'Typologie',
    options: [
      { label: 'APP', value: 'APP' },
      { label: 'POE', value: 'POE' },
      { label: 'PDC', value: 'PDC' },
    ],
  },
];

export function ProjetsDataTable({
  data,
  userRole,
}: {
  data: ProjetListEnriched[];
  userRole?: string;
}) {
  const router = useRouter();
  const { favorites, toggle, isFavorite } = useFavorites();

  const handleRowClick = (row: ProjetListEnriched) => {
    router.push(`/projets/${row.ref}`);
  };

  const handleExport = async () => {
    const XLSX = await import('xlsx');
    const rows = data.map((p) => ({
      Ref: p.ref ?? '',
      Client: p.client?.raison_sociale ?? '',
      Typologie: p.typologie?.libelle ?? '',
      CDP: p.cdp ? `${p.cdp.prenom} ${p.cdp.nom}` : '',
      Statut: STATUT_PROJET_LABELS[p.statut] || p.statut,
      'Date début': p.date_debut ? formatDate(p.date_debut) : '',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Projets');
    XLSX.writeFile(
      wb,
      `projets_export_${new Date().toISOString().split('T')[0]}.xlsx`,
    );
  };

  // Star column prepended to existing columns
  const columnsWithStar = useMemo<ColumnDef<ProjetListEnriched>[]>(() => {
    const starColumn: ColumnDef<ProjetListEnriched> = {
      id: '_favorite',
      header: () => <span className="sr-only">Favori</span>,
      cell: ({ row }) => {
        const id = row.original.id;
        const fav = isFavorite(id);
        return (
          <button
            type="button"
            aria-label={fav ? 'Retirer des favoris' : 'Ajouter aux favoris'}
            className="flex items-center justify-center p-0.5 transition-colors hover:text-yellow-500"
            onClick={(e) => {
              e.stopPropagation();
              toggle(id);
            }}
          >
            <Star
              className={`h-4 w-4 ${fav ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground'}`}
            />
          </button>
        );
      },
      size: 36,
      enableSorting: false,
      enableResizing: false,
    };
    return [starColumn, ...projetListColumns];
  }, [isFavorite, toggle]);

  // Sort favorites to top, preserving original order within each group
  const sortedData = useMemo(() => {
    return [...data].sort((a, b) => {
      const aFav = favorites.has(a.id) ? 0 : 1;
      const bFav = favorites.has(b.id) ? 0 : 1;
      return aFav - bFav;
    });
  }, [data, favorites]);

  if (data.length === 0) {
    const isCdp = userRole === 'cdp';
    if (isCdp) {
      return (
        <EmptyState
          icon={ClipboardList}
          title="Aucun projet assigné"
          description="Aucun projet ne vous est assigné pour le moment. En attendant, suivez votre onboarding ou saisissez votre temps interne."
        >
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Link
              href="/accueil"
              className={buttonVariants({ variant: 'default', size: 'sm' })}
            >
              <Sparkles className="mr-1 h-3.5 w-3.5" />
              Mon accueil
            </Link>
            <Link
              href="/temps"
              className={buttonVariants({ variant: 'outline', size: 'sm' })}
            >
              <Clock className="mr-1 h-3.5 w-3.5" />
              Saisir mon temps interne
            </Link>
          </div>
        </EmptyState>
      );
    }
    return (
      <EmptyState
        icon={ClipboardList}
        title="Aucun projet"
        description="Il n'y a pas encore de projet enregistré. Les projets apparaîtront ici une fois synchronisés depuis Eduvia."
      />
    );
  }

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <Button variant="outline" size="sm" onClick={handleExport}>
          <Download className="mr-1.5 h-4 w-4" />
          Export Excel
        </Button>
      </div>
      <DataTable
        columns={columnsWithStar}
        data={sortedData}
        searchKey="ref"
        searchPlaceholder="Rechercher un projet..."
        onRowClick={handleRowClick}
        defaultSort={{ id: 'ref', desc: true }}
        filters={PROJET_FILTERS}
      />
    </div>
  );
}
