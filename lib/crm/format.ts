import { TZ, parisDateOnly } from '@/lib/crm/domain/dates';

// Ré-export : les importeurs historiques de parisDateOnly passent par lib/format.
export { parisDateOnly };

/** Formate une date (sans heure) en français, fuseau Europe/Paris. */
export function formatDate(iso?: string | null): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: TZ,
  });
}

/**
 * Formate une date + heure en français, fuseau Europe/Paris.
 * L'année n'est affichée que si elle diffère de l'année courante : évite
 * l'ambiguïté à la bascule d'année sans alourdir les dates de l'année en cours.
 */
export function formatDateTime(iso?: string | null): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  const yearInParis = (date: Date) =>
    new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric' }).format(
      date,
    );
  const showYear = yearInParis(d) !== yearInParis(new Date());
  return d.toLocaleString('fr-FR', {
    day: '2-digit',
    month: 'short',
    ...(showYear ? { year: 'numeric' } : {}),
    hour: '2-digit',
    minute: '2-digit',
    timeZone: TZ,
  });
}

/**
 * Date du jour au format "YYYY-MM-DD" dans le fuseau Europe/Paris.
 * À utiliser partout (queries serveur ET UI) pour éviter le décalage UTC vs local
 * près de minuit (badge cloche ≠ page Relances entre minuit et ~02h l'été).
 */
export function todayInParis(): string {
  return parisDateOnly(new Date());
}

/** Formate un montant en euros (fr-FR). Coerce les `numeric` Postgres renvoyés en string. */
export function formatEuros(n?: number | string | null): string {
  const v = Number(n ?? 0);
  return `${(Number.isFinite(v) ? v : 0).toLocaleString('fr-FR')} €`;
}
