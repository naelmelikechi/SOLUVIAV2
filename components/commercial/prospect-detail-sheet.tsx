'use client';

import { useEffect, useState, useTransition } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { StatusBadge } from '@/components/shared/status-badge';
import {
  Building2,
  Mail,
  Phone,
  Globe,
  MapPin,
  UserCheck,
  Loader2,
  CheckCircle,
  Link as LinkIcon,
} from 'lucide-react';
import Link from 'next/link';
import {
  STAGE_PROSPECT_LABELS,
  STAGE_PROSPECT_COLORS,
  TYPE_PROSPECT_LABELS,
} from '@/lib/utils/constants';
import {
  updateProspectAssignment,
  convertProspectToClient,
} from '@/lib/actions/prospects';
import { toast } from 'sonner';
import { ProspectNotesSection } from './prospect-notes-section';
import { ProspectRdvSection } from './prospect-rdv-section';
import type {
  ProspectWithCommercial,
  ProspectNote,
} from '@/lib/queries/prospects';
import type { RdvCommercialWithRefs } from '@/lib/queries/rdv';

interface Commercial {
  id: string;
  nom: string;
  prenom: string;
}

interface ProspectDetailSheetProps {
  prospect: ProspectWithCommercial | null;
  notes: ProspectNote[];
  rdvs: RdvCommercialWithRefs[];
  commerciaux: Commercial[];
  onOpenChange: (open: boolean) => void;
  isAdminUser: boolean;
  convertedClient?: { id: string; raison_sociale: string } | null;
  onNotesReload?: () => void;
}

