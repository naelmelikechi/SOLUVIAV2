'use client';
import { useState, useTransition } from 'react';
import { runWithToast } from '@/components/crm/shared/run-with-toast';
import { MapPin, Plus, Star, Trash2, X } from 'lucide-react';
import { Button } from '@/components/crm/ui/button';
import { Badge } from '@/components/crm/ui/badge';
import { Input } from '@/components/crm/ui/input';
import {
  ZoneCombobox,
  EMPTY_ZONE,
  zoneLabel,
  type Zone,
} from '@/components/crm/shared/zone-combobox';
import {
  addAdresse,
  deleteAdresse,
  setAdressePrincipale,
} from '@/lib/crm/actions/adresses';

export type OppAdresse = {
  id: string;
  libelle: string | null;
  ville: string | null;
  departement: string | null;
  region: string | null;
  principal: boolean;
};

function adresseText(a: OppAdresse): string {
  const zone = zoneLabel({
    ville: a.ville,
    departement: a.departement,
    region: a.region,
  });
  const region = a.region && a.region !== zone ? a.region : null;
  return [a.libelle, zone, region].filter(Boolean).join(' · ') || 'Adresse';
}

export function OppAdresses({
  compteId,
  adresses,
}: {
  compteId: string | null;
  adresses: OppAdresse[];
}) {
  // Les actions adresses revalident /pipeline (route courante) : aucun router.refresh() nécessaire.
  const [pending, start] = useTransition();
  const [adding, setAdding] = useState(false);
  const [libelle, setLibelle] = useState('');
  const [zone, setZone] = useState<Zone>(EMPTY_ZONE);

  if (!compteId) return null;

  const reset = () => {
    setLibelle('');
    setZone(EMPTY_ZONE);
    setAdding(false);
  };

  const save = () =>
    start(() =>
      runWithToast(
        () =>
          addAdresse(compteId, {
            libelle,
            ville: zone.ville ?? '',
            departement: zone.departement ?? '',
            region: zone.region ?? '',
          }),
        {
          success: 'Établissement ajouté',
          error: 'Ajout impossible',
          onSuccess: reset,
        },
      ),
    );

  const onDelete = (id: string) =>
    start(() =>
      runWithToast(() => deleteAdresse(id), {
        error: 'Suppression impossible',
      }),
    );

  const onPrincipal = (id: string) =>
    start(() => runWithToast(() => setAdressePrincipale(compteId, id)));

  const canSave = Boolean(
    libelle.trim() || zone.ville || zone.departement || zone.region,
  );

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          Établissements / zones
        </h3>
        {!adding && (
          <Button variant="ghost" size="sm" onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4" />
            Ajouter
          </Button>
        )}
      </div>

      {adresses.length ? (
        <div className="divide-border border-border divide-y overflow-hidden rounded-lg border">
          {adresses.map((a) => (
            <div
              key={a.id}
              className="flex items-center justify-between gap-2 px-3 py-2.5"
            >
              <span className="flex min-w-0 items-center gap-1.5">
                <MapPin className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
                <span className="truncate text-sm">{adresseText(a)}</span>
                {a.principal && (
                  <Badge variant="secondary" className="shrink-0 text-[10px]">
                    Principal
                  </Badge>
                )}
              </span>
              <span className="flex shrink-0 items-center gap-1">
                {!a.principal && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => onPrincipal(a.id)}
                    className="text-muted-foreground hover:text-primary disabled:opacity-50"
                    aria-label="Définir comme principal"
                    title="Définir comme principal"
                  >
                    <Star className="h-4 w-4" />
                  </button>
                )}
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => onDelete(a.id)}
                  className="text-muted-foreground hover:text-destructive disabled:opacity-50"
                  aria-label="Supprimer cet établissement"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </span>
            </div>
          ))}
        </div>
      ) : (
        !adding && (
          <p className="text-muted-foreground text-sm">
            Aucun établissement renseigné.
          </p>
        )
      )}

      {adding && (
        <div className="border-border space-y-2 rounded-lg border p-3">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground text-xs">
              Nouvel établissement
            </span>
            <button
              type="button"
              onClick={reset}
              className="text-muted-foreground hover:text-destructive"
              aria-label="Annuler"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <Input
            placeholder="Libellé (ex. McDo République) - facultatif"
            value={libelle}
            onChange={(e) => setLibelle(e.target.value)}
          />
          <ZoneCombobox value={zone} onChange={setZone} />
          <Button size="sm" disabled={pending || !canSave} onClick={save}>
            {pending ? '…' : 'Enregistrer'}
          </Button>
        </div>
      )}
    </section>
  );
}
