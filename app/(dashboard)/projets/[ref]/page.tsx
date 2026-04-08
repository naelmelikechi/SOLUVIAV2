import { notFound } from 'next/navigation';
import { getProjetByRef, getContratsByProjetId } from '@/lib/queries/projets';
import { MOCK_FINANCE, MOCK_TEMPS, MOCK_QUALITE } from '@/lib/mock-data';
import { Card } from '@/components/ui/card';
import { StatusBadge } from '@/components/shared/status-badge';
import { ProjectRef } from '@/components/shared/project-ref';
import { ProjetFinanceSection } from '@/components/projets/projet-finance-section';
import { ProjetTempsSection } from '@/components/projets/projet-temps-section';
import { ProjetQualiteSection } from '@/components/projets/projet-qualite-section';
import { formatDate, formatCurrency } from '@/lib/utils/formatters';
import {
  STATUT_PROJET_LABELS,
  STATUT_PROJET_COLORS,
} from '@/lib/utils/constants';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export default async function ProjetDetailPage({
  params,
}: {
  params: Promise<{ ref: string }>;
}) {
  const { ref } = await params;
  const projet = await getProjetByRef(ref);

  if (!projet) {
    notFound();
  }

  const contrats = await getContratsByProjetId(projet.id);

  // Mock data for sections not yet wired to Supabase
  // Using 'p1' as fallback — these will be replaced with real queries
  const finance = MOCK_FINANCE['p1'];
  const temps = MOCK_TEMPS['p1'];
  const qualite = MOCK_QUALITE['p1'];

  const contratsActifs = contrats.filter(
    (c) => c.contract_state === 'actif',
  ).length;

  return (
    <div>
      {/* Header */}
      <div className="mb-6 space-y-2">
        <div className="flex items-center gap-3">
          <ProjectRef ref_={projet.ref ?? ''} />
          <StatusBadge
            label={STATUT_PROJET_LABELS[projet.statut] || projet.statut}
            color={STATUT_PROJET_COLORS[projet.statut] || 'gray'}
          />
        </div>
        <p className="text-muted-foreground text-sm">
          {projet.client?.raison_sociale} · {projet.typologie?.libelle}
          {projet.cdp && ` · CDP ${projet.cdp.prenom} ${projet.cdp.nom}`}
        </p>
        {projet.date_debut && (
          <p className="text-muted-foreground text-xs">
            Début : {formatDate(projet.date_debut)} · Commission :{' '}
            {projet.taux_commission}%
          </p>
        )}
      </div>

      {/* Stat Cards */}
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card className="p-4">
          <div className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
            Typologie
          </div>
          <div className="mt-1 text-sm font-semibold">
            {projet.typologie?.libelle}
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
            Client
          </div>
          <div className="mt-1 text-sm font-semibold">
            {projet.client?.trigramme}
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
            Contrats actifs
          </div>
          <div className="mt-1 text-sm font-semibold">{contratsActifs}</div>
        </Card>
        <Card className="p-4">
          <div className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
            Commission
          </div>
          <div className="mt-1 text-sm font-semibold">
            {projet.taux_commission}%
          </div>
        </Card>
      </div>

      {/* Finance / Temps / Qualite (still mock) */}
      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <ProjetFinanceSection finance={finance} />
        <div className="space-y-6">
          <ProjetTempsSection temps={temps} />
          <ProjetQualiteSection qualite={qualite} />
        </div>
      </div>

      {/* Contrats (real data) */}
      <Card className="p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Contrats</h3>
          <span className="text-muted-foreground text-sm">
            {contratsActifs} contrat{contratsActifs > 1 ? 's' : ''} actif
            {contratsActifs > 1 ? 's' : ''}
          </span>
        </div>

        {contrats.length === 0 ? (
          <p className="text-muted-foreground text-sm">Aucun contrat</p>
        ) : (
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
                </TableRow>
              </TableHeader>
              <TableBody>
                {contrats.map((c) => (
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
                      {c.date_debut ? formatDate(c.date_debut) : '—'}
                    </TableCell>
                    <TableCell className="text-sm tabular-nums">
                      {c.date_fin ? formatDate(c.date_fin) : '—'}
                    </TableCell>
                    <TableCell>
                      <StatusBadge
                        label={c.contract_state}
                        color={
                          c.contract_state === 'actif'
                            ? 'green'
                            : c.contract_state === 'suspendu'
                              ? 'orange'
                              : c.contract_state === 'resilie'
                                ? 'red'
                                : 'gray'
                        }
                      />
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm tabular-nums">
                      {c.montant_prise_en_charge
                        ? formatCurrency(c.montant_prise_en_charge)
                        : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>
    </div>
  );
}
