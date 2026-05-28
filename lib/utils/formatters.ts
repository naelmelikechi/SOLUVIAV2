import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';

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
