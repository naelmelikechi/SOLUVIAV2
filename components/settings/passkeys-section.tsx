'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Fingerprint, Plus, Trash2, Check } from 'lucide-react';
import { startRegistration } from '@simplewebauthn/browser';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { deletePasskey } from '@/lib/actions/passkeys';
import type { PasskeyRow } from '@/lib/queries/passkeys';
import { formatDate } from '@/lib/utils/formatters';

function defaultDeviceName() {
  if (typeof navigator === 'undefined') return 'Passkey';
  const ua = navigator.userAgent;
  if (/iPhone|iPad/.test(ua)) return 'iPhone / iPad';
  if (/Mac OS|Macintosh/.test(ua)) return 'Mac (Touch ID)';
  if (/Windows/.test(ua)) return 'Windows (Hello)';
  if (/Android/.test(ua)) return 'Android';
  return 'Passkey';
}

// oxlint-disable-next-line react-doctor/prefer-useReducer
export function PasskeysSection({ passkeys }: { passkeys: PasskeyRow[] }) {
  const { refresh } = useRouter();
  const [supported] = useState(
    () =>
      typeof window !== 'undefined' &&
      typeof window.PublicKeyCredential !== 'undefined',
  );
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState(false);
  const [deviceName, setDeviceName] = useState(() => defaultDeviceName());
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const handleRegister = async () => {
    setAdding(true);
    try {
      const optsRes = await fetch('/api/auth/webauthn/register-options', {
        method: 'POST',
      });
      if (!optsRes.ok) {
        const err = await optsRes.json().catch(() => ({}));
        throw new Error(err.error ?? 'Échec génération challenge');
      }
      const options = await optsRes.json();

      const attestation = await startRegistration({ optionsJSON: options });

      const verifyRes = await fetch('/api/auth/webauthn/register-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          response: attestation,
          deviceName: deviceName.trim() || defaultDeviceName(),
        }),
      });
      const data = await verifyRes.json();
      if (!verifyRes.ok || !data.ok) {
        throw new Error(data.error ?? 'Vérification échouée');
      }

      toast.success('Passkey ajouté');
      setOpen(false);
      refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Erreur inconnue';
      if (/NotAllowed|cancelled|abort/i.test(msg)) {
        // user a annule -- silencieux
      } else if (/InvalidStateError|exists|already registered/i.test(msg)) {
        toast.error('Ce device a déjà un passkey enregistré.');
      } else {
        toast.error(msg);
      }
    } finally {
      setAdding(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    const { id } = deleteTarget;
    setDeletingId(id);
    const result = await deletePasskey(id);
    setDeletingId(null);
    setDeleteTarget(null);
    if (result.success) {
      toast.success('Passkey supprimé');
      refresh();
    } else {
      toast.error(result.error ?? 'Erreur');
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Fingerprint className="size-5" />
          Passkeys
        </CardTitle>
        <CardDescription>
          Connectez-vous avec Touch ID, Windows Hello ou une clé de sécurité.
          Plus rapide et plus sûr qu&apos;un mot de passe.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!supported && (
          <p className="text-muted-foreground text-sm">
            Votre navigateur ne prend pas en charge les passkeys.
          </p>
        )}

        {supported && passkeys.length === 0 && (
          <p className="text-muted-foreground mb-4 text-sm">
            Aucun passkey enregistré. Ajoutez-en un pour vous connecter sans mot
            de passe.
          </p>
        )}

        {supported && passkeys.length > 0 && (
          <ul className="mb-4 divide-y divide-[var(--border)]">
            {passkeys.map((p) => (
              <li key={p.id} className="flex items-center justify-between py-3">
                <div className="flex items-center gap-3">
                  <div className="bg-muted text-muted-foreground flex size-9 items-center justify-center rounded-md">
                    <Fingerprint className="size-4" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">
                      {p.device_name ?? 'Passkey'}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      Ajouté le {formatDate(p.created_at)}
                      {p.last_used_at &&
                        ` · Dernière utilisation : ${formatDate(p.last_used_at)}`}
                      {p.backed_up && (
                        <span className="ml-1 inline-flex items-center gap-0.5 text-green-600 dark:text-green-400">
                          · <Check className="size-3" /> synchronisé
                        </span>
                      )}
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setDeleteTarget({
                      id: p.id,
                      name: p.device_name ?? 'Passkey',
                    })
                  }
                  disabled={deletingId === p.id}
                  aria-label="Supprimer ce passkey"
                >
                  <Trash2 className="size-4 text-red-600 dark:text-red-400" />
                </Button>
              </li>
            ))}
          </ul>
        )}

        {supported && (
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setDeviceName(defaultDeviceName());
              setOpen(true);
            }}
          >
            <Plus className="mr-2 size-4" />
            Ajouter un passkey
          </Button>
        )}

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nouveau passkey</DialogTitle>
              <DialogDescription>
                Donnez un nom à ce device pour le retrouver facilement.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="device-name">Nom du device</Label>
              <Input
                id="device-name"
                value={deviceName}
                onChange={(e) => setDeviceName(e.target.value)}
                placeholder="Mac (Touch ID)"
                maxLength={50}
              />
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={adding}
              >
                Annuler
              </Button>
              <Button onClick={handleRegister} disabled={adding}>
                {adding ? 'Enregistrement...' : 'Enregistrer'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <ConfirmDialog
          open={deleteTarget !== null}
          onOpenChange={(open) => {
            if (!open) setDeleteTarget(null);
          }}
          title="Supprimer le passkey"
          description={`Voulez-vous vraiment supprimer le passkey "${deleteTarget?.name ?? 'Passkey'}" ? Cette action est irréversible.`}
          confirmText="Supprimer"
          variant="destructive"
          onConfirm={handleDeleteConfirm}
          isPending={deletingId !== null}
        />
      </CardContent>
    </Card>
  );
}
