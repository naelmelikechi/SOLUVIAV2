'use client';

import { useMemo } from 'react';
import { Download, ArrowRight } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { formatDate } from '@/lib/utils/formatters';
import {
  STAGE_PROSPECT_LABELS,
  type StageProspect,
} from '@/lib/utils/constants';
import type {
  ProspectDetail,
  ProspectStageHistoryItem,
} from '@/lib/queries/prospects';

interface Props {
  prospect: ProspectDetail;
  stageHistory: ProspectStageHistoryItem[];
}

interface JournalRow {
  at: string;
  evenement: string;
  de: string;
  vers: string;
  par: string;
}

export function FicheHistorique({ prospect, stageHistory }: Props) {
  const rows = useMemo<JournalRow[]>(() => {
    const list: JournalRow[] = stageHistory.map((s) => ({
      at: s.changed_at,
      evenement: 'Changement d\u2019étape',
      de: s.from_stage
        ? (STAGE_PROSPECT_LABELS[s.from_stage as StageProspect] ?? s.from_stage)
        : '-',
      vers: STAGE_PROSPECT_LABELS[s.to_stage as StageProspect] ?? s.to_stage,
      par: s.changed_by_user
        ? `${s.changed_by_user.prenom} ${s.changed_by_user.nom}`
        : '-',
    }));
    list.push({
      at: prospect.created_at,
      evenement: 'Création de la fiche',
      de: '-',
      vers: prospect.nom,
      par: '-',
    });
    return list.sort(
      (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime(),
    );
  }, [stageHistory, prospect.created_at, prospect.nom]);

  function exportCsv() {
    const header = ['Date', 'Évènement', 'De', 'Vers', 'Par'];
    const lines = [
      header.join(';'),
      ...rows.map((r) =>
        [formatDate(r.at), r.evenement, r.de, r.vers, r.par]
          .map((v) => `"${v.replace(/"/g, '""')}"`)
          .join(';'),
      ),
    ];
    // BOM pour qu'Excel reconnaisse l'UTF-8 (accents FR).
    const blob = new Blob(['\uFEFF' + lines.join('\r\n')], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `historique-${prospect.nom.replace(/[^\w-]+/g, '_')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-muted-foreground text-sm">
          Journal immuable du prospect ({rows.length} évènement
          {rows.length > 1 ? 's' : ''})
        </p>
        <Button variant="outline" size="sm" onClick={exportCsv}>
          <Download className="mr-1 size-4" />
          Exporter CSV
        </Button>
      </div>

      <Card className="p-0">
        <ul className="divide-y">
          {rows.map((r, i) => (
            <li key={`${r.at}-${i}`} className="flex items-center gap-3 p-3">
              <span className="text-muted-foreground w-24 shrink-0 text-xs tabular-nums">
                {formatDate(r.at)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{r.evenement}</p>
                <p className="text-muted-foreground flex flex-wrap items-center gap-1.5 text-xs">
                  {r.de !== '-' && (
                    <>
                      <span>{r.de}</span>
                      <ArrowRight className="size-3" />
                    </>
                  )}
                  <span>{r.vers}</span>
                </p>
              </div>
              {r.par !== '-' && (
                <span className="text-muted-foreground shrink-0 text-xs">
                  {r.par}
                </span>
              )}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
