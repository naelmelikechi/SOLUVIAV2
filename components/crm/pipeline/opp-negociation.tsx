'use client';
import { useMemo, useState, useTransition } from 'react';
import { ChevronDown, Plus, X } from 'lucide-react';
import { runWithToast } from '@/components/crm/shared/run-with-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  TYPE_FORMATION_LABELS,
  CANAL_ORIGINE_LABELS,
  INITIATEUR_LABELS,
  TYPE_PROSPECT_LABELS,
} from '@/lib/utils/constants';
import { updateOpportuniteNegociation } from '@/lib/crm/actions/opportunites';
import type { NegociationInput } from '@/lib/crm/validators/negociation';

export type OppNegociation = {
  id: string;
  perimetre_missions: string | null;
  formations_rncp: string[] | null;
  type_formation: string | null;
  taux_npec: number | null;
  duree_contrat_ans: number | null;
  mois_demarrage: number | null;
  volume_an1: number | null;
  volume_an2: number | null;
  volume_an3: number | null;
  volume_garanti_seuil: number | null;
  leviers: string[] | null;
  canal_origine: string | null;
  date_premier_contact: string | null;
  initiateur: string | null;
  historique_synthese: string | null;
  numero_contrat: string | null;
  type_prospect: string | null;
};

const numStr = (v: number | null) => (v != null ? String(v) : '');

