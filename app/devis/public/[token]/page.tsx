// oxlint-disable-next-line react-doctor/nextjs-missing-metadata
import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import { DevisPublicView } from './devis-public-view';

interface Props {
  params: Promise<{ token: string }>;
}

export default async function DevisPublicPage({ params }: Props) {
  const [{ token }, supabase, hdrs] = await Promise.all([
    params,
    createClient(),
    headers(),
  ]);
  const ip = hdrs.get('x-forwarded-for')?.split(',')[0]?.trim() ?? undefined;
  const ua = hdrs.get('user-agent') ?? undefined;

  const { data, error } = await supabase.rpc('get_devis_public', {
    p_token: token,
    p_ip: ip,
    p_user_agent: ua,
  });

  if (error || !data) notFound();

  return (
    <DevisPublicView
      token={token}
      payload={data as unknown as DevisPublicPayload}
    />
  );
}

interface DevisPublicPayload {
  devis: {
    ref: string;
    statut: string;
    objet: string;
    date_emission: string | null;
    date_validite: string | null;
    acceptation_token_expire_at: string;
    montant_ht: number;
    montant_tva: number;
    montant_ttc: number;
    conditions_reglement: string | null;
  };
  lignes: Array<{
    ordre: number;
    libelle: string;
    description: string | null;
    quantite: number;
    prix_unitaire_ht: number;
    taux_tva: number;
    total_ht: number;
    total_tva: number;
    total_ttc: number;
  }>;
  societe: {
    code: string;
    raison_sociale: string;
    forme_juridique: string | null;
    siret: string;
    tva_intracom: string;
    adresse: string;
    code_postal: string;
    ville: string;
    pays: string;
    email_contact: string;
    banque_nom: string | null;
    banque_iban: string | null;
    banque_bic: string | null;
    mentions_legales: string | null;
    conditions_reglement_default: string | null;
    logo_url: string | null;
  };
  client: {
    raison_sociale: string;
    adresse: string | null;
    localisation: string | null;
  };
}
