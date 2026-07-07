'use client';

import { useCallback, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useCmdEnter } from '@/lib/hooks/use-cmd-enter';
import { AlertTriangle } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { updateProspectNegotiation } from '@/lib/actions/prospects';
import {
  TAUX_NPEC_PLANCHER,
  TYPE_FORMATION_LABELS,
  INITIATEUR_LABELS,
  JALONS_CALENDRIER,
  type TypeFormation,
  type InitiateurContact,
} from '@/lib/utils/constants';
import type { ProspectDetail } from '@/lib/queries/prospects';
import {
  CalendrierPrevisionnelForm,
  type CalendrierPrevisionnel,
} from './calendrier-previsionnel-form';

// Leviers de négociation proposés (cases à cocher). La colonne stocke un
// string[] libre : tout levier déjà présent et hors liste est conservé.
const LEVIER_OPTIONS = [
  'Volume garanti',
  'Engagement pluriannuel',
  'Exclusivité territoriale',
  'Co-construction pédagogique',
  'Accompagnement OPCO',
  'Mise en avant / communication',
];

const TYPE_FORMATION_ENTRIES = Object.entries(TYPE_FORMATION_LABELS) as [
  TypeFormation,
  string,
][];

const INITIATEUR_ENTRIES = Object.entries(INITIATEUR_LABELS) as [
  InitiateurContact,
  string,
][];

interface Props {
  prospect: ProspectDetail;
  locked: boolean;
}

function numToStr(n: number | null): string {
  return n != null ? String(n) : '';
}

function jsonToStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === 'string')
    : [];
}

function jsonToCalendrier(value: unknown): CalendrierPrevisionnel {
  const result: CalendrierPrevisionnel = {};
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const { key } of JALONS_CALENDRIER) {
      const mois = (value as Record<string, unknown>)[key];
      if (typeof mois === 'string') result[key] = mois;
    }
  }
  return result;
}

