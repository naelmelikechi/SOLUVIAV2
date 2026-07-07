'use client';
import { useMemo, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import {
  FRANCE_REGIONS,
  FRANCE_VIEWBOX,
} from '@/lib/crm/domain/france-regions';
import { REGIONS } from '@/lib/crm/domain/geo';
import {
  aggregateParRegion,
  countNonGeolocalisees,
  tauxGeolocalisation,
  fenetreRentree,
  filtreRentree,
  type OppRegions,
} from '@/lib/crm/domain/geo-stats';
import { Button } from '@/components/crm/ui/button';

type Metric = 'opps' | 'alternants';

/**
 * Préférence UI persistée en localStorage, réactive dans l'onglet courant.
 * `useSyncExternalStore` : sûr au SSR (snapshot serveur = fallback, pas de
 * mismatch d'hydratation) et sans setState-en-effet. L'écriture notifie via un
 * évènement custom pour re-rendre les lecteurs du même onglet.
 */
function usePersisted<T extends string>(
  key: string,
  fallback: T,
): [T, (v: T) => void] {
  const value = useSyncExternalStore(
    (cb) => {
      window.addEventListener('carte-prefs', cb);
      return () => window.removeEventListener('carte-prefs', cb);
    },
    () => (localStorage.getItem(key) as T | null) ?? fallback,
    () => fallback,
  );
  const set = (v: T) => {
    localStorage.setItem(key, v);
    window.dispatchEvent(new Event('carte-prefs'));
  };
  return [value, set];
}

/**
 * Carte de densité géographique du dashboard.
 * Colore les 13 régions métropolitaines selon la métrique choisie (nombre d'opps
 * ouvertes ou volume d'alternants), avec filtre « rentrée » optionnel. Survol →
 * légende ; clic → pipeline filtré sur la région. Régions d'Outre-mer en puces.
 * Agrégation faite ici (côté client) pour permettre les bascules sans round-trip.
 */
export function CarteRegions({ opps }: { opps: OppRegions[] }) {
  const router = useRouter();
  const [hover, setHover] = useState<string | null>(null);
  const [metric, chooseMetric] = usePersisted<Metric>(
    'carte-metric',
    'alternants',
  );
  const [rentreeStr, setRentreeStr] = usePersisted<'0' | '1'>(
    'carte-rentree',
    '0',
  );
  const rentree = rentreeStr === '1';
  const toggleRentree = () => setRentreeStr(rentree ? '0' : '1');

  const fenetre = useMemo(() => fenetreRentree(), []);
  const anneeRentree = fenetre.debut.slice(0, 4);

  const visibles = useMemo(
    () => (rentree ? filtreRentree(opps, fenetre) : opps),
    [opps, rentree, fenetre],
  );
  const counts = useMemo(
    () =>
      aggregateParRegion(
        visibles,
        metric === 'opps' ? () => 1 : (o) => o.nb_alternants ?? 0,
      ),
    [visibles, metric],
  );
  const nonGeo = useMemo(() => countNonGeolocalisees(visibles), [visibles]);
  const taux = useMemo(() => tauxGeolocalisation(visibles), [visibles]);
  const max = useMemo(() => Math.max(0, ...Object.values(counts)), [counts]);
  const multiRegion = useMemo(
    () =>
      visibles.some(
        (o) =>
          new Set(
            (o.compte?.adresses ?? []).map((a) => a.region).filter(Boolean),
          ).size > 1,
      ),
    [visibles],
  );

  // Régions d'Outre-mer = référentiel géo moins les régions métropole dessinées.
  const domRegions = useMemo(() => {
    const metro = new Set(FRANCE_REGIONS.map((r) => r.region));
    return REGIONS.filter((r) => !metro.has(r) && (counts[r] ?? 0) > 0);
  }, [counts]);

  const goTo = (region: string) =>
    router.push(`/crm/pipeline?region=${encodeURIComponent(region)}`);

  // Unité selon la métrique — 3 sites d'affichage doivent rester cohérents.
  const unite = (n: number) =>
    metric === 'opps'
      ? `${n} opp. ouverte${n > 1 ? 's' : ''}`
      : `${n} alternant${n > 1 ? 's' : ''}`;

  const fillFor = (count: number) => {
    if (count === 0 || max === 0) return 'var(--muted)';
    // Petit N : un dégradé fin suggérerait des écarts non significatifs → teinte unique de présence.
    if (max < 5) return 'color-mix(in oklab, var(--primary) 60%, var(--muted))';
    return `color-mix(in oklab, var(--primary) ${25 + Math.round((75 * count) / max)}%, var(--muted))`;
  };

  if (opps.length === 0) {
    return (
      <p className="text-muted-foreground py-12 text-center text-sm">
        Aucune opportunité ouverte.
      </p>
    );
  }

  const carteVide = max === 0 && domRegions.length === 0;
  const hoverCount = hover ? (counts[hover] ?? 0) : null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-center gap-2">
        <div className="border-border flex w-fit gap-1 rounded-lg border p-1">
          <Button
            size="sm"
            variant={metric === 'opps' ? 'default' : 'ghost'}
            onClick={() => chooseMetric('opps')}
          >
            Opportunités
          </Button>
          <Button
            size="sm"
            variant={metric === 'alternants' ? 'default' : 'ghost'}
            onClick={() => chooseMetric('alternants')}
          >
            Alternants
          </Button>
        </div>
        <Button
          size="sm"
          variant={rentree ? 'default' : 'ghost'}
          onClick={toggleRentree}
          className="border-border border"
        >
          Rentrée {anneeRentree}
        </Button>
      </div>

      {carteVide ? (
        <p className="text-muted-foreground py-10 text-center text-sm">
          {rentree
            ? `Aucune opportunité géolocalisée pour la rentrée ${anneeRentree}.`
            : 'Aucune opportunité ouverte géolocalisée.'}
        </p>
      ) : (
        <>
          <svg
            viewBox={FRANCE_VIEWBOX}
            className="mx-auto h-auto w-full max-w-md"
            role="group"
            aria-label={`Carte de densité (${metric === 'opps' ? 'opportunités ouvertes' : 'alternants'}) par région`}
          >
            {FRANCE_REGIONS.map(({ region, d }) => {
              const count = counts[region] ?? 0;
              const active = hover === region;
              return (
                <path
                  key={region}
                  d={d}
                  fill={fillFor(count)}
                  stroke={active ? 'var(--primary)' : 'var(--border)'}
                  strokeWidth={active ? 1.6 : 0.6}
                  className="focus-visible:stroke-primary cursor-pointer transition-[stroke,stroke-width] outline-none"
                  role="button"
                  tabIndex={0}
                  aria-label={`${region} : ${unite(count)}`}
                  onClick={() => goTo(region)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      goTo(region);
                    }
                  }}
                  onMouseEnter={() => setHover(region)}
                  onMouseLeave={() =>
                    setHover((h) => (h === region ? null : h))
                  }
                  onFocus={() => setHover(region)}
                  onBlur={() => setHover((h) => (h === region ? null : h))}
                >
                  <title>{`${region} — ${unite(count)}`}</title>
                </path>
              );
            })}
          </svg>

          <p className="text-center text-sm" aria-live="polite">
            {hover ? (
              <>
                <span className="text-foreground font-medium">{hover}</span>
                <span className="text-muted-foreground">
                  {' — '}
                  {unite(hoverCount ?? 0)}
                </span>
              </>
            ) : (
              <span className="text-muted-foreground">
                Survolez une région · cliquez pour filtrer le pipeline
              </span>
            )}
          </p>

          {domRegions.length > 0 && (
            <div className="border-border flex flex-wrap items-center justify-center gap-1.5 border-t pt-3">
              <span className="text-muted-foreground text-xs">Outre-mer :</span>
              {domRegions.map((region) => (
                <button
                  key={region}
                  type="button"
                  onClick={() => goTo(region)}
                  className="border-border bg-primary/10 text-primary hover:bg-primary/20 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors"
                >
                  {region} {counts[region]}
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {/* Pied fiabilité : ce que la carte ne montre pas + qualité de la donnée. */}
      <div className="border-border text-muted-foreground space-y-1 border-t pt-3 text-center text-xs">
        {nonGeo > 0 && (
          <button
            type="button"
            onClick={() => router.push('/crm/pipeline')}
            className="hover:text-foreground underline-offset-2 hover:underline"
          >
            {nonGeo} opportunité{nonGeo > 1 ? 's' : ''} ouverte
            {nonGeo > 1 ? 's' : ''} non géolocalisée{nonGeo > 1 ? 's' : ''}
          </button>
        )}
        {visibles.length > 0 && (
          <p>{taux} % des opportunités ouvertes géolocalisées</p>
        )}
        {multiRegion && (
          <p title="Une opportunité présente dans plusieurs régions compte dans chacune ; le total par région peut dépasser le nombre d'opportunités.">
            Une opportunité multi-régions compte dans chaque région
          </p>
        )}
      </div>
    </div>
  );
}
