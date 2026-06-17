'use client';

import type { ReactNode } from 'react';
import { useTransition } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { Download } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/shared/status-badge';
import { TYPE_PROSPECT_LABELS } from '@/lib/utils/constants';
import type { CommercialKpis, PeriodeKpi } from '@/lib/queries/commercial-kpis';
import { KpiCards } from './kpi-cards';
import { KpiFunnel } from './kpi-funnel';
import { KpiOrigineChart } from './kpi-origine-chart';
import { KpiTunnelTable } from './kpi-tunnel-table';

const PERIODE_OPTIONS: Record<PeriodeKpi, string> = {
  mois: 'Mois en cours',
  mois_precedent: 'Mois précédent',
  trimestre: 'Trimestre',
  annee: 'Année',
};

const TUNNEL_OPTIONS: Record<string, string> = {
  tous: 'Tous les tunnels',
  entreprise: TYPE_PROSPECT_LABELS.entreprise,
  cfa: TYPE_PROSPECT_LABELS.cfa,
};

interface CommercialOption {
  id: string;
  nom: string;
  prenom: string;
  role: string;
}

interface Props {
  kpis: CommercialKpis;
  commerciaux: CommercialOption[];
  isAdmin: boolean;
}

// Genere un CSV (separateur ';' pour Excel FR) de l'ensemble des KPI affichés.
function buildKpiCsv(kpis: CommercialKpis): string {
  const rows: [string, string, string | number][] = [
    ['Volume', 'Prospects actifs', kpis.volume.actifs],
    ['Volume', 'Qualifiés', kpis.volume.qualifies],
    ['Volume', 'Nouveaux (période)', kpis.volume.nouveaux.value],
    ['Volume', 'Nouveaux (période précédente)', kpis.volume.nouveaux.previous],
    ['Volume', 'Signatures (période)', kpis.volume.signatures.value],
    [
      'Volume',
      'Signatures (période précédente)',
      kpis.volume.signatures.previous,
    ],
    ['Cycle', 'Cycle médian (jours)', kpis.cycle.medianJours],
    ['Cycle', 'Cycle moyen (jours)', kpis.cycle.moyenJours],
    ['Cycle', 'Signatures comptées', kpis.cycle.count],
  ];
  for (const step of kpis.funnel) {
    rows.push([
      'Entonnoir',
      step.label,
      step.conversion === null
        ? String(step.count)
        : `${step.count} (conv. ${(step.conversion * 100).toFixed(1)}%)`,
    ]);
  }
  for (const t of kpis.tunnels) {
    rows.push([`Tunnel`, `${t.label} - volume actif`, t.volumeActif]);
    rows.push([`Tunnel`, `${t.label} - signatures`, t.signatures]);
    rows.push([`Tunnel`, `${t.label} - apprenants signés`, t.apprenantsSignes]);
    rows.push([`Tunnel`, `${t.label} - ticket moyen`, t.ticketMoyen]);
    rows.push([
      `Tunnel`,
      `${t.label} - cycle médian (jours)`,
      t.cycleMedianJours,
    ]);
  }
  for (const o of kpis.origine) {
    rows.push(['Origine', o.label, `${o.count} (${o.pct}%)`]);
  }
  for (const a of kpis.alertes) {
    rows.push(['Alertes', a.label, a.count]);
  }

  const esc = (v: string | number) => {
    const s = String(v);
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [['Section', 'Indicateur', 'Valeur'], ...rows]
    .map((cells) => cells.map(esc).join(';'))
    .join('\n');
}

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="border-border bg-card rounded-lg border p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </div>
  );
}