export function ProspectDetailSheet({
  prospect,
  notes,
  rdvs,
  commerciaux,
  onOpenChange,
  isAdminUser,
  convertedClient,
}: ProspectDetailSheetProps) {
  const [selectedCommercial, setSelectedCommercial] = useState<string>('none');
  const [isPending, startTransition] = useTransition();
  const [converting, setConverting] = useState(false);

  useEffect(() => {
    setSelectedCommercial(prospect?.commercial_id ?? 'none');
  }, [prospect?.id, prospect?.commercial_id]);

  if (!prospect) {
    return (
      <Sheet open={false} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="hidden" />
      </Sheet>
    );
  }

  function handleCommercialChange(value: string | null) {
    if (!prospect) return;
    const normalized = value ?? 'none';
    setSelectedCommercial(normalized);
    const commercialId = normalized === 'none' ? null : normalized;

    startTransition(async () => {
      const result = await updateProspectAssignment(prospect.id, commercialId);
      if (result.success) {
        toast.success('Commercial assigné');
      } else {
        toast.error(result.error ?? 'Erreur');
      }
    });
  }

  async function handleConvert() {
    if (!prospect) return;
    setConverting(true);
    try {
      const result = await convertProspectToClient(prospect.id);
      if (result.success) {
        toast.success('Prospect converti en client');
      } else {
        toast.error(result.error ?? 'Erreur lors de la conversion');
      }
    } finally {
      setConverting(false);
    }
  }

  return (
    <Sheet open={prospect !== null} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex !w-[min(680px,95vw)] flex-col gap-0 overflow-y-auto p-0 data-[side=right]:sm:max-w-[min(680px,95vw)]"
      >
        <SheetHeader className="border-border from-primary/[0.03] border-b bg-gradient-to-b to-transparent p-5">
          <div className="flex items-start gap-3">
            <div className="bg-primary/10 text-primary flex h-9 w-9 shrink-0 items-center justify-center rounded-md">
              <Building2 className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <SheetTitle className="text-left text-base leading-tight">
                {prospect.nom}
              </SheetTitle>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <StatusBadge
                  label={STAGE_PROSPECT_LABELS[prospect.stage]}
                  color={STAGE_PROSPECT_COLORS[prospect.stage]}
                />
                <StatusBadge
                  label={TYPE_PROSPECT_LABELS[prospect.type_prospect]}
                  color="gray"
                />
                {prospect.client_id && convertedClient && (
                  <Link
                    href={`/admin/clients/${prospect.client_id}`}
                    className="text-primary inline-flex items-center gap-1 text-xs hover:underline"
                  >
                    <LinkIcon className="h-3 w-3" />
                    {convertedClient.raison_sociale}
                  </Link>
                )}
              </div>
            </div>
          </div>
        </SheetHeader>

        <div className="flex-1 space-y-6 p-5">
          {/* Key metric tile */}
          {prospect.volume_apprenants !== null && (
            <div className="bg-primary/5 border-primary/15 rounded-lg border p-4">
              <div className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">
                {prospect.type_prospect === 'cfa'
                  ? 'Apprentis potentiels'
                  : 'Salariés'}
              </div>
              <div className="text-primary mt-1 text-3xl font-semibold tabular-nums">
                {prospect.volume_apprenants.toLocaleString('fr-FR')}
              </div>
            </div>
          )}

          {/* Infos grid */}
          <section>
            <h4 className="text-muted-foreground mb-3 text-[11px] font-semibold tracking-wider uppercase">
              Informations
            </h4>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              {prospect.region && (
                <InfoRow icon={MapPin} label="Région" value={prospect.region} />
              )}
              {prospect.siret && (
                <InfoRow
                  icon={Building2}
                  label="SIRET"
                  value={prospect.siret}
                />
              )}
              {prospect.dirigeant_nom && (
                <InfoRow
                  icon={UserCheck}
                  label="Dirigeant"
                  value={`${prospect.dirigeant_nom}${
                    prospect.dirigeant_poste
                      ? ` — ${prospect.dirigeant_poste}`
                      : ''
                  }`}
                  wide
                />
              )}
              {prospect.dirigeant_email && (
                <InfoRow
                  icon={Mail}
                  label="Email dirigeant"
                  value={prospect.dirigeant_email}
                  href={`mailto:${prospect.dirigeant_email}`}
                />
              )}
              {prospect.dirigeant_telephone && (
                <InfoRow
                  icon={Phone}
                  label="Tél dirigeant"
                  value={prospect.dirigeant_telephone}
                  href={`tel:${prospect.dirigeant_telephone}`}
                />
              )}
              {prospect.telephone_standard && (
                <InfoRow
                  icon={Phone}
                  label="Tél standard"
                  value={prospect.telephone_standard}
                  href={`tel:${prospect.telephone_standard}`}
                />
              )}
              {prospect.emails_generiques && (
                <InfoRow
                  icon={Mail}
                  label="Emails génériques"
                  value={prospect.emails_generiques}
                  wide
                />
              )}
              {prospect.site_web && (
                <InfoRow
                  icon={Globe}
                  label="Site web"
                  value={prospect.site_web}
                  href={
                    prospect.site_web.startsWith('http')
                      ? prospect.site_web
                      : `https://${prospect.site_web}`
                  }
                  wide
                />
              )}
            </dl>
          </section>

          {/* Assignation */}
          <section>
            <h4 className="text-muted-foreground mb-2 text-xs font-semibold tracking-wider uppercase">
              Commercial assigné
            </h4>
            <Select
              value={selectedCommercial}
              onValueChange={handleCommercialChange}
              disabled={isPending}
            >
              <SelectTrigger>
                <SelectValue placeholder="Non assigné">
                  {(v) => {
                    if (v === 'none' || !v) return 'Non assigné';
                    const c = commerciaux.find((x) => x.id === v);
                    return c ? `${c.prenom} ${c.nom}` : 'Non assigné';
                  }}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none" label="Non assigné">
                  Non assigné
                </SelectItem>
                {commerciaux.map((c) => (
                  <SelectItem
                    key={c.id}
                    value={c.id}
                    label={`${c.prenom} ${c.nom}`}
                  >
                    {c.prenom} {c.nom}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </section>

          {/* Notes import */}
          {prospect.notes_import && (
            <section>
              <h4 className="text-muted-foreground mb-2 text-xs font-semibold tracking-wider uppercase">
                Notes issues de l&apos;import
              </h4>
              <p className="text-muted-foreground bg-muted/40 rounded-md p-3 text-xs whitespace-pre-wrap">
                {prospect.notes_import}
              </p>
            </section>
          )}

          <Separator />

          {/* RDV commerciaux */}
          <ProspectRdvSection prospectId={prospect.id} rdvs={rdvs} />

          <Separator />

          {/* Notes CRM */}
          <ProspectNotesSection prospectId={prospect.id} notes={notes} />

          {/* Conversion */}
          {prospect.stage === 'signe' && !prospect.client_id && isAdminUser && (
            <section className="border-primary/20 bg-primary/[0.03] rounded-lg border p-4">
              <div className="mb-3 flex items-start gap-2">
                <CheckCircle className="text-primary mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <p className="text-sm font-medium">Prêt à être converti</p>
                  <p className="text-muted-foreground mt-0.5 text-xs">
                    Ce prospect est signé. Crée une fiche client avec un
                    trigramme auto-généré — le projet CFA pourra être lancé
                    depuis la page Clients.
                  </p>
                </div>
              </div>
              <Button
                onClick={handleConvert}
                disabled={converting}
                className="w-full"
              >
                {converting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle className="mr-2 h-4 w-4" />
                )}
                {converting ? 'Conversion...' : 'Convertir en client'}
              </Button>
            </section>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function InfoRow({
  icon: Icon,
  label,
  value,
  href,
  wide,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  href?: string;
  wide?: boolean;
}) {
  return (
    <div className={wide ? 'col-span-2' : undefined}>
      <dt className="text-muted-foreground flex items-center gap-1.5 text-[11px]">
        <Icon className="h-3 w-3" />
        {label}
      </dt>
      <dd className="mt-1 text-sm">
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary break-words hover:underline"
          >
            {value}
          </a>
        ) : (
          <span className="break-words">{value}</span>
        )}
      </dd>
    </div>
  );
}