export function FicheNegociation({ prospect, locked }: Props) {
  const router = useRouter();
  const initialLeviers = Array.isArray(prospect.leviers)
    ? (prospect.leviers as unknown[]).filter(
        (l): l is string => typeof l === 'string',
      )
    : [];

  const [tauxNpec, setTauxNpec] = useState(numToStr(prospect.taux_npec));
  const [dureeAns, setDureeAns] = useState(
    numToStr(prospect.duree_contrat_ans),
  );
  const [moisDemarrage, setMoisDemarrage] = useState(
    numToStr(prospect.mois_demarrage),
  );
  const [volumeAn1, setVolumeAn1] = useState(numToStr(prospect.volume_an1));
  const [volumeAn2, setVolumeAn2] = useState(numToStr(prospect.volume_an2));
  const [volumeAn3, setVolumeAn3] = useState(numToStr(prospect.volume_an3));
  const [volumeGaranti, setVolumeGaranti] = useState(
    numToStr(prospect.volume_garanti_seuil),
  );
  const [leviers, setLeviers] = useState<string[]>(initialLeviers);
  const [perimetre, setPerimetre] = useState(prospect.perimetre_missions ?? '');
  const [numeroContrat, setNumeroContrat] = useState(
    prospect.numero_contrat ?? '',
  );
  const [typeFormation, setTypeFormation] = useState<string>(
    prospect.type_formation ?? '',
  );
  const [formationsRncp, setFormationsRncp] = useState(
    jsonToStringArray(prospect.formations_rncp).join(', '),
  );
  const [datePremierContact, setDatePremierContact] = useState(
    prospect.date_premier_contact ?? '',
  );
  const [initiateur, setInitiateur] = useState<string>(
    prospect.initiateur ?? '',
  );
  const [historiqueSynthese, setHistoriqueSynthese] = useState(
    prospect.historique_synthese ?? '',
  );
  const [calendrier, setCalendrier] = useState<CalendrierPrevisionnel>(() =>
    jsonToCalendrier(prospect.calendrier_previsionnel),
  );
  const [isPending, startTransition] = useTransition();

  const leviersOptions = useMemo(() => {
    const extras = initialLeviers.filter((l) => !LEVIER_OPTIONS.includes(l));
    return [...LEVIER_OPTIONS, ...extras];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tauxValue = tauxNpec.trim() === '' ? null : parseFloat(tauxNpec);
  const sousPlancher =
    tauxValue != null &&
    !Number.isNaN(tauxValue) &&
    tauxValue < TAUX_NPEC_PLANCHER;

  const handleSubmit = useCallback(() => {
    const parseInteger = (s: string): number | null | false => {
      if (s.trim() === '') return null;
      const n = parseInt(s, 10);
      return Number.isNaN(n) || n < 0 ? false : n;
    };

    const taux = tauxNpec.trim() === '' ? null : parseFloat(tauxNpec);
    if (taux != null && (Number.isNaN(taux) || taux < 0 || taux > 100)) {
      toast.error('Taux NPEC invalide (0-100)');
      return;
    }
    const mois = parseInteger(moisDemarrage);
    if (mois === false || (mois != null && mois > 3)) {
      toast.error('Mois de démarrage invalide (0-3)');
      return;
    }
    const duree = parseInteger(dureeAns);
    const v1 = parseInteger(volumeAn1);
    const v2 = parseInteger(volumeAn2);
    const v3 = parseInteger(volumeAn3);
    const vg = parseInteger(volumeGaranti);
    if ([duree, v1, v2, v3, vg].includes(false)) {
      toast.error('Valeur numérique invalide');
      return;
    }

    const rncp = formationsRncp
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (rncp.length > 20) {
      toast.error('Maximum 20 formations RNCP');
      return;
    }
    if (rncp.some((s) => s.length > 100)) {
      toast.error('Formation RNCP trop longue (100 caractères max)');
      return;
    }

    startTransition(async () => {
      const r = await updateProspectNegotiation({
        id: prospect.id,
        tauxNpec: taux,
        dureeContratAns: duree as number | null,
        moisDemarrage: mois as number | null,
        volumeAn1: v1 as number | null,
        volumeAn2: v2 as number | null,
        volumeAn3: v3 as number | null,
        volumeGarantiSeuil: vg as number | null,
        leviers,
        perimetreMissions: perimetre.trim() || null,
        numeroContrat: numeroContrat.trim() || null,
        typeFormation: (typeFormation || null) as TypeFormation | null,
        formationsRncp: rncp.length > 0 ? rncp : null,
        datePremierContact: datePremierContact || null,
        initiateur: (initiateur || null) as InitiateurContact | null,
        historiqueSynthese: historiqueSynthese.trim() || null,
        calendrierPrevisionnel:
          Object.keys(calendrier).length > 0 ? calendrier : null,
      });
      if (r.success) {
        toast.success('Négociation enregistrée');
        router.refresh();
      } else {
        toast.error(r.error ?? 'Erreur');
      }
    });
  }, [
    prospect.id,
    tauxNpec,
    dureeAns,
    moisDemarrage,
    volumeAn1,
    volumeAn2,
    volumeAn3,
    volumeGaranti,
    leviers,
    perimetre,
    numeroContrat,
    typeFormation,
    formationsRncp,
    datePremierContact,
    initiateur,
    historiqueSynthese,
    calendrier,
    router,
  ]);

  useCmdEnter(handleSubmit, !locked && !isPending);

  return (
    <Card className="p-6">
      {locked && (
        <p className="text-muted-foreground mb-4 text-sm">
          Fiche verrouillée : la négociation est en lecture seule.
        </p>
      )}

      {sousPlancher && (
        <div className="mb-5 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300">
          <AlertTriangle className="size-4 shrink-0" />
          <span>
            Sous le plancher {TAUX_NPEC_PLANCHER}% NPEC — validation Direction
            requise.
          </span>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="nego-taux">Taux NPEC (%)</Label>
          <Input
            id="nego-taux"
            type="number"
            min="0"
            max="100"
            step="0.01"
            value={tauxNpec}
            disabled={locked}
            onChange={(e) => setTauxNpec(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="nego-duree">Durée contrat (ans)</Label>
          <Input
            id="nego-duree"
            type="number"
            min="0"
            value={dureeAns}
            disabled={locked}
            onChange={(e) => setDureeAns(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="nego-mois">Mois de démarrage (0-3)</Label>
          <Input
            id="nego-mois"
            type="number"
            min="0"
            max="3"
            value={moisDemarrage}
            disabled={locked}
            onChange={(e) => setMoisDemarrage(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="nego-v1">Volume an 1</Label>
          <Input
            id="nego-v1"
            type="number"
            min="0"
            value={volumeAn1}
            disabled={locked}
            onChange={(e) => setVolumeAn1(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="nego-v2">Volume an 2</Label>
          <Input
            id="nego-v2"
            type="number"
            min="0"
            value={volumeAn2}
            disabled={locked}
            onChange={(e) => setVolumeAn2(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="nego-v3">Volume an 3</Label>
          <Input
            id="nego-v3"
            type="number"
            min="0"
            value={volumeAn3}
            disabled={locked}
            onChange={(e) => setVolumeAn3(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="nego-vg">Volume garanti (seuil)</Label>
          <Input
            id="nego-vg"
            type="number"
            min="0"
            value={volumeGaranti}
            disabled={locked}
            onChange={(e) => setVolumeGaranti(e.target.value)}
          />
        </div>
      </div>

      <div className="mt-5 space-y-2">
        <Label>Leviers</Label>
        <div className="grid gap-2 sm:grid-cols-2">
          {leviersOptions.map((opt) => (
            <label
              key={opt}
              className="flex cursor-pointer items-center gap-2 text-sm"
            >
              <Checkbox
                checked={leviers.includes(opt)}
                disabled={locked}
                onCheckedChange={(checked) =>
                  setLeviers((prev) =>
                    checked ? [...prev, opt] : prev.filter((x) => x !== opt),
                  )
                }
              />
              {opt}
            </label>
          ))}
        </div>
      </div>

      <div className="mt-5 space-y-2">
        <Label htmlFor="nego-perimetre">Périmètre des missions</Label>
        <Textarea
          id="nego-perimetre"
          rows={4}
          value={perimetre}
          disabled={locked}
          onChange={(e) => setPerimetre(e.target.value)}
        />
      </div>

      {/* Engagements */}
      <div className="mt-6 border-t pt-5">
        <h3 className="mb-4 text-sm font-semibold">Engagements</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="nego-num-contrat">Numéro de contrat</Label>
            <Input
              id="nego-num-contrat"
              value={numeroContrat}
              disabled={locked}
              onChange={(e) => setNumeroContrat(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="nego-type-formation">Type de formation</Label>
            <Select
              value={typeFormation}
              onValueChange={(v) => setTypeFormation(v ?? '')}
              disabled={locked}
            >
              <SelectTrigger className="w-full" id="nego-type-formation">
                <SelectValue placeholder="Non renseigné">
                  {(v) =>
                    v
                      ? TYPE_FORMATION_LABELS[v as TypeFormation]
                      : 'Non renseigné'
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Non renseigné</SelectItem>
                {TYPE_FORMATION_ENTRIES.map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="nego-rncp">Formations visées (codes RNCP)</Label>
            <Input
              id="nego-rncp"
              value={formationsRncp}
              disabled={locked}
              placeholder="RNCP 34567, RNCP 12345"
              onChange={(e) => setFormationsRncp(e.target.value)}
            />
            <p className="text-muted-foreground text-xs">
              Codes séparés par des virgules (20 maximum).
            </p>
          </div>
        </div>
      </div>

      {/* Historique commercial */}
      <div className="mt-6 border-t pt-5">
        <h3 className="mb-4 text-sm font-semibold">Historique commercial</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="nego-premier-contact">
              Date du premier contact
            </Label>
            <Input
              id="nego-premier-contact"
              type="date"
              value={datePremierContact}
              disabled={locked}
              onChange={(e) => setDatePremierContact(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="nego-initiateur">Initiateur du contact</Label>
            <Select
              value={initiateur}
              onValueChange={(v) => setInitiateur(v ?? '')}
              disabled={locked}
            >
              <SelectTrigger className="w-full" id="nego-initiateur">
                <SelectValue placeholder="Non renseigné">
                  {(v) =>
                    v
                      ? INITIATEUR_LABELS[v as InitiateurContact]
                      : 'Non renseigné'
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Non renseigné</SelectItem>
                {INITIATEUR_ENTRIES.map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="nego-historique">Évolution du dossier</Label>
            <Textarea
              id="nego-historique"
              rows={4}
              value={historiqueSynthese}
              disabled={locked}
              onChange={(e) => setHistoriqueSynthese(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Calendrier prévisionnel */}
      <div className="mt-6 border-t pt-5">
        <h3 className="mb-4 text-sm font-semibold">Calendrier prévisionnel</h3>
        <CalendrierPrevisionnelForm
          value={calendrier}
          onChange={setCalendrier}
          disabled={locked}
        />
      </div>

      {!locked && (
        <div className="mt-5 flex justify-end">
          <Button onClick={handleSubmit} disabled={isPending}>
            {isPending ? 'Enregistrement...' : 'Enregistrer'}
          </Button>
        </div>
      )}
    </Card>
  );
}
