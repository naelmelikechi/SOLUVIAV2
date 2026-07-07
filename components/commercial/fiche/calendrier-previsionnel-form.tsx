'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  JALONS_CALENDRIER,
  type JalonCalendrierKey,
} from '@/lib/utils/constants';

export type CalendrierPrevisionnel = Partial<
  Record<JalonCalendrierKey, string>
>;

interface Props {
  value: CalendrierPrevisionnel;
  onChange: (value: CalendrierPrevisionnel) => void;
  disabled?: boolean;
}

/**
 * Les 10 jalons du calendrier prévisionnel (section 5 de la synthèse de
 * passation). Composant contrôlé : le state vit dans le formulaire parent
 * (fiche-negociation) et part dans le même submit.
 */
export function CalendrierPrevisionnelForm({
  value,
  onChange,
  disabled,
}: Props) {
  const setJalon = (key: JalonCalendrierKey, mois: string) => {
    const next = { ...value };
    if (mois) {
      next[key] = mois;
    } else {
      delete next[key];
    }
    onChange(next);
  };

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {JALONS_CALENDRIER.map(({ key, label }) => (
        <div key={key} className="space-y-2">
          <Label htmlFor={`cal-${key}`}>{label}</Label>
          <Input
            id={`cal-${key}`}
            type="month"
            value={value[key] ?? ''}
            disabled={disabled}
            onChange={(e) => setJalon(key, e.target.value)}
          />
        </div>
      ))}
    </div>
  );
}
