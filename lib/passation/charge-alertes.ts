import { seuilCharge, type SeuilCharge } from '@/lib/utils/cdp-scoring';
import type { DispoCdp } from '@/lib/utils/constants';

/** État de charge d'un CDP au moment du contrôle (cron). */
export interface CdpChargeEtat {
  cdpId: string;
  ratio: number;
  disponibilite: DispoCdp | null;
  /** Dernier palier notifié (users.cdp_seuil_alerte). */
  seuilNotifie: number;
}

export interface TransitionSeuil {
  cdpId: string;
  seuil: SeuilCharge;
}

export interface ChargeAlertes {
  /** CDP venant de franchir 80 % (notif in-app CDP + Référents). */
  montees80: TransitionSeuil[];
  /** CDP venant de franchir 95 % ou saturation déclarée (mail Direction). */
  montees95: TransitionSeuil[];
  /** Paliers à persister (montées ET redescentes = ré-armement). */
  aPersister: TransitionSeuil[];
  /**
   * Cas critique Feature 7 : tous les CDP sont rouges ET au moins un vient
   * de le devenir. L'escalade Direction ne part que sur cette transition
   * (idempotence naturelle, pas de spam à chaque exécution du cron).
   */
  escaladeTousRouges: boolean;
}

/**
 * Décide les alertes de saturation à émettre à partir des charges courantes
 * et des paliers déjà notifiés. Pur et déterministe (testé isolément).
 */
export function computeChargeAlertes(etats: CdpChargeEtat[]): ChargeAlertes {
  const montees80: TransitionSeuil[] = [];
  const montees95: TransitionSeuil[] = [];
  const aPersister: TransitionSeuil[] = [];

  let tousRouges = etats.length > 0;
  for (const etat of etats) {
    const seuil = seuilCharge(etat.ratio, etat.disponibilite);
    if (seuil !== 95) tousRouges = false;
    if (seuil === etat.seuilNotifie) continue;
    aPersister.push({ cdpId: etat.cdpId, seuil });
    if (seuil === 80 && etat.seuilNotifie < 80) {
      montees80.push({ cdpId: etat.cdpId, seuil });
    } else if (seuil === 95 && etat.seuilNotifie < 95) {
      montees95.push({ cdpId: etat.cdpId, seuil });
    }
  }

  return {
    montees80,
    montees95,
    aPersister,
    escaladeTousRouges: tousRouges && montees95.length > 0,
  };
}
