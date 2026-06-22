// Décision PURE de la vue d'accueil rôle-adaptative. Séparée de la page pour
// être testable sans I/O. Voir app/(dashboard)/accueil/page.tsx.
//
// Routing par `isAdmin` + `projetsCount` (PAS le bucket collab-status seul,
// qui classe en 'commercial' tout porteur de pipeline_access, CDP compris).

export type AccueilView = 'superadmin' | 'cdp' | 'commercial' | 'onboarding';

export function resolveAccueilView(input: {
  isAdmin: boolean;
  projetsCount: number;
  status: string;
}): AccueilView {
  if (input.isAdmin) return 'superadmin';
  if (input.projetsCount > 0) return 'cdp';
  if (input.status === 'commercial') return 'commercial';
  return 'onboarding';
}
