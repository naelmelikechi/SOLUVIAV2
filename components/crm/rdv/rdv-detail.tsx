'use client';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { runWithToast } from '@/components/crm/shared/run-with-toast';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/crm/ui/sheet';
import { Button } from '@/components/crm/ui/button';
import { Badge } from '@/components/crm/ui/badge';
import { Textarea } from '@/components/crm/ui/textarea';
import { Label } from '@/components/crm/ui/label';
import { updateRdvCompteRendu } from '@/lib/crm/actions/rdv';
import { label, statutRdvLabel } from '@/lib/crm/labels';

type Commercial = {
  user: { id: string; prenom: string | null; nom: string | null } | null;
};
type RdvDetailData = {
  id: string;
  titre: string;
  lieu: string | null;
  statut: string;
  notes_prep: string | null;
  compte_rendu: string | null;
  commerciaux?: Commercial[];
};

export function RdvDetail({ rdv }: { rdv: RdvDetailData }) {
  const router = useRouter();
  const [cr, setCr] = useState(rdv.compte_rendu ?? '');
  const [pending, start] = useTransition();
  const close = () => router.push('/crm/rdv');
  const statut: 'planifie' | 'realise' | 'annule' =
    rdv.statut === 'realise' || rdv.statut === 'annule'
      ? rdv.statut
      : 'planifie';
  return (
    <Sheet
      open
      onOpenChange={(o) => {
        if (!o) close();
      }}
    >
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="text-lg font-semibold tracking-tight">
            {rdv.titre}
          </SheetTitle>
          <SheetDescription className="sr-only">
            Détail du rendez-vous.
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-4 px-4 pb-6 text-sm">
          <p className="text-muted-foreground">
            {rdv.lieu ?? '-'} · {label(statutRdvLabel, rdv.statut)}
          </p>
          {rdv.commerciaux && rdv.commerciaux.length > 0 && (
            <div className="space-y-1.5">
              <Label>Commerciaux</Label>
              <div className="flex flex-wrap gap-1.5">
                {rdv.commerciaux.map((c) => (
                  <Badge key={c.user?.id} variant="secondary">
                    {[c.user?.prenom, c.user?.nom].filter(Boolean).join(' ') ||
                      '-'}
                  </Badge>
                ))}
              </div>
            </div>
          )}
          <div className="space-y-2">
            <Label>Notes de préparation</Label>
            <p className="bg-secondary/40 rounded-lg p-3">
              {rdv.notes_prep ?? '-'}
            </p>
          </div>
          <div className="space-y-2">
            <Label>Compte-rendu</Label>
            <Textarea
              value={cr}
              onChange={(e) => setCr(e.target.value)}
              rows={6}
            />
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={pending}
              onClick={() =>
                start(() =>
                  // updateRdvCompteRendu revalide /rdv (route courante)
                  runWithToast(
                    () => updateRdvCompteRendu(rdv.id, cr, 'realise'),
                    {
                      success: 'RDV réalisé',
                      error: 'Enregistrement impossible',
                    },
                  ),
                )
              }
            >
              Marquer réalisé
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() =>
                start(() =>
                  runWithToast(() => updateRdvCompteRendu(rdv.id, cr, statut), {
                    success: 'Enregistré',
                    error: 'Enregistrement impossible',
                  }),
                )
              }
            >
              Enregistrer
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
