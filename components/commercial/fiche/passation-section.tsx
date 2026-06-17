'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Download, FileText, RefreshCw, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/shared/status-badge';
import {
  STATUT_SYNTHESE_LABELS,
  STATUT_SYNTHESE_COLORS,
} from '@/lib/utils/constants';
import { formatDate } from '@/lib/utils/formatters';
import { logger } from '@/lib/utils/logger';
import {
  genererSynthese,
  diffuserVague1,
  diffuserVague2,
  getSyntheseDownloadUrl,
  getPassationState,
} from '@/lib/actions/passation';
import type { PassationSynthese } from '@/lib/queries/passation';

interface PassationState {
  synthese: PassationSynthese | null;
  hasCdpReferent: boolean;
}

export function PassationSection({
  prospectId,
  clientId,
  stage,
  synthese: initialSynthese,
}: {
  prospectId: string;
  clientId: string | null;
  stage: string;
  synthese?: PassationSynthese | null;
}) {
  const router = useRouter();
  const [state, setState] = useState<PassationState>({
    synthese: initialSynthese ?? null,
    hasCdpReferent: false,
  });
  const [isPending, startTransition] = useTransition();
  const { synthese, hasCdpReferent } = state;

  const signe = stage === 'signe' || clientId != null;

  // La page de la fiche ne charge pas la synthèse en props : on la récupère ici
  // à l'ouverture de l'onglet, puis on la rafraîchit après chaque mutation.
  useEffect(() => {
    if (!signe) return;
    let cancelled = false;
    getPassationState(prospectId)
      .then((next) => {
        if (cancelled) return;
        setState({
          synthese: next.synthese,
          hasCdpReferent: next.hasCdpReferent,
        });
      })
      .catch((err) => {
        if (!cancelled) logger.error('passation-section', err, { prospectId });
      });
    return () => {
      cancelled = true;
    };
  }, [prospectId, signe]);

  const reload = async () => {
    const next = await getPassationState(prospectId);
    setState({ synthese: next.synthese, hasCdpReferent: next.hasCdpReferent });
  };

  const handleGenerer = () => {
    startTransition(async () => {
      const r = await genererSynthese(prospectId);
      if (r.success) {
        toast.success('Synthèse de passation générée');
        await reload();
        router.refresh();
      } else {
        toast.error(r.error ?? 'Génération impossible');
      }
    });
  };

  const handleDiffuser = (vague: 1 | 2) => {
    if (!synthese) return;
    startTransition(async () => {
      const r =
        vague === 1
          ? await diffuserVague1(synthese.id)
          : await diffuserVague2(synthese.id);
      if (r.success) {
        toast.success(
          vague === 1
            ? 'Synthèse diffusée au Référent CDP et à la Direction'
            : 'Synthèse transmise au CDP affecté',
        );
        await reload();
        router.refresh();
      } else {
        toast.error(r.error ?? 'Diffusion impossible');
      }
    });
  };

  const handleDownload = async (variante: 'complet' | 'cdp') => {
    if (!synthese) return;
    const res = await getSyntheseDownloadUrl(synthese.id, variante);
    if (res.url) {
      window.open(res.url, '_blank', 'noopener,noreferrer');
    } else {
      toast.error(res.error ?? 'Document indisponible');
    }
  };

  return (
    <div className="mt-6 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <FileText className="size-4" />
          Synthèse de passation
        </h3>
        {synthese ? (
          <StatusBadge
            label={STATUT_SYNTHESE_LABELS[synthese.statut]}
            color={STATUT_SYNTHESE_COLORS[synthese.statut]}
          />
        ) : null}
      </div>

      {!signe ? (
        <p className="text-muted-foreground text-sm">
          La synthèse de passation sera disponible après la signature du
          contrat.
        </p>
      ) : !synthese ? (
        <div className="space-y-2">
          <p className="text-muted-foreground text-sm">
            Aucune synthèse générée. À produire sous 48h après la signature.
          </p>
          <Button size="sm" disabled={isPending} onClick={handleGenerer}>
            <FileText className="size-3.5" /> Générer la synthèse de passation
          </Button>
        </div>
      ) : (
        <div className="space-y-3 rounded-md border p-3">
          <p className="text-muted-foreground text-xs">
            Générée le {formatDate(synthese.created_at)}
            {synthese.diffuse_vague1_at
              ? ` · vague 1 le ${formatDate(synthese.diffuse_vague1_at)}`
              : ''}
            {synthese.diffuse_vague2_at
              ? ` · vague 2 le ${formatDate(synthese.diffuse_vague2_at)}`
              : ''}
          </p>

          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => handleDownload('complet')}
            >
              <Download className="size-3.5" /> PDF complet
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => handleDownload('cdp')}
            >
              <Download className="size-3.5" /> PDF CDP
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              size="sm"
              variant="outline"
              disabled={isPending}
              onClick={() => handleDiffuser(1)}
            >
              <Send className="size-3.5" /> Diffuser (Référent + Direction)
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={isPending || !hasCdpReferent}
              onClick={() => handleDiffuser(2)}
            >
              <Send className="size-3.5" /> Diffuser (CDP affecté)
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={isPending}
              onClick={handleGenerer}
            >
              <RefreshCw className="size-3.5" /> Régénérer
            </Button>
          </div>

          {!hasCdpReferent ? (
            <p className="text-muted-foreground text-xs">
              La diffusion au CDP affecté sera possible une fois un Chef de
              Projet affecté au client.
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
