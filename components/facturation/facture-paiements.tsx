'use client';

import { useEffect, useState, useTransition } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DataTable,
  DataTableColumnHeader,
} from '@/components/shared/data-table';
import { formatCurrency, formatDate } from '@/lib/utils/formatters';
import { differenceInDays, parseISO } from 'date-fns';
import { toast } from 'sonner';
import { addManualPayment } from '@/lib/actions/factures';
import { Plus, Sparkles } from 'lucide-react';

interface Paiement {
  id: string;
  montant: number;
  date_reception: string;
  saisie_manuelle: boolean;
}

interface BankLineSuggestion {
  id: string;
  date: string;
  montant: number;
  payment_ref: string | null;
  partner_name: string | null;
  societe_slug: string | null;
  score: number;
  reasons: string[];
}

const paiementColumns: ColumnDef<Paiement>[] = [
  {
    accessorKey: 'date_reception',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Date réception" />
    ),
    cell: ({ row }) => formatDate(row.original.date_reception),
  },
  {
    accessorKey: 'montant',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Montant" />
    ),
    cell: ({ row }) => (
      <span className="font-mono">{formatCurrency(row.original.montant)}</span>
    ),
  },
  {
    id: 'source',
    accessorFn: (p) => (p.saisie_manuelle ? 'Saisie manuelle' : 'Odoo'),
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Source" />
    ),
    cell: ({ getValue }) => (
      <span className="text-muted-foreground">{getValue<string>()}</span>
    ),
  },
];

interface FacturePaiementsProps {
  paiements: Paiement[];
  statut: string;
  date_echeance: string | null;
  factureId?: string;
  factureRef?: string;
  montantTtc?: number;
  // Role courant pour gating de l'action manuelle (push Odoo).
  // Reserve aux superadmins : ecriture comptable directe dans le livre Odoo.
  userRole?: string;
  // Si false, la facture n'a pas d'odoo_id et le push echouerait.
  odooSynced?: boolean;
}

// oxlint-disable-next-line react-doctor/no-giant-component
export function FacturePaiements({
  paiements,
  statut,
  date_echeance,
  factureId,
  factureRef,
  montantTtc,
  userRole,
  odooSynced = true,
  // oxlint-disable-next-line react-doctor/prefer-useReducer
}: FacturePaiementsProps) {
  const isEnRetard = statut === 'en_retard';
  const hasPaiements = paiements.length > 0;
  const isSuperAdmin = userRole === 'superadmin';
  const canAddPayment =
    isSuperAdmin &&
    odooSynced &&
    (statut === 'emise' || statut === 'en_retard');

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
  // Sentinelle : null = loading (en cours de fetch), array = résultat reçu.
  // Évite un setState séparé pour le loading (le linter `react-hooks/
  // set-state-in-effect` interdit setState synchrone dans un effect).
  const [suggestions, setSuggestions] = useState<BankLineSuggestion[] | null>(
    null,
  );
  const suggestionsLoading =
    showForm && Boolean(factureRef) && suggestions === null;

  // Synergie #2 : fetch les bank_lines miroir qui matchent (montant ± 0.01€,
  // ref dans payment_ref, date proche échéance) dès que le form s'ouvre.
  // L'utilisateur peut cliquer sur une suggestion pour pré-remplir date +
  // montant en 1 clic au lieu de saisir à la main.
  // oxlint-disable-next-line react-doctor/no-cascading-set-state, react-doctor/no-effect-event-handler, react-doctor/no-fetch-in-effect
  useEffect(() => {
    if (!showForm || !factureRef) return;
    let cancelled = false;
    fetch(
      `/api/factures/${encodeURIComponent(factureRef)}/bank-line-suggestions`,
    )
      .then((r) => (r.ok ? r.json() : Promise.reject(r.statusText)))
      .then((data: { suggestions?: BankLineSuggestion[] }) => {
        if (!cancelled) setSuggestions(data.suggestions ?? []);
      })
      .catch(() => {
        if (!cancelled) setSuggestions([]);
      });
    return () => {
      cancelled = true;
      // Reset au unmount/close pour que la prochaine ouverture re-fetch frais
      setSuggestions(null);
    };
  }, [showForm, factureRef]);

  const applySuggestion = (s: BankLineSuggestion) => {
    setMontant(String(s.montant));
    setDateReception(s.date);
  };

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
        <DataTable
          columns={paiementColumns}
          data={paiements}
          searchPlaceholder="Rechercher un paiement..."
          paginationMode="auto"
          emptyMessage="Aucun résultat."
        />
      ) : (
        <p className="text-muted-foreground text-sm">Aucun paiement reçu</p>
      )}

      {/* Manual payment form - superadmin only, push compta Odoo */}
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
              <Plus className="mr-1.5 size-3.5" />
              Marquer comme payée (Odoo)
            </Button>
          ) : (
            <div className="border-border space-y-3 rounded-lg border p-4">
              <p className="text-sm font-medium">
                Enregistrer le paiement dans Odoo
              </p>
              <p className="text-muted-foreground text-xs">
                Ce paiement sera poussé dans Odoo (account.payment) et lettré à
                la facture. L&apos;écriture comptable est inscrite immédiatement
                dans le livre - un retour en arrière nécessite une intervention
                manuelle dans Odoo (contre-écriture).
              </p>

              {/* Synergie #2 : suggestions depuis bank_lines_mirror (FINANCES) */}
              {suggestionsLoading && (
                <p className="text-muted-foreground text-xs italic">
                  Recherche dans le compte bancaire…
                </p>
              )}
              {!suggestionsLoading && suggestions && suggestions.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-muted-foreground flex items-center gap-1 text-xs font-medium">
                    <Sparkles className="size-3" />
                    Lignes bancaires correspondantes
                  </p>
                  <div className="space-y-1.5">
                    {suggestions.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => applySuggestion(s)}
                        className="border-border hover:bg-accent flex w-full items-start justify-between gap-3 rounded-md border p-2.5 text-left text-xs transition-colors"
                      >
                        <div className="min-w-0 flex-1 space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-medium">
                              {formatCurrency(s.montant)}
                            </span>
                            <span className="text-muted-foreground">
                              {formatDate(s.date)}
                            </span>
                            <span className="bg-muted text-muted-foreground inline-block rounded-full px-1.5 py-0.5 text-[10px] font-semibold">
                              score {s.score}
                            </span>
                          </div>
                          {s.payment_ref && (
                            <p className="text-muted-foreground truncate">
                              {s.payment_ref}
                            </p>
                          )}
                          <p className="text-muted-foreground text-[10px]">
                            {s.reasons.join(' - ')}
                          </p>
                        </div>
                        <span className="text-muted-foreground shrink-0 text-[10px]">
                          Utiliser
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-1">
                  <label
                    htmlFor="paiement-montant"
                    className="text-muted-foreground text-xs font-medium"
                  >
                    Montant (EUR)
                  </label>
                  <Input
                    id="paiement-montant"
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
                  <label
                    htmlFor="paiement-date"
                    className="text-muted-foreground text-xs font-medium"
                  >
                    Date de réception
                  </label>
                  <Input
                    id="paiement-date"
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
