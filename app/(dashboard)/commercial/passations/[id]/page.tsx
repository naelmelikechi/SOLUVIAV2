import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { PassationSection } from '@/components/commercial/passations/passation-section';
import { normalizeSnapshot } from '@/lib/queries/passation';
import { createClient } from '@/lib/supabase/server';
import { canAccessPipeline } from '@/lib/utils/roles';

export const metadata: Metadata = {
  title: 'Synthèse de passation - SOLUVIA',
};

// Détail d'une synthèse de passation : saisies 6/8, soumission vague 1,
// PDFs, régénération depuis l'opportunité CRM source.
export default async function PassationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: currentUser } = await supabase
    .from('users')
    .select('role, pipeline_access')
    .eq('id', user.id)
    .single();
  if (!canAccessPipeline(currentUser?.role, currentUser?.pipeline_access)) {
    redirect('/accueil');
  }

  const { data: synthese } = await supabase
    .from('document_synthese')
    .select(
      `*, client:clients!document_synthese_client_id_fkey(raison_sociale)`,
    )
    .eq('id', id)
    .maybeSingle();
  if (!synthese) notFound();

  const { client, ...syntheseRow } = synthese as typeof synthese & {
    client: { raison_sociale: string } | null;
  };
  const raisonSociale =
    client?.raison_sociale ??
    normalizeSnapshot(syntheseRow.contenu).identite.raisonSociale;

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <Link
          href="/commercial/passations"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
        >
          <ArrowLeft className="size-3.5" /> Passations
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">
          {raisonSociale}
        </h1>
        {syntheseRow.reference_dossier ? (
          <p className="text-muted-foreground text-sm">
            {syntheseRow.reference_dossier}
          </p>
        ) : null}
      </div>

      <PassationSection syntheseId={syntheseRow.id} synthese={syntheseRow} />
    </div>
  );
}
