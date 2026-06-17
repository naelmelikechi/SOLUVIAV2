'use client';

import { useState, useTransition } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { StatusBadge } from '@/components/shared/status-badge';
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@/components/ui/table';
import {
  addMappingRule,
  updateMappingRule,
  deleteMappingRule,
} from '@/lib/actions/linkedin';
import type { LinkedinMappingRule } from '@/lib/queries/linkedin';

const NONE_VALUE = '__none__';

interface Developpeur {
  id: string;
  nom: string;
  prenom: string;
}

interface Props {
  rules: LinkedinMappingRule[];
  developpeurs: Developpeur[];
}

interface FormBodyProps {
  rule: LinkedinMappingRule | null;
  developpeurs: Developpeur[];
  onClose: () => void;
}

function RuleFormBody({ rule, developpeurs, onClose }: FormBodyProps) {
  const [pattern, setPattern] = useState(rule?.linkedin_company_pattern ?? '');
  const [developpeurId, setDeveloppeurId] = useState(
    rule?.developpeur_affecte_id ?? NONE_VALUE,
  );
  const [prioriteRaw, setPrioriteRaw] = useState(
    rule ? String(rule.priorite) : '100',
  );
  const [actif, setActif] = useState(rule?.actif ?? true);
  const [isPending, startTransition] = useTransition();

  function handleSubmit() {
    const trimmed = pattern.trim();
    if (!trimmed) {
      toast.error('Motif requis');
      return;
    }
    const priorite = Number(prioriteRaw);
    if (!Number.isInteger(priorite) || priorite < 0) {
      toast.error('Priorité invalide (entier positif)');
      return;
    }
    const developpeurAffecteId =
      developpeurId === NONE_VALUE ? null : developpeurId;

    startTransition(async () => {
      const res = rule
        ? await updateMappingRule({
            id: rule.id,
            pattern: trimmed,
            developpeurAffecteId,
            priorite,
            actif,
          })
        : await addMappingRule({
            pattern: trimmed,
            developpeurAffecteId,
            priorite,
            actif,
          });
      if (res.success) {
        toast.success(rule ? 'Règle mise à jour' : 'Règle créée');
        onClose();
      } else {
        toast.error(res.error ?? 'Erreur');
      }
    });
  }

  return (
    <>
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="rule-pattern">Motif société (regex)</Label>
          <Input
            id="rule-pattern"
            value={pattern}
            onChange={(e) => setPattern(e.target.value)}
            placeholder="(?i)acme|globex"
          />
          <p className="text-muted-foreground text-xs">
            Expression régulière testée (insensible à la casse) sur le nom et
            l&apos;URL de la société captés.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="rule-dev">Développeur affecté</Label>
          <Select
            value={developpeurId}
            onValueChange={(v) => setDeveloppeurId(v ?? NONE_VALUE)}
          >
            <SelectTrigger className="w-full" id="rule-dev">
              <SelectValue placeholder="Round-robin (aucun)">
                {(v) => {
                  if (!v || v === NONE_VALUE) return 'Round-robin (aucun)';
                  const dev = developpeurs.find((d) => d.id === v);
                  return dev
                    ? `${dev.prenom} ${dev.nom}`
                    : 'Round-robin (aucun)';
                }}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE_VALUE}>Round-robin (aucun)</SelectItem>
              {developpeurs.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.prenom} {d.nom}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-muted-foreground text-xs">
            Sans développeur, l&apos;affectation suit le round-robin équitable.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="rule-priorite">Priorité</Label>
          <Input
            id="rule-priorite"
            type="number"
            min={0}
            value={prioriteRaw}
            onChange={(e) => setPrioriteRaw(e.target.value)}
          />
          <p className="text-muted-foreground text-xs">
            Plus la valeur est basse, plus la règle est évaluée tôt.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Checkbox
            id="rule-actif"
            checked={actif}
            onCheckedChange={(v) => setActif(Boolean(v))}
          />
          <Label htmlFor="rule-actif">Règle active</Label>
        </div>
      </div>

      <DialogFooter>
        <Button variant="ghost" onClick={onClose} disabled={isPending}>
          Annuler
        </Button>
        <Button onClick={handleSubmit} disabled={isPending}>
          {isPending ? 'Enregistrement...' : 'Enregistrer'}
        </Button>
      </DialogFooter>
    </>
  );
}

export function MappingRulesManager({ rules, developpeurs }: Props) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<LinkedinMappingRule | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [isDeleting, startDelete] = useTransition();

  function openCreate() {
    setEditing(null);
    setDialogOpen(true);
  }

  function openEdit(rule: LinkedinMappingRule) {
    setEditing(rule);
    setDialogOpen(true);
  }

  function handleDelete() {
    if (!confirmId) return;
    const id = confirmId;
    startDelete(async () => {
      const res = await deleteMappingRule(id);
      if (res.success) {
        toast.success('Règle supprimée');
        setConfirmId(null);
      } else {
        toast.error(res.error ?? 'Suppression impossible');
      }
    });
  }

  return (
    <Card className="p-6">
      <div className="mb-4 flex items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">Règles d&apos;affectation</h2>
          <p className="text-muted-foreground text-sm">
            Dirige les prospects LinkedIn vers un développeur selon la société.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="size-4" />
          Nouvelle règle
        </Button>
      </div>

      {rules.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Aucune règle : tous les prospects suivent le round-robin équitable.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Motif société</TableHead>
              <TableHead>Développeur</TableHead>
              <TableHead>Priorité</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rules.map((rule) => (
              <TableRow key={rule.id}>
                <TableCell className="font-mono text-xs">
                  {rule.linkedin_company_pattern}
                </TableCell>
                <TableCell>
                  {rule.developpeur
                    ? `${rule.developpeur.prenom} ${rule.developpeur.nom}`
                    : 'Round-robin'}
                </TableCell>
                <TableCell className="tabular-nums">{rule.priorite}</TableCell>
                <TableCell>
                  <StatusBadge
                    label={rule.actif ? 'Active' : 'Inactive'}
                    color={rule.actif ? 'green' : 'gray'}
                  />
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Modifier"
                      onClick={() => openEdit(rule)}
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Supprimer"
                      onClick={() => setConfirmId(rule.id)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editing ? 'Modifier la règle' : 'Nouvelle règle'}
            </DialogTitle>
          </DialogHeader>
          <RuleFormBody
            key={`${editing?.id ?? 'new'}-${String(dialogOpen)}`}
            rule={editing}
            developpeurs={developpeurs}
            onClose={() => setDialogOpen(false)}
          />
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmId !== null}
        onOpenChange={(open) => !open && setConfirmId(null)}
        title="Supprimer la règle"
        description="Cette règle d'affectation sera définitivement supprimée."
        confirmText="Supprimer"
        variant="destructive"
        onConfirm={handleDelete}
        isPending={isDeleting}
      />
    </Card>
  );
}
