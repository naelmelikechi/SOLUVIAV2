'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { X, UserMinus } from 'lucide-react';
import { toast } from 'sonner';
import {
  Card,
  CardHeader,
  CardTitle,
  CardAction,
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
import { formatDate } from '@/lib/utils/formatters';
import { desaffectCdp } from '@/lib/actions/cdp';
import type { CdpPipelineClient } from '@/lib/queries/cdp';

interface CdpPipelineListProps {
  cdpNom: string;
  clients: CdpPipelineClient[];
}

export function CdpPipelineList({ cdpNom, clients }: CdpPipelineListProps) {
  const router = useRouter();
  const [clientARetirer, setClientARetirer] =
    useState<CdpPipelineClient | null>(null);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Portefeuille de {cdpNom}</CardTitle>
        <CardAction>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push('/commercial/cdp')}
          >
            <X className="size-4" />
            Fermer
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {clients.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Aucun client sous gestion.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-foreground border-b text-left">
                <th className="py-2 font-medium">Raison sociale</th>
                <th className="py-2 font-medium">Trigramme</th>
                <th className="py-2 font-medium">Affecté le</th>
                <th className="py-2 text-right font-medium">Projets actifs</th>
                <th className="py-2 text-right font-medium">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {clients.map((c) => (
                <tr key={c.id} className="border-b last:border-0">
                  <td className="py-2 font-medium">{c.raison_sociale}</td>
                  <td className="py-2">{c.trigramme}</td>
                  <td className="py-2">
                    {c.cdp_affecte_at ? formatDate(c.cdp_affecte_at) : '-'}
                  </td>
                  <td className="py-2 text-right tabular-nums">
                    {c.nbProjetsActifs}
                  </td>
                  <td className="py-2 text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => setClientARetirer(c)}
                    >
                      <UserMinus className="size-4" />
                      Retirer
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>

      <Dialog
        open={clientARetirer !== null}
        onOpenChange={(o) => !o && setClientARetirer(null)}
      >
        <DialogContent className="sm:max-w-md">
          {clientARetirer && (
            <DesaffectationDialogBody
              key={clientARetirer.id}
              client={clientARetirer}
              cdpNom={cdpNom}
              onClose={() => setClientARetirer(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

interface DesaffectationDialogBodyProps {
  client: CdpPipelineClient;
  cdpNom: string;
  onClose: () => void;
}

function DesaffectationDialogBody({
  client,
  cdpNom,
  onClose,
}: DesaffectationDialogBodyProps) {
  const router = useRouter();
  const [justification, setJustification] = useState('');
  const [isPending, startTransition] = useTransition();

  function handleDesaffect() {
    startTransition(async () => {
      const res = await desaffectCdp(
        client.id,
        justification.trim() || undefined,
      );
      if (res.success) {
        toast.success('CDP désaffecté');
        onClose();
        router.refresh();
      } else {
        toast.error(res.error ?? 'Erreur');
      }
    });
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Retirer {client.raison_sociale} ?</DialogTitle>
        <DialogDescription>
          Le client sera retiré du portefeuille de {cdpNom} et repassera dans
          les clients à affecter.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-2">
        <Label htmlFor="desaffect-justif">Justification (optionnel)</Label>
        <Textarea
          id="desaffect-justif"
          value={justification}
          onChange={(e) => setJustification(e.target.value)}
          placeholder="Raison du retrait (tracée dans l'historique)"
          rows={3}
        />
      </div>

      <DialogFooter>
        <Button variant="ghost" onClick={onClose} disabled={isPending}>
          Annuler
        </Button>
        <Button
          variant="destructive"
          onClick={handleDesaffect}
          disabled={isPending}
        >
          {isPending ? 'Retrait...' : 'Retirer le CDP'}
        </Button>
      </DialogFooter>
    </>
  );
}