/** Select nullable ("" = non renseigné) alimenté par un Record<string,string>. */
function EnumSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Record<string, string>;
}) {
  const items = useMemo(
    () => [
      { value: '', label: '— Non renseigné —' },
      ...Object.entries(options).map(([v, l]) => ({ value: v, label: l })),
    ],
    [options],
  );
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Select
        items={items}
        value={value}
        onValueChange={(v) => {
          if (typeof v === 'string') onChange(v);
        }}
      >
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {items.map((it) => (
            <SelectItem key={it.value} value={it.value}>
              {it.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/** Liste éditable de tags -> text[] (formations RNCP, leviers). */
function TagList({
  label,
  values,
  onChange,
  placeholder,
}: {
  label: string;
  values: string[];
  onChange: (v: string[]) => void;
  placeholder: string;
}) {
  const [draft, setDraft] = useState('');
  const add = () => {
    const t = draft.trim();
    if (!t || values.includes(t)) {
      setDraft('');
      return;
    }
    onChange([...values, t]);
    setDraft('');
  };
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {values.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {values.map((v) => (
            <Badge key={v} variant="secondary" className="gap-1">
              {v}
              <button
                type="button"
                onClick={() => onChange(values.filter((x) => x !== v))}
                className="hover:text-destructive"
                aria-label={`Retirer ${v}`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
          placeholder={placeholder}
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={add}
          disabled={!draft.trim()}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

/** Section repliable « Négociation & passation » du drawer d'opportunité (A5).
 *  Charge les valeurs actuelles et enregistre l'intégralité du bloc en un update
 *  partiel via `updateOpportuniteNegociation` (les tableaux sont donc préservés). */
export function OppNegociation({ opp }: { opp: OppNegociation }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  const [perimetre, setPerimetre] = useState(opp.perimetre_missions ?? '');
  const [formations, setFormations] = useState<string[]>(
    opp.formations_rncp ?? [],
  );
  const [typeFormation, setTypeFormation] = useState(opp.type_formation ?? '');
  const [tauxNpec, setTauxNpec] = useState(numStr(opp.taux_npec));
  const [duree, setDuree] = useState(numStr(opp.duree_contrat_ans));
  const [mois, setMois] = useState(numStr(opp.mois_demarrage));
  const [volAn1, setVolAn1] = useState(numStr(opp.volume_an1));
  const [volAn2, setVolAn2] = useState(numStr(opp.volume_an2));
  const [volAn3, setVolAn3] = useState(numStr(opp.volume_an3));
  const [volSeuil, setVolSeuil] = useState(numStr(opp.volume_garanti_seuil));
  const [leviers, setLeviers] = useState<string[]>(opp.leviers ?? []);
  const [canal, setCanal] = useState(opp.canal_origine ?? '');
  const [datePremierContact, setDatePremierContact] = useState(
    opp.date_premier_contact ?? '',
  );
  const [initiateur, setInitiateur] = useState(opp.initiateur ?? '');
  const [historique, setHistorique] = useState(opp.historique_synthese ?? '');
  const [numeroContrat, setNumeroContrat] = useState(opp.numero_contrat ?? '');
  const [typeProspect, setTypeProspect] = useState(opp.type_prospect ?? '');

  const payload: NegociationInput = {
    perimetre_missions: perimetre,
    formations_rncp: formations,
    type_formation: typeFormation,
    taux_npec: tauxNpec,
    duree_contrat_ans: duree,
    mois_demarrage: mois,
    volume_an1: volAn1,
    volume_an2: volAn2,
    volume_an3: volAn3,
    volume_garanti_seuil: volSeuil,
    leviers,
    canal_origine: canal,
    date_premier_contact: datePremierContact,
    initiateur,
    historique_synthese: historique,
    numero_contrat: numeroContrat,
    type_prospect: typeProspect,
  };

  const save = () =>
    start(() =>
      // updateOpportuniteNegociation revalide /pipeline (route courante).
      runWithToast(() => updateOpportuniteNegociation(opp.id, payload), {
        success: 'Négociation enregistrée',
        error: 'Enregistrement impossible',
      }),
    );

  return (
    <section className="space-y-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between"
      >
        <h3 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          Négociation &amp; passation
        </h3>
        <ChevronDown
          className={`text-muted-foreground h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="border-border bg-muted/30 space-y-4 rounded-lg border p-3">
          <div className="grid grid-cols-2 gap-3">
            <EnumSelect
              label="Type de prospect"
              value={typeProspect}
              onChange={setTypeProspect}
              options={TYPE_PROSPECT_LABELS}
            />
            <EnumSelect
              label="Type de formation"
              value={typeFormation}
              onChange={setTypeFormation}
              options={TYPE_FORMATION_LABELS}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="nego-perimetre">Périmètre des missions</Label>
            <Textarea
              id="nego-perimetre"
              rows={3}
              value={perimetre}
              onChange={(e) => setPerimetre(e.target.value)}
              placeholder="Ce que Soluvia prend en charge…"
            />
          </div>

          <TagList
            label="Formations RNCP visées"
            values={formations}
            onChange={setFormations}
            placeholder="Ex. RNCP34079 — puis Entrée"
          />

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="nego-npec">Taux NPEC (€)</Label>
              <Input
                id="nego-npec"
                type="number"
                min="0"
                value={tauxNpec}
                onChange={(e) => setTauxNpec(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nego-duree">Durée contrat (ans)</Label>
              <Input
                id="nego-duree"
                type="number"
                min="0"
                step="0.5"
                value={duree}
                onChange={(e) => setDuree(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nego-mois">Mois de démarrage (1-12)</Label>
              <Input
                id="nego-mois"
                type="number"
                min="1"
                max="12"
                value={mois}
                onChange={(e) => setMois(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nego-seuil">Volume garanti (seuil)</Label>
              <Input
                id="nego-seuil"
                type="number"
                min="0"
                value={volSeuil}
                onChange={(e) => setVolSeuil(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="nego-v1">Volume an 1</Label>
              <Input
                id="nego-v1"
                type="number"
                min="0"
                value={volAn1}
                onChange={(e) => setVolAn1(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nego-v2">Volume an 2</Label>
              <Input
                id="nego-v2"
                type="number"
                min="0"
                value={volAn2}
                onChange={(e) => setVolAn2(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nego-v3">Volume an 3</Label>
              <Input
                id="nego-v3"
                type="number"
                min="0"
                value={volAn3}
                onChange={(e) => setVolAn3(e.target.value)}
              />
            </div>
          </div>

          <TagList
            label="Leviers de négociation"
            values={leviers}
            onChange={setLeviers}
            placeholder="Ex. volume, exclusivité — puis Entrée"
          />

          <div className="grid grid-cols-2 gap-3">
            <EnumSelect
              label="Canal d'origine"
              value={canal}
              onChange={setCanal}
              options={CANAL_ORIGINE_LABELS}
            />
            <EnumSelect
              label="Initiateur du 1er contact"
              value={initiateur}
              onChange={setInitiateur}
              options={INITIATEUR_LABELS}
            />
            <div className="space-y-1.5">
              <Label htmlFor="nego-premier-contact">1er contact</Label>
              <Input
                id="nego-premier-contact"
                type="date"
                value={datePremierContact}
                onChange={(e) => setDatePremierContact(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nego-numero">N° de contrat</Label>
              <Input
                id="nego-numero"
                value={numeroContrat}
                onChange={(e) => setNumeroContrat(e.target.value)}
                placeholder="Optionnel"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="nego-historique">Historique / synthèse</Label>
            <Textarea
              id="nego-historique"
              rows={3}
              value={historique}
              onChange={(e) => setHistorique(e.target.value)}
              placeholder="Points marquants de la négociation…"
            />
          </div>

          <Button size="sm" onClick={save} disabled={pending}>
            {pending ? '…' : 'Enregistrer'}
          </Button>
        </div>
      )}
    </section>
  );
}
