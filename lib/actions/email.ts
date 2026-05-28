'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireAuth } from '@/lib/auth/guards';
import { sendEmailForFacture } from '@/lib/email/client';
import { logAudit } from '@/lib/utils/audit';

const factureIdSchema = z.string().uuid('Facture ID doit être un UUID');

// ---------------------------------------------------------------------------
// getFactureContactsAction - retourne les contacts du client d'une facture
// ---------------------------------------------------------------------------
// Lazy fetch utilise par les listes (brouillons, factures emises) qui ne
// chargent pas les contacts a priori. Ouvre le SendFactureDialog au clic
// sur "Envoyer" en fournissant la liste des contacts du client concerne.

export interface FactureContactDto {
  id: string;
  nom: string;
  email: string | null;
  recoit_factures: boolean;
  recoit_factures_cc: boolean;
}

export async function getFactureContactsAction(
  factureId: string,
): Promise<
  | { success: true; contacts: FactureContactDto[]; factureRef: string | null }
  | { success: false; error: string }
> {
  const parsed = factureIdSchema.safeParse(factureId);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Données invalides',
    };
  }

  const auth = await requireAuth();
  if (!auth.ok) return { success: false, error: auth.error };
  const { supabase } = auth;

  const { data: facture, error: factureError } = await supabase
    .from('factures')
    .select('id, ref, client_id')
    .eq('id', parsed.data)
    .single();

  if (factureError || !facture) {
    return { success: false, error: 'Facture introuvable' };
  }

  if (!facture.client_id) {
    return { success: true, contacts: [], factureRef: facture.ref };
  }

  const { data: contacts, error: contactsError } = await supabase
    .from('client_contacts')
    .select('id, nom, email, recoit_factures, recoit_factures_cc')
    .eq('client_id', facture.client_id)
    .order('created_at', { ascending: true });

  if (contactsError) {
    return { success: false, error: contactsError.message };
  }

  return {
    success: true,
    contacts: (contacts ?? []).map((c) => ({
      id: c.id,
      nom: c.nom,
      email: c.email,
      recoit_factures: c.recoit_factures ?? false,
      recoit_factures_cc: c.recoit_factures_cc ?? false,
    })),
    factureRef: facture.ref,
  };
}

const emailListSchema = z
  .array(z.string().email('Email invalide').max(254))
  .max(20, 'Trop de destinataires (max 20)');

const recipientsOverrideSchema = z
  .object({
    to: emailListSchema.optional(),
    cc: emailListSchema.optional(),
  })
  .optional();

export async function sendFactureEmailAction(
  factureId: string,
  recipients?: { to?: string[]; cc?: string[] },
): Promise<{ success: boolean; error?: string }> {
  const parsed = factureIdSchema.safeParse(factureId);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Données invalides',
    };
  }

  const parsedRecipients = recipientsOverrideSchema.safeParse(recipients);
  if (!parsedRecipients.success) {
    return {
      success: false,
      error:
        parsedRecipients.error.issues[0]?.message ?? 'Destinataires invalides',
    };
  }

  const auth = await requireAuth();
  if (!auth.ok) return { success: false, error: auth.error };
  const { supabase, user } = auth;

  const result = await sendEmailForFacture(
    parsed.data,
    supabase,
    parsedRecipients.data,
  );

  if (result.success) {
    logAudit('email_sent', 'facture', parsed.data, undefined, user.id);

    // Revalidate facture detail pages
    const { data: facture } = await supabase
      .from('factures')
      .select('ref')
      .eq('id', parsed.data)
      .single();
    if (facture?.ref) {
      revalidatePath(`/facturation/${facture.ref}`);
    }
    revalidatePath('/facturation');
  }

  return result;
}

export async function sendRelanceEmailAction(
  factureId: string,
  recipients?: { to?: string[]; cc?: string[] },
): Promise<{ success: boolean; error?: string }> {
  const parsed = factureIdSchema.safeParse(factureId);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Données invalides',
    };
  }

  const parsedRecipients = recipientsOverrideSchema.safeParse(recipients);
  if (!parsedRecipients.success) {
    return {
      success: false,
      error:
        parsedRecipients.error.issues[0]?.message ?? 'Destinataires invalides',
    };
  }

  const auth = await requireAuth();
  if (!auth.ok) return { success: false, error: auth.error };
  const { supabase, user } = auth;

  const { sendRelanceEmail } = await import('@/lib/email/client');
  const result = await sendRelanceEmail(
    parsed.data,
    supabase,
    parsedRecipients.data,
  );

  if (result.success) {
    logAudit('relance_sent', 'facture', parsed.data, undefined, user.id);

    const { data: facture } = await supabase
      .from('factures')
      .select('ref')
      .eq('id', parsed.data)
      .single();
    if (facture?.ref) {
      revalidatePath(`/facturation/${facture.ref}`);
    }
  }

  return result;
}
