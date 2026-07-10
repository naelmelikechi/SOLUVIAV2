'use client';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { runWithToast } from '@/components/crm/shared/run-with-toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Pencil, Trash2 } from 'lucide-react';
import { Timeline, type TimelineItem } from '@/components/crm/shared/timeline';
import {
  MentionTextarea,
  type MentionOption,
} from '@/components/crm/shared/mention-textarea';
import { RelanceForm } from '@/components/crm/relances/relance-form';
import { RdvForm } from '@/components/crm/rdv/rdv-form';
import { StageBar } from './stage-bar';
import { OppQuickEdit } from './opp-quick-edit';
import { OppAdresses, type OppAdresse } from './opp-adresses';
import { OppNegociation } from './opp-negociation';
import { OppInsee } from './opp-insee';
import { OppContactRole } from './opp-contact-role';
import { ConfirmButton } from '@/components/crm/shared/confirm-button';
import { addNote } from '@/lib/crm/actions/activites';
import {
  setOpportuniteStatut,
  deleteOpportunite,
} from '@/lib/crm/actions/opportunites';
import { toggleRelance } from '@/lib/crm/actions/relances';
import { formatDateParis, formatDateTimeParis } from '@/lib/utils/formatters';
import { label, statutOppLabel, statutRdvLabel } from '@/lib/crm/labels';
import type { Etape } from './types';

export type OppContact = {
  id: string;
  prenom: string | null;
  nom: string | null;
  email: string | null;
  telephone: string | null;
  principal: boolean;
  role_decision: string | null;
  sensibilites: string | null;
};
export type OppDetail = {
  id: string;
  intitule: string;
  statut: string;
  etape_id: string;
  probabilite: number | null;
  formation_visee: string | null;
  nb_alternants: number | null;
  source: string | null;
  date_cloture_prevue: string | null;
  cfa: string | null;
  date_cible_prochain_rdv: string | null;
  // Négociation / passation (A5)
  perimetre_missions: string | null;
  formations_rncp: string[] | null;
  type_formation: string | null;
  taux_npec: number | null;
  duree_contrat_ans: number | null;
  mois_demarrage: number | null;
  volume_an1: number | null;
  volume_an2: number | null;
  volume_an3: number | null;
  volume_garanti_seuil: number | null;
  leviers: string[] | null;
  canal_origine: string | null;
  date_premier_contact: string | null;
  initiateur: string | null;
  historique_synthese: string | null;
  numero_contrat: string | null;
  type_prospect: string | null;
  compte: {
    id: string;
    nom: string;
    nombre_collaborateurs: number | null;
    // Identité / INSEE (A5)
    siren: string | null;
    siret: string | null;
    forme_juridique: string | null;
    code_naf: string | null;
    naf_libelle: string | null;
    effectif_tranche: string | null;
    nb_implantations: number | null;
    ca_dernier_exercice: number | null;
    insee_verifie: boolean;
    contacts: OppContact[];
    adresses?: OppAdresse[];
  } | null;
  activites: TimelineItem[];
  relances: {
    id: string;
    titre: string;
    date_echeance: string;
    fait: boolean;
  }[];
  rdv: { id: string; titre: string; debut: string; statut: string }[];
};

export function StatutBadge({ statut }: { statut: string }) {
  const cls =
    statut === 'gagnee'
      ? 'bg-success/10 text-success'
      : statut === 'perdue'
        ? 'bg-destructive/10 text-destructive'
        : 'bg-info/10 text-info';
  return (
    <Badge variant="outline" className={cls}>
      {label(statutOppLabel, statut)}
    </Badge>
  );
}

