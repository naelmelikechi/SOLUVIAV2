import { createClient } from '@/lib/supabase/server';

export async function getParametresByCategorie(categorie: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('parametres')
    .select('id, cle, valeur, description')
    .eq('categorie', categorie)
    .order('cle');
  if (error) throw error;
  return data;
}

export async function getTypologies() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('typologies_projet')
    .select('id, code, libelle, actif')
    .order('code');
  if (error) throw error;
  return data;
}

export async function getAxesTemps() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('axes_temps')
    .select('id, code, libelle, couleur, ordre')
    .order('ordre');
  if (error) throw error;
  return data;
}

export async function getJoursFeries(annee: number) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('jours_feries')
    .select('id, date, libelle')
    .eq('annee', annee)
    .order('date');
  if (error) throw error;
  return data;
}
