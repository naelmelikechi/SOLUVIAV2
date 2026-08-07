/**
 * Les 5 categories metier d'un contrat sur la fiche projet.
 *
 * Rupture et annulation ont chacune la leur, a la demande explicite du
 * commanditaire : une rupture a produit du chiffre avant de s'arreter, un
 * archive n'a rien produit. Les confondre effacerait la seule distinction qui
 * interesse le CDP.
 */
export type CategorieContrat =
  | 'prevus'
  | 'deposes'
  | 'ruptures'
  | 'annules'
  | 'archives';

export const CATEGORIES_CONTRAT: ReadonlyArray<{
  cle: CategorieContrat;
  label: string;
  /** Phrase affichee quand la categorie est vide. */
  vide: string;
}> = [
  {
    cle: 'prevus',
    label: 'Prévus de rentrer',
    vide: 'Aucun contrat en attente de transmission',
  },
  {
    cle: 'deposes',
    label: "Déposés à l'OPCO",
    vide: 'Aucun contrat déposé',
  },
  { cle: 'ruptures', label: 'Ruptures', vide: 'Aucune rupture' },
  { cle: 'annules', label: 'Annulés', vide: 'Aucun contrat annulé' },
  { cle: 'archives', label: 'Archivés', vide: 'Aucun contrat archivé' },
];

const PREVUS = new Set(['NOTSENT']);
const RUPTURES = new Set(['RUPTURE', 'resilie', 'suspendu']);
const ANNULES = new Set(['ANNULE']);
const ARCHIVES = new Set(['ARCHIVE']);

export function categorieContrat(
  contractState: string | null | undefined,
  archive: boolean,
): CategorieContrat {
  // Le drapeau prime sur l'etat Eduvia : un contrat sorti de la production
  // par un admin ou par le cron ne doit pas reapparaitre ailleurs.
  if (archive) return 'archives';

  const etat = contractState ?? '';
  if (ARCHIVES.has(etat)) return 'archives';
  if (PREVUS.has(etat)) return 'prevus';
  if (RUPTURES.has(etat)) return 'ruptures';
  if (ANNULES.has(etat)) return 'annules';

  // Repli volontaire sur "deposes" : un etat inconnu doit rester VISIBLE.
  // Le ranger dans "archives" le ferait disparaitre de la production sans
  // que personne ne l'ait decide.
  return 'deposes';
}
