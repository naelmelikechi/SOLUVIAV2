import { createCrmClient } from '@/lib/crm/supabase/server';

export type CompteOption = { value: string; label: string };

export async function compteOptions(): Promise<CompteOption[]> {
  const supabase = await createCrmClient();
  const { data, error } = await supabase
    .from('comptes')
    .select('id, nom')
    .order('nom');
  if (error) throw error; // ne pas masquer l'échec par un sélecteur vide (cf. audit)
  return (data ?? []).map((c) => ({ value: c.id, label: c.nom }));
}
