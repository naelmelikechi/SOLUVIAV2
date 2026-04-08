'use client';

import { useState } from 'react';
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
} from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
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
import { AXES_TEMPS } from '@/lib/utils/constants';

// --- Data ---

const TYPOLOGIES = [
  { code: 'APP', libelle: 'Apprentissage', actif: true },
  { code: 'POE', libelle: 'POEI', actif: true },
  {
    code: 'PDC',
    libelle: 'Plan de Développement des Compétences',
    actif: true,
  },
  { code: 'ABS', libelle: 'Absence', actif: true },
] as const;

const JOURS_FERIES_2026 = [
  { date: '01/01', libelle: 'Jour de l\u2019An' },
  { date: '06/04', libelle: 'Lundi de Pâques' },
  { date: '01/05', libelle: 'Fête du Travail' },
  { date: '08/05', libelle: 'Victoire 1945' },
  { date: '14/05', libelle: 'Ascension' },
  { date: '25/05', libelle: 'Lundi de Pentecôte' },
  { date: '14/07', libelle: 'Fête Nationale' },
  { date: '15/08', libelle: 'Assomption' },
  { date: '01/11', libelle: 'Toussaint' },
  { date: '11/11', libelle: 'Armistice' },
  { date: '25/12', libelle: 'Noël' },
] as const;

const MENTIONS_LEGALES_DEFAUT =
  'Conditions de paiement : 30 jours fin de mois. En cas de retard de paiement, une pénalité de 3 fois le taux d\u2019intérêt légal sera appliquée, ainsi qu\u2019une indemnité forfaitaire de 40 \u20AC pour frais de recouvrement. Pas d\u2019escompte pour paiement anticipé.';

// --- Collapsible section ---

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

// --- Page ---

export default function ParametresPage() {
  // Entreprise state
  const [entreprise, setEntreprise] = useState({
    raison_sociale: 'SOLUVIA SAS',
    adresse: '15 Rue de la Formation, 75008 Paris',
    siret: '891 234 567 00015',
    tva_intra: 'FR89 891 234 567',
    email: 'contact@soluvia.fr',
  });

  // Facturation state
  const [facturation, setFacturation] = useState({
    taux_tva: '20',
    fenetre_debut: '25',
    fenetre_fin: '3',
    delai_echeance: '30',
    mentions_legales: MENTIONS_LEGALES_DEFAUT,
  });

  return (
    <div>
      <PageHeader
        title="Paramètres"
        description="Configuration du système — Admin uniquement"
      />

      <div className="space-y-4">
        {/* Section 1: Entreprise */}
        <SectionCard icon={Building2} title="Entreprise">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="raison_sociale">Raison sociale</Label>
              <Input
                id="raison_sociale"
                value={entreprise.raison_sociale}
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
                value={entreprise.adresse}
                onChange={(e) =>
                  setEntreprise((s) => ({ ...s, adresse: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="siret">SIRET</Label>
              <Input
                id="siret"
                value={entreprise.siret}
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
                value={entreprise.tva_intra}
                className="font-mono"
                onChange={(e) =>
                  setEntreprise((s) => ({ ...s, tva_intra: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="email_contact">Email de contact</Label>
              <Input
                id="email_contact"
                type="email"
                value={entreprise.email}
                onChange={(e) =>
                  setEntreprise((s) => ({ ...s, email: e.target.value }))
                }
              />
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <Button
              onClick={() => toast.success('Paramètres entreprise sauvegardés')}
            >
              Enregistrer
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
                value={facturation.taux_tva}
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
                value={facturation.fenetre_debut}
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
                value={facturation.fenetre_fin}
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
                value={facturation.delai_echeance}
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
                value={facturation.mentions_legales}
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
              onClick={() =>
                toast.success('Paramètres facturation sauvegardés')
              }
            >
              Enregistrer
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
                {TYPOLOGIES.map((t) => (
                  <TableRow key={t.code}>
                    <TableCell className="font-mono text-sm font-medium">
                      {t.code}
                    </TableCell>
                    <TableCell className="text-sm">{t.libelle}</TableCell>
                    <TableCell>
                      <StatusBadge label="Actif" color="green" />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <p className="text-muted-foreground mt-3 text-xs">
            Gestion via Supabase
          </p>
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
                {AXES_TEMPS.map((axe, idx) => (
                  <TableRow key={axe.code}>
                    <TableCell className="font-mono text-sm font-medium">
                      {axe.code}
                    </TableCell>
                    <TableCell className="text-sm">
                      <span className="flex items-center gap-2">
                        <span
                          className="inline-block h-3 w-3 shrink-0 rounded-full"
                          style={{ backgroundColor: axe.color }}
                        />
                        {axe.label}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground font-mono text-xs">
                      {axe.color}
                    </TableCell>
                    <TableCell className="text-sm tabular-nums">
                      {idx + 1}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </SectionCard>

        {/* Section 5: Jours fériés 2026 */}
        <SectionCard icon={Calendar} title="Jours fériés 2026">
          <div className="grid gap-x-8 gap-y-1.5 sm:grid-cols-2">
            {JOURS_FERIES_2026.map((jour) => (
              <div key={jour.date} className="flex items-center gap-3 py-1">
                <span className="w-12 shrink-0 font-mono text-sm font-medium">
                  {jour.date}
                </span>
                <span className="text-muted-foreground text-sm">—</span>
                <span className="text-sm">{jour.libelle}</span>
              </div>
            ))}
          </div>
        </SectionCard>

        {/* Section 6: Intégration Odoo */}
        <SectionCard icon={Link} title="Odoo" muted>
          <p className="text-muted-foreground text-sm">
            Intégration Odoo non configurée. Sera disponible quand Odoo sera en
            production.
          </p>
        </SectionCard>
      </div>
    </div>
  );
}
