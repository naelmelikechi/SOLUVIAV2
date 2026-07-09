'use client';
import * as React from 'react';
import { useState, useTransition } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { z } from 'zod';
import { runWithToast } from '@/components/crm/shared/run-with-toast';
import { rdvSchema, type RdvInput } from '@/lib/crm/validators/rdv';
import { createRdv } from '@/lib/crm/actions/rdv';
import {
  EntityCombobox,
  type Option,
} from '@/components/crm/shared/entity-combobox';
import { MultiCombobox } from '@/components/crm/shared/multi-combobox';
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

export function RdvForm({
  trigger,
  comptes = [],
  commerciaux = [],
  opportuniteId = null,
  compteId = null,
}: {
  trigger: React.ReactNode;
  comptes?: Option[];
  commerciaux?: Option[];
  opportuniteId?: string | null;
  compteId?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const scoped = Boolean(opportuniteId);
  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<z.input<typeof rdvSchema>, unknown, RdvInput>({
    resolver: zodResolver(rdvSchema),
    defaultValues: {
      titre: '',
      debut: '',
      fin: '',
      lieu: '',
      compte_id: compteId,
      opportunite_id: opportuniteId,
      commerciaux: [],
    },
  });
  const onSubmit = (values: RdvInput) =>
    start(() =>
      // createRdv revalide /rdv (et /pipeline si liée) : pas de router.refresh().
      // Les inputs datetime-local sont en heure locale ; on les convertit en ISO/UTC.
      runWithToast(
        () =>
          createRdv({
            ...values,
            debut: new Date(values.debut).toISOString(),
            fin: new Date(values.fin).toISOString(),
          }),
        {
          success: 'RDV créé',
          error: 'Erreur lors de la création',
          onSuccess: () => {
            setOpen(false);
            reset();
          },
        },
      ),
    );
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger as React.ReactElement} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nouveau RDV</DialogTitle>
          <DialogDescription className="sr-only">
            Formulaire de création d&apos;un rendez-vous.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="rdv-titre">Titre *</Label>
            <Input
              id="rdv-titre"
              autoFocus
              {...register('titre')}
              placeholder="Ex. RDV découverte"
            />
            {errors.titre && (
              <p className="text-destructive text-sm">{errors.titre.message}</p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="rdv-debut">Début *</Label>
              <Input
                id="rdv-debut"
                type="datetime-local"
                {...register('debut')}
              />
              {errors.debut && (
                <p className="text-destructive text-sm">
                  {errors.debut.message}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="rdv-fin">Fin *</Label>
              <Input id="rdv-fin" type="datetime-local" {...register('fin')} />
              {errors.fin && (
                <p className="text-destructive text-sm">{errors.fin.message}</p>
              )}
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="rdv-lieu">Lieu / visio</Label>
            <Input id="rdv-lieu" {...register('lieu')} />
          </div>
          {commerciaux.length > 0 && (
            <div className="space-y-2">
              <Label>Commerciaux</Label>
              <Controller
                control={control}
                name="commerciaux"
                render={({ field }) => (
                  <MultiCombobox
                    options={commerciaux}
                    value={field.value ?? []}
                    onChange={field.onChange}
                    placeholder="Assigner un ou plusieurs commerciaux"
                  />
                )}
              />
              <p className="text-muted-foreground text-xs">
                Vide = vous serez assigné par défaut.
              </p>
            </div>
          )}
          {!scoped && (
            <div className="space-y-2">
              <Label>Compte (optionnel)</Label>
              <Controller
                control={control}
                name="compte_id"
                render={({ field }) => (
                  <EntityCombobox
                    options={comptes}
                    value={field.value ?? null}
                    onChange={(v) => field.onChange(v)}
                    placeholder="Lier à un compte"
                  />
                )}
              />
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="rdv-notes">Notes de préparation</Label>
            <Textarea id="rdv-notes" {...register('notes_prep')} />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? '…' : 'Créer'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
