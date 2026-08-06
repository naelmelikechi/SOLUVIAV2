import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import type { ProjetFinance } from '@/lib/queries/projets';
import { formatCurrency } from '@/lib/utils/formatters';
import { productionSoluviaHt } from '@/lib/utils/montant-ht';
import { Card } from '@/components/ui/card';
import { StatusBadge } from '@/components/shared/status-badge';
import { CommissionRateBadge } from '@/components/projets/commission-rate-badge';
import {
  ModeleFacturationControl,
  type ModeleFacturation,
} from '@/components/projets/modele-facturation-control';

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

  // Ligne SOLUVIA : cohérente avec l'espace Facturation
  // (les factures en base sont les commissions SOLUVIA, pas les montants OPCO).
  // RAF clampé à 0 quand il n'y a pas de production (projet libre / taux 0) :
  // un reste à facturer négatif n'a pas de sens affiché.
  // Formule partagee avec la carte de synthese (lib/utils/montant-ht.ts).
  const production_soluvia = productionSoluviaHt(
    finance.production_opco,
    finance.taux_commission,
  );
  const raf_soluvia =
    production_soluvia > 0 ? production_soluvia - finance.facture_soluvia : 0;
  const rae_soluvia = finance.facture_soluvia - finance.encaisse_soluvia;
  // Equivalents TTC : production = commission contractuelle TTC-native
  // (taux x base, sans /1.2) ; facture/encaisse = montant_ttc des factures
  // (valeurs PDF) et paiements bruts ; RAF/RAE derives.
  const production_soluvia_ttc =
    finance.production_opco * (finance.taux_commission / 100);
  const raf_soluvia_ttc =
    production_soluvia_ttc > 0
      ? production_soluvia_ttc - finance.facture_soluvia_ttc
      : 0;
  const rae_soluvia_ttc =
    finance.facture_soluvia_ttc - finance.encaisse_soluvia_ttc;

  return (
    <Card className="p-6">
      <div className="mb-4 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold">Finance</h3>
          {finance.en_retard_soluvia > 0 && (
            <StatusBadge
              label={`Retard ${formatCurrency(finance.en_retard_soluvia)} HT (${formatCurrency(finance.en_retard_soluvia_ttc)} TTC)`}
              color="red"
            />
          )}
        </div>
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

      {/* SOLUVIA en ligne principale, OPCO en ligne secondaire : meme grille
          Production / Facturé / Encaissé, hiérarchie par la typo. */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-muted-foreground text-[11px] font-medium tracking-wider uppercase">
              <th className="pb-2 text-left font-medium" />
              <th className="pb-2 text-right font-medium">Production</th>
              <th className="pb-2 text-right font-medium">Facturé</th>
              <th className="pb-2 text-right font-medium">Encaissé</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-border border-t">
              <td className="py-2.5 pr-2 font-medium whitespace-nowrap">
                SOLUVIA ({finance.taux_commission}%)
              </td>
              <td className="py-2.5 pl-2 text-right font-semibold tabular-nums">
                {formatCurrency(production_soluvia)}
                <span className="text-muted-foreground block text-[10px] leading-tight font-normal">
                  {formatCurrency(production_soluvia_ttc)} TTC
                </span>
              </td>
              <td className="py-2.5 pl-2 text-right font-semibold tabular-nums">
                {formatCurrency(finance.facture_soluvia)}
                <span className="text-muted-foreground block text-[10px] leading-tight font-normal">
                  {formatCurrency(finance.facture_soluvia_ttc)} TTC
                </span>
              </td>
              <td className="text-primary py-2.5 pl-2 text-right font-semibold tabular-nums">
                {formatCurrency(finance.encaisse_soluvia)}
                <span className="text-muted-foreground block text-[10px] leading-tight font-normal">
                  {formatCurrency(finance.encaisse_soluvia_ttc)} TTC
                </span>
              </td>
            </tr>
            <tr className="border-border text-muted-foreground border-t text-xs">
              <td className="py-2 pr-2 whitespace-nowrap">
                OPCO (bordereaux Eduvia, hors 1er équipement)
              </td>
              <td className="py-2 pl-2 text-right tabular-nums">
                {formatCurrency(finance.production_opco)}
              </td>
              <td className="py-2 pl-2 text-right tabular-nums">
                {formatCurrency(finance.facture_opco)}
              </td>
              <td className="py-2 pl-2 text-right tabular-nums">
                {formatCurrency(finance.encaisse_opco)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {(finance.facture_soluvia_engagement > 0 ||
        finance.facture_soluvia_echeances > 0) && (
        <p className="text-muted-foreground mt-1 text-[11px] tabular-nums">
          dont étape 1 (engagement) :{' '}
          {formatCurrency(finance.facture_soluvia_engagement)}
          {' - '}
          échéances : {formatCurrency(finance.facture_soluvia_echeances)}
        </p>
      )}

      <div className="border-border mt-4 flex flex-wrap items-center gap-x-6 gap-y-1 border-t pt-3 text-xs">
        <span className="text-muted-foreground">
          RAF (à facturer){' '}
          <span
            className={`font-semibold tabular-nums ${
              raf_soluvia > 0
                ? 'text-[var(--warning)]'
                : 'text-muted-foreground'
            }`}
          >
            {formatCurrency(raf_soluvia)} HT ({formatCurrency(raf_soluvia_ttc)}{' '}
            TTC)
          </span>
        </span>
        <span className="text-muted-foreground">
          RAE (à encaisser){' '}
          <span
            className={`font-semibold tabular-nums ${
              rae_soluvia > 0
                ? 'text-[var(--warning)]'
                : 'text-muted-foreground'
            }`}
          >
            {formatCurrency(rae_soluvia)} HT ({formatCurrency(rae_soluvia_ttc)}{' '}
            TTC)
          </span>
        </span>
        <Link
          href="/facturation"
          className="text-primary hover:text-primary/80 ml-auto inline-flex items-center gap-1 font-medium"
        >
          Voir les factures
          <ArrowRight className="size-3" />
        </Link>
      </div>
    </Card>
  );
}
