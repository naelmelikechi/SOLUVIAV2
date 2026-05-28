'use client';

import { useEffect, useState } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { StatusBadge, type BadgeColor } from '@/components/shared/status-badge';
import { fetchContratDetail } from '@/lib/actions/contrats';
import type { ContratDetail } from '@/lib/queries/contrats';
import { formatCurrency, formatDate } from '@/lib/utils/formatters';
import { logger } from '@/lib/utils/logger';

const fmtDate = (d: string | Date | null | undefined): string | null =>
  d ? formatDate(d) : null;
import {
  Loader2,
  User,
  GraduationCap,
  Building2,
  TrendingUp,
  Receipt,
  Calendar,
  Hash,
} from 'lucide-react';

interface Props {
  contratId: string | null;
  onOpenChange: (open: boolean) => void;
}

const CONTRACT_STATE_LABELS: Record<string, string> = {
  actif: 'Actif',
  suspendu: 'Suspendu',
  resilie: 'Résilié',
  termine: 'Terminé',
  NOTSENT: 'Pas envoyé',
  TRANSMIS: 'Transmis',
  EN_COURS_INSTRUCTION: "En cours d'instruction",
  ENGAGE: 'Engagé',
  ANNULE: 'Annulé',
};

const CONTRACT_STATE_COLORS: Record<string, BadgeColor> = {
  actif: 'green',
  suspendu: 'orange',
  resilie: 'red',
  termine: 'gray',
  NOTSENT: 'gray',
  TRANSMIS: 'blue',
  EN_COURS_INSTRUCTION: 'orange',
  ENGAGE: 'green',
  ANNULE: 'red',
};

// Nomenclature Eduvia : codes contract_type (article du Code du travail)
const CONTRACT_TYPE_LABELS: Record<string, string> = {
  '11': "Contrat d'apprentissage",
  '21': 'Contrat de professionnalisation',
  '31': 'Contrat aidé',
  '41': 'Convention de stage',
  '51': 'POEI / AFPR',
  '61': 'Reconversion',
};

// Nomenclature Eduvia : codes contract_mode (forme du contrat)
const CONTRACT_MODE_LABELS: Record<string, string> = {
  '1': 'CDD',
  '2': 'CDI',
  '3': 'Apprenti',
  '4': 'Saisonnier',
};

const CREATION_MODE_LABELS: Record<string, string> = {
  MANUAL: 'Manuel',
  API: 'API',
  IMPORT: 'Import',
};

const GENDER_LABELS: Record<string, string> = {
  M: 'Masculin',
  F: 'Féminin',
  X: 'Non précisé',
};

// Codes nationalité Eduvia (INSEE simplifié)
const NATIONALITY_LABELS: Record<string, string> = {
  '1': 'Française',
  '2': 'Union européenne',
  '3': 'Hors Union européenne',
};

const APPRENANT_STATUS_LABELS: Record<string, string> = {
  incomplete: 'Incomplet',
  complete: 'Complet',
  pending: 'En attente',
  valid: 'Validé',
};

function mapLabel(
  table: Record<string, string>,
  value: string | number | null | undefined,
): string | null {
  if (value === null || value === undefined || value === '') return null;
  const key = String(value);
  return table[key] ?? key;
}

const INVOICE_STATE_LABELS: Record<string, string> = {
  // Etats Eduvia (en majuscule, telles que renvoyees par l'API)
  TRANSMIS: 'Transmise',
  RECU: 'Reçue OPCO',
  EN_INSTRUCTION: "En cours d'instruction",
  ACCEPTE: 'Acceptée',
  REGLE: 'Réglée',
  REJETE: 'Rejetée',
  // Anciennes valeurs en minuscule, fallback
  draft: 'Brouillon',
  sent: 'Envoyée',
  paid: 'Payée',
  overdue: 'En retard',
  cancelled: 'Annulée',
};

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <h3 className="text-muted-foreground flex items-center gap-1.5 text-xs font-semibold tracking-wide uppercase">
        <Icon className="size-3.5" />
        {title}
      </h3>
      <div className="space-y-1 rounded-md border p-3 text-sm">{children}</div>
    </section>
  );
}

function Row({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span
        className={`text-right text-sm ${mono ? 'font-mono tabular-nums' : ''}`}
      >
        {value}
      </span>
    </div>
  );
}

