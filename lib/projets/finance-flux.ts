/**
 * Agregation du flux OPCO d'un projet, a partir des jalons Eduvia.
 *
 * Ce flux est distinct de la commission SOLUVIA : ni les memes montants, ni
 * les memes echeances, ni le meme interlocuteur. Un OPCO qui ne regle pas
 * n'est pas le meme probleme qu'un client qui ne regle pas.
 *
 * Fonction pure : le jour courant et le delai sont injectes, jamais lus ici.
 */

export interface JalonOpco {
  id: string;
  contratId: string;
  stepNumber: number;
  /** Date a partir de laquelle le jalon est facturable a l'OPCO. */
  openingDate: string | null;
  /** null = non transmis, 'TRANSMIS', 'REGLE'. */
  invoiceState: string | null;
  totalAmount: number;
  paidAmount: number;
  opcoSettledAmount: number;
  invoiceSentAt: string | null;
}

export interface LigneRetardFacturation {
  id: string;
  contratId: string;
  stepNumber: number;
  openingDate: string;
  montant: number;
  joursDepuisOuverture: number;
}

export interface LigneRetardEncaissement {
  id: string;
  contratId: string;
  stepNumber: number;
  invoiceSentAt: string;
  montantDu: number;
  joursDepuisEnvoi: number;
}

export interface FluxOpco {
  facture: number;
  retardFacturation: number;
  retardEncaissement: number;
  lignesRetardFacturation: LigneRetardFacturation[];
  lignesRetardEncaissement: LigneRetardEncaissement[];
}

function joursEntre(debutIso: string, finIso: string): number {
  const d = Date.parse(
    debutIso.length === 10 ? `${debutIso}T00:00:00Z` : debutIso,
  );
  const f = Date.parse(`${finIso}T00:00:00Z`);
  if (Number.isNaN(d) || Number.isNaN(f)) return 0;
  return Math.floor((f - d) / 86_400_000);
}

export function agregerFluxOpco(
  jalons: JalonOpco[],
  aujourdHui: string,
  delaiReglementJours: number,
): FluxOpco {
  let facture = 0;
  let retardFacturation = 0;
  let retardEncaissement = 0;
  const lignesRetardFacturation: LigneRetardFacturation[] = [];
  const lignesRetardEncaissement: LigneRetardEncaissement[] = [];

  for (const j of jalons) {
    const transmis = j.invoiceState != null;

    if (transmis) {
      facture += j.totalAmount;
    }

    // Retard de facturation : le jalon est ouvert depuis au moins un jour et
    // n'est toujours pas parti a l'OPCO. Ouvert le jour meme = rien a
    // reprocher, la transmission peut encore se faire.
    if (!transmis && j.openingDate) {
      const jours = joursEntre(j.openingDate, aujourdHui);
      if (jours > 0) {
        retardFacturation += j.totalAmount;
        lignesRetardFacturation.push({
          id: j.id,
          contratId: j.contratId,
          stepNumber: j.stepNumber,
          openingDate: j.openingDate,
          montant: j.totalAmount,
          joursDepuisOuverture: jours,
        });
      }
    }

    // Retard d'encaissement : transmis depuis plus que le delai, pas encore
    // regle. Un jalon REGLE est hors de portee quoi qu'il arrive.
    if (j.invoiceState === 'REGLE' || !transmis || !j.invoiceSentAt) {
      continue;
    }
    const joursEnvoi = joursEntre(j.invoiceSentAt, aujourdHui);
    if (joursEnvoi <= delaiReglementJours) continue;

    // Les deux colonnes disent le meme fait par deux chemins (lecture
    // Eduvia et rapprochement Odoo) : retenir la plus elevee evite de
    // reclamer un montant deja encaisse.
    const regle = Math.max(j.paidAmount, j.opcoSettledAmount);
    const du = Math.max(0, j.totalAmount - regle);
    if (du <= 0) continue;

    retardEncaissement += du;
    lignesRetardEncaissement.push({
      id: j.id,
      contratId: j.contratId,
      stepNumber: j.stepNumber,
      invoiceSentAt: j.invoiceSentAt,
      montantDu: du,
      joursDepuisEnvoi: joursEnvoi,
    });
  }

  return {
    facture,
    retardFacturation,
    retardEncaissement,
    lignesRetardFacturation,
    lignesRetardEncaissement,
  };
}
