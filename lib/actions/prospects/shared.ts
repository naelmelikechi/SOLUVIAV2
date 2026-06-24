import { requireAuth } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import type { Database } from '@/types/database';

export type StageProspect = Database['public']['Enums']['stage_prospect'];
export type TypeProspect = Database['public']['Enums']['type_prospect'];
export type CanalOrigine = Database['public']['Enums']['canal_origine'];
export type RoleDecisionContact =
  Database['public']['Enums']['role_decision_contact'];

export const CANAL_VALUES = [
  'reseau_developpeur',
  'reseau_direction',
  'linkedin_auto',
  'salon',
  'apporteur',
  'autre',
] as const;

export async function getAuth() {
  const auth = await requireAuth();
  if (!auth.ok) {
    const supabase = await createClient();
    return {
      supabase,
      user: null,
      role: null,
      pipelineAccess: false,
    };
  }
  const { supabase, user } = auth;
  const { data } = await supabase
    .from('users')
    .select('role, pipeline_access')
    .eq('id', user.id)
    .single();
  return {
    supabase,
    user,
    role: data?.role ?? null,
    pipelineAccess: data?.pipeline_access ?? false,
  };
}