function Row({ term, value }: { term: string; value: string | number }) {
  return (
    <div className="flex items-start justify-between gap-4 px-3 py-2.5">
      <dt className="text-muted-foreground shrink-0">{term}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}

/**
 * Corps du détail d'une opportunité, partagé entre le Sheet du pipeline
 * (compact : aperçu + actions, doctrine "pas de tabs dans un sheet") et la
 * page /crm/pipeline/[id] (fiche complète avec les 4 onglets).
 */
// oxlint-disable-next-line react-doctor/no-giant-component
export function OppDetailBody({
  opp,
  etapes,
  mentionOptions = [],
  canNote = true,
  compact = false,
}: {
  opp: OppDetail;
  etapes: Etape[];
  mentionOptions?: MentionOption[];
  canNote?: boolean;
  compact?: boolean;
}) {
  const router = useRouter();
  const [note, setNote] = useState('');
  const [noteMentions, setNoteMentions] = useState<string[]>([]);
  const [editing, setEditing] = useState(false);
  const [perteOpen, setPerteOpen] = useState(false);
  const [motif, setMotif] = useState('');
  const [pending, start] = useTransition();
  // Les actions serveur revalident /crm/pipeline ; sur la page fiche on
  // rafraîchit aussi la route courante (refresh inoffensif sur le pipeline).
  const refresh = () => router.refresh();
  const confirmPerte = () =>
    start(() =>
      runWithToast(
        () => setOpportuniteStatut(opp.id, 'perdue', motif.trim() || undefined),
        {
          success: 'Opportunité perdue',
          onSuccess: () => {
            setPerteOpen(false);
            setMotif('');
            refresh();
          },
        },
      ),
    );
  const compteId = opp.compte?.id ?? null;
  const toggle = (id: string, fait: boolean) =>
    start(() =>
      runWithToast(() => toggleRelance(id, fait), { onSuccess: refresh }),
    );

  const apercu = (
    <div className="space-y-5 text-sm">
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
            Détails
          </h3>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setEditing((e) => !e)}
          >
            <Pencil />
            {editing ? 'Fermer' : 'Modifier'}
          </Button>
        </div>
        {editing ? (
          <OppQuickEdit
            opp={{
              id: opp.id,
              intitule: opp.intitule,
              probabilite: opp.probabilite,
              nb_alternants: opp.nb_alternants,
              cfa: opp.cfa,
              date_cible_prochain_rdv: opp.date_cible_prochain_rdv,
            }}
            onSaved={() => setEditing(false)}
          />
        ) : (
          <dl className="divide-border border-border divide-y overflow-hidden rounded-lg border">
            {opp.compte && (
              <Row
                term="Société"
                value={`${opp.compte.nom}${opp.compte.nombre_collaborateurs != null ? ` · ${opp.compte.nombre_collaborateurs} collab.` : ''}`}
              />
            )}
            <Row term="Apprentis visés" value={opp.nb_alternants ?? '-'} />
            {opp.cfa && <Row term="CFA" value={opp.cfa} />}
            {opp.date_cible_prochain_rdv && (
              <Row
                term="Prochain RDV cible"
                value={formatDateParis(opp.date_cible_prochain_rdv)}
              />
            )}
            {opp.probabilite != null && opp.probabilite > 0 && (
              <Row term="Probabilité" value={`${opp.probabilite} %`} />
            )}
            {opp.date_cloture_prevue && (
              <Row
                term="Clôture prévue"
                value={formatDateParis(opp.date_cloture_prevue)}
              />
            )}
            {opp.source && <Row term="Source" value={opp.source} />}
          </dl>
        )}
      </section>

      {opp.compte?.contacts?.length ? (
        <section className="space-y-2">
          <h3 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
            Contacts
          </h3>
          <div className="divide-border border-border divide-y overflow-hidden rounded-lg border">
            {opp.compte.contacts.map((c) => (
              <OppContactRole key={c.id} contact={c} />
            ))}
          </div>
        </section>
      ) : null}

      {!compact && opp.compte && <OppInsee compte={opp.compte} />}

      {!compact && <OppNegociation opp={opp} />}

      {!compact && (
        <OppAdresses
          compteId={opp.compte?.id ?? null}
          adresses={opp.compte?.adresses ?? []}
        />
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      <StatutBadge statut={opp.statut} />
      <StageBar etapes={etapes} currentId={opp.etape_id} oppId={opp.id} />
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() =>
            start(() =>
              runWithToast(() => setOpportuniteStatut(opp.id, 'gagnee'), {
                success: 'Gagnée 🎉',
                onSuccess: refresh,
              }),
            )
          }
        >
          Gagné
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => setPerteOpen(true)}
        >
          Perdu
        </Button>
        <ConfirmButton
          trigger={
            <Button
              size="sm"
              variant="ghost"
              aria-label="Supprimer l'opportunité"
              className="text-muted-foreground hover:text-destructive ml-auto"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          }
          title="Supprimer l'opportunité"
          description={`« ${opp.intitule} » et ses activités, relances et RDV liés seront définitivement supprimés. Action irréversible.`}
          confirmLabel="Supprimer définitivement"
          errorMessage="Suppression impossible"
          onConfirm={async () => {
            await deleteOpportunite(opp.id);
            router.push('/crm/pipeline');
          }}
        />
      </div>
      <Dialog open={perteOpen} onOpenChange={setPerteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Marquer comme perdue</DialogTitle>
            <DialogDescription>
              Indique le motif de la perte (optionnel).
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={motif}
            onChange={(e) => setMotif(e.target.value)}
            placeholder="Ex. budget, concurrent, timing…"
            rows={3}
            autoFocus
          />
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPerteOpen(false)}
              disabled={pending}
            >
              Annuler
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={confirmPerte}
              disabled={pending}
            >
              {pending ? '…' : 'Confirmer la perte'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {compact ? (
        apercu
      ) : (
        <Tabs defaultValue="apercu">
          <TabsList>
            <TabsTrigger value="apercu">Aperçu</TabsTrigger>
            <TabsTrigger value="activites">
              Activités
              {opp.activites.length ? ` (${opp.activites.length})` : ''}
            </TabsTrigger>
            <TabsTrigger value="relances">
              Relances{opp.relances.length ? ` (${opp.relances.length})` : ''}
            </TabsTrigger>
            <TabsTrigger value="rdv">
              RDV{opp.rdv.length ? ` (${opp.rdv.length})` : ''}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="apercu">{apercu}</TabsContent>
          <TabsContent value="activites" className="space-y-3">
            {/* Comptes fantômes : pas de composeur (zéro trace, garde aussi côté serveur dans addNote). */}
            {canNote && (
              <div className="space-y-2">
                <MentionTextarea
                  value={note}
                  onChange={(v, ids) => {
                    setNote(v);
                    setNoteMentions(ids);
                  }}
                  options={mentionOptions}
                  placeholder="Ajouter une note… (tapez @ pour mentionner un collègue)"
                />
                <Button
                  size="sm"
                  disabled={pending || !note.trim()}
                  onClick={() =>
                    start(() =>
                      runWithToast(() => addNote(opp.id, note, noteMentions), {
                        success: 'Note ajoutée',
                        error: 'Ajout impossible',
                        onSuccess: () => {
                          setNote('');
                          setNoteMentions([]);
                          refresh();
                        },
                      }),
                    )
                  }
                >
                  Ajouter
                </Button>
              </div>
            )}
            <Timeline items={opp.activites} />
          </TabsContent>
          <TabsContent value="relances" className="space-y-3 text-sm">
            <RelanceForm
              opportuniteId={opp.id}
              compteId={compteId}
              trigger={
                <Button size="sm" variant="outline">
                  + Nouvelle relance
                </Button>
              }
            />
            {opp.relances.length ? (
              <div className="space-y-2">
                {opp.relances.map((r) => (
                  <div
                    key={r.id}
                    className="border-border flex items-center justify-between rounded-md border px-3 py-2"
                  >
                    <span
                      className={
                        r.fait ? 'text-muted-foreground line-through' : ''
                      }
                    >
                      {r.titre}
                    </span>
                    <div className="flex items-center gap-3">
                      <span className="text-muted-foreground">
                        {formatDateParis(r.date_echeance)}
                      </span>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => toggle(r.id, !r.fait)}
                        className="text-primary text-xs hover:underline disabled:opacity-50"
                      >
                        {r.fait ? 'Rouvrir' : 'Marquer fait'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground">Aucune relance.</p>
            )}
          </TabsContent>
          <TabsContent value="rdv" className="space-y-3 text-sm">
            <RdvForm
              opportuniteId={opp.id}
              compteId={compteId}
              trigger={
                <Button size="sm" variant="outline">
                  + Nouveau RDV
                </Button>
              }
            />
            {opp.rdv.length ? (
              <div className="space-y-2">
                {opp.rdv.map((r) => (
                  <div
                    key={r.id}
                    className="border-border flex items-center justify-between rounded-md border px-3 py-2"
                  >
                    <span>{r.titre}</span>
                    <span className="text-muted-foreground">
                      {formatDateTimeParis(r.debut)} ·{' '}
                      {label(statutRdvLabel, r.statut)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground">Aucun RDV.</p>
            )}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
