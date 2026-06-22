import { createClient } from '@/lib/supabase/server';
import { getDashboardData } from '@/lib/queries/dashboard';
import {
  getContratsAFacturer,
  type ContratAFacturer,
} from '@/lib/queries/contrats-a-facturer';
import { getJoursSansSaisie } from '@/lib/queries/temps';

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

  const [dash, aFacturer, joursSansSaisie, notifRes] = await Promise.all([
    getDashboardData(),
    getContratsAFacturer(),
    getJoursSansSaisie(userId),
    supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .is('read_at', null),
  ]);

  const notifications = notifRes.count ?? 0;

  const allItems: AccueilWorklistItem[] = [
    {
      key: 'a-facturer',
      count: aFacturer.length,
      title: 'Contrats à facturer',
      description: 'Échéances OPCO échues à transmettre dans Eduvia',
      href: '/a-facturer',
      color: 'blue',
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
    totalActions: items.length,
  };
}
