'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getUser } from '@/lib/queries/users';
import { logAudit } from '@/lib/utils/audit';
import { logger } from '@/lib/utils/logger';
import { isAdmin } from '@/lib/utils/roles';
import { getDevisById } from '@/lib/queries/devis';

type Result<T = object> =
  | ({ success: true } & T)
  | { success: false; error: string };

const CreateFactureFromDevisSchema = z.object({
  devisId: z.string().uuid(),
  mode: z.enum(['acompte', 'solde', 'personnalisee']),
  // Pour mode 'acompte' uniquement : pourcentage du total devis (1-100). Default 50.
  pourcentage: z.number().min(0.01).max(100).default(50).optional(),
});

export type CreateFactureFromDevisInput = z.input<
  typeof CreateFactureFromDevisSchema
>;

type LignePayload = {
  description: string;
  taux_tva_ligne: number;
  montant_ht: number;
  ordre: number;
};

export async function createFactureFromDevis(
  input: CreateFactureFromDevisInput,
): Promise<Result<{ factureId: string }>> {
  const user = await getUser();
  if (!isAdmin(user?.role))
    return { success: false, error: 'Accès refusé (admin requis)' };

  const parsed = CreateFactureFromDevisSchema.safeParse(input);
  if (!parsed.success)
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Données invalides',
    };

  const devis = await getDevisById(parsed.data.devisId);
  if (!devis) return { success: false, error: 'Devis introuvable' };
  if (devis.statut !== 'accepte')
    return {
      success: false,
      error: `Devis non transformable (statut=${devis.statut})`,
    };
  if (!devis.client_id || !devis.societe_emettrice_id)
    return {
      success: false,
      error: 'Devis incomplet (client ou société manquant)',
    };

  const supabase = await createClient();

  // Recuperer le total deja facture pour ce devis (pour calcul du solde)
  const { data: existingFactures } = await supabase
    .from('factures')
    .select('montant_ht')
    .eq('devis_id', devis.id);
  const totalDejaFactureHt = (existingFactures ?? []).reduce(
    (sum, f) => sum + Number(f.montant_ht),
    0,
  );
  const totalDevisHt = Number(devis.montant_ht);
  const tauxTva = Number(devis.lignes[0]?.taux_tva ?? 20);

  // Construire les lignes selon le mode
  let lignesPayload: LignePayload[] = [];
  let estAcompte = false;

  if (parsed.data.mode === 'acompte') {
    const pct = parsed.data.pourcentage ?? 50;
    const montantHt = Math.round(totalDevisHt * pct) / 100;
    lignesPayload = [
      {
        description: `Acompte ${pct}% sur ${devis.ref ?? devis.id} - ${devis.objet}`,
        taux_tva_ligne: tauxTva,
        montant_ht: montantHt,
        ordre: 1,
      },
    ];
    estAcompte = true;
  } else if (parsed.data.mode === 'solde') {
    const montantHt =
      Math.round((totalDevisHt - totalDejaFactureHt) * 100) / 100;
    if (montantHt <= 0)
      return { success: false, error: 'Devis déjà entièrement facturé' };
    lignesPayload = [
      {
        description: `Solde sur ${devis.ref ?? devis.id} - ${devis.objet}`,
        taux_tva_ligne: tauxTva,
        montant_ht: montantHt,
        ordre: 1,
      },
    ];
  } else {
    // personnalisee : copie toutes les lignes du devis
    lignesPayload = devis.lignes.map((l, i) => ({
      description: l.description ? `${l.libelle}\n${l.description}` : l.libelle,
      taux_tva_ligne: Number(l.taux_tva),
      montant_ht: Number(l.total_ht),
      ordre: i + 1,
    }));
  }

  const totalHt = lignesPayload.reduce((s, l) => s + l.montant_ht, 0);
  const totalTva = lignesPayload.reduce(
    (s, l) => s + Math.round(l.montant_ht * l.taux_tva_ligne) / 100,
    0,
  );
  const totalTtc = Math.round((totalHt + totalTva) * 100) / 100;

  // Insert facture brouillon (statut 'a_emettre')
  const { data: facture, error: factureErr } = await supabase
    .from('factures')
    .insert({
      client_id: devis.client_id,
      societe_emettrice_id: devis.societe_emettrice_id,
      devis_id: devis.id,
      statut: 'a_emettre',
      est_acompte: estAcompte,
      est_avoir: false,
      montant_ht: totalHt,
      montant_tva: totalTva,
      montant_ttc: totalTtc,
      taux_tva: tauxTva,
      objet: devis.objet,
      conditions_reglement: devis.conditions_reglement,
      date_emission: new Date().toISOString().slice(0, 10),
      date_echeance: new Date(Date.now() + 30 * 86400_000)
        .toISOString()
        .slice(0, 10),
    })
    .select('id')
    .single();

  if (factureErr || !facture) {
    logger.error('actions.devis-to-facture', 'insert facture failed', {
      error: factureErr,
    });
    return {
      success: false,
      error: factureErr?.message ?? 'Erreur creation facture',
    };
  }

  // Insert lignes
  const lignesWithFactureId = lignesPayload.map((l) => ({
    facture_id: facture.id,
    description: l.description,
    montant_ht: l.montant_ht,
    taux_tva_ligne: l.taux_tva_ligne,
    ordre: l.ordre,
  }));
  const { error: lignesErr } = await supabase
    .from('facture_lignes')
    .insert(lignesWithFactureId);
  if (lignesErr) {
    logger.error('actions.devis-to-facture', 'insert lignes failed', {
      error: lignesErr,
    });
    return { success: false, error: lignesErr.message };
  }

  logAudit('facture_from_devis_created', 'facture', facture.id, {
    devis_id: devis.id,
    devis_ref: devis.ref,
    mode: parsed.data.mode,
  });

  revalidatePath('/facturation');
  revalidatePath(`/devis/${devis.ref ?? devis.id}`);
  return { success: true, factureId: facture.id };
}
