'use client';

import { useState, useTransition } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatCurrency, formatDate } from '@/lib/utils/formatters';
import { differenceInDays, parseISO } from 'date-fns';
import { toast } from 'sonner';
import { addManualPayment } from '@/lib/actions/factures';
import { Plus } from 'lucide-react';

interface Paiement {
  id: string;
  montant: number;
  date_reception: string;
  saisie_manuelle: boolean;
}

interface FacturePaiementsProps {
  paiements: Paiement[];
  statut: string;
  date_echeance: string | null;
  factureId?: string;
  montantTtc?: number;
}

export function FacturePaiements({
  paiements,
  statut,
  date_echeance,
  factureId,
  montantTtc,
}: FacturePaiementsProps) {
  const isEnRetard = statut === 'en_retard';
  const hasPaiements = paiements.length > 0;
  const canAddPayment = statut === 'emise' || statut === 'en_retard';

  const [showForm, setShowForm] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Calculate remaining amount
  const totalPaye = paiements.reduce((sum, p) => sum + p.montant, 0);
  const remaining = montantTtc
    ? Math.round((montantTtc - totalPaye) * 100) / 100
    : 0;

  const today = new Date().toISOString().split('T')[0]!;

  const [montant, setMontant] = useState(
    String(remaining > 0 ? remaining : ''),
  );
  const [dateReception, setDateReception] = useState(today);

  // Don't render anything if no payments and not overdue and can't add payment
  if (!hasPaiements && !isEnRetard && !canAddPayment) {
    return null;
  }

  const joursRetard =
    isEnRetard && date_echeance
      ? differenceInDays(new Date(), parseISO(date_echeance))
      : 0;

  const handleSubmit = () => {
    if (!factureId) return;
    const parsedMontant = parseFloat(montant);
    if (isNaN(parsedMontant) || parsedMontant <= 0) {
      toast.error('Montant invalide');
      return;
    }

    startTransition(async () => {
      const result = await addManualPayment({
        factureId,
        montant: parsedMontant,
        dateReception,
      });
      if (result.success) {
        toast.success('Paiement enregistré');
        setShowForm(false);
      } else {
        toast.error(result.error ?? 'Erreur');
      }
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <h3 className="text-sm font-semibold">Paiements</h3>
        {isEnRetard && joursRetard > 0 && (
          <span className="inline-block rounded-full bg-red-100 px-2.5 py-0.5 text-[11px] font-semibold text-red-700 dark:bg-red-950/40 dark:text-red-400">
            {joursRetard} jour{joursRetard > 1 ? 's' : ''} de retard
          </span>
        )}
      </div>

      {hasPaiements ? (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date réception</TableHead>
                <TableHead>Montant</TableHead>
                <TableHead>Source</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paiements.map((paiement) => (
                <TableRow key={paiement.id}>
                  <TableCell>{formatDate(paiement.date_reception)}</TableCell>
                  <TableCell className="font-mono">
                    {formatCurrency(paiement.montant)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {paiement.saisie_manuelle ? 'Saisie manuelle' : 'Odoo'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">Aucun paiement reçu</p>
      )}

      {/* Manual payment form */}
      {canAddPayment && factureId && (
        <div className="pt-2">
          {!showForm ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                // Reset form values when opening
                setMontant(String(remaining > 0 ? remaining : ''));
                setDateReception(today);
                setShowForm(true);
              }}
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Enregistrer un paiement
            </Button>
          ) : (
            <div className="border-border space-y-3 rounded-lg border p-4">
              <p className="text-sm font-medium">Nouveau paiement</p>
              <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-1">
                  <label className="text-muted-foreground text-xs font-medium">
                    Montant (EUR)
                  </label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={montant}
                    onChange={(e) => setMontant(e.target.value)}
                    className="w-[160px] font-mono"
                    placeholder="0.00"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-muted-foreground text-xs font-medium">
                    Date de réception
                  </label>
                  <Input
                    type="date"
                    value={dateReception}
                    onChange={(e) => setDateReception(e.target.value)}
                    className="w-[160px]"
                  />
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleSubmit} disabled={isPending}>
                    {isPending ? 'Enregistrement...' : 'Valider'}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowForm(false)}
                    disabled={isPending}
                  >
                    Annuler
                  </Button>
                </div>
              </div>
              {remaining > 0 && (
                <p className="text-muted-foreground text-xs">
                  Reste dû : {formatCurrency(remaining)}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
