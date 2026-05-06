import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/utils/logger';

export async function getContratDetail(contratId: string) {
  const supabase = await createClient();

  const { data: contrat, error: contratErr } = await supabase
    .from('contrats')
    .select('*')
    .eq('id', contratId)
    .maybeSingle();

  if (contratErr || !contrat) {
    logger.error('queries.contrats', 'getContratDetail contrat not found', {
      contratId,
      error: contratErr,
    });
    return null;
  }

  const sourceClient = contrat.source_client_id;

  const [
    { data: apprenant },
    { data: formation },
    { data: company },
    { data: progression },
    { data: invoiceSteps },
    { data: forecastSteps },
  ] = await Promise.all([
    contrat.eduvia_employee_id && sourceClient
      ? supabase
          .from('apprenants')
          .select('*')
          .eq('eduvia_id', contrat.eduvia_employee_id)
          .eq('source_client_id', sourceClient)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    contrat.eduvia_formation_id && sourceClient
      ? supabase
          .from('formations')
          .select('*')
          .eq('eduvia_id', contrat.eduvia_formation_id)
          .eq('source_client_id', sourceClient)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    contrat.eduvia_company_id && sourceClient
      ? supabase
          .from('eduvia_companies')
          .select('*')
          .eq('eduvia_id', contrat.eduvia_company_id)
          .eq('client_id', sourceClient)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from('contrats_progressions')
      .select('*')
      .eq('contrat_id', contratId)
      .maybeSingle(),
    supabase
      .from('eduvia_invoice_steps')
      .select('*')
      .eq('contrat_id', contratId)
      .order('step_number', { ascending: true }),
    supabase
      .from('eduvia_invoice_forecast_steps')
      .select('*')
      .eq('contrat_id', contratId)
      .order('step_number', { ascending: true }),
  ]);

  return {
    contrat,
    apprenant: apprenant ?? null,
    formation: formation ?? null,
    company: company ?? null,
    progression: progression ?? null,
    invoiceSteps: invoiceSteps ?? [],
    forecastSteps: forecastSteps ?? [],
  };
}

export type ContratDetail = NonNullable<
  Awaited<ReturnType<typeof getContratDetail>>
>;
