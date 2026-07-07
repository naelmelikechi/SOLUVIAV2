'use client';
import { useMemo, useState } from 'react';
import { KanbanSquare, Table2, MapPin, X } from 'lucide-react';
import { Button } from '@/components/crm/ui/button';
import { EntityCombobox } from '@/components/crm/shared/entity-combobox';
import {
  DEPARTEMENTS,
  REGIONS,
  departementsForRegion,
} from '@/lib/crm/domain/geo';
import { Kanban } from './kanban';
import { OppTable } from './opp-table';
import type { Etape, OppCard } from './types';

const REGION_OPTIONS = REGIONS.map((r) => ({ value: r, label: r }));

export function PipelineView({
  etapes,
  opportunites,
  initialRegion = null,
}: {
  etapes: Etape[];
  opportunites: OppCard[];
  initialRegion?: string | null;
}) {
  const [view, setView] = useState<'kanban' | 'table'>('kanban');
  const [region, setRegion] = useState<string | null>(initialRegion);
  const [departement, setDepartement] = useState<string | null>(null);

  // Départements proposés : ceux de la région choisie, sinon tous.
  const departementOptions = useMemo(() => {
    const codes = new Set(
      region ? departementsForRegion(region) : DEPARTEMENTS.map((d) => d.code),
    );
    return DEPARTEMENTS.filter((d) => codes.has(d.code)).map((d) => ({
      value: d.code,
      label: `${d.code} - ${d.nom}`,
    }));
  }, [region]);

  const filtered = useMemo(() => {
    if (!region && !departement) return opportunites;
    return opportunites.filter((o) => {
      const adresses = o.compte?.adresses ?? [];
      if (departement)
        return adresses.some((a) => a.departement === departement);
      return adresses.some((a) => a.region === region);
    });
  }, [opportunites, region, departement]);

  const active = Boolean(region || departement);
  const clear = () => {
    setRegion(null);
    setDepartement(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="border-border flex w-fit gap-1 rounded-lg border p-1">
          <Button
            size="sm"
            variant={view === 'kanban' ? 'default' : 'ghost'}
            onClick={() => setView('kanban')}
          >
            <KanbanSquare className="mr-1 h-4 w-4" />
            Kanban
          </Button>
          <Button
            size="sm"
            variant={view === 'table' ? 'default' : 'ghost'}
            onClick={() => setView('table')}
          >
            <Table2 className="mr-1 h-4 w-4" />
            Tableau
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <MapPin className="text-muted-foreground h-4 w-4" />
          <div className="w-52">
            <EntityCombobox
              options={REGION_OPTIONS}
              value={region}
              onChange={(v) => {
                setRegion(v);
                setDepartement(null);
              }}
              placeholder="Toutes les régions"
            />
          </div>
          <div className="w-52">
            <EntityCombobox
              options={departementOptions}
              value={departement}
              onChange={setDepartement}
              placeholder="Tous les départements"
            />
          </div>
          {active && (
            <Button
              size="sm"
              variant="ghost"
              onClick={clear}
              className="text-muted-foreground"
            >
              <X className="mr-1 h-4 w-4" />
              Effacer ({filtered.length})
            </Button>
          )}
        </div>
      </div>
      {view === 'kanban' ? (
        <Kanban etapes={etapes} opportunites={filtered} />
      ) : (
        <OppTable opportunites={filtered} etapes={etapes} />
      )}
    </div>
  );
}