// oxlint-disable-next-line react-doctor/no-giant-component
export function ContratDetailSheet({ contratId, onOpenChange }: Props) {
  const [data, setData] = useState<ContratDetail | null>(null);

  useEffect(() => {
    if (!contratId) return;
    let cancelled = false;
    fetchContratDetail(contratId)
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err) => {
        logger.error('contrat-detail-sheet', err, { contratId });
      });
    return () => {
      cancelled = true;
    };
  }, [contratId]);

  const loading = contratId !== null && data?.contrat.id !== contratId;

  return (
    <Sheet open={contratId !== null} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="!max-w-2xl overflow-y-auto sm:!max-w-2xl"
      >
        {loading || !data ? (
          <div className="flex flex-1 items-center justify-center py-20">
            <Loader2 className="text-muted-foreground size-6 animate-spin" />
          </div>
        ) : (
          <>
            <SheetHeader className="border-b pb-4">
              <div className="flex items-center justify-between gap-2">
                <SheetTitle className="text-base">
                  {data.contrat.apprenant_prenom}{' '}
                  {data.contrat.apprenant_nom?.toUpperCase()}
                </SheetTitle>
                <StatusBadge
                  label={
                    CONTRACT_STATE_LABELS[data.contrat.contract_state] ??
                    data.contrat.contract_state
                  }
                  color={
                    CONTRACT_STATE_COLORS[data.contrat.contract_state] ?? 'gray'
                  }
                />
              </div>
              <div className="text-muted-foreground text-xs">
                {data.contrat.formation_titre ?? 'Formation non renseignée'}
              </div>
            </SheetHeader>

            <div className="space-y-5 p-4">
              <Section icon={Hash} title="Identifiants">
                <Row
                  label="DECA / OPCO"
                  value={data.contrat.contract_number}
                  mono
                />
                <Row
                  label="N° Eduvia"
                  value={data.contrat.internal_number}
                  mono
                />
                <Row label="Réf Soluvia" value={data.contrat.ref} mono />
                <Row
                  label="ID API Eduvia"
                  value={data.contrat.eduvia_id?.toString()}
                  mono
                />
              </Section>

              <Section icon={Calendar} title="Contrat">
                <Row
                  label="Type"
                  value={mapLabel(
                    CONTRACT_TYPE_LABELS,
                    data.contrat.contract_type,
                  )}
                />
                <Row
                  label="Mode"
                  value={mapLabel(
                    CONTRACT_MODE_LABELS,
                    data.contrat.contract_mode,
                  )}
                />
                <Row
                  label="Mode de création"
                  value={mapLabel(
                    CREATION_MODE_LABELS,
                    data.contrat.creation_mode,
                  )}
                />
                <Row
                  label="Date conclusion"
                  value={fmtDate(data.contrat.contract_conclusion_date)}
                />
                <Row
                  label="Acceptation"
                  value={fmtDate(data.contrat.accepted_at)}
                />
                <Row
                  label="Début formation pratique"
                  value={fmtDate(data.contrat.practical_training_start_date)}
                />
                <Row label="Début" value={fmtDate(data.contrat.date_debut)} />
                <Row label="Fin" value={fmtDate(data.contrat.date_fin)} />
                <Row
                  label="Durée"
                  value={
                    data.contrat.duree_mois
                      ? `${data.contrat.duree_mois} mois`
                      : null
                  }
                />
                <Row
                  label="Prise en charge OPCO (NPEC)"
                  value={formatCurrency(data.contrat.npec_amount ?? 0)}
                  mono
                />
                {data.contrat.support != null &&
                data.contrat.npec_amount != null &&
                Number(data.contrat.support) !==
                  Number(data.contrat.npec_amount) ? (
                  <Row
                    label="Support réel OPCO"
                    value={formatCurrency(Number(data.contrat.support))}
                    mono
                  />
                ) : null}
                {data.contrat.support_first_equipment != null &&
                Number(data.contrat.support_first_equipment) > 0 ? (
                  <Row
                    label="Premier équipement"
                    value={formatCurrency(
                      Number(data.contrat.support_first_equipment),
                    )}
                    mono
                  />
                ) : null}
                <Row
                  label="Apporteur"
                  value={
                    data.contrat.referrer_name && data.contrat.referrer_amount
                      ? `${data.contrat.referrer_name} (${formatCurrency(data.contrat.referrer_amount)})`
                      : data.contrat.referrer_name
                  }
                />
              </Section>

              {data.apprenant && (
                <Section icon={User} title="Apprenant">
                  <Row label="Email" value={data.apprenant.email} />
                  <Row label="Téléphone" value={data.apprenant.phone_number} />
                  <Row
                    label="Date de naissance"
                    value={fmtDate(data.apprenant.birth_date)}
                  />
                  <Row
                    label="Genre"
                    value={mapLabel(GENDER_LABELS, data.apprenant.gender)}
                  />
                  <Row
                    label="Adresse"
                    value={
                      [
                        data.apprenant.address,
                        data.apprenant.postcode,
                        data.apprenant.city,
                      ]
                        .filter(Boolean)
                        .join(' ') || null
                    }
                  />
                  <Row
                    label="Statut"
                    value={mapLabel(
                      APPRENANT_STATUS_LABELS,
                      data.apprenant.status,
                    )}
                  />
                  <Row
                    label="RQTH"
                    value={
                      data.apprenant.disabled_worker === true
                        ? 'Oui'
                        : data.apprenant.disabled_worker === false
                          ? 'Non'
                          : null
                    }
                  />
                  <Row
                    label="Nationalité"
                    value={mapLabel(
                      NATIONALITY_LABELS,
                      data.apprenant.nationality_code,
                    )}
                  />
                </Section>
              )}

              {data.formation && (
                <Section icon={GraduationCap} title="Formation">
                  <Row
                    label="Titre"
                    value={data.formation.qualification_title}
                  />
                  <Row label="RNCP" value={data.formation.rncp} mono />
                  <Row
                    label="Code diplôme"
                    value={data.formation.code_diploma}
                    mono
                  />
                  <Row
                    label="Type diplôme"
                    value={data.formation.diploma_type}
                  />
                  <Row label="Durée" value={data.formation.duree} />
                  <Row
                    label="Nb séquences"
                    value={data.formation.sequence_count?.toString()}
                  />
                </Section>
              )}

              {data.company && (
                <Section icon={Building2} title="Entreprise d'accueil">
                  <Row label="Dénomination" value={data.company.denomination} />
                  <Row label="SIRET" value={data.company.siret} mono />
                  <Row label="Code NAF" value={data.company.naf} mono />
                  <Row label="IDCC" value={data.company.idcc_code} mono />
                  <Row
                    label="Effectif"
                    value={data.company.employee_count?.toString()}
                  />
                  <Row
                    label="Type employeur"
                    value={data.company.employer_type}
                  />
                  <Row
                    label="Adresse"
                    value={
                      [
                        data.company.address,
                        data.company.postcode,
                        data.company.city,
                        data.company.country,
                      ]
                        .filter(Boolean)
                        .join(' ') || null
                    }
                  />
                </Section>
              )}

              {data.progression && (
                <Section
                  icon={TrendingUp}
                  title="Progression pédagogique (Eduvia)"
                >
                  <Row
                    label="Progression réelle"
                    value={
                      data.progression.progression_percentage !== null
                        ? `${Number(data.progression.progression_percentage).toFixed(1)} %`
                        : null
                    }
                  />
                  <Row
                    label="Séquences complétées"
                    value={
                      data.progression.completed_sequences_count !== null &&
                      data.progression.sequence_count !== null
                        ? `${data.progression.completed_sequences_count} / ${data.progression.sequence_count}`
                        : null
                    }
                  />
                  <Row
                    label="Temps passé"
                    value={
                      data.progression.total_spent_time_hours !== null
                        ? `${Number(data.progression.total_spent_time_hours).toFixed(1)} h`
                        : null
                    }
                  />
                  <Row
                    label="Score moyen"
                    value={
                      data.progression.average_score !== null
                        ? Number(data.progression.average_score).toFixed(1)
                        : null
                    }
                  />
                  <Row
                    label="Dernière activité"
                    value={fmtDate(data.progression.last_activity_at)}
                  />
                </Section>
              )}

              {data.forecastSteps.length > 0 && (
                <Section icon={Calendar} title="Échéancier prévisionnel Eduvia">
                  <div className="space-y-1.5">
                    {data.forecastSteps.map((s) => (
                      <div
                        key={s.id}
                        className="flex items-center justify-between border-b py-1 last:border-0"
                      >
                        <span className="text-muted-foreground text-xs">
                          #{s.step_number} · {fmtDate(s.opening_date)}
                          {s.percentage !== null
                            ? ` · ${Number(s.percentage).toFixed(0)}%`
                            : ''}
                        </span>
                        <span className="font-mono text-sm tabular-nums">
                          {formatCurrency(Number(s.total_amount ?? 0))}
                        </span>
                      </div>
                    ))}
                    <div className="text-muted-foreground flex items-center justify-between pt-1 text-xs">
                      <span>Total échéancier</span>
                      <span className="font-mono tabular-nums">
                        {formatCurrency(
                          data.forecastSteps.reduce(
                            (sum, s) => sum + Number(s.total_amount ?? 0),
                            0,
                          ),
                        )}
                      </span>
                    </div>
                  </div>
                </Section>
              )}

              {data.invoiceSteps.length > 0 && (
                <Section icon={Receipt} title="Facturation Eduvia">
                  <div className="space-y-1.5">
                    {data.invoiceSteps.map((s) => {
                      const total = Number(s.total_amount ?? 0);
                      // Eduvia API ne remonte pas paid_amount (toujours 0).
                      // Le payé OPCO = invoice_state='REGLE' (+ paid_at) →
                      // montant payé = total_amount.
                      const isPaid =
                        s.invoice_state === 'REGLE' || s.paid_at !== null;
                      const paid = isPaid ? total : Number(s.paid_amount ?? 0);
                      const inProgress = Number(s.in_progress_amount ?? 0);
                      const stateLabel = s.invoice_state
                        ? (INVOICE_STATE_LABELS[s.invoice_state] ??
                          s.invoice_state)
                        : null;
                      return (
                        <div
                          key={s.id}
                          className="flex items-start justify-between gap-2 border-b py-1.5 last:border-0"
                        >
                          <div className="flex min-w-0 flex-col">
                            <span className="text-sm font-medium">
                              #{s.step_number} · {fmtDate(s.opening_date)}
                            </span>
                            <div className="text-muted-foreground flex items-center gap-1.5 text-[11px]">
                              {stateLabel && (
                                <span
                                  className={
                                    isPaid
                                      ? 'text-[var(--success)]'
                                      : 'text-muted-foreground'
                                  }
                                >
                                  {isPaid ? 'Payé' : stateLabel}
                                </span>
                              )}
                              {s.external_code && (
                                <span className="font-mono">
                                  · {s.external_code}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="shrink-0 text-right">
                            <div className="font-mono text-sm tabular-nums">
                              {formatCurrency(total)}
                            </div>
                            {paid > 0 && (
                              <div className="font-mono text-[11px] text-[var(--success)] tabular-nums">
                                payé {formatCurrency(paid)}
                              </div>
                            )}
                            {inProgress > 0 && (
                              <div className="text-muted-foreground font-mono text-[11px] tabular-nums">
                                en cours {formatCurrency(inProgress)}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    {(() => {
                      const totals = data.invoiceSteps.reduce(
                        (acc, s) => {
                          const total = Number(s.total_amount ?? 0);
                          const stepPaid =
                            s.invoice_state === 'REGLE' || s.paid_at !== null
                              ? total
                              : Number(s.paid_amount ?? 0);
                          return {
                            invoiced: acc.invoiced + total,
                            paid: acc.paid + stepPaid,
                          };
                        },
                        { invoiced: 0, paid: 0 },
                      );
                      return (
                        <div className="space-y-0.5 pt-1 text-xs">
                          <div className="text-muted-foreground flex items-center justify-between">
                            <span>Total facturé</span>
                            <span className="font-mono tabular-nums">
                              {formatCurrency(totals.invoiced)}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-[var(--success)]">
                            <span>Total encaissé</span>
                            <span className="font-mono tabular-nums">
                              {formatCurrency(totals.paid)}
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span>Reste</span>
                            <span className="font-mono tabular-nums">
                              {formatCurrency(totals.invoiced - totals.paid)}
                            </span>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </Section>
              )}

              <div className="text-muted-foreground pt-2 text-[10px]">
                Dernière sync :{' '}
                {data.contrat.last_synced_at
                  ? new Date(data.contrat.last_synced_at).toLocaleString(
                      'fr-FR',
                    )
                  : 'jamais'}
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
