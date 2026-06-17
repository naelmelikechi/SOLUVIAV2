'use client';

import { useCallback, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useCmdEnter } from '@/lib/hooks/use-cmd-enter';
import { toast } from 'sonner';
import { BadgeCheck, BadgeAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  updateProspectIdentite,
  verifyProspectSiren,
} from '@/lib/actions/prospects';
import { CANAL_ORIGINE_LABELS, type CanalOrigine } from '@/lib/utils/constants';
import type { ProspectDetail } from '@/lib/queries/prospects';

const CANAL_ORIGINE_ENTRIES = Object.entries(CANAL_ORIGINE_LABELS) as [
  CanalOrigine,
  string,
][];

interface Props {
  prospect: ProspectDetail;
  locked: boolean;
}

function ReadOnlyField({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div className="space-y-0.5">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="text-sm">{value || '-'}</p>
    </div>
  );
}

export function FicheIdentiteForm({ prospect, locked }: Props) {
  const router = useRouter();
  const [region, setRegion] = useState(prospect.region ?? '');
  const [adresse, setAdresse] = useState(prospect.adresse ?? '');
  const [siteWeb, setSiteWeb] = useState(prospect.site_web ?? '');
  const [dirigeantNom, setDirigeantNom] = useState(
    prospect.dirigeant_nom ?? '',
  );
  const [dirigeantPoste, setDirigeantPoste] = useState(
    prospect.dirigeant_poste ?? '',
  );
  const [dirigeantEmail, setDirigeantEmail] = useState(
    prospect.dirigeant_email ?? '',
  );
  const [dirigeantTelephone, setDirigeantTelephone] = useState(
    prospect.dirigeant_telephone ?? '',
  );
  const [canalOrigine, setCanalOrigine] = useState<string>(
    prospect.canal_origine ?? '',
  );
  const [volume, setVolume] = useState(
    prospect.volume_apprenants != null
      ? String(prospect.volume_apprenants)
      : '',
  );
  const [pointsVigilance, setPointsVigilance] = useState(
    prospect.points_vigilance ?? '',
  );
  const [notesInterEquipe, setNotesInterEquipe] = useState(
    prospect.notes_inter_equipe ?? '',
  );
  const [isPending, startTransition] = useTransition();
  const [siren, setSiren] = useState(prospect.siren ?? '');
  const [isVerifying, startVerify] = useTransition();

  const handleSubmit = useCallback(() => {
    let volumeApprenants: number | null = null;
    if (volume.trim() !== '') {
      const n = parseInt(volume, 10);
      if (Number.isNaN(n) || n < 0) {
        toast.error('Volume invalide');
        return;
      }
      volumeApprenants = n;
    }

    startTransition(async () => {
      const r = await updateProspectIdentite({
        id: prospect.id,
        region: region.trim() || null,
        adresse: adresse.trim() || null,
        siteWeb: siteWeb.trim() || null,
        dirigeantNom: dirigeantNom.trim() || null,
        dirigeantPoste: dirigeantPoste.trim() || null,
        dirigeantEmail: dirigeantEmail.trim() || null,
        dirigeantTelephone: dirigeantTelephone.trim() || null,
        canalOrigine: (canalOrigine || null) as CanalOrigine | null,
        volumeApprenants,
        pointsVigilance: pointsVigilance.trim() || null,
        notesInterEquipe: notesInterEquipe.trim() || null,
      });
      if (r.success) {
        toast.success('Identité enregistrée');
        router.refresh();
      } else {
        toast.error(r.error ?? 'Erreur');
      }
    });
  }, [
    prospect.id,
    region,
    adresse,
    siteWeb,
    dirigeantNom,
    dirigeantPoste,
    dirigeantEmail,
    dirigeantTelephone,
    canalOrigine,
    volume,
    pointsVigilance,
    notesInterEquipe,
    router,
  ]);

  const handleVerifySiren = useCallback(() => {
    const clean = siren.replace(/\s+/g, '');
    if (!/^\d{9}$/.test(clean)) {
      toast.error('SIREN attendu : 9 chiffres');
      return;
    }
    startVerify(async () => {
      const r = await verifyProspectSiren(prospect.id, clean);
      if (r.success) {
        toast.success('Identité enrichie via INSEE');
        router.refresh();
      } else {
        toast.error(r.error ?? 'SIREN introuvable');
      }
    });
  }, [prospect.id, siren, router]);

  useCmdEnter(handleSubmit, !isPending);

  return (
    <div className="space-y-5">
      {/* Bloc INSEE (lecture seule) */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <ReadOnlyField label="Raison sociale" value={prospect.nom} />
        <div className="space-y-0.5">
          <p className="text-muted-foreground text-xs">SIREN</p>
          <p className="flex items-center gap-1.5 text-sm">
            {prospect.siren || '-'}
            {prospect.siren ? (
              prospect.insee_verifie ? (
                <span
                  className="inline-flex items-center gap-1 text-xs text-green-600 dark:text-green-400"
                  title="Vérifié auprès de l'INSEE"
                >
                  <BadgeCheck className="size-3.5" /> Vérifié
                </span>
              ) : (
                <span
                  className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400"
                  title="Non vérifié auprès de l'INSEE"
                >
                  <BadgeAlert className="size-3.5" /> Non vérifié
                </span>
              )
            ) : null}
          </p>
        </div>
        <ReadOnlyField
          label="Forme juridique"
          value={prospect.forme_juridique}
        />
        <ReadOnlyField
          label="Code NAF"
          value={
            prospect.code_naf
              ? prospect.naf_libelle
                ? `${prospect.code_naf} - ${prospect.naf_libelle}`
                : prospect.code_naf
              : '-'
          }
        />
        <ReadOnlyField label="Effectif" value={prospect.effectif_tranche} />
      </div>

      {!locked && (
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1.5">
            <Label htmlFor="ident-siren">SIREN (9 chiffres)</Label>
            <Input
              id="ident-siren"
              value={siren}
              onChange={(e) => setSiren(e.target.value)}
              placeholder="123456789"
              className="w-44"
            />
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={handleVerifySiren}
            disabled={isVerifying}
          >
            {isVerifying ? 'Vérification...' : 'Vérifier via INSEE'}
          </Button>
        </div>
      )}

      {/* Bloc éditable */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="ident-region">Région</Label>
          <Input
            id="ident-region"
            value={region}
            disabled={locked}
            onChange={(e) => setRegion(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="ident-volume">Volume apprenants</Label>
          <Input
            id="ident-volume"
            type="number"
            min="0"
            value={volume}
            disabled={locked}
            onChange={(e) => setVolume(e.target.value)}
          />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="ident-adresse">Adresse</Label>
          <Input
            id="ident-adresse"
            value={adresse}
            disabled={locked}
            onChange={(e) => setAdresse(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="ident-site">Site web</Label>
          <Input
            id="ident-site"
            value={siteWeb}
            disabled={locked}
            onChange={(e) => setSiteWeb(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="ident-canal">Canal d&apos;origine</Label>
          <Select
            value={canalOrigine}
            onValueChange={(v) => setCanalOrigine(v ?? '')}
            disabled={locked}
          >
            <SelectTrigger className="w-full" id="ident-canal">
              <SelectValue placeholder="Non renseigné">
                {(v) =>
                  v ? CANAL_ORIGINE_LABELS[v as CanalOrigine] : 'Non renseigné'
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">Non renseigné</SelectItem>
              {CANAL_ORIGINE_ENTRIES.map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="ident-dir-nom">Dirigeant</Label>
          <Input
            id="ident-dir-nom"
            value={dirigeantNom}
            disabled={locked}
            placeholder="Nom"
            onChange={(e) => setDirigeantNom(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="ident-dir-poste">Poste dirigeant</Label>
          <Input
            id="ident-dir-poste"
            value={dirigeantPoste}
            disabled={locked}
            onChange={(e) => setDirigeantPoste(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="ident-dir-email">Email dirigeant</Label>
          <Input
            id="ident-dir-email"
            type="email"
            value={dirigeantEmail}
            disabled={locked}
            onChange={(e) => setDirigeantEmail(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="ident-dir-tel">Téléphone dirigeant</Label>
          <Input
            id="ident-dir-tel"
            value={dirigeantTelephone}
            disabled={locked}
            onChange={(e) => setDirigeantTelephone(e.target.value)}
          />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="ident-vigilance">Points de vigilance</Label>
          <Textarea
            id="ident-vigilance"
            rows={3}
            value={pointsVigilance}
            onChange={(e) => setPointsVigilance(e.target.value)}
            placeholder="Toujours éditable, même après signature"
          />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="ident-notes">Notes inter-équipe</Label>
          <Textarea
            id="ident-notes"
            rows={3}
            value={notesInterEquipe}
            onChange={(e) => setNotesInterEquipe(e.target.value)}
            placeholder="Toujours éditable, même après signature"
          />
        </div>
      </div>

      <div className="flex justify-end">
        <Button onClick={handleSubmit} disabled={isPending}>
          {isPending ? 'Enregistrement...' : 'Enregistrer'}
        </Button>
      </div>
    </div>
  );
}
