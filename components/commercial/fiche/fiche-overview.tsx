'use client';

import { useMemo } from 'react';
import {
  StickyNote,
  CalendarDays,
  Mail,
  ArrowRightLeft,
  User,
  Clock,
  Flag,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { StatusBadge } from '@/components/shared/status-badge';
import { ProspectSanteBadge } from '@/components/commercial/prospect-sante-badge';
import { FicheIdentiteForm } from './fiche-identite-form';
import { formatDate } from '@/lib/utils/formatters';
import {
  STAGE_PROSPECT_LABELS,
  STAGE_PROSPECT_COLORS,
  TYPE_RDV_LABELS,
  STATUT_RDV_LABELS,
  type StageProspect,
  type TypeRdv,
  type StatutRdv,
} from '@/lib/utils/constants';
import type {
  ProspectDetail,
  ProspectContact,
  ProspectNote,
  ProspectCommunication,
  ProspectStageHistoryItem,
} from '@/lib/queries/prospects';
import type { RdvCommercialWithRefs } from '@/lib/queries/rdv';
import { LinkedinEncart } from '@/components/commercial/linkedin/linkedin-encart';

interface Props {
  prospect: ProspectDetail;
  contacts: ProspectContact[];
  rdvs: RdvCommercialWithRefs[];
  notes: ProspectNote[];
  communications: ProspectCommunication[];
  stageHistory: ProspectStageHistoryItem[];
  locked: boolean;
}

type TimelineEvent = {
  id: string;
  at: string;
  ts: number;
  kind: 'note' | 'rdv' | 'communication' | 'stage';
  title: string;
  detail?: string | null;
  author?: string | null;
};

function userName(
  u: { nom: string; prenom: string } | null | undefined,
): string | null {
  return u ? `${u.prenom} ${u.nom}` : null;
}

export function FicheOverview({
  prospect,
  contacts,
  rdvs,
  notes,
  communications,
  stageHistory,
  locked,
}: Props) {
  const contactPrincipal = useMemo(
    () => contacts.find((c) => c.id === prospect.contact_principal_id) ?? null,
    [contacts, prospect.contact_principal_id],
  );

  const prochaineAction = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return (
      rdvs
        .filter((r) => r.statut === 'prevu' && r.date_prevue >= today)
        .sort((a, b) => a.date_prevue.localeCompare(b.date_prevue))[0] ?? null
    );
  }, [rdvs]);

  const timeline = useMemo<TimelineEvent[]>(() => {
    const events: TimelineEvent[] = [];
    for (const n of notes) {
      events.push({
        id: `note-${n.id}`,
        at: n.created_at,
        ts: new Date(n.created_at).getTime(),
        kind: 'note',
        title: 'Note',
        detail: n.contenu,
        author: userName(n.user),
      });
    }
    for (const r of rdvs) {
      events.push({
        id: `rdv-${r.id}`,
        at: r.date_prevue,
        ts: new Date(r.date_prevue).getTime(),
        kind: 'rdv',
        title: `RDV ${TYPE_RDV_LABELS[r.type_rdv as TypeRdv] ?? ''} (${
          STATUT_RDV_LABELS[r.statut as StatutRdv]
        })`,
        detail: r.objet,
        author: userName(r.commercial),
      });
    }
    for (const c of communications) {
      events.push({
        id: `comm-${c.id}`,
        at: c.created_at,
        ts: new Date(c.created_at).getTime(),
        kind: 'communication',
        title:
          c.type.charAt(0).toUpperCase() + c.type.slice(1).replace(/_/g, ' '),
        detail: [c.sujet, c.destinataire].filter(Boolean).join(' · ') || null,
        author: userName(c.user),
      });
    }
    for (const s of stageHistory) {
      const from = s.from_stage
        ? (STAGE_PROSPECT_LABELS[s.from_stage as StageProspect] ?? s.from_stage)
        : 'Création';
      const to =
        STAGE_PROSPECT_LABELS[s.to_stage as StageProspect] ?? s.to_stage;
      events.push({
        id: `stage-${s.id}`,
        at: s.changed_at,
        ts: new Date(s.changed_at).getTime(),
        kind: 'stage',
        title: 'Changement d\u2019étape',
        detail: `${from} \u2192 ${to}`,
        author: userName(s.changed_by_user),
      });
    }
    return events.sort((a, b) => b.ts - a.ts);
  }, [notes, rdvs, communications, stageHistory]);

  const stage = prospect.stage as StageProspect;

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        <Card className="p-6">
          <h2 className="mb-4 text-sm font-semibold">Identité</h2>
          <FicheIdentiteForm prospect={prospect} locked={locked} />
        </Card>

        <Card className="p-6">
          <h2 className="mb-4 text-sm font-semibold">Activité récente</h2>
          {timeline.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Aucun évènement pour le moment.
            </p>
          ) : (
            <ul className="space-y-3">
              {timeline.map((e) => (
                <li key={e.id} className="flex gap-3">
                  <div className="text-muted-foreground mt-0.5">
                    {e.kind === 'note' && <StickyNote className="size-4" />}
                    {e.kind === 'rdv' && <CalendarDays className="size-4" />}
                    {e.kind === 'communication' && <Mail className="size-4" />}
                    {e.kind === 'stage' && (
                      <ArrowRightLeft className="size-4" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span className="text-sm font-medium">{e.title}</span>
                      <span className="text-muted-foreground text-xs tabular-nums">
                        {formatDate(e.at)}
                      </span>
                      {e.author && (
                        <span className="text-muted-foreground text-xs">
                          · {e.author}
                        </span>
                      )}
                    </div>
                    {e.detail && (
                      <p className="text-muted-foreground mt-0.5 text-sm whitespace-pre-line">
                        {e.detail}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="space-y-6">
        <Card className="p-6">
          <h2 className="mb-4 text-sm font-semibold">Synthèse</h2>
          <div className="space-y-4 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground flex items-center gap-1.5">
                <Flag className="size-3.5" /> Étape
              </span>
              <StatusBadge
                label={STAGE_PROSPECT_LABELS[stage] ?? stage}
                color={STAGE_PROSPECT_COLORS[stage] ?? 'gray'}
              />
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">Santé</span>
              <ProspectSanteBadge
                derniereActionAt={prospect.derniere_action_at}
              />
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground flex items-center gap-1.5">
                <Clock className="size-3.5" /> Prochaine action
              </span>
              <span className="font-medium tabular-nums">
                {prochaineAction
                  ? formatDate(prochaineAction.date_prevue)
                  : 'Aucune'}
              </span>
            </div>
            {prochaineAction?.objet && (
              <p className="text-muted-foreground text-xs">
                {prochaineAction.objet}
              </p>
            )}
          </div>

          <hr className="border-border my-4" />

          <h3 className="text-muted-foreground mb-2 flex items-center gap-1.5 text-xs font-semibold tracking-wider uppercase">
            <User className="size-3.5" /> Interlocuteur principal
          </h3>
          {contactPrincipal ? (
            <div className="space-y-1 text-sm">
              <p className="font-medium">{contactPrincipal.nom}</p>
              {contactPrincipal.poste && (
                <p className="text-muted-foreground">
                  {contactPrincipal.poste}
                </p>
              )}
              {contactPrincipal.email && (
                <a
                  href={`mailto:${contactPrincipal.email}`}
                  className="text-primary block hover:underline"
                >
                  {contactPrincipal.email}
                </a>
              )}
              {contactPrincipal.telephone && (
                <p className="text-muted-foreground tabular-nums">
                  {contactPrincipal.telephone}
                </p>
              )}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">
              Aucun contact principal défini.
            </p>
          )}
        </Card>
        {prospect.canal_origine === 'linkedin_auto' && (
          <LinkedinEncart prospectId={prospect.id} />
        )}
      </div>
    </div>
  );
}
