'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { StatusBadge } from '@/components/shared/status-badge';
import { DISPO_CDP_LABELS, type DispoCdp } from '@/lib/utils/constants';
import { rankCdps, type CdpScore } from '@/lib/utils/cdp-scoring';
import { formatDate } from '@/lib/utils/formatters';
import { affectCdp } from '@/lib/actions/cdp';
import type { CdpPlanLine, ClientAAffecter } from '@/lib/queries/cdp';

interface CdpCandidate {
  id: string;
  nom: string;
  prenom: string;
  disponibilite: DispoCdp | null;
}

interface RankedCdp extends CdpScore {
  nom: string;
  prenom: string;
  disponibilite: DispoCdp | null;
}

interface ArbitragePanelProps {
  clientsAAffecter: ClientAAffecter[];
  cdps: CdpCandidate[];
  lines: CdpPlanLine[];
}

export function ArbitragePanel({
  clientsAAffecter,
  cdps,
  lines,
}: ArbitragePanelProps) {
  const [openClientId, setOpenClientId] = useState<string | null>(null);

  const rankedCdps = useMemo<RankedCdp[]>(() => {
    const metrics = cdps.map((c) => {
      const line = lines.find((l) => l.cdp.id === c.id);
      return {
        cdpId: c.id,
        nbClients: line?.nbClients ?? 0,
        nbAlternants: line?.nbAlternants ?? 0,
        disponibilite: c.disponibilite,
      };
    });
    return rankCdps(metrics).map((s) => {
      const c = cdps.find((x) => x.id === s.cdpId);
      return {
        ...s,
        nom: c?.nom ?? '',
        prenom: c?.prenom ?? '',
        disponibilite: c?.disponibilite ?? null,
      };
    });
  }, [cdps, lines]);

  const openClient =
    clientsAAffecter.find((c) => c.id === openClientId) ?? null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Clients à affecter</CardTitle>
        <CardDescription>
          Affectez un chef de projet référent aux clients signés sans CDP.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {clientsAAffecter.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Tous les clients signés disposent d&apos;un CDP référent.
          </p>
        ) : (
          <ul className="divide-y">
            {clientsAAffecter.map((client) => (
              <li
                key={client.id}
                className="flex items-center justify-between gap-4 py-3"
              >
                <div className="space-y-0.5">
                  <p className="font-medium">{client.raison_sociale}</p>
                  <p className="text-muted-foreground text-xs">
                    {client.trigramme} · créé le {formatDate(client.created_at)}
                  </p>
                </div>
                <Button size="sm" onClick={() => setOpenClientId(client.id)}>
                  Affecter un CDP
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <Dialog
        open={openClient !== null}
        onOpenChange={(o) => !o && setOpenClientId(null)}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Affecter un CDP
              {openClient ? ` — ${openClient.raison_sociale}` : ''}
            </DialogTitle>
            <DialogDescription>
              Les chefs de projet sont classés par capacité et disponibilité.
            </DialogDescription>
          </DialogHeader>
          {openClient && (
            <ArbitrageDialogBody
              key={openClient.id}
              client={openClient}
              rankedCdps={rankedCdps}
              onClose={() => setOpenClientId(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

interface ArbitrageDialogBodyProps {
  client: ClientAAffecter;
  rankedCdps: RankedCdp[];
  onClose: () => void;
}

function ArbitrageDialogBody({
  client,
  rankedCdps,
  onClose,
}: ArbitrageDialogBodyProps) {
  const router = useRouter();
  const [selectedCdpId, setSelectedCdpId] = useState<string | null>(
    rankedCdps[0]?.cdpId ?? null,
  );
  const [justification, setJustification] = useState('');
  const [isPending, startTransition] = useTransition();

  function handleAffect() {
    if (!selectedCdpId) {
      toast.error('Sélectionnez un chef de projet');
      return;
    }
    startTransition(async () => {
      const res = await affectCdp(
        client.id,
        selectedCdpId,
        justification.trim() || undefined,
      );
      if (res.success) {
        toast.success('CDP affecté');
        onClose();
        router.refresh();
      } else {
        toast.error(res.error ?? 'Erreur');
      }
    });
  }

  return (
    <>
      <div className="space-y-4">
        {rankedCdps.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Aucun chef de projet disponible.
          </p>
        ) : (
          <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
            {rankedCdps.map((c, i) => {
              const selected = c.cdpId === selectedCdpId;
              return (
                <button
                  type="button"
                  key={c.cdpId}
                  onClick={() => setSelectedCdpId(c.cdpId)}
                  className={cn(
                    'flex w-full items-center justify-between gap-3 rounded-lg border p-3 text-left transition',
                    selected
                      ? 'border-primary ring-primary/30 ring-2'
                      : 'hover:bg-muted/50',
                  )}
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">
                        {c.prenom} {c.nom}
                      </span>
                      {i < 3 && (
                        <StatusBadge label={`Top ${i + 1}`} color="blue" />
                      )}
                      {c.sature && <StatusBadge label="Saturé" color="red" />}
                    </div>
                    <p className="text-muted-foreground text-xs">
                      Capacité {c.charge} %
                      {c.disponibilite
                        ? ` · ${DISPO_CDP_LABELS[c.disponibilite]}`
                        : ''}
                    </p>
                  </div>
                  <span className="text-muted-foreground shrink-0 text-sm tabular-nums">
                    Score {c.score}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="affect-justif">Justification (optionnel)</Label>
          <Textarea
            id="affect-justif"
            value={justification}
            onChange={(e) => setJustification(e.target.value)}
            placeholder="Raison de l'affectation (tracée dans l'historique)"
            rows={3}
          />
        </div>
      </div>

      <DialogFooter>
        <Button variant="ghost" onClick={onClose} disabled={isPending}>
          Annuler
        </Button>
        <Button onClick={handleAffect} disabled={isPending || !selectedCdpId}>
          {isPending ? 'Affectation...' : 'Affecter'}
        </Button>
      </DialogFooter>
    </>
  );
}
