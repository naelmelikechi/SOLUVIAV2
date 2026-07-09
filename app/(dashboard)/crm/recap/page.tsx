import { requireCrmAdmin } from '@/lib/crm/auth/roles';
import { createCrmClient } from '@/lib/crm/supabase/server';
import { buildRecap } from '@/lib/crm/recap';
import { lastRecap } from '@/lib/crm/queries/recap';
import { formatDateTime } from '@/lib/crm/format';
import { RecapPreview } from '@/components/crm/recap/recap-preview';

export default async function RecapPage() {
  await requireCrmAdmin();
  const sb = await createCrmClient();
  const [{ html, model }, dernier] = await Promise.all([
    buildRecap(sb),
    lastRecap(sb),
  ]);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">
          Récap commercial
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Envoi automatique lundi, mercredi &amp; vendredi (17-18 h).
          Destinataires : variable <code>RECAP_RECIPIENTS</code>.
          {dernier
            ? ` Dernier envoi : ${formatDateTime(dernier.created_at)} (${dernier.trigger}).`
            : ' Aucun envoi enregistré.'}
        </p>
      </div>
      <RecapPreview html={html} kpis={model.kpis} />
    </div>
  );
}
