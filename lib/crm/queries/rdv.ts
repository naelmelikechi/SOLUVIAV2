import { createCrmClient } from '@/lib/crm/supabase/server';
import { createClient } from '@/lib/supabase/server';
import { isHiddenEmail } from '@/lib/crm/auth/hidden';
import type { RdvStatut } from '@/lib/crm/domain/enums';

const RDV_BASE = `id, titre, debut, fin, lieu, statut, notes_prep, compte_rendu,
  compte:comptes(id, nom), opportunite:opportunites(id, intitule)`;

export type RdvListItem = {
  id: string;
  titre: string;
  debut: string;
  fin: string | null;
  lieu: string | null;
  statut: RdvStatut;
  notes_prep: string | null;
  compte_rendu: string | null;
  compte: { id: string; nom: string } | null;
  opportunite: { id: string; intitule: string } | null;
  commerciaux: {
    user: { id: string; prenom: string | null; nom: string | null } | null;
  }[];
};

export async function listRdv(): Promise<RdvListItem[]> {
  const supabase = await createCrmClient();
  // Borne : tous les RDV futurs + 12 mois d'historique. La table ne fait que
  // grossir ; sans borne, calendrier + listes rapatriaient TOUT à chaque rendu.
  // L'historique plus ancien reste en base (récap/drawer le requêtent en ciblé).
  // Les commerciaux assignés vivent dans `public.users` (embed cross-schema via
  // la FK rdv_commerciaux.user_id → users).
  const unAnAvant = new Date(Date.now() - 365 * 86_400_000).toISOString();
  const { data, error } = await supabase
    .from('rdv')
    .select(
      `${RDV_BASE}, commerciaux:rdv_commerciaux(user:users!rdv_commerciaux_user_id_fkey(id, prenom, nom))`,
    )
    .gte('debut', unAnAvant)
    .order('debut');
  if (error) throw error;
  return (data ?? []) as unknown as RdvListItem[];
}

export type CommercialOption = { value: string; label: string };

/** Liste des commerciaux assignables (utilisateurs SOLUVIA avec accès pipeline). */
export async function commercialOptions(): Promise<CommercialOption[]> {
  // Cross-schema : les commerciaux sont des `public.users` (SOLUVIA), pas des
  // lignes du schéma `crm`. Lecture via le client public (typé sur `public`).
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('users')
    .select('id, prenom, nom, email, role, pipeline_access')
    // Commerciaux + admins/superadmins, ou tout utilisateur avec accès pipeline.
    .or('role.in.(commercial,admin,superadmin),pipeline_access.eq.true')
    .order('nom');
  if (error) throw error; // ne pas masquer l'échec par un sélecteur vide (cf. audit)
  return (data ?? [])
    .filter((u) => !isHiddenEmail(u.email)) // comptes fantômes exclus
    .map((u) => ({
      value: u.id,
      label:
        [u.prenom, u.nom].filter(Boolean).join(' ').trim() ||
        u.email ||
        'Sans nom',
    }));
}
