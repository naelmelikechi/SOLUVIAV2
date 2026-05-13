import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
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

export function formatHeures(h: number): string {
  if (!Number.isFinite(h) || h <= 0) return '0h';
  const hours = Math.floor(h);
  const minutes = Math.round((h - hours) * 60);
  if (minutes === 60) return `${hours + 1}h`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h${minutes.toString().padStart(2, '0')}`;
}
