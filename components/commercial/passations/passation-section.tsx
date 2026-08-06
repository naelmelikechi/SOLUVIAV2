'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  Archive,
  Download,
  FileText,
  Info,
  Mail,
  RefreshCw,
  Send,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/shared/status-badge';
import {
  STATUT_SYNTHESE_LABELS,
  STATUT_SYNTHESE_COLORS,
} from '@/lib/utils/constants';
import { formatDate } from '@/lib/utils/formatters';
import { logger } from '@/lib/utils/logger';
import {
  archiverSynthese,
  diffuserVague2,
  getSyntheseDownloadUrl,
  getPassationStateBySynthese,
  regenererSynthese,
  soumettreSynthese,
} from '@/lib/actions/passation';
import type { PassationReco, PassationSynthese } from '@/lib/queries/passation';
import { PassationEmailDialog } from './passation-email-dialog';
import { PassationForm } from './passation-form';
import { PassationProgressRail } from './passation-progress-rail';

interface PassationState {
  synthese: PassationSynthese | null;
  reco: PassationReco | null;
  hasCdpReferent: boolean;
}

// Workflow spec F6 : generee -> en_cours_completion -> en_attente_arbitrage
// (soumission = vague 1, notification in-app - AUCUN email automatique depuis
// le 2026-07-15, envoi manuel via PassationEmailDialog) -> cdp_affecte
// (vague 2 automatique à l'affectation) -> archivee. La génération est 100 %
// automatique via le pont opportunité gagnée (lib/crm/actions/pont.ts).
const STATUTS_EDITABLES = new Set([
  'generee',
  'en_cours_completion',
  'en_attente_arbitrage',
]);

export function PassationSection({
  syntheseId,
  synthese: initialSynthese,
}: {
  syntheseId: string;
  synthese?: PassationSynthese | null;
}) {
  const router = useRouter();
  const [state, setState] = useState<PassationState>({
    synthese: initialSynthese ?? null,
    reco: null,
    hasCdpReferent: false,
  });
  const [isPending, startTransition] = useTransition();
  const [emailOpen, setEmailOpen] = useState(false);
  const { synthese, reco, hasCdpReferent } = state;
  // Sauvegarde du formulaire, publiee par PassationForm. Permet de persister les
  // sections 6 et 8 AVANT la soumission, qui rend les PDF depuis la base.
  const saveFormRef = useRef<((silent?: boolean) => Promise<boolean>) | null>(
    null,
  );

  // La page ne charge que la ligne synthèse en props : la reco (section 8) et
  // le CDP référent sont récupérés ici, puis rafraîchis après chaque mutation.
  useEffect(() => {
    let cancelled = false;
    getPassationStateBySynthese(syntheseId)
      .then((next) => {
        if (cancelled) return;
        setState({
          synthese: next.synthese,
          reco: next.reco,
          hasCdpReferent: next.hasCdpReferent,
        });
      })
      .catch((err) => {
        if (!cancelled) logger.error('passation-section', err, { syntheseId });
      });
    return () => {
      cancelled = true;
    };
  }, [syntheseId]);

  const reload = async () => {
    const next = await getPassationStateBySynthese(syntheseId);
    setState({
      synthese: next.synthese,
      reco: next.reco,
      hasCdpReferent: next.hasCdpReferent,
    });
  };

  const handleRegenerer = () => {
    startTransition(async () => {
      const r = await regenererSynthese(syntheseId);
      if (r.success) {
        toast.success(
          'Snapshot régénéré depuis le CRM (saisies 6 et 8 conservées)',
        );
        await reload();
        router.refresh();
      } else {
        toast.error(r.error ?? 'Régénération impossible');
      }
    });
  };

  const handleSoumettre = () => {
    if (!synthese) return;
    startTransition(async () => {
      // Persister AVANT de soumettre. soumettreSynthese rend les deux PDF a
      // partir de la ligne en base : soumettre sans enregistrer d'abord les
      // envoyait sans les sections 6 et 8 (points de vigilance), et la
      // recuperation etait impossible puisque re-soumettre renvoie
      // « Synthese deja soumise ». Cf audit #122, constat 12b.
      const persisted = await saveFormRef.current?.(true);
      if (persisted === false) return; // le formulaire a deja affiche l'erreur

      const r = await soumettreSynthese(synthese.id);
      if (r.success) {
        toast.success(
          'Synthèse soumise (aucun email automatique) : utilisez « Envoyer par email » pour diffuser le PDF',
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

  const handleArchiver = () => {
    if (!synthese) return;
    startTransition(async () => {
      const r = await archiverSynthese(synthese.id);
      if (r.success) {
        toast.success('Synthèse archivée');
        await reload();
        router.refresh();
      } else {
        toast.error(r.error ?? 'Archivage impossible');
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

  if (!synthese) {
    return (
      <p className="text-muted-foreground text-sm">
        Chargement de la synthèse...
      </p>
    );
  }

  const editable = STATUTS_EDITABLES.has(synthese.statut);
  const soumise =
    synthese.statut === 'en_attente_arbitrage' ||
    synthese.statut === 'cdp_affecte' ||
    synthese.statut === 'archivee';

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <FileText className="size-4" />
          Synthèse de passation
        </h3>
        <StatusBadge
          label={STATUT_SYNTHESE_LABELS[synthese.statut]}
          color={STATUT_SYNTHESE_COLORS[synthese.statut]}
        />
      </div>

      <PassationProgressRail statut={synthese.statut} />

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
            Les sections 1 à 5 et 7 sont pré-remplies depuis l&apos;opportunité
            CRM (identité, interlocuteurs, historique, négociation, calendrier).
            Pour les corriger : modifiez l&apos;opportunité puis cliquez sur
            «&nbsp;Régénérer&nbsp;».
          </span>
        </div>

        <PassationForm
          key={`${synthese.id}-${synthese.updated_at}`}
          synthese={synthese}
          reco={reco}
          locked={!editable || isPending}
          onSaved={reload}
          saveRef={saveFormRef}
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
          {synthese.pdf_path_complet ? (
            <Button
              size="sm"
              variant="outline"
              disabled={isPending}
              onClick={() => setEmailOpen(true)}
            >
              <Mail className="size-3.5" /> Envoyer par email
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
              onClick={handleRegenerer}
            >
              <RefreshCw className="size-3.5" /> Régénérer
            </Button>
          ) : null}
          {synthese.statut === 'cdp_affecte' ? (
            <Button
              size="sm"
              variant="ghost"
              disabled={isPending}
              onClick={handleArchiver}
              title="À archiver une fois la prise en main effective du CDP"
            >
              <Archive className="size-3.5" /> Archiver
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

      <PassationEmailDialog
        syntheseId={synthese.id}
        open={emailOpen}
        onOpenChange={setEmailOpen}
      />
    </div>
  );
}