export function KpiDashboard({ kpis, commerciaux, isAdmin }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  const selectedCommercialId = isAdmin ? (kpis.commercialId ?? '') : '';

  function navigate(next: {
    periode?: PeriodeKpi;
    tunnel?: string;
    commercial?: string;
  }) {
    const params = new URLSearchParams();
    params.set('periode', next.periode ?? kpis.periode);

    const tunnel =
      next.tunnel !== undefined ? next.tunnel : (kpis.tunnel ?? '');
    if (tunnel) params.set('tunnel', tunnel);

    const commercial =
      next.commercial !== undefined ? next.commercial : selectedCommercialId;
    if (isAdmin && commercial) params.set('commercial', commercial);

    startTransition(() => router.push(`${pathname}?${params.toString()}`));
  }

  function handleExport() {
    const csv = `\uFEFF${buildKpiCsv(kpis)}`;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `kpi-commercial-${kpis.periode}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={kpis.periode}
          onValueChange={(v) => v && navigate({ periode: v as PeriodeKpi })}
          disabled={isPending}
        >
          <SelectTrigger size="sm" className="w-44">
            <SelectValue>
              {(v) => PERIODE_OPTIONS[(v as PeriodeKpi) ?? 'mois']}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {(Object.entries(PERIODE_OPTIONS) as [PeriodeKpi, string][]).map(
              ([val, label]) => (
                <SelectItem key={val} value={val}>
                  {label}
                </SelectItem>
              ),
            )}
          </SelectContent>
        </Select>

        <Select
          value={kpis.tunnel ?? 'tous'}
          onValueChange={(v) =>
            v && navigate({ tunnel: v === 'tous' ? '' : (v as string) })
          }
          disabled={isPending}
        >
          <SelectTrigger size="sm" className="w-44">
            <SelectValue>
              {(v) => TUNNEL_OPTIONS[(v as string) ?? 'tous']}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {Object.entries(TUNNEL_OPTIONS).map(([val, label]) => (
              <SelectItem key={val} value={val}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {isAdmin && (
          <Select
            value={selectedCommercialId || 'tous'}
            onValueChange={(v) =>
              v && navigate({ commercial: v === 'tous' ? '' : (v as string) })
            }
            disabled={isPending}
          >
            <SelectTrigger size="sm" className="w-52">
              <SelectValue>
                {(v) => {
                  if (!v || v === 'tous') return 'Tous les commerciaux';
                  const c = commerciaux.find((x) => x.id === v);
                  return c ? `${c.prenom} ${c.nom}` : 'Tous les commerciaux';
                }}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="tous">Tous les commerciaux</SelectItem>
              {commerciaux.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.prenom} {c.nom}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Button
          variant="outline"
          size="sm"
          onClick={handleExport}
          className="ml-auto"
        >
          <Download className="size-4" />
          Exporter CSV
        </Button>
      </div>

      <KpiCards volume={kpis.volume} cycle={kpis.cycle} />

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Entonnoir de conversion">
          <KpiFunnel data={kpis.funnel} />
        </Section>
        <Section title="Origine des leads">
          <KpiOrigineChart data={kpis.origine} />
        </Section>
      </div>

      <Section title="Comparaison des tunnels (A entreprise / B CFA)">
        <KpiTunnelTable rows={kpis.tunnels} />
      </Section>

      <Section title="Alertes">
        <div className="space-y-4">
          {kpis.alertes.map((groupe) => (
            <div key={groupe.type}>
              <div className="mb-1 flex items-center gap-2">
                <StatusBadge
                  label={String(groupe.count)}
                  color={groupe.count > 0 ? 'orange' : 'gray'}
                />
                <span className="text-sm font-medium">{groupe.label}</span>
              </div>
              {groupe.prospects.length > 0 ? (
                <ul className="divide-border divide-y text-sm">
                  {groupe.prospects.map((p) => (
                    <li key={p.id}>
                      <Link
                        href={`/commercial/prospects/${p.id}`}
                        className="hover:bg-muted/50 flex items-center justify-between rounded px-2 py-1.5"
                      >
                        <span>{p.nom}</span>
                        <span className="text-muted-foreground text-xs tabular-nums">
                          {p.joursInactif} j sans action
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground text-xs">Aucune alerte</p>
              )}
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}
