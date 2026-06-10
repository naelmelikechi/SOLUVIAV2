'use client';

import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Date + heure Paris, deterministe quel que soit le fuseau du serveur :
// on formate cote client au moment du clic (meme approche que bugs-table).
const DATE_TIME_FMT = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

export interface AuditExportRow {
  /** ISO created_at brut, formate au moment de l'export */
  date: string;
  utilisateur: string;
  action: string;
  entite: string;
  details: string;
}

export function AuditExportButton({ rows }: { rows: AuditExportRow[] }) {
  const handleExport = async () => {
    const XLSX = await import('xlsx');
    const data = rows.map((r) => ({
      Date: DATE_TIME_FMT.format(new Date(r.date)),
      Utilisateur: r.utilisateur,
      Action: r.action,
      Entité: r.entite,
      Détails: r.details,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Historique');
    XLSX.writeFile(wb, `audit_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  return (
    <Button variant="outline" size="sm" onClick={handleExport}>
      <Download className="mr-1.5 size-4" />
      Export Excel
    </Button>
  );
}
