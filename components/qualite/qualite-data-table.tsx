'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Download, CheckCircle } from 'lucide-react';
import type { QualiteSummary } from '@/lib/queries/qualite';
import { DataTable } from '@/components/shared/data-table';
import { qualiteListColumns } from '@/components/qualite/qualite-list-columns';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/shared/empty-state';

export function QualiteDataTable({ data }: { data: QualiteSummary[] }) {
  const router = useRouter();

  const handleRowClick = (row: QualiteSummary) => {
    router.push(`/qualite/${row.projet.ref ?? ''}`);
  };

  const handleExport = async () => {
    const XLSX = await import('xlsx');
    const rows = data.map((q) => ({
      Projet: q.projet.ref ?? '',
      Client: q.projet.client?.raison_sociale ?? '',
      CDP: q.projet.cdp ? `${q.projet.cdp.prenom} ${q.projet.cdp.nom}` : '',
      'Total tâches': q.total,
      Terminées: q.terminees,
      'À réaliser': q.a_realiser,
      'Taux (%)': q.pct,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Qualité');
    XLSX.writeFile(
      wb,
      `qualite_export_${new Date().toISOString().split('T')[0]}.xlsx`,
    );
  };

  const summary = useMemo(() => {
    const totalLivrables = data.reduce((s, q) => s + q.total, 0);
    const terminees = data.reduce((s, q) => s + q.terminees, 0);
    const projetsConformes = data.filter(
      (q) => q.statutGlobal === 'conforme',
    ).length;
    const projetsAvecTaches = data.filter(
      (q) => q.statutGlobal !== 'sans_taches',
    ).length;
    return {
      totalLivrables,
      terminees,
      pctGlobal:
        totalLivrables > 0 ? Math.round((terminees / totalLivrables) * 100) : 0,
      projetsConformes,
      totalProjets: projetsAvecTaches,
    };
  }, [data]);

  if (data.length === 0) {
    return (
      <EmptyState
        icon={CheckCircle}
        title="Aucune tâche qualité"
        description="Aucun projet actif n'a de tâches qualité associées. Les tâches apparaîtront ici pour les projets actifs."
      />
    );
  }

  return (
    <div>
      {/* Recap global Qualiopi - taux complétion + projets conformes */}
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <div className="text-muted-foreground text-xs tracking-wide uppercase">
            Complétion globale
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-semibold tabular-nums">
              {summary.pctGlobal}%
            </span>
            <span className="text-muted-foreground text-xs tabular-nums">
              {summary.terminees} / {summary.totalLivrables} livrables
            </span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--border-light)]">
            <div
              className="bg-primary h-full rounded-full"
              style={{ width: `${summary.pctGlobal}%` }}
            />
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-muted-foreground text-xs tracking-wide uppercase">
            Projets conformes
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-semibold tabular-nums">
              {summary.projetsConformes}
            </span>
            <span className="text-muted-foreground text-xs tabular-nums">
              / {summary.totalProjets}
            </span>
          </div>
          <div className="text-muted-foreground mt-2 text-xs">
            10 familles, 109 livrables Qualiopi
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-muted-foreground text-xs tracking-wide uppercase">
            Reste à faire
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-semibold tabular-nums">
              {summary.totalLivrables - summary.terminees}
            </span>
            <span className="text-muted-foreground text-xs">livrables</span>
          </div>
          <div className="text-muted-foreground mt-2 text-xs">
            Tous projets actifs et en pause confondus
          </div>
        </Card>
      </div>

      <div className="mb-4 flex justify-end">
        <Button variant="outline" size="sm" onClick={handleExport}>
          <Download className="mr-1.5 h-4 w-4" />
          Export Excel
        </Button>
      </div>
      <DataTable
        columns={qualiteListColumns}
        data={data}
        searchKey="ref"
        searchPlaceholder="Rechercher un projet..."
        onRowClick={handleRowClick}
        defaultSort={{ id: 'pct', desc: false }}
      />
    </div>
  );
}
