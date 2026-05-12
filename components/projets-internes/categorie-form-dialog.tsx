'use client';

import { useState, useTransition } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import {
  createCategorieInterneAction,
  updateCategorieInterneAction,
} from '@/app/(dashboard)/projets/internes/actions';
import type { CategorieInterne } from '@/lib/queries/projets-internes';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  categorie?: CategorieInterne;
}

export function CategorieFormDialog({ open, onOpenChange, categorie }: Props) {
  const isEdit = !!categorie;
  const [code, setCode] = useState(categorie?.code ?? '');
  const [libelle, setLibelle] = useState(categorie?.libelle ?? '');
  const [ordre, setOrdre] = useState(String(categorie?.ordre ?? 0));
  const [pending, startTransition] = useTransition();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      const result = isEdit
        ? await updateCategorieInterneAction(categorie.id, {
            libelle,
            ordre: parseInt(ordre, 10) || 0,
          })
        : await createCategorieInterneAction({
            code,
            libelle,
            ordre: parseInt(ordre, 10) || 0,
          });

      if (!result.success) {
        toast.error(result.error);
        return;
      }

      toast.success(isEdit ? 'Catégorie mise à jour' : 'Catégorie créée');
      onOpenChange(false);
      // Reset form for next open
      if (!isEdit) {
        setCode('');
        setLibelle('');
        setOrdre('0');
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEdit ? 'Modifier la catégorie' : 'Nouvelle catégorie interne'}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="cat-code">Code</Label>
            <Input
              id="cat-code"
              value={code}
              onChange={(e) =>
                setCode(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))
              }
              placeholder="ex: r_et_d, support_transverse"
              disabled={isEdit}
              required
            />
            {isEdit && (
              <p className="text-muted-foreground mt-1 text-xs">
                Le code est immutable (préserve l&apos;historique des stats).
              </p>
            )}
          </div>
          <div>
            <Label htmlFor="cat-libelle">Libellé</Label>
            <Input
              id="cat-libelle"
              value={libelle}
              onChange={(e) => setLibelle(e.target.value)}
              placeholder="ex: Recherche et développement"
              required
            />
          </div>
          <div>
            <Label htmlFor="cat-ordre">Ordre d&apos;affichage</Label>
            <Input
              id="cat-ordre"
              type="number"
              value={ordre}
              onChange={(e) => setOrdre(e.target.value)}
              min={0}
              max={999}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              Annuler
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? 'Enregistrement...' : isEdit ? 'Enregistrer' : 'Créer'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
