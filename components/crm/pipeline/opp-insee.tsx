'use client';
import { useState, useTransition } from 'react';
import { BadgeCheck, Search } from 'lucide-react';
import { toast } from 'sonner';
import { runWithToast } from '@/components/crm/shared/run-with-toast';
import { Button } from '@/components/crm/ui/button';
import { Input } from '@/components/crm/ui/input';
import { Label } from '@/components/crm/ui/label';
import { Badge } from '@/components/crm/ui/badge';
import { updateCompteInsee } from '@/lib/crm/actions/comptes';
import { enrichirCompteParSiren } from '@/lib/crm/actions/insee';

export type OppCompteInsee = {
  id: string;
  siren: string | null;
  siret: string | null;
  forme_juridique: string | null;
  code_naf: string | null;
  naf_libelle: string | null;
  effectif_tranche: string | null;
  nb_implantations: number | null;
  ca_dernier_exercice: number | null;
  insee_verifie: boolean;
};

const numStr = (v: number | null) => (v != null ? String(v) : '');

/** Encart identité / INSEE du compte (A5) : SIREN + enrichissement automatique
 *  via l'API Sirene, complété manuellement, persisté via `updateCompteInsee`. */
export function OppInsee({ compte }: { compte: OppCompteInsee }) {
  const [pending, start] = useTransition();
  const [enriching, setEnriching] = useState(false);

  const [siren, setSiren] = useState(compte.siren ?? '');
  const [siret, setSiret] = useState(compte.siret ?? '');
  const [formeJuridique, setFormeJuridique] = useState(
    compte.forme_juridique ?? '',
  );
  const [codeNaf, setCodeNaf] = useState(compte.code_naf ?? '');
  const [nafLibelle, setNafLibelle] = useState(compte.naf_libelle ?? '');
  const [effectif, setEffectif] = useState(compte.effectif_tranche ?? '');
  const [nbImplantations, setNbImplantations] = useState(
    numStr(compte.nb_implantations),
  );
  const [ca, setCa] = useState(numStr(compte.ca_dernier_exercice));
  const [adresseInsee, setAdresseInsee] = useState<string | null>(null);
  // Passe à true dès qu'un enrichissement Sirene réussit ; conserve l'état existant sinon.
  const [verified, setVerified] = useState(compte.insee_verifie);

  const enrich = () =>
    start(async () => {
      setEnriching(true);
      try {
        const res = await enrichirCompteParSiren(siren);
        if (!res.ok) {
          toast.error('Aucune entreprise trouvée pour ce SIREN');
          return;
        }
        const d = res.data;
        setSiren(d.siren);
        if (d.siret) setSiret(d.siret);
        if (d.formeJuridique) setFormeJuridique(d.formeJuridique);
        if (d.codeNaf) setCodeNaf(d.codeNaf);
        if (d.effectifTranche) setEffectif(d.effectifTranche);
        setAdresseInsee(d.adresse);
        setVerified(true);
        toast.success('Fiche enrichie via INSEE');
      } catch {
        toast.error('Enrichissement impossible');
      } finally {
        setEnriching(false);
      }
    });

  const save = () =>
    start(() =>
      runWithToast(
        () =>
          updateCompteInsee(compte.id, {
            siren,
            siret,
            forme_juridique: formeJuridique,
            code_naf: codeNaf,
            naf_libelle: nafLibelle,
            effectif_tranche: effectif,
            nb_implantations: nbImplantations,
            ca_dernier_exercice: ca,
            insee_verifie: verified,
          }),
        { success: 'Société enregistrée', error: 'Enregistrement impossible' },
      ),
    );

  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2">
        <h3 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          Identité / INSEE
        </h3>
        {verified && (
          <Badge variant="secondary" className="gap-1 text-[10px]">
            <BadgeCheck className="h-3 w-3" />
            Vérifié INSEE
          </Badge>
        )}
      </div>

      <div className="border-border bg-muted/30 space-y-3 rounded-lg border p-3">
        <div className="space-y-1.5">
          <Label htmlFor="insee-siren">SIREN</Label>
          <div className="flex gap-2">
            <Input
              id="insee-siren"
              value={siren}
              onChange={(e) => setSiren(e.target.value)}
              placeholder="9 chiffres"
              inputMode="numeric"
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={enrich}
              disabled={pending || enriching || !siren.trim()}
            >
              <Search className="h-4 w-4" />
              {enriching ? '…' : 'Enrichir'}
            </Button>
          </div>
        </div>

        {adresseInsee && (
          <p className="text-muted-foreground text-xs">
            Adresse INSEE : {adresseInsee}
          </p>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="insee-siret">SIRET (siège)</Label>
            <Input
              id="insee-siret"
              value={siret}
              onChange={(e) => setSiret(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="insee-forme">Forme juridique</Label>
            <Input
              id="insee-forme"
              value={formeJuridique}
              onChange={(e) => setFormeJuridique(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="insee-naf">Code NAF</Label>
            <Input
              id="insee-naf"
              value={codeNaf}
              onChange={(e) => setCodeNaf(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="insee-naf-lib">Libellé NAF</Label>
            <Input
              id="insee-naf-lib"
              value={nafLibelle}
              onChange={(e) => setNafLibelle(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="insee-effectif">Effectif</Label>
            <Input
              id="insee-effectif"
              value={effectif}
              onChange={(e) => setEffectif(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="insee-implantations">Nb implantations</Label>
            <Input
              id="insee-implantations"
              type="number"
              min="0"
              value={nbImplantations}
              onChange={(e) => setNbImplantations(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="insee-ca">CA dernier exercice (€)</Label>
            <Input
              id="insee-ca"
              type="number"
              min="0"
              value={ca}
              onChange={(e) => setCa(e.target.value)}
            />
          </div>
        </div>

        <Button size="sm" onClick={save} disabled={pending || enriching}>
          {pending ? '…' : 'Enregistrer'}
        </Button>
      </div>
    </section>
  );
}
