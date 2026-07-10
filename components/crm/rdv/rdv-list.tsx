'use client';
import { useRouter } from 'next/navigation';
import { Users } from 'lucide-react';
import { formatDateTimeParis } from '@/lib/utils/formatters';

type Commercial = {
  user: { id: string; prenom: string | null; nom: string | null } | null;
};
type RdvItem = {
  id: string;
  titre: string;
  debut: string;
  statut: string;
  compte: { nom: string } | null;
  commerciaux?: Commercial[];
};

// Composant de niveau module (et non redéfini à chaque render de RdvLists) : évite
// de casser la réconciliation React à chaque mise à jour de la liste.
function Row({ r }: { r: RdvItem }) {
  const router = useRouter();
  const noms = (r.commerciaux ?? [])
    .map((c) => [c.user?.prenom, c.user?.nom].filter(Boolean).join(' '))
    .filter(Boolean)
    .join(', ');
  const open = () => router.push(`/crm/rdv?rdv=${r.id}`);
  return (
    <li
      className="hover:bg-secondary/50 focus-visible:bg-secondary/50 flex cursor-pointer items-center justify-between gap-3 p-3 text-sm transition-colors focus-visible:outline-none"
      role="button"
      tabIndex={0}
      aria-label={`Ouvrir le RDV ${r.titre}`}
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          open();
        }
      }}
    >
      <span className="min-w-0">
        <span className="truncate">{r.titre}</span>
        <span className="text-muted-foreground"> · {r.compte?.nom ?? ''}</span>
        {noms && (
          <span className="text-muted-foreground flex items-center gap-1 text-xs">
            <Users aria-hidden className="h-3 w-3 shrink-0" />
            <span>Commerciaux : {noms}</span>
          </span>
        )}
      </span>
      <span className="text-muted-foreground shrink-0">
        {formatDateTimeParis(r.debut)}
      </span>
    </li>
  );
}

export function RdvLists({ rdv, nowIso }: { rdv: RdvItem[]; nowIso: string }) {
  // `nowIso` vient du serveur (instant du rendu) : split à-venir/passés cohérent
  // entre SSR et hydratation (plus de Date.now() client, source de mismatch).
  const now = new Date(nowIso).getTime();
  const aVenir = rdv.filter((r) => new Date(r.debut).getTime() >= now);
  // Passés : du plus récent au plus ancien (la requête trie par début croissant) - cf. audit.
  const passes = rdv
    .filter((r) => new Date(r.debut).getTime() < now)
    .sort((a, b) => new Date(b.debut).getTime() - new Date(a.debut).getTime());
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div>
        <h2 className="text-muted-foreground mb-2 text-sm font-semibold">
          À venir ({aVenir.length})
        </h2>
        <ul className="divide-border border-border divide-y rounded-xl border">
          {aVenir.length ? (
            aVenir.map((r) => <Row key={r.id} r={r} />)
          ) : (
            <li className="text-muted-foreground p-3 text-sm">Aucun.</li>
          )}
        </ul>
      </div>
      <div>
        <h2 className="text-muted-foreground mb-2 text-sm font-semibold">
          Passés ({passes.length})
        </h2>
        <ul className="divide-border border-border divide-y rounded-xl border">
          {passes.length ? (
            passes.map((r) => <Row key={r.id} r={r} />)
          ) : (
            <li className="text-muted-foreground p-3 text-sm">Aucun.</li>
          )}
        </ul>
      </div>
    </div>
  );
}
