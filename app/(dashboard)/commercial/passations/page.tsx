import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { PageHeader } from '@/components/shared/page-header';
import { StatusBadge } from '@/components/shared/status-badge';
import { normalizeSnapshot } from '@/lib/queries/passation';
import { createClient } from '@/lib/supabase/server';
import {
  STATUT_SYNTHESE_LABELS,
  STATUT_SYNTHESE_COLORS,
  type StatutSynthese,
} from '@/lib/utils/constants';
import { formatDate } from '@/lib/utils/formatters';
import { canAccessPipeline } from '@/lib/utils/roles';

export const metadata: Metadata = {
  title: 'Passations - SOLUVIA',
};

// Vue portefeuille des synthèses de passation (spec F6). Les synthèses sont
// générées automatiquement par le pont CRM (opportunité gagnée -> client +
// synthèse) ; cette page est l'unique surface de complétion/soumission depuis
// la suppression du module prospects (Phase 2 CRM, Lot D).
export default async function PassationsPage() {
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

  const { data: syntheses } = await supabase
    .from('document_synthese')
    .select(
      `id, statut, reference_dossier, contenu, created_at, soumise_at,
       client:clients!document_synthese_client_id_fkey(raison_sociale)`,
    )
    .order('created_at', { ascending: false });

  const rows = (syntheses ?? []).map((s) => {
    const client = s.client as { raison_sociale: string } | null;
    return {
      id: s.id,
      statut: s.statut as StatutSynthese,
      reference: s.reference_dossier,
      createdAt: s.created_at,
      soumiseAt: s.soumise_at,
      raisonSociale:
        client?.raison_sociale ??
        normalizeSnapshot(s.contenu).identite.raisonSociale,
    };
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Passations"
        description="Synthèses de passation générées à la signature (opportunité gagnée) - complétion, soumission et suivi"
      />

      <Card>
        <CardHeader>
          <CardTitle>Synthèses de passation</CardTitle>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Aucune synthèse de passation. Elles sont générées automatiquement
              quand une opportunité CRM passe en «&nbsp;gagnée&nbsp;».
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground border-b text-left">
                  <th className="py-2 font-medium">Client</th>
                  <th className="py-2 font-medium">Référence</th>
                  <th className="py-2 font-medium">Générée le</th>
                  <th className="py-2 font-medium">Soumise le</th>
                  <th className="py-2 text-right font-medium">Statut</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b last:border-0">
                    <td className="py-2 font-medium">
                      <Link
                        href={`/commercial/passations/${r.id}`}
                        className="hover:underline"
                      >
                        {r.raisonSociale}
                      </Link>
                    </td>
                    <td className="text-muted-foreground py-2">
                      {r.reference ?? '-'}
                    </td>
                    <td className="py-2">{formatDate(r.createdAt)}</td>
                    <td className="py-2">
                      {r.soumiseAt ? formatDate(r.soumiseAt) : '-'}
                    </td>
                    <td className="py-2 text-right">
                      <StatusBadge
                        label={STATUT_SYNTHESE_LABELS[r.statut]}
                        color={STATUT_SYNTHESE_COLORS[r.statut]}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
