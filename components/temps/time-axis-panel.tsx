'use client';

import { useState, useEffect } from 'react';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AXES_TEMPS } from '@/lib/utils/constants';
import type { SaisieTemps } from '@/lib/queries/temps';

interface TimeAxisPanelProps {
  saisie: SaisieTemps;
  date: string;
  cellTotal: number;
  onClose: () => void;
  onSave: (axes: Record<string, number>, total: number) => void;
}

export function TimeAxisPanel({
  saisie,
  date,
  cellTotal: _cellTotal,
  onClose,
  onSave,
}: TimeAxisPanelProps) {
  const existingAxes = saisie.axes[date] || {};
  const [values, setValues] = useState<Record<string, number>>(
    Object.fromEntries(
      AXES_TEMPS.map((a) => [a.code, existingAxes[a.code] || 0]),
    ),
  );

  const axisTotal = Object.values(values).reduce((a, b) => a + b, 0);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleChange = (code: string, value: string) => {
    const num = parseFloat(value);
    if (value === '' || (!isNaN(num) && num >= 0)) {
      setValues((prev) => ({ ...prev, [code]: value === '' ? 0 : num }));
    }
  };

  return (
    <div className="border-border w-[340px] rounded-[10px] border bg-white shadow-lg">
      {/* Header */}
      <div className="border-border flex items-center justify-between border-b bg-[var(--card-alt)] px-4 py-3">
        <div>
          <div className="text-sm font-semibold">
            Detail — {format(parseISO(date), 'EEE d', { locale: fr })}
          </div>
          <div className="text-primary font-mono text-xs">
            {saisie.projet_ref}
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="h-7 w-7"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Axes */}
      <div className="px-4 py-3">
        <div className="space-y-0">
          {AXES_TEMPS.map((axe) => (
            <div
              key={axe.code}
              className="flex items-center justify-between border-b border-[var(--border-light)] py-2 last:border-b-0"
            >
              <div className="flex items-center gap-2">
                <div
                  className="h-3 w-3 rounded-sm"
                  style={{ backgroundColor: axe.color }}
                />
                <span className="text-sm">{axe.label}</span>
              </div>
              <input
                type="text"
                inputMode="decimal"
                className="border-border focus:border-primary focus:ring-primary/15 w-[50px] rounded-md border bg-white px-1.5 py-1 text-center font-mono text-[13px] outline-none focus:ring-2"
                value={values[axe.code] || ''}
                onChange={(e) => handleChange(axe.code, e.target.value)}
                placeholder="0"
              />
            </div>
          ))}
        </div>

        {/* Total */}
        <div className="border-border mt-3 flex items-center justify-between border-t pt-3">
          <span className="text-sm font-semibold">Total</span>
          <span className="text-primary font-mono text-sm font-bold">
            {axisTotal > 0 ? `${axisTotal}h` : '—'}
          </span>
        </div>

        <Button
          className="mt-3 w-full"
          size="sm"
          onClick={() => {
            onSave(values, axisTotal);
            onClose();
          }}
        >
          Valider
        </Button>
      </div>
    </div>
  );
}
