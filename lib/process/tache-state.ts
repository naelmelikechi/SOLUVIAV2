export type TacheState =
  | 'a_faire'
  | 'en_retard'
  | 'realise'
  | 'valide_cdp'
  | 'valide';

export interface TacheStateInput {
  realise: boolean;
  valide_cdp: boolean;
  valide: boolean;
  echeance: string | null;
}

/** État d'une tâche (miroir de la logique Soluvia-Process). `today` = 'YYYY-MM-DD'. */
export function getTacheState(t: TacheStateInput, today: string): TacheState {
  if (t.valide) return 'valide';
  if (t.valide_cdp) return 'valide_cdp';
  if (t.realise) return 'realise';
  if (t.echeance && t.echeance < today) return 'en_retard';
  return 'a_faire';
}

export const TACHE_STATE_LABEL: Record<TacheState, string> = {
  a_faire: 'À faire',
  en_retard: 'En retard',
  realise: 'Réalisé',
  valide_cdp: 'Validé CDP',
  valide: 'Validé',
};
