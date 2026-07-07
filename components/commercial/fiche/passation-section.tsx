'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Download, FileText, Info, RefreshCw, Send } from 'lucide-react';
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
  diffuserVague2,
  getSyntheseDownloadUrl,
  getPassationState,
  soumettreSynthese,
} from '@/lib/actions/passation';
import type { PassationReco, PassationSynthese } from '@/lib/queries/passation';
import { PassationForm } from './passation-form';

interface PassationState {
  synthese: PassationSynthese | null;
  reco: PassationReco | null;
  hasCdpReferent: boolean;
}

// Workflow spec F6 : generee -> en_cours_completion -> en_attente_arbitrage
// (soumission = vague 1, mail PDF au Référent CDP + Direction) -> cdp_affecte
// (vague 2 automatique à l'affectation) -> archivee.
const STATUTS_EDITABLES = new Set([
  'generee',
  'en_cours_completion',
  'en_attente_arbitrage',
]);

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
    reco: null,
    hasCdpReferent: false,
  });
  const [isPending, startTransition] = useTransition();
  const { synthese, reco, hasCdpReferent } = state;

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
          reco: next.reco,
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
    setState({
      synthese: next.synthese,
      reco: next.reco,
      hasCdpReferent: next.hasCdpReferent,
    });
  };

  const handleGenerer = () => {
    startTransition(async () => {
      const r = await genererSynthese(prospectId);
      if (r.success) {
        toast.success(
          synthese
            ? 'Snapshot régénéré depuis la fiche (saisies 6 et 8 conservées)'
            : 'Synthèse de passation générée',
        );
        await reload();
        router.refresh();
      } else {
        toast.error(r.error ?? 'Génération impossible');
      }
    });
  };

  const handleSoumettre = () => {
    if (!synthese) return;
    startTransition(async () => {
      const r = await soumettreSynthese(synthese.id);
      if (r.success) {
        toast.success(
          'Synthèse soumise : PDF envoyé au Référent CDP et à la Direction',
        );
        await reload();
        router.refresh();
      } else {
        toast.error(r.error ?? 'Soumission impossible');
      }
    });
  };

  const handleVague2 = () => {
    if (!synthese) return;
    startTransition(async () => {
      const r = await diffuserVague2(synthese.id);
      if (r.success) {
        toast.success('Synthèse transmise au CDP affecté');
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

  const editable = synthese ? STATUTS_EDITABLES.has(synthese.statut) : false;
  const soumise =
    synthese?.statut === 'en_attente_arbitrage' ||
    synthese?.statut === 'cdp_affecte' ||
    synthese?.statut === 'archivee';

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
            Aucune synthèse générée. Elle est produite automatiquement à la
            signature du contrat - à soumettre au Référent CDP sous 48h.
          </p>
          <Button size="sm" disabled={isPending} onClick={handleGenerer}>
            <FileText className="size-3.5" /> Générer la synthèse de passation
          </Button>
        </div>
      ) : (
        <div className="space-y-4 rounded-md border p-3">
          <p className="text-muted-foreground text-xs">
            Générée le {formatDate(synthese.created_at)}
            {synthese.signature_signee_at
              ? ` · contrat signé le ${formatDate(synthese.signature_signee_at)}`
              : ''}
            {synthese.soumise_at
              ? ` · soumise le ${formatDate(synthese.soumise_at)}`
              : ''}
            {synthese.diffuse_vague2_at
              ? ` · transmise au CDP le ${formatDate(synthese.diffuse_vague2_at)}`
              : ''}
          </p>

          <div className="text-muted-foreground bg-muted/50 flex items-start gap-2 rounded-md px-3 py-2 text-xs">
            <Info className="mt-0.5 size-3.5 shrink-0" />
            <span>
              Les sections 1 à 5 et 7 sont pré-remplies depuis la fiche
              (identité, interlocuteurs, historique, négociation, calendrier).
              Pour les corriger : modifiez la fiche puis cliquez sur
              «&nbsp;Régénérer&nbsp;».
            </span>
          </div>

          <PassationForm
            key={`${synthese.id}-${synthese.updated_at}`}
            synthese={synthese}
            reco={reco}
            locked={!editable || isPending}
            onSaved={reload}
          />

          <div className="flex flex-wrap items-center gap-1.5 border-t pt-3">
            {editable && !soumise ? (
              <Button size="sm" disabled={isPending} onClick={handleSoumettre}>
                <Send className="size-3.5" /> Soumettre au Référent CDP
              </Button>
            ) : null}
            {synthese.pdf_path_complet ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => handleDownload('complet')}
              >
                <Download className="size-3.5" /> PDF complet
              </Button>
            ) : null}
            {synthese.pdf_path_cdp ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => handleDownload('cdp')}
              >
                <Download className="size-3.5" /> PDF CDP
              </Button>
            ) : null}
            {synthese.statut === 'en_attente_arbitrage' && hasCdpReferent ? (
              <Button
                size="sm"
                variant="outline"
                disabled={isPending}
                onClick={handleVague2}
              >
                <Send className="size-3.5" /> Transmettre au CDP affecté
              </Button>
            ) : null}
            {editable ? (
              <Button
                size="sm"
                variant="ghost"
                disabled={isPending}
                onClick={handleGenerer}
              >
                <RefreshCw className="size-3.5" /> Régénérer
              </Button>
            ) : null}
          </div>

          {synthese.statut === 'en_attente_arbitrage' && !hasCdpReferent ? (
            <p className="text-muted-foreground text-xs">
              {
                "En attente d'arbitrage : la synthèse sera transmise automatiquement au Chef de Projet dès son affectation au client."
              }
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
