/**
 * Definitions declaratives des etapes du tour guide par role.
 *
 * Chaque etape pointe sur un selecteur CSS (data-tour="X" sur l'element
 * cible) et optionnellement une route a charger avant l'affichage. Le
 * composant OnboardingTour orchestre la navigation Next.js + l'attente
 * de l'ancre dans le DOM.
 */

export interface TourStep {
  /** Selecteur CSS de l'element a highlight. Omis = popup centree. */
  element?: string;
  /** Route a charger avant d'afficher cette etape. */
  route?: string;
  popover: {
    title: string;
    description: string;
    side?: 'left' | 'right' | 'top' | 'bottom';
    align?: 'start' | 'center' | 'end';
  };
}

const COMMON_OUTRO: TourStep = {
  popover: {
    title: 'C’est tout pour la visite !',
    description:
      'Astuce : tape ⌘K (ou Ctrl+K) n’importe où pour naviguer rapidement. Tu peux relancer cette visite depuis Mon compte > Visite guidée.',
  },
};

export const CDP_TOUR: TourStep[] = [
  {
    route: '/accueil',
    popover: {
      title: 'Bienvenue dans Soluvia',
      description:
        'Voici un rapide tour de ton espace de travail. On va parcourir les modules clés que tu utiliseras au quotidien. Tu peux passer la visite à tout moment.',
    },
  },
  {
    element: '[data-tour="/projets"]',
    popover: {
      title: 'Projets',
      description:
        'Le hub de tes projets de formation : avancement, planning, contrats, livrables.',
      side: 'right',
      align: 'start',
    },
  },
  {
    route: '/projets',
    element: '[data-tour="/projets"]',
    popover: {
      title: 'Page Projets',
      description:
        'Filtre par client, statut, CDP. Clique sur une ligne pour ouvrir la fiche complète du projet.',
      side: 'right',
      align: 'start',
    },
  },
  {
    element: '[data-tour="/temps"]',
    popover: {
      title: 'Saisie des temps',
      description:
        'Ta feuille de temps hebdomadaire. Auto-save après 2 secondes, pas besoin de bouton enregistrer.',
      side: 'right',
      align: 'start',
    },
  },
  {
    route: '/temps',
    element: '[data-tour="/temps"]',
    popover: {
      title: 'Page Temps',
      description:
        'Saisis tes heures par jour et par projet. Tu seras notifié en début de semaine si une saisie manque.',
      side: 'right',
      align: 'start',
    },
  },
  {
    element: '[data-tour="/facturation"]',
    popover: {
      title: 'Facturation',
      description:
        'Émission et suivi des factures. Le badge rouge indique les factures en retard de paiement.',
      side: 'right',
      align: 'start',
    },
  },
  {
    element: '[data-tour="bug-report"]',
    popover: {
      title: 'Signaler un bug',
      description:
        'Un comportement bizarre ? Ce bouton capture l’écran et envoie le contexte technique aux admins.',
      side: 'left',
      align: 'end',
    },
  },
  COMMON_OUTRO,
];

export const COMMERCIAL_TOUR: TourStep[] = [
  {
    route: '/accueil',
    popover: {
      title: 'Bienvenue dans Soluvia',
      description:
        'Voici un rapide tour de ton espace commercial. On va parcourir les modules clés. Tu peux passer la visite à tout moment.',
    },
  },
  {
    element: '[data-tour="/commercial/pipeline"]',
    popover: {
      title: 'Pipeline',
      description:
        'Tes opportunités commerciales regroupées par étape. Suis chaque affaire jusqu’à la signature.',
      side: 'right',
      align: 'start',
    },
  },
  {
    route: '/commercial/pipeline',
    element: '[data-tour="/commercial/pipeline"]',
    popover: {
      title: 'Page Pipeline',
      description:
        'Vue façon Notion de toutes les affaires en cours, regroupées par stage (Non contacté, R1 validé, R2 validé, Signé). Clique sur une ligne pour ouvrir le détail.',
      side: 'right',
      align: 'start',
    },
  },
  {
    element: '[data-tour="/projets"]',
    popover: {
      title: 'Projets',
      description:
        'Une fois une affaire gagnée, retrouve le projet correspondant ici pour suivre sa production.',
      side: 'right',
      align: 'start',
    },
  },
  {
    element: '[data-tour="/idees"]',
    popover: {
      title: 'Idées',
      description:
        'Une suggestion d’amélioration ? Partage-la ici, l’équipe pourra voter et commenter.',
      side: 'right',
      align: 'start',
    },
  },
  {
    element: '[data-tour="bug-report"]',
    popover: {
      title: 'Signaler un bug',
      description:
        'Un comportement bizarre ? Ce bouton capture l’écran et envoie le contexte technique aux admins.',
      side: 'left',
      align: 'end',
    },
  },
  COMMON_OUTRO,
];

export function getTourForRole(
  role: string | null | undefined,
): TourStep[] | null {
  if (role === 'cdp') return CDP_TOUR;
  if (role === 'commercial') return COMMERCIAL_TOUR;
  return null;
}
