'use client';

import { useMemo, useState, useTransition } from 'react';
import { Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { toast } from 'sonner';
import { updateEmployeeCostDefaults } from '@/lib/actions/employee-cost';
import {
  computeHourlyCost,
  type EmployeeCostDefaults,
} from '@/lib/utils/employee-cost';

interface Props {
  initial: EmployeeCostDefaults;
}

const FIELDS: Array<{
  key: keyof EmployeeCostDefaults;
  label: string;
  unit: string;
  step: string;
  hint: string;
}> = [
  {
    key: 'salaire_brut_annuel',
    label: 'Salaire brut annuel',
    unit: '€',
    step: '100',
    hint: '12 mois × brut mensuel par défaut.',
  },
  {
    key: 'primes_annuelles',
    label: 'Primes annuelles',
    unit: '€',
    step: '100',
    hint: '13e mois, prime de fin d’année…',
  },
  {
    key: 'avantages_annuels',
    label: 'Avantages annuels',
    unit: '€',
    step: '100',
    hint: 'Tickets resto + mutuelle (part employeur).',
  },
  {
    key: 'taux_charges_patronales',
    label: 'Charges patronales',
    unit: '%',
    step: '0.5',
    hint: '~42 % standard cadre France.',
  },
  {
    key: 'heures_hebdo',
    label: 'Heures hebdo',
    unit: 'h',
    step: '0.5',
    hint: '35 (standard) / 39 (cadre).',
  },
  {
    key: 'jours_conges_payes',
    label: 'Congés payés',
    unit: 'j',
    step: '1',
    hint: 'Jours ouvrés / an.',
  },
  {
    key: 'jours_rtt',
    label: 'RTT',
    unit: 'j',
    step: '1',
    hint: 'Cadres au forfait jours souvent.',
  },
];

export function EmployeeCostDefaultsForm({ initial }: Props) {
  const [values, setValues] = useState<EmployeeCostDefaults>(initial);
  const [saving, startSaving] = useTransition();

  const breakdown = useMemo(() => computeHourlyCost(values), [values]);

  const updateValue = (key: keyof EmployeeCostDefaults, raw: string) => {
    const n = Number(raw);
    setValues((v) => ({ ...v, [key]: Number.isFinite(n) ? n : 0 }));
  };

  const handleSave = () => {
    startSaving(async () => {
      const result = await updateEmployeeCostDefaults(values);
      if (result.success) {
        toast.success('Défauts coût employé enregistrés');
      } else {
        toast.error(result.error ?? 'Erreur');
      }
    });
  };

  return (
    <Card className="space-y-4 p-4">
      <div className="flex items-center gap-2">
        <Wallet className="h-4 w-4" />
        <h3 className="text-sm font-semibold">Coût employé par défaut</h3>
      </div>
      <p className="text-muted-foreground text-xs">
        Valeurs utilisées quand un CDP n&apos;a pas de coût personnalisé saisi
        sur sa fiche. Sert au calcul de rentabilité projet.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {FIELDS.map((f) => (
          <div key={f.key} className="space-y-1">
            <Label htmlFor={`def-${f.key}`} className="text-xs">
              {f.label}
            </Label>
            <div className="relative">
              <Input
                id={`def-${f.key}`}
                type="number"
                step={f.step}
                min="0"
                value={values[f.key]}
                onChange={(e) => updateValue(f.key, e.target.value)}
                className="pr-8 font-mono text-sm tabular-nums"
                disabled={saving}
              />
              <span className="text-muted-foreground absolute top-1/2 right-2 -translate-y-1/2 text-xs">
                {f.unit}
              </span>
            </div>
            <p className="text-muted-foreground text-[11px]">{f.hint}</p>
          </div>
        ))}
      </div>
      <div className="bg-muted/50 flex items-center justify-between rounded-md p-3 text-xs">
        <span className="text-muted-foreground">
          Coût total annuel :{' '}
          {Math.round(breakdown.coutTotalAnnuel).toLocaleString('fr-FR')} € ·{' '}
          Heures effectives : {Math.round(breakdown.heuresEffectives)} h
        </span>
        <span className="text-primary font-semibold tabular-nums">
          {breakdown.coutHoraire.toFixed(2)} €/h calculé
        </span>
      </div>
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? 'Enregistrement...' : 'Enregistrer les défauts'}
        </Button>
      </div>
    </Card>
  );
}
