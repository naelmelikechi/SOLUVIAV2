'use client';
import * as React from 'react';
import { useState, useTransition } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { z } from 'zod';
import { runWithToast } from '@/components/crm/shared/run-with-toast';
import { relanceSchema, type RelanceInput } from '@/lib/crm/validators/relance';
import { createRelance } from '@/lib/crm/actions/relances';
import {
  EntityCombobox,
  type Option,
} from '@/components/crm/shared/entity-combobox';
import { Button } from '@/components/crm/ui/button';
import { Input } from '@/components/crm/ui/input';
import { Label } from '@/components/crm/ui/label';
import { Textarea } from '@/components/crm/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/crm/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/crm/ui/dialog';
import { prioriteItems } from '@/lib/crm/labels';

export function RelanceForm({
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
  } = useForm<z.input<typeof relanceSchema>, unknown, RelanceInput>({
    resolver: zodResolver(relanceSchema),
    defaultValues: {
      titre: '',
      date_echeance: '',
      priorite: 'normale',
      compte_id: compteId,
      opportunite_id: opportuniteId,
      assignee_id: null,
    },
  });
  const onSubmit = (values: RelanceInput) =>
    start(() =>
      // createRelance revalide /relances (et /pipeline si liée) : pas de router.refresh().
      runWithToast(() => createRelance(values), {
        success: 'Relance créée',
        error: 'Erreur lors de la création',
        onSuccess: () => {
          setOpen(false);
          reset();
        },
      }),
    );
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger as React.ReactElement} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nouvelle relance</DialogTitle>
          <DialogDescription className="sr-only">
            Formulaire de création d&apos;une relance.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="relance-titre">Titre *</Label>
            <Input
              id="relance-titre"
              autoFocus
              {...register('titre')}
              placeholder="Ex. Rappeler pour le devis"
            />
            {errors.titre && (
              <p className="text-destructive text-sm">{errors.titre.message}</p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="relance-echeance">Échéance *</Label>
              <Input
                id="relance-echeance"
                type="date"
                {...register('date_echeance')}
              />
              {errors.date_echeance && (
                <p className="text-destructive text-sm">
                  {errors.date_echeance.message}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Priorité</Label>
              <Controller
                control={control}
                name="priorite"
                render={({ field }) => (
                  <Select
                    items={prioriteItems}
                    value={field.value ?? 'normale'}
                    onValueChange={(v) => {
                      if (typeof v !== 'string') return;
                      field.onChange(v);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {prioriteItems.map((p) => (
                        <SelectItem key={p.value} value={p.value}>
                          {p.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </div>
          {commerciaux.length > 0 && (
            <div className="space-y-2">
              <Label>Assigné à</Label>
              <Controller
                control={control}
                name="assignee_id"
                render={({ field }) => (
                  <EntityCombobox
                    options={commerciaux}
                    value={field.value ?? null}
                    onChange={(v) => field.onChange(v)}
                    placeholder="Par défaut : vous"
                  />
                )}
              />
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
            <Label htmlFor="relance-note">Note</Label>
            <Textarea id="relance-note" rows={2} {...register('note')} />
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
