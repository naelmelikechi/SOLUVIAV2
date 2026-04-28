import { createClient } from '@/lib/supabase/server';

export interface PasskeyRow {
  id: string;
  device_name: string | null;
  device_type: string | null;
  backed_up: boolean;
  transports: string[] | null;
  last_used_at: string | null;
  created_at: string;
}

export async function getMyPasskeys(): Promise<PasskeyRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('webauthn_credentials')
    .select(
      'id, device_name, device_type, backed_up, transports, last_used_at, created_at',
    )
    .order('created_at', { ascending: false });

  if (error) return [];
  return data ?? [];
}
