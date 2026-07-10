import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { TZ, parisDateOnly } from '@/lib/utils/dates-paris';

const currencyFormatter = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

export function formatCurrency(amount: number): string {
  return currencyFormatter.format(amount);
}

export function formatDate(date: string | Date): string {
  const d =
    typeof date === 'string'
      ? new Date(date + (date.length === 10 ? 'T00:00:00' : ''))
      : date;
  return format(d, 'd MMM yyyy', { locale: fr });
}

export function formatDateLong(date: string | Date): string {
  const d =
    typeof date === 'string'
      ? new Date(date + (date.length === 10 ? 'T00:00:00' : ''))
      : date;
  return format(d, 'd MMMM yyyy', { locale: fr });
}

// Normalise les tirets typographiques externes (em-dash et en-dash) en simple
// hyphen, pour rester aligné sur la convention UI projet : pas d'em-dash.
export function normalizeDashes(text: string): string {
  return text.replace(/[—–]/g, '-');
}

export function formatPercent(value: number, decimals = 0): string {
  return `${value.toFixed(decimals)}%`;
}

export function formatDateShort(date: string | Date): string {
  const d =
    typeof date === 'string'
      ? new Date(date + (date.length === 10 ? 'T00:00:00' : ''))
      : date;
  return format(d, 'dd/MM/yyyy', { locale: fr });
}

// Normalise les differents formats de `mois_concerne` (ISO "2026-05",
// "2026-05-01", ou texte deja humain "janvier 2026") en libelle FR
// capitalise type "Mai 2026". Retourne chaine vide si vide/null.
export function formatMoisConcerne(value: string | null | undefined): string {
  if (!value) return '';
  if (/^\d{4}-\d{2}/.test(value)) {
    try {
      const dateStr = value.length === 7 ? value + '-01' : value;
      const moisLabel = format(parseISO(dateStr), 'MMMM yyyy', { locale: fr });
      return moisLabel.charAt(0).toUpperCase() + moisLabel.slice(1);
    } catch {
      return value;
    }
  }
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function formatHeures(h: number): string {
  if (!Number.isFinite(h) || h <= 0) return '0h';
  const hours = Math.floor(h);
  const minutes = Math.round((h - hours) * 60);
  if (minutes === 60) return `${hours + 1}h`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h${minutes.toString().padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Variantes fuseau Europe/Paris (ex lib/crm/format.ts, fusionné ici).
// Contrat différent de formatDate/formatDateLong ci-dessus : null-safe
// (retourne '-') et calées sur le fuseau Paris quel que soit le serveur.
// ---------------------------------------------------------------------------

export { parisDateOnly };

/** Formate une date (sans heure) en français, fuseau Europe/Paris. '-' si vide. */
export function formatDateParis(iso?: string | null): string {
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
export function formatDateTimeParis(iso?: string | null): string {
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
