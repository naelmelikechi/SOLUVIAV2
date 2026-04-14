import { createClient } from '@/lib/supabase/server';
import { AppError } from '@/lib/errors';
import { logger } from '@/lib/utils/logger';

export async function getClientsList() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('clients')
    .select(
      'id, trigramme, raison_sociale, siret, adresse, localisation, date_entree',
    )
    .eq('archive', false)
    .order('raison_sociale');

  if (error) {
    logger.error('queries.clients', 'getClientsList failed', { error });
    throw new AppError(
      'CLIENTS_FETCH_FAILED',
      'Impossible de charger les clients',
      { cause: error },
    );
  }
  return data;
}

export type ClientListItem = Awaited<ReturnType<typeof getClientsList>>[number];

export async function getClientById(id: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('clients')
    .select(
      'id, trigramme, raison_sociale, siret, adresse, localisation, numero_qualiopi, numero_nda, numero_uai, date_entree, archive, tva_intracommunautaire, created_at',
    )
    .eq('id', id)
    .single();

  if (error) {
    logger.error('queries.clients', 'getClientById failed', { id, error });
    return null;
  }
  return data;
}

export type ClientDetail = NonNullable<
  Awaited<ReturnType<typeof getClientById>>
>;

export async function getContactsByClientId(clientId: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('client_contacts')
    .select('*')
    .eq('client_id', clientId)
    .order('nom');

  if (error) {
    logger.error('queries.clients', 'getContactsByClientId failed', {
      clientId,
      error,
    });
    throw new AppError(
      'CLIENTS_CONTACTS_FETCH_FAILED',
      'Impossible de charger les contacts',
      { cause: error },
    );
  }
  return data;
}

export type ClientContact = Awaited<
  ReturnType<typeof getContactsByClientId>
>[number];

export async function getNotesByClientId(clientId: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('client_notes')
    .select('*, user:users!client_notes_user_id_fkey(id, nom, prenom, role)')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false });

  if (error) {
    logger.error('queries.clients', 'getNotesByClientId failed', {
      clientId,
      error,
    });
    throw new AppError(
      'CLIENTS_NOTES_FETCH_FAILED',
      'Impossible de charger les notes',
      { cause: error },
    );
  }
  return data;
}

export type ClientNote = Awaited<ReturnType<typeof getNotesByClientId>>[number];

export async function getDocumentsByClientId(clientId: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('client_documents')
    .select('*, user:users!client_documents_user_id_fkey(id, nom, prenom)')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false });

  if (error) {
    logger.error('queries.clients', 'getDocumentsByClientId failed', {
      clientId,
      error,
    });
    throw new AppError(
      'CLIENTS_DOCUMENTS_FETCH_FAILED',
      'Impossible de charger les documents',
      { cause: error },
    );
  }
  return data;
}

export type ClientDocument = Awaited<
  ReturnType<typeof getDocumentsByClientId>
>[number];

export async function getProjetsByClientId(clientId: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('projets')
    .select(
      `
      id, ref, statut, taux_commission,
      typologie:typologies_projet!projets_typologie_id_fkey(code, libelle),
      cdp:users!projets_cdp_id_fkey(id, nom, prenom)
    `,
    )
    .eq('client_id', clientId)
    .eq('est_absence', false)
    .order('ref');

  if (error) {
    logger.error('queries.clients', 'getProjetsByClientId failed', {
      clientId,
      error,
    });
    throw new AppError(
      'CLIENTS_PROJETS_FETCH_FAILED',
      'Impossible de charger les projets du client',
      { cause: error },
    );
  }
  return data;
}

export type ClientProjet = Awaited<
  ReturnType<typeof getProjetsByClientId>
>[number];

export async function getClientApiKeys(clientId: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('client_api_keys')
    .select(
      'id, client_id, label, instance_url, is_active, last_sync_at, api_key_encrypted',
    )
    .eq('client_id', clientId)
    .order('created_at', { ascending: false });

  if (error) {
    logger.error('queries.clients', 'getClientApiKeys failed', {
      clientId,
      error,
    });
    throw new AppError(
      'CLIENTS_FETCH_FAILED',
      'Impossible de charger les clés API',
      { cause: error },
    );
  }

  // Mask the encrypted key — never expose full value to UI
  return data.map((key) => ({
    id: key.id,
    client_id: key.client_id,
    label: key.label,
    instance_url: key.instance_url,
    is_active: key.is_active,
    last_sync_at: key.last_sync_at,
    api_key_masked: maskApiKey(key.api_key_encrypted),
  }));
}

/** Show only the last 4 chars of the encrypted key, prefixed with "sk_...". */
function maskApiKey(encrypted: string): string {
  if (!encrypted || encrypted.length < 4) return '****';
  return `sk_...${encrypted.slice(-4)}`;
}

export type ClientApiKey = Awaited<ReturnType<typeof getClientApiKeys>>[number];
