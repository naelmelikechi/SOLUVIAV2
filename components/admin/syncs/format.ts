import { format } from 'date-fns';

/**
 * Helpers de formatage partages entre les cards (Server Components) et la
 * table des derniers runs (Client Component). Purs, sans dependance serveur.
 */

/** Duree d'un run : "850 ms", "12,3 s", "2 min 05 s". */
export function formatDureeMs(ms: number | null | undefined): string {
  if (ms == null) return '-';
  if (ms < 1000) return `${ms} ms`;
  const totalSeconds = ms / 1000;
  if (totalSeconds < 60) {
    return `${totalSeconds.toFixed(1).replace('.', ',')} s`;
  }
  const rounded = Math.round(totalSeconds);
  const minutes = Math.floor(rounded / 60);
  const seconds = rounded % 60;
  return `${minutes} min ${seconds.toString().padStart(2, '0')} s`;
}

/** Horodatage absolu "10/06/2026 14:02" (fuseau local du rendu). */
export function formatHorodatage(iso: string | null | undefined): string {
  if (!iso) return '-';
  return format(new Date(iso), 'dd/MM/yyyy HH:mm');
}
