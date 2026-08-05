import type { BadgeColor } from '@/components/shared/status-badge';

// Les 7 etapes fixes de la timeline de lancement d'un projet, dans l'ordre.
// Les keys sont figees en DB (CHECK constraints) : ne pas renommer sans migration.
export const LANCEMENT_ETAPES = [
  { key: 'contrat_signe', label: 'Contrat signé' },
  { key: 'nda', label: 'NDA' },
  { key: 'extension_nda', label: 'Extension NDA' },
  { key: 'qualiopi', label: 'Qualiopi' },
  { key: 'uai', label: 'UAI' },
  { key: 'agrements', label: 'Agréments' },
  { key: 'production', label: 'Production' },
] as const;

export type LancementEtapeKey = (typeof LANCEMENT_ETAPES)[number]['key'];

export const LANCEMENT_ETAPE_KEYS = LANCEMENT_ETAPES.map(
  (e) => e.key,
) as LancementEtapeKey[];

export const LANCEMENT_STATUTS = [
  { key: 'non_commence', label: 'Non commencé', color: 'gray' },
  { key: 'en_cours', label: 'En cours', color: 'orange' },
  // "Depose" = dossier parti chez le tiers instructeur, en attente de sa
  // reponse. Distinct d'"en_cours" (action encore cote SOLUVIA) et de
  // "lance" (accepte). Ordre de la liste = ordre d'avancement affiche.
  { key: 'depose', label: 'Déposé', color: 'blue' },
  { key: 'lance', label: 'Lancé', color: 'green' },
] as const satisfies readonly {
  key: string;
  label: string;
  color: BadgeColor;
}[];

export type LancementStatut = (typeof LANCEMENT_STATUTS)[number]['key'];

export const LANCEMENT_STATUT_KEYS = LANCEMENT_STATUTS.map(
  (s) => s.key,
) as LancementStatut[];

export function getLancementStatutMeta(statut: string) {
  return (
    LANCEMENT_STATUTS.find((s) => s.key === statut) ?? LANCEMENT_STATUTS[0]
  );
}
