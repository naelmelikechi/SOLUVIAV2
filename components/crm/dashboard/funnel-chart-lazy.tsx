'use client';
import dynamic from 'next/dynamic';

// recharts (~400 KB) est chargé à la demande, hors du bundle initial du dashboard
// (page la plus visitée) : le reste de la page s'hydrate sans l'attendre.
export const FunnelChart = dynamic(
  () => import('./funnel-chart').then((m) => m.FunnelChart),
  {
    ssr: false,
    loading: () => (
      <div className="text-muted-foreground flex h-48 items-center justify-center text-sm">
        Chargement du graphique…
      </div>
    ),
  },
);
