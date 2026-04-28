'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { Wallet, ChevronDown, ChevronRight } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import {
  computeHourlyCost,
  resolveEmployeeCost,
  type EmployeeCostInputs,
  type EmployeeCostDefaults,
} from '@/lib/utils/employee-cost';
import {
  fetchUserCost,
  saveUserCost,
} from '@/components/admin/user-cost-actions';

interface UserCostSectionProps {
  userId: string;
  defaults: EmployeeCostDefaults;
}

const FIELDS: Array<{
  key: keyof EmployeeCostInputs;
  label: string;
  placeholder: (d: EmployeeCostDefaults) => string;
  unit: string;
  step?: string;
  hint?: string;
}> = [
  {
    key: 'salaire_brut_annuel',
    label: 'Salaire brut annuel',
    placeholder: (d) => String(d.salaire_brut_annuel),
    unit: '€',
    step: '100',
    hint: '12 mois × brut mensuel (avant charges patronales).',
  },
  {
    key: 'primes_annuelles',
    label: 'Primes annuelles',
    placeholder: (d) => String(d.primes_annuelles),
    unit: '€',
    step: '100',
    hint: '13e mois, prime de fin d’année, intéressement.',
  },
  {
    key: 'avantages_annuels',
    label: 'Avantages annuels',
    placeholder: (d) => String(d.avantages_annuels),
    unit: '€',
    step: '100',
    hint: 'Tickets resto + mutuelle + télétravail (part employeur).',
  },
  {
    key: 'taux_charges_patronales',
    label: 'Charges patronales',
    placeholder: (d) => String(d.taux_charges_patronales),
    unit: '%',
    step: '0.5',
    hint: 'Appliqué sur le brut. ~42 % en France pour un cadre.',
  },
  {
    key: 'heures_hebdo',
    label: 'Heures hebdo',
    placeholder: (d) => String(d.heures_hebdo),
    unit: 'h',
    step: '0.5',
    hint: '35 (standard) / 39 (cadre) / 17,5 (mi-temps).',
  },
  {
    key: 'jours_conges_payes',
    label: 'Congés payés',
    placeholder: (d) => String(d.jours_conges_payes),
    unit: 'j',
    step: '1',
    hint: 'Jours ouvrés de CP par an.',
  },
  {
    key: 'jours_rtt',
    label: 'Jours RTT',
    placeholder: (d) => String(d.jours_rtt),
    unit: 'j',
    step: '1',
    hint: 'Cadre au forfait jours en a typiquement 8-12.',
  },
];

