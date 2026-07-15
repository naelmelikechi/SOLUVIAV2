import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import type { ProjetFinance } from '@/lib/queries/projets';
import { formatCurrency } from '@/lib/utils/formatters';
import { ttcToHt } from '@/lib/utils/montant-ht';
import { Card } from '@/components/ui/card';
import { CommissionRateBadge } from '@/components/projets/commission-rate-badge';
import {
  ModeleFacturationControl,
  type ModeleFacturation,
} from '@/components/projets/modele-facturation-control';

function FinanceStatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="text-center">
      <div className="text-muted-foreground text-[11px] font-medium tracking-wider uppercase">
        {label}
      </div>
      <div className={`mt-1 text-lg font-semibold tabular-nums ${color}`}>
        {formatCurrency(value)}
      </div>
    </div>
  );
}

export function ProjetFinanceSection({
  finance,
  projetId,
  canEdit = false,
  modeleFacturation,
  echeancierTemplateId,
  echeancierTemplates,
}: {
  finance: ProjetFinance | null;
  projetId: string;
  canEdit?: boolean;
  modeleFacturation: ModeleFacturation;
  echeancierTemplateId: string | null;
  echeancierTemplates: Array<{ id: string; nom: string; is_default: boolean }>;
}) {
  if (!finance) {
    return (
      <Card className="p-6">
        <h3 className="mb-2 text-sm font-semibold">Finance</h3>
        <p className="text-muted-foreground text-sm">
          Aucune donnée financière
        </p>
      </Card>
    );
  }

  // Commission SOLUVIA en HT : taux × base donne le TTC, on en déduit le HT (/1.2).
  const commSoluvia = ttcToHt(finance.taux_commission / 100);

  // Ligne du bas côté SOLUVIA : cohérente avec l'espace Facturation
  // (les factures en base sont les commissions SOLUVIA, pas les montants OPCO).
  const production_soluvia = finance.production_opco * commSoluvia;
  const raf_soluvia = production_soluvia - finance.facture_soluvia;
  const rae_soluvia = finance.facture_soluvia - finance.encaisse_soluvia;

  return (
    <Card className="p-6">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Finance</h3>
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          <ModeleFacturationControl
            projetId={projetId}
            initialModele={modeleFacturation}
            initialTemplateId={echeancierTemplateId}
            templates={echeancierTemplates}
            canEdit={canEdit}
          />
          <CommissionRateBadge
            projetId={projetId}
            initialValue={finance.taux_commission}
            canEdit={canEdit}
          />
        </div>
      </div>

      {/* OPCO Side */}
      <div className="mb-4">
        <div className="text-muted-foreground mb-2 text-xs font-medium tracking-wider uppercase">
          Côté OPCO (bordereaux Eduvia)
        </div>
        <div className="grid grid-cols-3 gap-4">
          <FinanceStatCard
            label="Production"
            value={finance.production_opco}
            color="text-[var(--warning)]"
          />
          <FinanceStatCard
            label="Facturé"
            value={finance.facture_opco}
            color="text-[var(--warning)]"
          />
          <FinanceStatCard
            label="Encaissé"
            value={finance.encaisse_opco}
            color="text-primary"
          />
        </div>
      </div>

      {/* SOLUVIA Side */}
      <div className="mb-4">
        <div className="text-muted-foreground mb-2 text-xs font-medium tracking-wider uppercase">
          Côté SOLUVIA ({finance.taux_commission}%)
        </div>
        <div className="grid grid-cols-3 gap-4">
          <FinanceStatCard
            label="Production"
            value={production_soluvia}
            color="text-[var(--warning)]"
          />
          <FinanceStatCard
            label="Facturé"
            value={finance.facture_soluvia}
            color="text-[var(--warning)]"
          />
          <FinanceStatCard
            label="Encaissé"
            value={finance.encaisse_soluvia}
            color="text-primary"
          />
        </div>
      </div>

      {/* RAF / RAE / En retard - commission SOLUVIA */}
      <div className="border-border border-t pt-4">
        <div className="grid grid-cols-3 gap-4">
          <FinanceStatCard
            label="RAF commission (à facturer)"
            value={raf_soluvia}
            color={
              raf_soluvia > 0
                ? 'text-[var(--warning)]'
                : 'text-muted-foreground'
            }
          />
          <FinanceStatCard
            label="RAE commission (à encaisser)"
            value={rae_soluvia}
            color={
              rae_soluvia > 0
                ? 'text-[var(--warning)]'
                : 'text-muted-foreground'
            }
          />
          <FinanceStatCard
            label="En retard"
            value={finance.en_retard_soluvia}
            color={
              finance.en_retard_soluvia > 0
                ? 'text-red-600 dark:text-red-400'
                : 'text-muted-foreground'
            }
          />
        </div>
      </div>

      <Link
        href="/facturation"
        className="text-primary hover:text-primary/80 mt-3 inline-flex items-center gap-1 text-xs font-medium"
      >
        Voir les factures
        <ArrowRight className="size-3" />
      </Link>
    </Card>
  );
}
