import Link from 'next/link';
import { CheckCircle2, ClipboardList } from 'lucide-react';
import { Card } from '@/components/ui/card';
import {
  getReferentiel,
  listCampusesForClient,
  getDeliverableStatuses,
} from '@/lib/queries/qualiopi';
import {
  resteAFaireQualiopi,
  type ReferentielDeliverable,
} from '@/lib/qualiopi/reste-a-faire';
import type { QualityDeliverableStatus } from '@/lib/eduvia/quality-types';

type StatusLite = Pick<QualityDeliverableStatus, 'deliverable_id' | 'status'>;

function flattenReferentiel(
  referentiel: Awaited<ReturnType<typeof getReferentiel>>,
): ReferentielDeliverable[] {
  const flat: ReferentielDeliverable[] = [];
  for (const criterion of referentiel.criteria) {
    const indicateurs =
      referentiel.indicatorsByCriterion.get(criterion.id) ?? [];
    for (const indicateur of indicateurs) {
      const livrables =
        referentiel.deliverablesByIndicator.get(indicateur.id) ?? [];
      for (const livrable of livrables) {
        flat.push({
          deliverableId: livrable.id,
          criterionId: criterion.id,
          criterionPrefix: criterion.prefix,
          indicatorId: indicateur.id,
          indicatorCode: indicateur.code,
          indicatorTitle: indicateur.title,
        });
      }
    }
  }
  return flat;
}

function ReferentielIndisponible() {
  return (
    <Card className="p-6">
      <div className="flex items-center gap-3">
        <ClipboardList className="text-muted-foreground size-5 shrink-0" />
        <p className="text-muted-foreground text-sm">
          Référentiel Qualiopi non disponible pour ce CFA.
        </p>
      </div>
    </Card>
  );
}

/**
 * Score + reste a faire Qualiopi, isoles dans leur propre composant serveur
 * async. Le chargement du referentiel passe par lib/eduvia/quality-client.ts,
 * qui n'a ni delai d'expiration ni annulation : un appel peut pendre
 * indefiniment. Ce composant DOIT rester enveloppe dans un <Suspense> par la
 * page appelante, jamais assemble dans un Promise.all avec le reste - meme
 * motif que components/projets/projet-carte-qualite.tsx (lot 0).
 */
export async function ProjetQualiteReste({
  clientId,
  clientTrigramme,
}: {
  clientId: string;
  clientTrigramme: string;
}) {
  const [campuses, referentiel] = await Promise.all([
    listCampusesForClient(clientId),
    getReferentiel(clientId),
  ]);

  // Pas de cle API active, ou aucun campus retourne : pas de zero trompeur,
  // une phrase honnete.
  if (campuses.length === 0) return <ReferentielIndisponible />;

  const flat = flattenReferentiel(referentiel);
  if (flat.length === 0) return <ReferentielIndisponible />;

  const statuses: StatusLite[] = (
    await Promise.all(
      campuses.map((c) => getDeliverableStatuses(clientId, c.id)),
    )
  ).flat();

  const realise = statuses.filter((s) => s.status === 'conform').length;
  const total = flat.length * campuses.length;
  const pct = total > 0 ? Math.round((realise / total) * 100) : 0;

  const { groups, totalGroupes } = resteAFaireQualiopi(
    flat,
    statuses,
    campuses.length,
  );

  // Le lien vers le livrable pointe sur le premier campus : le referentiel
  // est partage entre campus d'un meme CFA, la page indicateur y est
  // identique quel que soit le campus choisi comme point d'entree.
  const campusEntreeId = campuses[0]!.id;

  return (
    <div className="space-y-4">
      <Card className="p-6">
        <div className="flex items-center gap-3">
          <ClipboardList className="text-primary size-5 shrink-0" />
          <div>
            <p className="text-3xl font-bold tabular-nums">{pct} %</p>
            <p className="text-muted-foreground text-sm">
              {realise}/{total} livrables conformes
            </p>
          </div>
        </div>
      </Card>

      <Card className="p-6">
        <h3 className="mb-4 text-sm font-semibold">Reste à faire</h3>
        {groups.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-[var(--success)]">
            <CheckCircle2 className="size-4 shrink-0" />
            Rien à faire, le référentiel est complet.
          </p>
        ) : (
          <>
            <ul className="divide-border divide-y">
              {groups.map((g) => (
                <li
                  key={g.indicatorId}
                  className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5"
                >
                  <Link
                    href={`/qualiopi/${clientTrigramme}/${campusEntreeId}/${g.criterionId}/${g.indicatorId}`}
                    className="text-primary hover:text-primary/80 min-w-0 flex-1 truncate text-sm font-medium"
                  >
                    Indicateur {g.indicatorCode} - {g.indicatorTitle}
                  </Link>
                  <span className="text-muted-foreground shrink-0 text-xs">
                    {g.manquants} pièce{g.manquants > 1 ? 's' : ''} manquante
                    {g.manquants > 1 ? 's' : ''}
                  </span>
                  <span className="shrink-0 text-sm font-semibold text-[var(--warning)] tabular-nums">
                    +{Math.round(g.gain * 10) / 10} points
                  </span>
                </li>
              ))}
            </ul>
            {totalGroupes > groups.length && (
              <p className="text-muted-foreground mt-3 text-xs">
                {groups.length} premiers sur {totalGroupes}
              </p>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
