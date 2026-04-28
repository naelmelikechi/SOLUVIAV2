'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { UsersRound, Mail, Calendar, Clock } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { UserAvatar } from '@/components/shared/user-avatar';
import { cn } from '@/lib/utils';
import { formatHeures } from '@/lib/utils/formatters';
import {
  CATEGORIES_INTERNES,
  getCategorieInterneLabel,
  type CategorieInterne,
} from '@/lib/utils/projets-internes';
import type {
  IntercontratUser,
  TauxBillableEntry,
} from '@/lib/queries/intercontrat';

interface IntercontratListProps {
  data: IntercontratUser[];
  tauxBillable: TauxBillableEntry[];
}

function ancienneteBadgeColor(jours: number): string {
  if (jours <= 7)
    return 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400';
  if (jours <= 30) return 'bg-amber-500/15 text-amber-700 dark:text-amber-400';
  return 'bg-red-500/15 text-red-700 dark:text-red-400';
}

function tauxBillableColor(taux: number | null): string {
  if (taux === null) return 'text-muted-foreground';
  if (taux >= 80) return 'text-emerald-600 dark:text-emerald-400';
  if (taux >= 50) return 'text-amber-600 dark:text-amber-400';
  return 'text-red-600 dark:text-red-400';
}

export function IntercontratList({
  data,
  tauxBillable,
}: IntercontratListProps) {
  const router = useRouter();

  // Realtime : rafraichit la page quand un projet ou un user change
  // (affectation, archive, role, pipeline_access).
  useEffect(() => {
    let supabase: ReturnType<typeof createClient> | null = null;
    let channel: ReturnType<ReturnType<typeof createClient>['channel']> | null =
      null;
    try {
      supabase = createClient();
      channel = supabase
        .channel('admin-intercontrat')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'projets' },
          () => router.refresh(),
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'users' },
          () => router.refresh(),
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'saisies_temps' },
          () => router.refresh(),
        )
        .subscribe();
    } catch {
      // Realtime indisponible : la page reste statique jusqu au prochain navigate.
    }
    return () => {
      if (supabase && channel) supabase.removeChannel(channel);
    };
  }, [router]);

  const moyenneBillable = (() => {
    const valid = tauxBillable.filter((t) => t.taux_billable !== null);
    if (valid.length === 0) return null;
    const sum = valid.reduce((s, t) => s + (t.taux_billable ?? 0), 0);
    return Math.round(sum / valid.length);
  })();

  const [categorieFilter, setCategorieFilter] =
    useState<CategorieInterne | null>(null);

  const countsByCategorie = useMemo(() => {
    const counts = new Map<CategorieInterne, number>();
    for (const cat of CATEGORIES_INTERNES) counts.set(cat, 0);
    for (const u of data) {
      for (const cat of Object.keys(u.heures_par_categorie)) {
        if ((u.heures_par_categorie[cat] ?? 0) > 0) {
          counts.set(
            cat as CategorieInterne,
            (counts.get(cat as CategorieInterne) ?? 0) + 1,
          );
        }
      }
    }
    return counts;
  }, [data]);

  const filteredData = useMemo(() => {
    if (!categorieFilter) return data;
    return data.filter(
      (u) => (u.heures_par_categorie[categorieFilter] ?? 0) > 0,
    );
  }, [data, categorieFilter]);

  return (
    <div>
      <PageHeader
        title="Intercontrat"
        description="Collaborateurs actifs sans projet client affecté. Triés par ancienneté d'attente décroissante."
      />

      {tauxBillable.length > 0 && (
        <Card className="mb-6 p-4">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-sm font-semibold">
              Taux billable équipe (30 derniers jours)
            </h3>
            {moyenneBillable !== null && (
              <span className="text-muted-foreground text-xs">
                Moyenne :{' '}
                <span
                  className={cn(
                    'font-semibold',
                    tauxBillableColor(moyenneBillable),
                  )}
                >
                  {moyenneBillable}%
                </span>
              </span>
            )}
          </div>
          <ul className="divide-border divide-y text-sm">
            {tauxBillable.map((t) => {
              const fullName = `${t.prenom} ${t.nom}`.trim() || t.email;
              return (
                <li
                  key={t.user_id}
                  className="flex flex-wrap items-center justify-between gap-3 py-2 first:pt-0 last:pb-0"
                >
                  <span className="text-foreground">{fullName}</span>
                  <div className="text-muted-foreground flex items-center gap-3 text-xs">
                    <span>
                      {formatHeures(t.heures_billable_30j)} client /{' '}
                      {formatHeures(t.heures_internes_30j)} interne
                    </span>
                    <span
                      className={cn(
                        'font-mono text-sm font-semibold',
                        tauxBillableColor(t.taux_billable),
                      )}
                    >
                      {t.taux_billable === null ? '-' : `${t.taux_billable}%`}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {data.length === 0 ? (
        <EmptyState
          icon={UsersRound}
          title="Aucun collaborateur en intercontrat"
          description="Tous les collaborateurs actifs sont affectes a au moins un projet client."
        />
      ) : (
        <>
          <div className="mb-4 flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setCategorieFilter(null)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                categorieFilter === null
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border text-muted-foreground hover:bg-muted',
              )}
            >
              Tous
              <span
                className={cn(
                  'inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold',
                  categorieFilter === null
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground',
                )}
              >
                {data.length}
              </span>
            </button>
            {CATEGORIES_INTERNES.map((cat) => {
              const count = countsByCategorie.get(cat) ?? 0;
              if (count === 0) return null;
              const active = categorieFilter === cat;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategorieFilter(active ? null : cat)}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                    active
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground hover:bg-muted',
                  )}
                >
                  {getCategorieInterneLabel(cat)}
                  <span
                    className={cn(
                      'inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold',
                      active
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground',
                    )}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {filteredData.length === 0 ? (
            <p className="text-muted-foreground text-sm italic">
              Aucun collaborateur dans cette categorie.
            </p>
          ) : (
            <div className="grid gap-3">
              {filteredData.map((u) => {
                const fullName = `${u.prenom} ${u.nom}`.trim();
                return (
                  <Card key={u.id} className="p-4">
                    <div className="flex flex-wrap items-start gap-4">
                      <UserAvatar
                        email={u.email}
                        name={fullName}
                        size={40}
                        className="shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-foreground text-sm font-semibold">
                            {fullName || u.email}
                          </h3>
                          <Badge
                            variant="outline"
                            className={ancienneteBadgeColor(
                              u.jours_sans_projet,
                            )}
                          >
                            <Calendar className="mr-1 h-3 w-3" />
                            {u.jours_sans_projet} j sans projet
                          </Badge>
                        </div>
                        <div className="text-muted-foreground mt-1 flex flex-wrap items-center gap-3 text-xs">
                          <span className="flex items-center gap-1">
                            <Mail className="h-3 w-3" />
                            {u.email}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {formatHeures(u.heures_internes_30j)} interne (30j)
                          </span>
                        </div>
                        {Object.keys(u.heures_par_categorie).length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {Object.entries(u.heures_par_categorie)
                              .sort((a, b) => b[1] - a[1])
                              .map(([cat, h]) => (
                                <span
                                  key={cat}
                                  className="bg-muted text-muted-foreground rounded px-1.5 py-0.5 text-[10px] font-medium"
                                >
                                  {getCategorieInterneLabel(cat)} ·{' '}
                                  {formatHeures(h)}
                                </span>
                              ))}
                          </div>
                        )}
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <Link
                          href="/admin/utilisateurs"
                          className={buttonVariants({
                            variant: 'outline',
                            size: 'sm',
                          })}
                        >
                          Voir le profil
                        </Link>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