export function UserCostSection({ userId, defaults }: UserCostSectionProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, startSaving] = useTransition();
  const [values, setValues] = useState<
    Record<keyof EmployeeCostInputs, string>
  >({
    salaire_brut_annuel: '',
    primes_annuelles: '',
    avantages_annuels: '',
    taux_charges_patronales: '',
    heures_hebdo: '',
    jours_conges_payes: '',
    jours_rtt: '',
  });

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    // Charge a l'ouverture du panneau. setState dans l'effet est OK ici :
    // c'est une synchronisation explicite avec une ressource externe.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    fetchUserCost(userId)
      .then((data) => {
        if (cancelled || !data) return;
        setValues({
          salaire_brut_annuel: data.salaire_brut_annuel?.toString() ?? '',
          primes_annuelles: data.primes_annuelles?.toString() ?? '',
          avantages_annuels: data.avantages_annuels?.toString() ?? '',
          taux_charges_patronales:
            data.taux_charges_patronales?.toString() ?? '',
          heures_hebdo: data.heures_hebdo?.toString() ?? '',
          jours_conges_payes: data.jours_conges_payes?.toString() ?? '',
          jours_rtt: data.jours_rtt?.toString() ?? '',
        });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, userId]);

  const inputsTyped = useMemo<EmployeeCostInputs>(
    () => ({
      salaire_brut_annuel: parseOrNull(values.salaire_brut_annuel),
      primes_annuelles: parseOrNull(values.primes_annuelles),
      avantages_annuels: parseOrNull(values.avantages_annuels),
      taux_charges_patronales: parseOrNull(values.taux_charges_patronales),
      heures_hebdo: parseOrNull(values.heures_hebdo),
      jours_conges_payes: parseIntOrNull(values.jours_conges_payes),
      jours_rtt: parseIntOrNull(values.jours_rtt),
    }),
    [values],
  );

  const breakdown = useMemo(
    () => computeHourlyCost(resolveEmployeeCost(inputsTyped, defaults)),
    [inputsTyped, defaults],
  );

  const handleSave = () => {
    startSaving(async () => {
      const result = await saveUserCost(userId, inputsTyped);
      if (result.success) {
        toast.success('Coût employé mis à jour');
      } else {
        toast.error(result.error ?? 'Erreur');
      }
    });
  };

  return (
    <div className="border-border rounded-lg border">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="hover:bg-muted/40 flex w-full items-center gap-2 rounded-t-lg p-3 text-left transition-colors"
      >
        {open ? (
          <ChevronDown className="h-4 w-4" />
        ) : (
          <ChevronRight className="h-4 w-4" />
        )}
        <Wallet className="h-4 w-4" />
        <span className="text-sm font-medium">Coût employé (admin)</span>
        <span className="text-muted-foreground ml-auto text-xs">
          {breakdown.coutHoraire.toFixed(2)} €/h calculé
        </span>
      </button>
      {open && (
        <div className="space-y-3 border-t p-4">
          {loading && (
            <p className="text-muted-foreground text-xs">Chargement...</p>
          )}
          <p className="text-muted-foreground text-xs">
            Laisser vide = utiliser la valeur par défaut SOLUVIA. La donnée est
            limitée aux administrateurs (read/write côté DB).
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {FIELDS.map((f) => (
              <div key={f.key} className="space-y-1">
                <Label htmlFor={`cost-${f.key}`} className="text-xs">
                  {f.label}
                </Label>
                <div className="relative">
                  <Input
                    id={`cost-${f.key}`}
                    type="number"
                    step={f.step}
                    min="0"
                    value={values[f.key]}
                    placeholder={f.placeholder(defaults)}
                    onChange={(e) =>
                      setValues((v) => ({ ...v, [f.key]: e.target.value }))
                    }
                    className="pr-8 font-mono text-sm tabular-nums"
                    disabled={saving || loading}
                  />
                  <span className="text-muted-foreground absolute top-1/2 right-2 -translate-y-1/2 text-xs">
                    {f.unit}
                  </span>
                </div>
                {f.hint && (
                  <p className="text-muted-foreground text-[11px]">{f.hint}</p>
                )}
              </div>
            ))}
          </div>

          <div className="bg-muted/50 space-y-1 rounded-md p-3 text-xs tabular-nums">
            <Row
              label="Brut chargé"
              value={`${formatEuro(breakdown.brutCharge)} /an`}
            />
            <Row
              label="Coût total annuel"
              value={`${formatEuro(breakdown.coutTotalAnnuel)} /an`}
              strong
            />
            <Row
              label="Heures effectives"
              value={`${breakdown.heuresEffectives.toFixed(0)} h /an`}
            />
            <div className="bg-border my-2 h-px" />
            <Row
              label="Coût horaire"
              value={`${breakdown.coutHoraire.toFixed(2)} €/h`}
              strong
              accent
            />
          </div>

          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={saving || loading}>
              {saving ? 'Enregistrement...' : 'Enregistrer le coût'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function parseOrNull(v: string): number | null {
  const n = Number(v);
  if (v.trim() === '' || Number.isNaN(n)) return null;
  return n;
}
function parseIntOrNull(v: string): number | null {
  const n = parseInt(v, 10);
  if (v.trim() === '' || Number.isNaN(n)) return null;
  return n;
}
function formatEuro(n: number): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(n);
}

function Row({
  label,
  value,
  strong,
  accent,
}: {
  label: string;
  value: string;
  strong?: boolean;
  accent?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className={`${strong ? 'font-semibold' : ''}`}>{label}</span>
      <span
        className={`${strong ? 'font-semibold' : ''} ${
          accent ? 'text-primary' : ''
        }`}
      >
        {value}
      </span>
    </div>
  );
}
