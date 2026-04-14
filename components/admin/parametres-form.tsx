'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import {
  Building2,
  FileText,
  Tag,
  Clock,
  Calendar,
  Link,
  ChevronDown,
  ChevronRight,
  Loader2,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { StatusBadge } from '@/components/shared/status-badge';
import { createClient } from '@/lib/supabase/client';
import { formatDate } from '@/lib/utils/formatters';
import { triggerOdooSync } from '@/lib/actions/sync';

interface ParametresFormProps {
  entreprise: Record<string, string>;
  facturation: Record<string, string>;
  typologies: { id: string; code: string; libelle: string; actif: boolean }[];
  axes: {
    id: string;
    code: string;
    libelle: string;
    couleur: string | null;
    ordre: number;
  }[];
  joursFeries: { id: string; date: string; libelle: string }[];
}

function SectionCard({
  icon: Icon,
  title,
  children,
  defaultOpen = true,
  muted = false,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  muted?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Card className={muted ? 'opacity-60' : undefined}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full cursor-pointer items-center gap-2 px-4 text-left"
      >
        {open ? (
          <ChevronDown className="text-muted-foreground h-4 w-4 shrink-0" />
        ) : (
          <ChevronRight className="text-muted-foreground h-4 w-4 shrink-0" />
        )}
        <Icon className="h-4 w-4 shrink-0" />
        <span className="text-sm font-semibold">{title}</span>
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </Card>
  );
}

