import { createClient } from '@/lib/supabase/server';
import { getDashboardData } from '@/lib/queries/dashboard';
import {
  getContratsAFacturer,
  type ContratAFacturer,
} from '@/lib/queries/contrats-a-facturer';
import { getJoursSansSaisie } from '@/lib/queries/temps';
import { formatCurrency } from '@/lib/utils/formatters';
import { getDevisARelancerCount } from '@/lib/queries/devis';
import { getRdvFormateursAVenirCount } from '@/lib/queries/rdv';

// ---------------------------------------------------------------------------
// Accueil CDP : worklist « À faire ». Agrège les signaux actionnables déjà
// synchronisés (RLS = projets du CDP), sans nouvelle source de données.
// ---------------------------------------------------------------------------

export type WorklistColor = 'red' | 'orange' | 'blue';

export interface AccueilWorklistItem {
  key: string;
  count: number;
  title: string;
  description: string;
  href: string;
  color: WorklistColor;
}

export interface AccueilCdpData {
  items: AccueilWorklistItem[];
  /** Aperçu des 3 contrats à facturer les plus en retard. */
  aFacturerPreview: ContratAFacturer[];
  totalActions: number;
}

// Urgence d'affichage : rouge avant orange avant bleu.
const COLOR_ORDER: Record<WorklistColor, number> = {
  red: 0,
  orange: 1,
  blue: 2,
};

export async function getAccueilCdpData(
  userId: string,
): Promise<AccueilCdpData> {
  const supabase = await createClient();

  const [
    dash,
    aFacturer,
    joursSansSaisie,
    devisARelancer,
    rdvAVenir,
    notifRes,
  ] = await Promise.all([
    getDashboardData(),
    getContratsAFacturer(),
    getJoursSansSaisie(userId),
    getDevisARelancerCount(),
    getRdvFormateursAVenirCount(),
    supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .is('read_at', null),
  ]);

  const notifications = notifRes.count ?? 0;
  // Dimension € du pilotage : montant total des échéances OPCO échues à
  // facturer (donnée déjà chargée, agrégée sans requête supplémentaire).
  const montantAFacturer = aFacturer.reduce((s, c) => s + (c.montant ?? 0), 0);
  // Urgence : au moins une échéance en retard -> rouge (priorité max), sinon
  // orange. Fait remonter le signal phare en tête de la worklist.
  const aFacturerColor: WorklistColor = aFacturer.some((c) => c.retardJours > 0)
    ? 'red'
    : 'orange';

  const allItems: AccueilWorklistItem[] = [
    {
      key: 'a-facturer',
      count: aFacturer.length,
      title: 'Contrats à facturer',
      description:
        montantAFacturer > 0
          ? `≈ ${formatCurrency(Math.round(montantAFacturer))} d'échéances OPCO échues`
          : 'Échéances OPCO échues à transmettre dans Eduvia',
      href: '/a-facturer',
      color: aFacturerColor,
    },
    {
      key: 'temps',
      count: joursSansSaisie,
      title: 'Jours sans saisie',
      description: 'Temps non saisi cette semaine',
      href: '/temps',
      color: 'orange',
    },
    {
      key: 'progression',
      count: dash.contratsSansProgression,
      title: 'Contrats sans progression',
      description: 'Aucune activité depuis plus de 30 jours',
      href: '/projets',
      color: 'orange',
    },
    {
      key: 'devis-relance',
      count: devisARelancer,
      title: 'Devis à relancer',
      description: 'Envoyés sans réponse depuis 7 jours ou plus',
      href: '/devis',
      color: 'orange',
    },
    {
      key: 'rdv',
      count: rdvAVenir,
      title: 'RDV à venir',
      description: 'Rendez-vous formateurs planifiés',
      href: '/projets',
      color: 'blue',
    },
    {
      key: 'notifications',
      count: notifications,
      title: 'Notifications',
      description: 'Notifications non lues',
      href: '/notifications',
      color: 'blue',
    },
  ];
  const items = allItems.filter((i) => i.count > 0);

  items.sort(
    (a, b) => COLOR_ORDER[a.color] - COLOR_ORDER[b.color] || b.count - a.count,
  );

  return {
    items,
    aFacturerPreview: aFacturer.slice(0, 3),
    totalActions: items.reduce((sum, i) => sum + i.count, 0),
  };
}
