'use client';
import * as React from 'react';
import { useState, useTransition } from 'react';
import { useForm, useFieldArray, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import type { z } from 'zod';
import { Plus, X } from 'lucide-react';
import { ZoneCombobox, type Zone } from '@/components/crm/shared/zone-combobox';
import {
  opportuniteCompleteSchema,
  type OpportuniteCompleteInput,
  type OpportuniteCompleteParsed,
} from '@/lib/crm/validators/opportunite-complete';
import { createOpportuniteComplete } from '@/lib/crm/actions/opportunites';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

const emptyContact = { prenom: '', nom: '', email: '', telephone: '' };
const emptyAdresse = { libelle: '', ville: '', departement: '', region: '' };

/**
 * Création unifiée d'opportunité : un seul formulaire crée société + contact(s) +
 * opportunité + 1er RDV + commentaire. Plus de saisie compte/contact séparée.
 */
export function OppCreateForm({ trigger }: { trigger: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const {
    register,
    control,
    handleSubmit,
    reset,
    setValue,
    formState: { errors },
  } = useForm<
    z.input<typeof opportuniteCompleteSchema>,
    unknown,
    OpportuniteCompleteParsed
  >({
    resolver: zodResolver(opportuniteCompleteSchema),
    defaultValues: {
      societe_nom: '',
      nombre_collaborateurs: '',
      contacts: [{ ...emptyContact }],
      adresses: [],
      nb_alternants: '',
      cfa: '',
      date_premier_rdv: '',
      commentaire: '',
      date_cible_prochain_rdv: '',
    },
  });
  const { fields, append, remove } = useFieldArray({
    control,
    name: 'contacts',
  });
  const adr = useFieldArray({ control, name: 'adresses' });
  // useWatch (et non watch()) : compatible React Compiler (watch() n'est pas mémoïsable).
  const adresses = useWatch({ control, name: 'adresses' });
  const setZone = (i: number, z: Zone) => {
    setValue(`adresses.${i}.ville`, z.ville ?? '');
    setValue(`adresses.${i}.departement`, z.departement ?? '');
    setValue(`adresses.${i}.region`, z.region ?? '');
  };

  const onSubmit = (values: OpportuniteCompleteParsed) =>
    start(async () => {
      try {
        // datetime-local -> ISO côté client (fuseau navigateur), comme rdv-form.
        const payload = {
          ...values,
          date_premier_rdv: values.date_premier_rdv
            ? new Date(values.date_premier_rdv).toISOString()
            : '',
        } as OpportuniteCompleteInput;
        const res = await createOpportuniteComplete(payload);
        if (!res.ok) {
          // res.error = message neutre pour tous, cause technique réelle pour le
          // propriétaire (cf. createOpportuniteComplete). Ne pas fermer le formulaire.
          toast.error(res.error);
          return;
        }
        toast.success('Opportunité créée');
        reset();
        setOpen(false);
        // createOpportuniteComplete revalide /pipeline (route courante) : refresh redondant.
      } catch {
        // Échec réseau / erreur inattendue avant la réponse de l'action.
        toast.error('Erreur lors de la création');
      }
    });

  const contactsError =
    errors.contacts?.message ?? errors.contacts?.root?.message ?? undefined;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger as React.ReactElement} />
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nouvelle opportunité</DialogTitle>
          <DialogDescription className="sr-only">
            Société, contact(s), recrutement et 1er rendez-vous.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          {/* Société */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold tracking-tight">Société</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="oc-societe">Nom de la société *</Label>
                <Input id="oc-societe" {...register('societe_nom')} />
                {errors.societe_nom && (
                  <p className="text-destructive text-sm">
                    {errors.societe_nom.message}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="oc-collab">Nombre de collaborateurs</Label>
                <Input
                  id="oc-collab"
                  type="number"
                  min="0"
                  {...register('nombre_collaborateurs')}
                />
              </div>
            </div>
          </section>

          {/* Contacts */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold tracking-tight">
                Contact(s)
              </h3>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => append({ ...emptyContact })}
              >
                <Plus className="mr-1 h-4 w-4" />
                Ajouter
              </Button>
            </div>
            {fields.map((f, i) => (
              <div
                key={f.id}
                className="border-border space-y-2 rounded-lg border p-3"
              >
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground text-xs">
                    {i === 0 ? 'Contact principal' : `Contact ${i + 1}`}
                  </span>
                  {fields.length > 1 && (
                    <button
                      type="button"
                      onClick={() => remove(i)}
                      className="text-muted-foreground hover:text-destructive"
                      aria-label="Retirer ce contact"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    placeholder="Prénom"
                    aria-label={`Prénom du contact ${i + 1}`}
                    {...register(`contacts.${i}.prenom`)}
                  />
                  <Input
                    placeholder="Nom"
                    aria-label={`Nom du contact ${i + 1}`}
                    {...register(`contacts.${i}.nom`)}
                  />
                  <Input
                    placeholder="Email"
                    type="email"
                    aria-label={`Email du contact ${i + 1}`}
                    {...register(`contacts.${i}.email`)}
                  />
                  <Input
                    placeholder="Téléphone"
                    aria-label={`Téléphone du contact ${i + 1}`}
                    {...register(`contacts.${i}.telephone`)}
                  />
                </div>
              </div>
            ))}
            {contactsError && (
              <p className="text-destructive text-sm">{contactsError}</p>
            )}
          </section>

          {/* Établissements / adresses (facultatif) - zones géographiques */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold tracking-tight">
                Établissements / zones
              </h3>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => adr.append({ ...emptyAdresse })}
              >
                <Plus className="mr-1 h-4 w-4" />
                Ajouter
              </Button>
            </div>
            {adr.fields.length === 0 && (
              <p className="text-muted-foreground text-xs">
                Facultatif. Ajoutez un ou plusieurs établissements (plusieurs
                restaurants, plusieurs villes).
              </p>
            )}
            {adr.fields.map((f, i) => (
              <div
                key={f.id}
                className="border-border space-y-2 rounded-lg border p-3"
              >
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground text-xs">
                    {i === 0
                      ? 'Établissement principal'
                      : `Établissement ${i + 1}`}
                  </span>
                  <button
                    type="button"
                    onClick={() => adr.remove(i)}
                    className="text-muted-foreground hover:text-destructive"
                    aria-label="Retirer cet établissement"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <Input
                  placeholder="Libellé (ex. McDo République) - facultatif"
                  aria-label={`Libellé de l'établissement ${i + 1}`}
                  {...register(`adresses.${i}.libelle`)}
                />
                <ZoneCombobox
                  value={{
                    ville: adresses?.[i]?.ville || null,
                    departement: adresses?.[i]?.departement || null,
                    region: adresses?.[i]?.region || null,
                  }}
                  onChange={(z) => setZone(i, z)}
                />
              </div>
            ))}
          </section>

          {/* Recrutement */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold tracking-tight">
              Recrutement
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="oc-app">
                  Nombre d&apos;apprentis potentiels
                </Label>
                <Input
                  id="oc-app"
                  type="number"
                  min="0"
                  {...register('nb_alternants')}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="oc-cfa">CFA actuel (facultatif)</Label>
                <Input id="oc-cfa" {...register('cfa')} />
              </div>
            </div>
          </section>

          {/* RDV + commentaire */}
          <section className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="oc-rdv">Date du 1er RDV</Label>
                <Input
                  id="oc-rdv"
                  type="datetime-local"
                  {...register('date_premier_rdv')}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="oc-next">Date cible prochain RDV</Label>
                <Input
                  id="oc-next"
                  type="date"
                  {...register('date_cible_prochain_rdv')}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="oc-comment">Commentaire</Label>
              <Textarea id="oc-comment" rows={2} {...register('commentaire')} />
            </div>
          </section>

          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? '…' : "Créer l'opportunité"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