export function ParametresForm({
  entreprise: initialEntreprise,
  facturation: initialFacturation,
  typologies,
  axes,
  joursFeries,
}: ParametresFormProps) {
  const [entreprise, setEntreprise] = useState(initialEntreprise);
  const [facturation, setFacturation] = useState(initialFacturation);
  const [saving, setSaving] = useState(false);
  const [syncPending, startSyncTransition] = useTransition();
  const [syncResult, setSyncResult] = useState<{
    pushed: number;
    pulled: number;
    errors: string[];
  } | null>(null);

  const saveParams = async (
    categorie: string,
    values: Record<string, string>,
  ) => {
    setSaving(true);
    try {
      const supabase = createClient();
      const updates = Object.entries(values).map(([key, valeur]) => ({
        cle: `${categorie}.${key}`,
        valeur,
      }));

      for (const update of updates) {
        const { error } = await supabase
          .from('parametres')
          .update({ valeur: update.valeur })
          .eq('cle', update.cle);
        if (error) throw error;
      }

      toast.success(
        `Paramètres ${categorie === 'entreprise' ? 'entreprise' : 'facturation'} sauvegardés`,
      );
    } catch {
      toast.error('Erreur lors de la sauvegarde');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Section 1: Entreprise */}
      <SectionCard icon={Building2} title="Entreprise">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="raison_sociale">Raison sociale</Label>
            <Input
              id="raison_sociale"
              value={entreprise.raison_sociale ?? ''}
              onChange={(e) =>
                setEntreprise((s) => ({
                  ...s,
                  raison_sociale: e.target.value,
                }))
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="adresse">Adresse</Label>
            <Input
              id="adresse"
              value={entreprise.adresse ?? ''}
              onChange={(e) =>
                setEntreprise((s) => ({ ...s, adresse: e.target.value }))
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="siret">SIRET</Label>
            <Input
              id="siret"
              value={entreprise.siret ?? ''}
              className="font-mono"
              onChange={(e) =>
                setEntreprise((s) => ({ ...s, siret: e.target.value }))
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tva_intra">TVA intracommunautaire</Label>
            <Input
              id="tva_intra"
              value={entreprise.tva_intracommunautaire ?? ''}
              className="font-mono"
              onChange={(e) =>
                setEntreprise((s) => ({
                  ...s,
                  tva_intracommunautaire: e.target.value,
                }))
              }
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="email_contact">Email de contact</Label>
            <Input
              id="email_contact"
              type="email"
              value={entreprise.email ?? ''}
              onChange={(e) =>
                setEntreprise((s) => ({ ...s, email: e.target.value }))
              }
            />
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <Button
            onClick={() => saveParams('entreprise', entreprise)}
            disabled={saving}
          >
            {saving ? 'Enregistrement...' : 'Enregistrer'}
          </Button>
        </div>
      </SectionCard>

      {/* Section 2: Facturation */}
      <SectionCard icon={FileText} title="Facturation">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="taux_tva">Taux TVA (%)</Label>
            <Input
              id="taux_tva"
              type="number"
              value={facturation.taux_tva ?? '20'}
              onChange={(e) =>
                setFacturation((s) => ({ ...s, taux_tva: e.target.value }))
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fenetre_debut">
              Fenêtre de facturation (début)
            </Label>
            <Input
              id="fenetre_debut"
              type="number"
              value={facturation.fenetre_debut ?? '25'}
              onChange={(e) =>
                setFacturation((s) => ({
                  ...s,
                  fenetre_debut: e.target.value,
                }))
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fenetre_fin">Fenêtre de facturation (fin)</Label>
            <Input
              id="fenetre_fin"
              type="number"
              value={facturation.fenetre_fin ?? '3'}
              onChange={(e) =>
                setFacturation((s) => ({
                  ...s,
                  fenetre_fin: e.target.value,
                }))
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="delai_echeance">Délai échéance (jours)</Label>
            <Input
              id="delai_echeance"
              type="number"
              value={facturation.delai_echeance ?? '30'}
              onChange={(e) =>
                setFacturation((s) => ({
                  ...s,
                  delai_echeance: e.target.value,
                }))
              }
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="mentions_legales">Mentions légales</Label>
            <Textarea
              id="mentions_legales"
              rows={4}
              value={facturation.mentions_legales ?? ''}
              onChange={(e) =>
                setFacturation((s) => ({
                  ...s,
                  mentions_legales: e.target.value,
                }))
              }
            />
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <Button
            onClick={() => saveParams('facturation', facturation)}
            disabled={saving}
          >
            {saving ? 'Enregistrement...' : 'Enregistrer'}
          </Button>
        </div>
      </SectionCard>

      {/* Section 3: Typologies de projet */}
      <SectionCard icon={Tag} title="Typologies de projet">
        <div className="border-border overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Libellé</TableHead>
                <TableHead>Statut</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {typologies.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-mono text-sm font-medium">
                    {t.code}
                  </TableCell>
                  <TableCell className="text-sm">{t.libelle}</TableCell>
                  <TableCell>
                    <StatusBadge
                      label={t.actif ? 'Actif' : 'Inactif'}
                      color={t.actif ? 'green' : 'gray'}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </SectionCard>

      {/* Section 4: Axes de temps */}
      <SectionCard icon={Clock} title="Axes de temps">
        <div className="border-border overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Libellé</TableHead>
                <TableHead>Couleur</TableHead>
                <TableHead>Ordre</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {axes.map((axe) => (
                <TableRow key={axe.id}>
                  <TableCell className="font-mono text-sm font-medium">
                    {axe.code}
                  </TableCell>
                  <TableCell className="text-sm">
                    <span className="flex items-center gap-2">
                      <span
                        className="inline-block h-3 w-3 shrink-0 rounded-full"
                        style={{ backgroundColor: axe.couleur ?? '#888' }}
                      />
                      {axe.libelle}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground font-mono text-xs">
                    {axe.couleur}
                  </TableCell>
                  <TableCell className="text-sm tabular-nums">
                    {axe.ordre}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </SectionCard>

      {/* Section 5: Jours fériés */}
      <SectionCard icon={Calendar} title="Jours fériés 2026">
        <div className="grid gap-x-8 gap-y-1.5 sm:grid-cols-2">
          {joursFeries.map((jour) => (
            <div key={jour.id} className="flex items-center gap-3 py-1">
              <span className="w-20 shrink-0 font-mono text-sm font-medium">
                {formatDate(jour.date)}
              </span>
              <span className="text-muted-foreground text-sm">—</span>
              <span className="text-sm">{jour.libelle}</span>
            </div>
          ))}
        </div>
      </SectionCard>

      {/* Section 6: Intégration Odoo */}
      <SectionCard icon={Link} title="Odoo">
        <div className="space-y-3">
          <p className="text-muted-foreground text-sm">
            Synchronisation Odoo : pousse les factures vers Odoo et tire les
            paiements. Mode stub actif (remplacer par l&apos;API XML-RPC quand
            Odoo sera en production).
          </p>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              disabled={syncPending}
              onClick={() => {
                startSyncTransition(async () => {
                  setSyncResult(null);
                  const res = await triggerOdooSync();
                  if (res.success && res.results) {
                    setSyncResult(res.results);
                    toast.success(
                      `Sync Odoo : ${res.results.pushed} poussee(s), ${res.results.pulled} tiree(s)`,
                    );
                  } else {
                    toast.error(res.error ?? 'Echec de la synchronisation');
                  }
                });
              }}
            >
              {syncPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Synchronisation...
                </>
              ) : (
                'Lancer la synchronisation'
              )}
            </Button>
          </div>
          {syncResult && (
            <div className="bg-muted rounded-md px-3 py-2 text-sm">
              <div className="flex items-center gap-2">
                {syncResult.errors.length === 0 ? (
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                ) : (
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                )}
                <span className="font-medium">
                  {syncResult.pushed} facture(s) poussee(s) &middot;{' '}
                  {syncResult.pulled} paiement(s) tire(s)
                </span>
              </div>
              {syncResult.errors.length > 0 && (
                <ul className="text-destructive mt-1 list-inside list-disc text-xs">
                  {syncResult.errors.map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </SectionCard>
    </div>
  );
}
