import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/utils/logger';
import { getActiveOpcoMapping } from '@/lib/queries/opcos';
import {
  qProjetOne,
  qProjetsMany,
  qContrats,
  qInvoiceLines,
  qEmittedSteps,
  qCompaniesIdcc,
  qExistingLignes,
  type ContratRow,
} from './db';
import { assembleProjetBillableEvents, groupByProjet } from './derive';
import type { ProjetBillableEvents } from './types';

/**
 * Materialise tous les events facturables d'UN projet, avec leur statut
 * billed/locked/available. ~7 round-trips DB.
 */
export async function getBillableEvents(
  projetId: string,
): Promise<ProjetBillableEvents | null> {
  const supabase = await createClient();

  const { data: projet, error: pErr } = await qProjetOne(supabase, projetId);
  if (pErr || !projet) {
    logger.error('queries.billable-events', 'projet not found', {
      projetId,
      error: pErr,
    });
    return null;
  }

  const { data: contrats } = await qContrats(supabase, [projetId]);
  if (!contrats || contrats.length === 0) {
    return {
      projetId,
      projetRef: projet.ref ?? '',
      clientRaisonSociale: projet.client?.raison_sociale ?? '',
      tauxCommission: Number(projet.taux_commission ?? 10),
      events: [],
      auditInvoiceIdsBySource: new Map(),
      clientTvaIntracom: projet.client?.tva_intracommunautaire ?? null,
      contrats: [],
    };
  }

  const contratIds = contrats.map((c) => c.id);

  const [
    opcoMapping,
    { data: invoiceLines },
    { data: emittedSteps },
    { data: companiesIdcc },
  ] = await Promise.all([
    getActiveOpcoMapping(),
    qInvoiceLines(supabase, contratIds),
    qEmittedSteps(supabase, contratIds),
    qCompaniesIdcc(supabase, projet.client?.id ? [projet.client.id] : []),
  ]);

  const { data: existingLignes } = await qExistingLignes(supabase, contratIds);

  return assembleProjetBillableEvents({
    projet,
    contrats,
    opcoMapping,
    invoiceLines: invoiceLines ?? [],
    emittedSteps: emittedSteps ?? [],
    companiesIdcc: companiesIdcc ?? [],
    existingLignes: existingLignes ?? [],
  });
}

/**
 * Version BATCH : materialise les events de PLUSIEURS projets en un nombre
 * CONSTANT de requetes (~6) au lieu de N x ~7 round-trips avec getBillableEvents
 * en boucle. Resultats dans l'ordre des `projetIds` ; projets introuvables omis.
 */
export async function getBillableEventsForProjets(
  projetIds: string[],
): Promise<ProjetBillableEvents[]> {
  if (projetIds.length === 0) return [];
  const supabase = await createClient();

  const { data: projets, error: pErr } = await qProjetsMany(
    supabase,
    projetIds,
  );
  if (pErr || !projets || projets.length === 0) {
    if (pErr) {
      logger.error(
        'queries.billable-events',
        'getBillableEventsForProjets projets failed',
        { error: pErr },
      );
    }
    return [];
  }

  const { data: contratsData } = await qContrats(supabase, projetIds);
  const contrats = contratsData ?? [];
  const contratIds = contrats.map((c) => c.id);
  const contratToProjet = new Map<string, string>();
  for (const c of contrats) {
    if (c.projet_id) contratToProjet.set(c.id, c.projet_id);
  }
  const clientIds = Array.from(
    new Set(
      projets.map((p) => p.client?.id).filter((id): id is string => !!id),
    ),
  );

  const [
    opcoMapping,
    { data: invoiceLines },
    { data: emittedSteps },
    { data: companiesIdcc },
    { data: existingLignes },
  ] = await Promise.all([
    getActiveOpcoMapping(),
    qInvoiceLines(supabase, contratIds),
    qEmittedSteps(supabase, contratIds),
    qCompaniesIdcc(supabase, clientIds),
    qExistingLignes(supabase, contratIds),
  ]);

  const linesByProjet = groupByProjet(invoiceLines ?? [], contratToProjet);
  const stepsByProjet = groupByProjet(emittedSteps ?? [], contratToProjet);
  const existingByProjet = groupByProjet(existingLignes ?? [], contratToProjet);
  const contratsByProjet = new Map<string, ContratRow[]>();
  for (const c of contrats) {
    if (!c.projet_id) continue;
    const arr = contratsByProjet.get(c.projet_id);
    if (arr) arr.push(c);
    else contratsByProjet.set(c.projet_id, [c]);
  }

  const byProjetId = new Map<string, ProjetBillableEvents>();
  for (const projet of projets) {
    byProjetId.set(
      projet.id,
      assembleProjetBillableEvents({
        projet,
        contrats: contratsByProjet.get(projet.id) ?? [],
        opcoMapping,
        invoiceLines: linesByProjet.get(projet.id) ?? [],
        emittedSteps: stepsByProjet.get(projet.id) ?? [],
        companiesIdcc: companiesIdcc ?? [],
        existingLignes: existingByProjet.get(projet.id) ?? [],
      }),
    );
  }

  return projetIds
    .map((id) => byProjetId.get(id))
    .filter((p): p is ProjetBillableEvents => p !== undefined);
}

/**
 * Liste les projets actifs ayant au moins un contrat Eduvia non archive.
 * Utilise par le selecteur de projet dans la creation de brouillon.
 */
export async function listBillableProjets(): Promise<
  Array<{ id: string; ref: string; client_raison_sociale: string }>
> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('projets')
    .select(
      `
      id, ref,
      client:clients!projets_client_id_fkey(raison_sociale),
      contrats!contrats_projet_id_fkey(id)
    `,
    )
    .eq('archive', false)
    .order('ref');

  if (error) {
    logger.error('queries.billable-events', 'listBillableProjets failed', {
      error,
    });
    return [];
  }

  return (data ?? []).flatMap((p) =>
    (p.contrats ?? []).length > 0
      ? [
          {
            id: p.id,
            ref: p.ref ?? '',
            client_raison_sociale: p.client?.raison_sociale ?? '',
          },
        ]
      : [],
  );
}
