// ---------------------------------------------------------------------------
// Vocabulaire unifie de la facturation a l'engagement :
// - step 1 OPCO  = "Engagement (étape 1)"
// - step N > 1   = "Échéance n°N"
// Consomme par : onglet À l'engagement, libelles de lignes de facture (PDF),
// badge Contenu de la liste des factures, carte Finance projet.
// Strings UI : hyphens simples uniquement, pas de tirets cadratins.
// ---------------------------------------------------------------------------

export type BillingEventType = 'engagement' | 'opco_step';

export function billingStepLabel(
  type: BillingEventType,
  stepNumber: number | null,
): string {
  if (type === 'engagement') return 'Engagement (étape 1)';
  return stepNumber != null ? `Échéance n°${stepNumber}` : 'Échéance';
}

/**
 * Badge "Contenu" d'une facture, derive de ses lignes.
 * Retourne null si la facture ne porte aucune ligne event (facture libre ou
 * manuelle) : pas de badge affiche.
 */
export function factureContenuLabel(
  lignes: Array<{ event_type: string | null; mois_relatif: number | null }>,
): string | null {
  const events = lignes.filter(
    (l) => l.event_type === 'engagement' || l.event_type === 'opco_step',
  );
  if (events.length === 0) return null;

  const hasEngagement = events.some((l) => l.event_type === 'engagement');
  const steps = new Set(
    events
      .filter((l) => l.event_type === 'opco_step')
      .map((l) => l.mois_relatif),
  );

  if (hasEngagement && steps.size > 0) return 'Mixte';
  if (hasEngagement) return 'Engagement';
  if (steps.size === 1) {
    // step 0 = mois_relatif de repli quand le step Eduvia n'est pas numerote :
    // on retombe sur le libelle generique, "Échéance n°0" n'existe pas.
    const step = [...steps][0];
    return step ? `Échéance n°${step}` : 'Échéance';
  }
  return 'Échéances';
}
