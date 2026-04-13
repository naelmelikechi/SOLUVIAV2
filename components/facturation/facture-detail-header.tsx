import Link from 'next/link';
import { StatusBadge } from '@/components/shared/status-badge';
import type { FactureDetail } from '@/lib/queries/factures';
import {
  STATUT_FACTURE_LABELS,
  STATUT_FACTURE_COLORS,
} from '@/lib/utils/constants';
import { formatDate } from '@/lib/utils/formatters';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';

interface FactureDetailHeaderProps {
  facture: FactureDetail;
  avoirRef?: string | null;
}

export function FactureDetailHeader({
  facture,
  avoirRef,
}: FactureDetailHeaderProps) {
  let moisCapitalized = '';
  if (facture.mois_concerne) {
    const moisLabel = format(
      parseISO(facture.mois_concerne + '-01'),
      'MMMM yyyy',
      { locale: fr },
    );
    moisCapitalized = moisLabel.charAt(0).toUpperCase() + moisLabel.slice(1);
  }

  return (
    <div className="mb-6 space-y-2">
      {/* Avoir banner — this facture IS an avoir referencing another */}
      {facture.est_avoir && facture.facture_origine_id && avoirRef && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-400">
          Avoir sur la facture{' '}
          <Link
            href={`/facturation/${avoirRef}`}
            className="font-semibold underline underline-offset-2 hover:text-red-900 dark:hover:text-red-300"
          >
            {avoirRef}
          </Link>
        </div>
      )}

      {/* Ref + Status */}
      <div className="flex items-center gap-3">
        {facture.est_avoir && (
          <span className="text-sm font-bold tracking-wide text-red-600 dark:text-red-400">
            AVOIR
          </span>
        )}
        <span className="font-mono text-xl font-bold text-orange-600 dark:text-orange-400">
          {facture.ref}
        </span>
        <StatusBadge
          label={STATUT_FACTURE_LABELS[facture.statut] ?? facture.statut}
          color={STATUT_FACTURE_COLORS[facture.statut] ?? 'gray'}
        />
      </div>

      {/* Client + Projet + Mois */}
      <p className="text-muted-foreground text-sm">
        {facture.client?.raison_sociale ?? ''} · Projet{' '}
        <span className="font-mono text-orange-600 dark:text-orange-400">
          {facture.projet?.ref ?? ''}
        </span>{' '}
        · {moisCapitalized}
      </p>

      {/* Dates */}
      <p className="text-muted-foreground text-xs">
        Emise le{' '}
        {facture.date_emission ? formatDate(facture.date_emission) : '—'} ·
        Echeance{' '}
        {facture.date_echeance ? formatDate(facture.date_echeance) : '—'}
      </p>
    </div>
  );
}
