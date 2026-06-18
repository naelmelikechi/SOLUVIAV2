'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  createSocieteEmettrice,
  updateSocieteEmettrice,
  type SocieteEmettriceInput,
} from '@/lib/actions/societes-emettrices';
import type { SocieteEmettriceRow } from '@/lib/queries/societes-emettrices';

interface Props {
  societe?: SocieteEmettriceRow;
}

// oxlint-disable-next-line react-doctor/no-giant-component
export function SocieteEmettriceForm({ societe }: Props) {
  const { push, refresh, back } = useRouter();
  const [isSubmitting, startSubmit] = useTransition();
  const [form, setForm] = useState<Partial<SocieteEmettriceInput>>({
    code: societe?.code ?? '',
    raison_sociale: societe?.raison_sociale ?? '',
    forme_juridique: societe?.forme_juridique ?? '',
    siret: societe?.siret ?? '',
    tva_intracom: societe?.tva_intracom ?? '',
    adresse: societe?.adresse ?? '',
    code_postal: societe?.code_postal ?? '',
    ville: societe?.ville ?? '',
    pays: societe?.pays ?? 'France',
    email_contact: societe?.email_contact ?? '',
    telephone: societe?.telephone ?? '',
    banque_nom: societe?.banque_nom ?? '',
    banque_iban: societe?.banque_iban ?? '',
    banque_bic: societe?.banque_bic ?? '',
    mentions_legales: societe?.mentions_legales ?? '',
    conditions_reglement_default: societe?.conditions_reglement_default ?? '',
    validite_devis_jours: societe?.validite_devis_jours ?? 90,
    odoo_company_id: societe?.odoo_company_id ?? null,
    odoo_journal_id: societe?.odoo_journal_id ?? null,
    est_defaut: societe?.est_defaut ?? false,
    tva_sur_debits: societe?.tva_sur_debits ?? false,
  });

  function set<K extends keyof SocieteEmettriceInput>(
    k: K,
    v: SocieteEmettriceInput[K],
  ) {
    setForm((prev) => ({ ...prev, [k]: v }));
  }

  function handleSubmit() {
    startSubmit(async () => {
      const res = societe
        ? await updateSocieteEmettrice(societe.id, form)
        : await createSocieteEmettrice(form as SocieteEmettriceInput);
      if (res.success) {
        toast.success(societe ? 'Société mise à jour' : 'Société créée');
        push('/admin/parametres/societes-emettrices');
        refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <div className="max-w-2xl space-y-4">
      <fieldset className="space-y-3 rounded-md border p-4">
        <legend className="px-2 text-sm font-semibold">Identité</legend>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="se-code">Code (2-8 caractères)</Label>
            <Input
              id="se-code"
              value={form.code ?? ''}
              onChange={(e) => set('code', e.target.value.toUpperCase())}
              maxLength={8}
            />
          </div>
          <div>
            <Label htmlFor="se-forme">Forme juridique</Label>
            <Input
              id="se-forme"
              value={form.forme_juridique ?? ''}
              onChange={(e) => set('forme_juridique', e.target.value)}
              placeholder="S.A.S."
            />
          </div>
        </div>
        <div>
          <Label htmlFor="se-raison">Raison sociale</Label>
          <Input
            id="se-raison"
            value={form.raison_sociale ?? ''}
            onChange={(e) => set('raison_sociale', e.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="se-siret">SIRET</Label>
            <Input
              id="se-siret"
              value={form.siret ?? ''}
              onChange={(e) => set('siret', e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="se-tva">TVA intracom</Label>
            <Input
              id="se-tva"
              value={form.tva_intracom ?? ''}
              onChange={(e) => set('tva_intracom', e.target.value)}
            />
          </div>
        </div>
      </fieldset>

      <fieldset className="space-y-3 rounded-md border p-4">
        <legend className="px-2 text-sm font-semibold">Adresse</legend>
        <div>
          <Label htmlFor="se-adresse">Adresse</Label>
          <Input
            id="se-adresse"
            value={form.adresse ?? ''}
            onChange={(e) => set('adresse', e.target.value)}
            placeholder="27 Rue Jacqueline Cochran"
          />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <Label htmlFor="se-cp">Code postal</Label>
            <Input
              id="se-cp"
              value={form.code_postal ?? ''}
              onChange={(e) => set('code_postal', e.target.value)}
              placeholder="79000"
            />
          </div>
          <div>
            <Label htmlFor="se-ville">Ville</Label>
            <Input
              id="se-ville"
              value={form.ville ?? ''}
              onChange={(e) => set('ville', e.target.value)}
              placeholder="Niort"
            />
          </div>
          <div>
            <Label htmlFor="se-pays">Pays</Label>
            <Input
              id="se-pays"
              value={form.pays ?? ''}
              onChange={(e) => set('pays', e.target.value)}
              placeholder="France"
            />
          </div>
        </div>
      </fieldset>

      <fieldset className="space-y-3 rounded-md border p-4">
        <legend className="px-2 text-sm font-semibold">Contact</legend>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="se-email">Email</Label>
            <Input
              id="se-email"
              type="email"
              value={form.email_contact ?? ''}
              onChange={(e) => set('email_contact', e.target.value)}
              placeholder="contact@..."
            />
          </div>
          <div>
            <Label htmlFor="se-tel">Téléphone</Label>
            <Input
              id="se-tel"
              value={form.telephone ?? ''}
              onChange={(e) => set('telephone', e.target.value)}
              placeholder="05 XX XX XX XX"
            />
          </div>
        </div>
      </fieldset>

      <fieldset className="space-y-3 rounded-md border p-4">
        <legend className="px-2 text-sm font-semibold">Banque</legend>
        <div>
          <Label htmlFor="se-banque">Nom de la banque</Label>
          <Input
            id="se-banque"
            value={form.banque_nom ?? ''}
            onChange={(e) => set('banque_nom', e.target.value)}
            placeholder="Crédit Agricole..."
          />
        </div>
        <div>
          <Label htmlFor="se-iban">IBAN</Label>
          <Input
            id="se-iban"
            value={form.banque_iban ?? ''}
            onChange={(e) => set('banque_iban', e.target.value)}
            placeholder="FR76 ..."
            className="font-mono"
          />
        </div>
        <div>
          <Label htmlFor="se-bic">BIC</Label>
          <Input
            id="se-bic"
            value={form.banque_bic ?? ''}
            onChange={(e) => set('banque_bic', e.target.value)}
            placeholder="AGRIFRPP817"
            className="font-mono"
          />
        </div>
      </fieldset>

      <fieldset className="space-y-3 rounded-md border p-4">
        <legend className="px-2 text-sm font-semibold">PDF / devis</legend>
        <div>
          <Label htmlFor="se-mentions">Mentions légales (footer PDF)</Label>
          <Textarea
            id="se-mentions"
            value={form.mentions_legales ?? ''}
            onChange={(e) => set('mentions_legales', e.target.value)}
            rows={2}
          />
        </div>
        <div>
          <Label htmlFor="se-conditions">
            Conditions de règlement par défaut
          </Label>
          <Textarea
            id="se-conditions"
            value={form.conditions_reglement_default ?? ''}
            onChange={(e) =>
              set('conditions_reglement_default', e.target.value)
            }
            rows={3}
          />
        </div>
        <div>
          <Label htmlFor="se-validite">Validité devis (jours)</Label>
          <Input
            id="se-validite"
            type="number"
            value={form.validite_devis_jours ?? 90}
            onChange={(e) =>
              set('validite_devis_jours', Number(e.target.value))
            }
            className="w-32"
          />
        </div>
        <div className="flex items-center gap-2">
          <Checkbox
            id="se-defaut"
            checked={form.est_defaut ?? false}
            onCheckedChange={(c) => set('est_defaut', c === true)}
          />
          <Label htmlFor="se-defaut">
            Société par défaut (utilisée si une seule active)
          </Label>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox
            id="se-tva-debits"
            checked={form.tva_sur_debits ?? false}
            onCheckedChange={(c) => set('tva_sur_debits', c === true)}
          />
          <Label htmlFor="se-tva-debits">
            Option TVA sur les débits (mention légale e-invoicing)
          </Label>
        </div>
      </fieldset>

      <fieldset className="space-y-3 rounded-md border p-4">
        <legend className="px-2 text-sm font-semibold">Intégration Odoo</legend>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="se-odoo-company">Odoo company ID</Label>
            <Input
              id="se-odoo-company"
              type="number"
              min={1}
              step={1}
              value={form.odoo_company_id ?? ''}
              onChange={(e) =>
                set(
                  'odoo_company_id',
                  e.target.value ? Number(e.target.value) : null,
                )
              }
              placeholder="ex: 1"
              className="w-40"
            />
            <p className="text-muted-foreground text-xs">
              ID interne Odoo pour cette société (multi-company)
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="se-odoo-journal">Odoo journal ID</Label>
            <Input
              id="se-odoo-journal"
              type="number"
              min={1}
              step={1}
              value={form.odoo_journal_id ?? ''}
              onChange={(e) =>
                set(
                  'odoo_journal_id',
                  e.target.value ? Number(e.target.value) : null,
                )
              }
              placeholder="ex: 7"
              className="w-40"
            />
            <p className="text-muted-foreground text-xs">
              Journal de ventes Odoo associé
            </p>
          </div>
        </div>
      </fieldset>

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={() => back()} disabled={isSubmitting}>
          Annuler
        </Button>
        <Button onClick={handleSubmit} disabled={isSubmitting}>
          {isSubmitting ? (
            <Loader2 className="mr-2 size-4 animate-spin" />
          ) : null}
          {societe ? 'Enregistrer' : 'Créer'}
        </Button>
      </div>
    </div>
  );
}
