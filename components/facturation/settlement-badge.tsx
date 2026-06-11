import { StatusBadge, type BadgeColor } from '@/components/shared/status-badge';
import { formatCurrency } from '@/lib/utils/formatters';
import type { BillableEvent } from '@/lib/queries/billable-events';

const NDASH = '-';

// Etat de reglement OPCO d'un bordereau pour l'affichage. Un event 'available'
// dont invoice_state reste 'TRANSMIS' a son pedago regle par l'OPCO (c'est ce
// qui le rend facturable) ; seul le premier equipement (hors base commission)
// reste du. On affiche "Pedago regle" + montant recu, plutot que "Transmis"
// (trompeur, laissait croire que rien n'etait facturable).
export function settlementBadge(e: BillableEvent): {
  label: string;
  color: BadgeColor;
  note: string | null;
} {
  if (e.invoice_state === 'REGLE') {
    return { label: 'Payé', color: 'green', note: null };
  }
  if (e.status === 'available' && e.invoice_state === 'TRANSMIS') {
    const note =
      e.opco_settled_amount != null &&
      e.net_invoiced_amount != null &&
      e.opco_settled_amount < e.net_invoiced_amount
        ? `${formatCurrency(e.opco_settled_amount)} reçus / ${formatCurrency(
            e.net_invoiced_amount,
          )} · équipement en attente`
        : null;
    return { label: 'Pédago réglé', color: 'green', note };
  }
  if (e.invoice_state === 'TRANSMIS') {
    return { label: 'Transmis', color: 'orange', note: null };
  }
  return { label: e.invoice_state ?? NDASH, color: 'gray', note: null };
}

export function SettlementBadge({ event }: { event: BillableEvent }) {
  const { label, color, note } = settlementBadge(event);
  return (
    <>
      <StatusBadge label={label} color={color} />
      {note ? (
        <span className="text-muted-foreground text-[10px]">{note}</span>
      ) : null}
    </>
  );
}
