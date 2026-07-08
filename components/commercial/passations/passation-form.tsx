'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Lock, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  enregistrerSaisiesSynthese,
  type SaisiesSynthese,
} from '@/lib/actions/passation';
import type { PassationReco, PassationSynthese } from '@/lib/queries/passation';
import {
  NIVEAU_CHARGE_LABELS,
  NIVEAU_RISQUE_LABELS,
  TYPOLOGIE_CLIENT_LABELS,
  type NiveauCharge,
  type NiveauRisque,
  type TypologieClient,
} from '@/lib/utils/constants';

function EnumSelect<K extends string>({
  id,
  value,
  labels,
  disabled,
  onChange,
}: {
  id: string;
  value: string;
  labels: Record<K, string>;
  disabled: boolean;
  onChange: (v: string) => void;
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v ?? '')}>
      <SelectTrigger className="w-full" id={id} disabled={disabled}>
        <SelectValue placeholder="À sélectionner...">
          {(v) => (v ? labels[v as K] : 'À sélectionner...')}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="">À sélectionner...</SelectItem>
        {(Object.entries(labels) as Array<[K, string]>).map(([val, label]) => (
          <SelectItem key={val} value={val}>
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * Saisies du Développeur : section 6 (points de vigilance, visible du CDP) et
 * section 8 (recommandation d'affectation, confidentielle - masquée au CDP
 * affecté). Enregistré en brouillon via enregistrerSaisiesSynthese ; la
 * soumission (vague 1) est portée par la section parente.
 */
export function PassationForm({
  synthese,
  reco,
  locked,
  onSaved,
}: {
  synthese: PassationSynthese;
  reco: PassationReco | null;
  locked: boolean;
  onSaved: () => Promise<void> | void;
}) {
  const [pointsVigilance, setPointsVigilance] = useState(
    synthese.points_vigilance ?? '',
  );
  const [promessesOrales, setPromessesOrales] = useState(
    synthese.promesses_orales ?? '',
  );
  const [typologie, setTypologie] = useState<string>(
    reco?.typologie_client ?? '',
  );
  const [charge, setCharge] = useState<string>(
    reco?.charge_previsionnelle ?? '',
  );
  const [churn, setChurn] = useState<string>(reco?.risque_churn ?? '');
  const [cdpIdeal, setCdpIdeal] = useState(reco?.cdp_ideal ?? '');
  const [cdpAEviter, setCdpAEviter] = useState(reco?.cdp_a_eviter ?? '');
  const [notes, setNotes] = useState(reco?.notes_inter_equipe ?? '');
  const [isPending, startTransition] = useTransition();

  const handleSave = () => {
    const saisies: SaisiesSynthese = {
      points_vigilance: pointsVigilance.trim() || null,
      promesses_orales: promessesOrales.trim() || null,
      typologie_client: (typologie || null) as TypologieClient | null,
      charge_previsionnelle: (charge || null) as NiveauCharge | null,
      risque_churn: (churn || null) as NiveauRisque | null,
      cdp_ideal: cdpIdeal.trim() || null,
      cdp_a_eviter: cdpAEviter.trim() || null,
      notes_inter_equipe: notes.trim() || null,
    };
    startTransition(async () => {
      const r = await enregistrerSaisiesSynthese(synthese.id, saisies);
      if (r.success) {
        toast.success('Saisies enregistrées');
        await onSaved();
      } else {
        toast.error(r.error ?? 'Enregistrement impossible');
      }
    });
  };

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <h4 className="text-sm font-semibold">
          Section 6 - Points de vigilance
        </h4>
        <div className="space-y-2">
          <Label htmlFor="passation-vigilance">
            Le tacite à connaître avant le premier contact (une ligne par point)
          </Label>
          <Textarea
            id="passation-vigilance"
            rows={5}
            value={pointsVigilance}
            disabled={locked}
            placeholder={
              'Sensibilités des interlocuteurs, objections restées sans réponse, contraintes internes au groupe, concurrents en présence...'
            }
            onChange={(e) => setPointsVigilance(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="passation-promesses">
            Promesses orales à honorer
          </Label>
          <Textarea
            id="passation-promesses"
            rows={2}
            value={promessesOrales}
            disabled={locked}
            placeholder="Engagements pris à l'oral, hors contrat, mais à tenir."
            onChange={(e) => setPromessesOrales(e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-3">
        <h4 className="flex items-center gap-1.5 text-sm font-semibold">
          <Lock className="size-3.5" />
          {"Section 8 - Recommandation d'affectation"}
        </h4>
        <p className="text-muted-foreground text-xs">
          Visible Référent CDP + Direction uniquement - jamais transmise au CDP
          affecté.
        </p>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="passation-typologie">Typologie de client</Label>
            <EnumSelect
              id="passation-typologie"
              value={typologie}
              labels={TYPOLOGIE_CLIENT_LABELS}
              disabled={locked}
              onChange={setTypologie}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="passation-charge">
              Charge prévisionnelle 6 mois
            </Label>
            <EnumSelect
              id="passation-charge"
              value={charge}
              labels={NIVEAU_CHARGE_LABELS}
              disabled={locked}
              onChange={setCharge}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="passation-churn">Risque de churn perçu</Label>
            <EnumSelect
              id="passation-churn"
              value={churn}
              labels={NIVEAU_RISQUE_LABELS}
              disabled={locked}
              onChange={setChurn}
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="passation-cdp-ideal">CDP idéal selon vous</Label>
          <Textarea
            id="passation-cdp-ideal"
            rows={2}
            value={cdpIdeal}
            disabled={locked}
            placeholder="Profil souhaité : expérience secteur, gestion de volume, séniorité, soft skills..."
            onChange={(e) => setCdpIdeal(e.target.value)}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="passation-cdp-eviter">
              CDP à éviter (si conflit antérieur connu)
            </Label>
            <Textarea
              id="passation-cdp-eviter"
              rows={2}
              value={cdpAEviter}
              disabled={locked}
              placeholder="Laisser vide si aucun."
              onChange={(e) => setCdpAEviter(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="passation-notes">Notes inter-équipe</Label>
            <Textarea
              id="passation-notes"
              rows={2}
              value={notes}
              disabled={locked}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>
      </div>

      {!locked ? (
        <div className="flex justify-end">
          <Button
            size="sm"
            variant="outline"
            disabled={isPending}
            onClick={handleSave}
          >
            <Save className="size-3.5" />
            {isPending ? 'Enregistrement...' : 'Enregistrer le brouillon'}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
