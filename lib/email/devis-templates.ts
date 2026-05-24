// Stub - implemented in T7
export async function sendDevisEmail(_p: {
  devisId: string;
  to?: string[];
  cc?: string[];
}): Promise<void> {
  throw new Error('devis-templates: not yet implemented');
}

export async function sendDevisAcceptationConfirmation(_p: {
  devisId: string;
  signataireEmail: string;
  signataireNom: string;
}): Promise<void> {
  throw new Error('devis-templates: not yet implemented');
}

export async function notifyAdminsDevisRefuse(_p: {
  devisId: string;
  motif?: string | null;
}): Promise<void> {
  throw new Error('devis-templates: not yet implemented');
}
