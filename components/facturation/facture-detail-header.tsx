'use client';

import Link from 'next/link';
import { Copy } from 'lucide-react';
import { toast } from 'sonner';
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
    // mois_concerne can be ISO date "2025-03-01" or French text "janvier 2025"
    if (/^\d{4}-\d{2}/.test(facture.mois_concerne)) {
      try {
        const dateStr =
          facture.mois_concerne.length === 7
            ? facture.mois_concerne + '-01'
            : facture.mois_concerne;
        const moisLabel = format(parseISO(dateStr), 'MMMM yyyy', {
          locale: fr,
        });
        moisCapitalized =
          moisLabel.charAt(0).toUpperCase() + moisLabel.slice(1);
      } catch {
        moisCapitalized = facture.mois_concerne;
      }
    } else {
      // Already human-readable (e.g. "janvier 2025")
      moisCapitalized =
        facture.mois_concerne.charAt(0).toUpperCase() +
        facture.mois_concerne.slice(1);
    }
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
        <button
          onClick={() => {
            navigator.clipboard.writeText(facture.ref ?? '');
            toast.success('Référence copiée');
          }}
          className="text-muted-foreground hover:text-foreground ml-1 inline-flex items-center"
          title="Copier la référence"
        >
          <Copy className="h-3.5 w-3.5" />
        </button>
        <StatusBadge
          label={STATUT_FACTURE_LABELS[facture.statut] ?? facture.statut}
          color={STATUT_FACTURE_COLORS[facture.statut] ?? 'gray'}
        />
      </div>

      {/* Client + Projet + Mois */}
      <p className="text-muted-foreground text-sm">
        {facture.client?.id ? (
          <Link
            href={`/admin/clients/${facture.client.id}`}
            className="hover:text-foreground underline underline-offset-2 transition-colors"
          >
            {facture.client.raison_sociale}
          </Link>
        ) : (
          (facture.client?.raison_sociale ?? '')
        )}{' '}
        · Projet{' '}
        {facture.projet?.ref ? (
          <Link
            href={`/projets/${facture.projet.ref}`}
            className="font-mono text-orange-600 transition-colors hover:text-orange-800 dark:text-orange-400 dark:hover:text-orange-300"
          >
            {facture.projet.ref}
          </Link>
        ) : (
          ''
        )}{' '}
        · {moisCapitalized}
      </p>

      {/* Dates */}
      <p className="text-muted-foreground text-xs">
        Émise le{' '}
        {facture.date_emission ? formatDate(facture.date_emission) : '—'} ·
        Échéance{' '}
        {facture.date_echeance ? formatDate(facture.date_echeance) : '—'}
      </p>
    </div>
  );
}
