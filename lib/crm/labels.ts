// Libellés FR partagés pour les valeurs d'enum stockées en base (U-M6).
// Évite d'afficher les valeurs techniques brutes (« ouverte », « planifie »…).

export const statutOppLabel: Record<string, string> = {
  ouverte: 'Ouverte',
  gagnee: 'Gagnée',
  perdue: 'Perdue',
};

export const statutRdvLabel: Record<string, string> = {
  planifie: 'Planifié',
  realise: 'Réalisé',
  annule: 'Annulé',
};

export const prioriteLabel: Record<string, string> = {
  basse: 'Basse',
  normale: 'Normale',
  haute: 'Haute',
};

/** Options { value, label } de priorité pour les sélecteurs (dérivées de prioriteLabel). */
export const prioriteItems = (
  Object.entries(prioriteLabel) as [string, string][]
).map(([value, label]) => ({ value, label }));

export const activiteTypeLabel: Record<string, string> = {
  note: 'Note',
  appel: 'Appel',
  email: 'Email',
  systeme: 'Système',
};

/** Renvoie le libellé connu, sinon la valeur brute (sécurité d'affichage). */
export function label(
  map: Record<string, string>,
  value: string | null | undefined,
): string {
  if (!value) return '-';
  return map[value] ?? value;
}
