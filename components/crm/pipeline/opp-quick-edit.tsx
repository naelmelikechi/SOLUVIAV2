'use client';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { runWithToast } from '@/components/crm/shared/run-with-toast';
import { Input } from '@/components/crm/ui/input';
import { Label } from '@/components/crm/ui/label';
import { Button } from '@/components/crm/ui/button';
import { updateOpportuniteFields } from '@/lib/crm/actions/opportunites';

type Fields = {
  id: string;
  intitule: string;
  probabilite: number | null;
  nb_alternants: number | null;
  cfa: string | null;
  date_cible_prochain_rdv: string | null;
};

/** Édition rapide des champs principaux d'une opportunité (update partiel, sans risque
 *  d'écraser les autres champs). Replié par défaut dans le drawer (bouton « Modifier »). */
export function OppQuickEdit({
  opp,
  onSaved,
}: {
  opp: Fields;
  onSaved?: () => void;
}) {
  const [pending, start] = useTransition();
  const [intitule, setIntitule] = useState(opp.intitule);
  const [proba, setProba] = useState(
    opp.probabilite != null ? String(opp.probabilite) : '',
  );
  const [nb, setNb] = useState(
    opp.nb_alternants != null ? String(opp.nb_alternants) : '',
  );
  const [cfa, setCfa] = useState(opp.cfa ?? '');
  const [dateCible, setDateCible] = useState(opp.date_cible_prochain_rdv ?? '');

  const dirty =
    intitule !== opp.intitule ||
    proba !== (opp.probabilite != null ? String(opp.probabilite) : '') ||
    nb !== (opp.nb_alternants != null ? String(opp.nb_alternants) : '') ||
    cfa !== (opp.cfa ?? '') ||
    dateCible !== (opp.date_cible_prochain_rdv ?? '');

  const save = () =>
    start(async () => {
      if (!intitule.trim()) {
        toast.error('Intitulé requis');
        return;
      }
      // updateOpportuniteFields revalide /pipeline (route courante) : pas de refresh redondant.
      await runWithToast(
        () =>
          updateOpportuniteFields(opp.id, {
            intitule,
            probabilite: proba,
            nb_alternants: nb,
            cfa,
            date_cible_prochain_rdv: dateCible,
          }),
        {
          success: 'Opportunité mise à jour',
          error: 'Mise à jour impossible',
          onSuccess: onSaved,
        },
      );
    });

  return (
    <div className="border-border bg-muted/30 space-y-3 rounded-lg border p-3">
      <div className="space-y-1.5">
        <Label htmlFor="qe-intitule">Intitulé</Label>
        <Input
          id="qe-intitule"
          value={intitule}
          onChange={(e) => setIntitule(e.target.value)}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="qe-nb">Nb apprentis</Label>
          <Input
            id="qe-nb"
            type="number"
            value={nb}
            onChange={(e) => setNb(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="qe-proba">Probabilité (%)</Label>
          <Input
            id="qe-proba"
            type="number"
            min="0"
            max="100"
            value={proba}
            onChange={(e) => setProba(e.target.value)}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="qe-cfa">CFA</Label>
          <Input
            id="qe-cfa"
            value={cfa}
            onChange={(e) => setCfa(e.target.value)}
            placeholder="Optionnel"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="qe-date">Prochain RDV cible</Label>
          <Input
            id="qe-date"
            type="date"
            value={dateCible}
            onChange={(e) => setDateCible(e.target.value)}
          />
        </div>
      </div>
      <Button size="sm" onClick={save} disabled={pending || !dirty}>
        {pending ? '…' : 'Enregistrer'}
      </Button>
    </div>
  );
}
