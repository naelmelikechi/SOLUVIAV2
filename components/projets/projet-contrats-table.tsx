'use client';

import { useMemo, useState } from 'react';
import type { ContratRow } from '@/lib/queries/projets';
import { formatCurrency, formatDate } from '@/lib/utils/formatters';
import { StatusBadge, type BadgeColor } from '@/components/shared/status-badge';
import {
  TableSearchInput,
  filterBySearch,
} from '@/components/shared/table-search-input';
import { Card } from '@/components/ui/card';
import { isContratActif } from '@/lib/utils/contrat-states';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

const CONTRACT_STATE_LABELS: Record<string, string> = {
  actif: 'Actif',
  suspendu: 'Suspendu',
  resilie: 'Résilié',
  termine: 'Terminé',
  NOTSENT: 'Pas envoyé',
  TRANSMIS: 'Transmis',
  EN_COURS_INSTRUCTION: "En cours d'instruction",
  ENGAGE: 'Engagé',
  ANNULE: 'Annulé',
};

const CONTRACT_STATE_COLORS: Record<string, BadgeColor> = {
  actif: 'green',
  suspendu: 'orange',
  resilie: 'red',
  termine: 'gray',
  NOTSENT: 'gray',
  TRANSMIS: 'blue',
  EN_COURS_INSTRUCTION: 'orange',
  ENGAGE: 'green',
  ANNULE: 'red',
};

function computeProgressionTheorique(
  dateDebut: string | null,
  dateFin: string | null,
): number {
  if (!dateDebut || !dateFin) return 0;
  const start = new Date(dateDebut).getTime();
  const end = new Date(dateFin).getTime();
  const now = Date.now();
  const totalDays = (end - start) / (1000 * 60 * 60 * 24);
  if (totalDays <= 0) return 100;
  const elapsedDays = (now - start) / (1000 * 60 * 60 * 24);
  return Math.min(
    100,
    Math.max(0, Math.round((elapsedDays / totalDays) * 100)),
  );
}

function ProgressBar({
  value,
  comparison,
  color,
}: {
  value: number;
  comparison?: number;
  color: string;
}) {
  const isBelow = comparison !== undefined && value < comparison;
  const barColor = isBelow ? 'bg-[var(--warning)]' : color;

  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-20 overflow-hidden rounded-full bg-[var(--border-light)]">
        <div
          className={`h-full rounded-full ${barColor}`}
          style={{ width: `${Math.min(value, 100)}%` }}
        />
      </div>
      <span className="text-muted-foreground text-xs tabular-nums">
        {value}%
      </span>
    </div>
  );
}

export function ProjetContratsTable({ contrats }: { contrats: ContratRow[] }) {
  const [search, setSearch] = useState('');
  const actifs = contrats.filter((c) =>
    isContratActif(c.contract_state),
  ).length;

  const progressions = contrats.map((c) =>
    computeProgressionTheorique(c.date_debut, c.date_fin),
  );
  const moyenneProgression =
    progressions.length > 0
      ? Math.round(
          progressions.reduce((sum, p) => sum + p, 0) / progressions.length,
        )
      : 0;

  const filteredContrats = useMemo(
    () =>
      filterBySearch(contrats, search, (c) =>
        [
          c.ref,
          c.apprenant_prenom,
          c.apprenant_nom,
          c.formation_titre,
          CONTRACT_STATE_LABELS[c.contract_state] ?? c.contract_state,
        ]
          .filter(Boolean)
          .join(' '),
      ),
    [contrats, search],
  );

  return (
    <Card className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold">Contrats</h3>
          <StatusBadge label="Eduvia" color="orange" />
        </div>
        <div className="flex items-center gap-4">
          {contrats.length > 0 && (
            <span className="text-muted-foreground text-sm">
              Progression moyenne :{' '}
              <span className="font-semibold tabular-nums">
                {moyenneProgression}%
              </span>{' '}
              théorique
            </span>
          )}
          <span className="text-muted-foreground text-sm">
            {actifs} contrat{actifs > 1 ? 's' : ''} actif
            {actifs > 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {contrats.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Aucun contrat synchronisé
        </p>
      ) : (
        <>
          <div className="mb-3">
            <TableSearchInput
              value={search}
              onChange={setSearch}
              placeholder="Rechercher un contrat..."
            />
          </div>
          <div className="border-border overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Réf</TableHead>
                  <TableHead>Apprenant</TableHead>
                  <TableHead>Formation</TableHead>
                  <TableHead>Début</TableHead>
                  <TableHead>Fin</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead className="text-right">Prise en charge</TableHead>
                  <TableHead>Progression</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredContrats.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={8}
                      className="text-muted-foreground h-16 text-center text-sm"
                    >
                      Aucun résultat.
                    </TableCell>
                  </TableRow>
                )}
                {filteredContrats.map((c) => {
                  const progression = computeProgressionTheorique(
                    c.date_debut,
                    c.date_fin,
                  );
                  return (
                    <TableRow key={c.id}>
                      <TableCell>
                        <span className="inline-block rounded bg-[var(--orange-bg)] px-2 py-0.5 font-mono text-xs font-semibold text-[var(--warning)]">
                          {c.ref}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm">
                        {c.apprenant_prenom} {c.apprenant_nom}
                      </TableCell>
                      <TableCell
                        className="max-w-[200px] truncate text-sm"
                        title={c.formation_titre ?? ''}
                      >
                        {c.formation_titre}
                      </TableCell>
                      <TableCell className="text-sm tabular-nums">
                        {c.date_debut ? formatDate(c.date_debut) : '\u2014'}
                      </TableCell>
                      <TableCell className="text-sm tabular-nums">
                        {c.date_fin ? formatDate(c.date_fin) : '\u2014'}
                      </TableCell>
                      <TableCell>
                        <StatusBadge
                          label={
                            CONTRACT_STATE_LABELS[c.contract_state] ??
                            c.contract_state
                          }
                          color={
                            CONTRACT_STATE_COLORS[c.contract_state] ?? 'gray'
                          }
                        />
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm tabular-nums">
                        {c.montant_prise_en_charge
                          ? formatCurrency(c.montant_prise_en_charge)
                          : '\u2014'}
                      </TableCell>
                      <TableCell>
                        <ProgressBar
                          value={progression}
                          color="bg-[var(--gray)]"
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </Card>
  );
}
