'use client';

import { useState, useTransition, type TransitionStartFunction } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import {
  User,
  Lock,
  Palette,
  Bot,
  Dices,
  LockKeyhole,
  CalendarDays,
  KeyRound,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { ThemeToggle } from '@/components/shared/theme-toggle';
import { getAvatarUrl } from '@/components/shared/user-avatar';
import {
  updateProfile,
  updatePassword,
  setAvatarDaily,
  rollRandomAvatar,
  freezeCurrentAvatar,
  attemptUnlockFrozenAvatar,
} from '@/lib/actions/settings';
import { isAdmin as checkIsAdmin } from '@/lib/utils/roles';
import {
  canRollRandomToday,
  resolveAvatarSeed,
  type AvatarMode,
} from '@/lib/utils/avatar';

interface SettingsPageClientProps {
  user: {
    id: string;
    email: string;
    nom: string;
    prenom: string;
    role: string;
    telephone: string | null;
    avatar_mode: AvatarMode | null;
    avatar_seed: string | null;
    avatar_regen_date: string | null;
  };
}

export function SettingsPageClient({ user }: SettingsPageClientProps) {
  const router = useRouter();

  // Profile state
  const [prenom, setPrenom] = useState(user.prenom);
  const [nom, setNom] = useState(user.nom);
  const [telephone, setTelephone] = useState(user.telephone ?? '');
  const [profileLoading, setProfileLoading] = useState(false);

  // Password state
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);

  // Avatar state - miroir fidèle de la DB, mis à jour uniquement par les retours
  // des server actions (fini les reconstructions de seed côté client).
  const [avatarMode, setAvatarMode] = useState<AvatarMode>(
    user.avatar_mode ?? (user.avatar_seed ? 'frozen' : 'daily'),
  );
  const [avatarSeed, setAvatarSeed] = useState<string | null>(user.avatar_seed);
  const [regenDate, setRegenDate] = useState<string | null>(
    user.avatar_regen_date,
  );
  const [avatarPending, startAvatarTransition] = useTransition();

  // Ce qui est *effectivement* affiché (gère l'expiry du random).
  const { effectiveMode } = resolveAvatarSeed({
    email: user.email,
    mode: avatarMode,
    seed: avatarSeed,
    regenDate,
  });
  const canRoll = canRollRandomToday(regenDate);

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prenom.trim() || !nom.trim()) {
      toast.error('Le prénom et le nom sont requis');
      return;
    }
    setProfileLoading(true);
    const result = await updateProfile(
      prenom.trim(),
      nom.trim(),
      telephone.trim() || null,
    );
    setProfileLoading(false);
    if (result.success) {
      toast.success('Profil mis à jour');
      router.refresh();
    } else {
      toast.error(result.error ?? 'Erreur lors de la mise à jour');
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 8) {
      toast.error('Le mot de passe doit contenir au moins 8 caractères');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('Les mots de passe ne correspondent pas');
      return;
    }
    setPasswordLoading(true);
    const result = await updatePassword(newPassword);
    setPasswordLoading(false);
    if (result.success) {
      toast.success('Mot de passe mis à jour');
      setNewPassword('');
      setConfirmPassword('');
    } else {
      toast.error(result.error ?? 'Erreur lors de la mise à jour');
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* ── Avatar ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5" />
            Votre robot personnel
          </CardTitle>
          <CardDescription>
            Trois modes au choix : l&apos;avatar du jour qui change chaque
            matin, un tirage aléatoire pour tenter votre chance (1/jour), ou
            figer un robot pour qu&apos;il reste votre compagnon permanent.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center gap-4">
            <div className="relative">
              <Image
                src={getAvatarUrl(
                  user.email,
                  avatarSeed,
                  128,
                  avatarMode,
                  regenDate,
                )}
                alt="Votre robot"
                width={128}
                height={128}
                unoptimized
                className="rounded-2xl border-2 border-dashed border-[var(--border)] p-2"
              />
              {effectiveMode === 'frozen' && (
                <div
                  className="absolute -top-2 -right-2 rounded-full bg-green-500 p-1 text-white shadow-md"
                  title="Avatar figé"
                >
                  <LockKeyhole className="h-3.5 w-3.5" />
                </div>
              )}
              {effectiveMode === 'random' && (
                <div
                  className="absolute -top-2 -right-2 rounded-full bg-amber-500 p-1 text-white shadow-md"
                  title="Tirage aléatoire du jour"
                >
                  <Dices className="h-3.5 w-3.5" />
                </div>
              )}
            </div>

            {effectiveMode === 'frozen' ? (
              <FrozenAvatarPanel
                pending={avatarPending}
                onUnlocked={() => {
                  setAvatarMode('daily');
                  setAvatarSeed(null);
                }}
                startTransition={startAvatarTransition}
              />
            ) : (
              <>
                <p className="text-muted-foreground text-center text-xs italic">
                  {effectiveMode === 'random'
                    ? '🎲 Tirage du jour. Il disparaîtra demain sauf si vous le figez.'
                    : '🎰 Nouveau robot chaque matin. Comme une boîte de chocolats, mais crunchy.'}
                </p>

                {/* Sélecteur de mode - radio-like, visible seulement hors "figé" */}
                <div
                  role="radiogroup"
                  aria-label="Mode d'avatar"
                  className="flex w-full max-w-sm flex-col gap-1.5"
                >
                  <AvatarModeRow
                    icon={<CalendarDays className="h-4 w-4" />}
                    label="Avatar du jour"
                    sub="Change chaque matin"
                    active={effectiveMode === 'daily'}
                    disabled={avatarPending}
                    onClick={() =>
                      startAvatarTransition(async () => {
                        const result = await setAvatarDaily();
                        if (result.success) {
                          setAvatarMode('daily');
                          setAvatarSeed(null);
                          toast.success('Mode quotidien activé.');
                        } else {
                          toast.error(result.error ?? 'Erreur');
                        }
                      })
                    }
                  />
                  <AvatarModeRow
                    icon={<Dices className="h-4 w-4" />}
                    label="Tirage aléatoire du jour"
                    sub={
                      canRoll
                        ? 'Tirez votre robot de la journée (1/jour)'
                        : "Déjà tiré aujourd'hui - revenez demain"
                    }
                    active={effectiveMode === 'random'}
                    disabled={avatarPending || !canRoll}
                    onClick={() =>
                      startAvatarTransition(async () => {
                        const result = await rollRandomAvatar();
                        if (
                          result.success &&
                          result.seed &&
                          result.regenDate &&
                          result.mode
                        ) {
                          setAvatarMode(result.mode);
                          setAvatarSeed(result.seed);
                          setRegenDate(result.regenDate);
                          toast.success('Nouveau robot tiré au sort !');
                        } else {
                          toast.error(result.error ?? 'Erreur');
                        }
                      })
                    }
                    actionLabel={
                      effectiveMode === 'random' && canRoll
                        ? 'Re-tirer'
                        : effectiveMode === 'random'
                          ? undefined
                          : 'Tirer'
                    }
                  />
                  <AvatarModeRow
                    icon={<LockKeyhole className="h-4 w-4" />}
                    label="Figer le robot actuel"
                    sub="Garder pour toujours celui affiché ci-dessus"
                    active={false}
                    disabled={avatarPending}
                    onClick={() =>
                      startAvatarTransition(async () => {
                        const result = await freezeCurrentAvatar();
                        if (result.success && result.seed && result.mode) {
                          setAvatarMode(result.mode);
                          setAvatarSeed(result.seed);
                          toast.success(
                            'Robot figé à vie ! Il ne changera plus.',
                          );
                        } else {
                          toast.error(result.error ?? 'Erreur');
                        }
                      })
                    }
                  />
                </div>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── Profil ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Profil
          </CardTitle>
          <CardDescription>
            Modifiez vos informations personnelles
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleProfileSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={user.email}
                disabled
                className="bg-muted"
              />
              <p className="text-muted-foreground text-xs">
                L&apos;email ne peut pas être modifié
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="prenom">Prénom</Label>
                <Input
                  id="prenom"
                  value={prenom}
                  onChange={(e) => setPrenom(e.target.value)}
                  placeholder="Votre prénom"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="nom">Nom</Label>
                <Input
                  id="nom"
                  value={nom}
                  onChange={(e) => setNom(e.target.value)}
                  placeholder="Votre nom"
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="telephone">Téléphone</Label>
              <Input
                id="telephone"
                type="tel"
                value={telephone}
                onChange={(e) => setTelephone(e.target.value)}
                placeholder="06 12 34 56 78"
                autoComplete="tel"
              />
              <p className="text-muted-foreground text-xs">
                Visible par vos collègues sur la page Équipe.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label>Rôle</Label>
              <Input
                value={
                  checkIsAdmin(user.role) ? 'Administrateur' : 'Chef de projet'
                }
                disabled
                className="bg-muted"
              />
            </div>

            <div className="flex justify-end">
              <Button type="submit" disabled={profileLoading}>
                {profileLoading ? 'Enregistrement...' : 'Enregistrer'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* ── Mot de passe ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5" />
            Mot de passe
          </CardTitle>
          <CardDescription>
            Changez votre mot de passe de connexion
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="new-password">Nouveau mot de passe</Label>
              <Input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Minimum 8 caractères"
                minLength={8}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="confirm-password">
                Confirmer le mot de passe
              </Label>
              <Input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Répétez le nouveau mot de passe"
                minLength={8}
                required
              />
            </div>

            <div className="flex justify-end">
              <Button type="submit" disabled={passwordLoading}>
                {passwordLoading ? 'Mise à jour...' : 'Changer le mot de passe'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* ── Preferences ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Palette className="h-5 w-5" />
            Préférences
          </CardTitle>
          <CardDescription>
            Personnalisez l&apos;apparence de l&apos;application
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Thème</p>
              <p className="text-muted-foreground text-xs">
                Choisissez entre le mode clair, sombre ou système
              </p>
            </div>
            <ThemeToggle />
          </div>
          <Separator className="my-4" />
          <p className="text-muted-foreground text-xs">
            Le thème est sauvegardé automatiquement dans votre navigateur.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

// Row used in the avatar mode selector. Active = filled accent, disabled =
// faded. `actionLabel` lets the random row expose a distinct "Tirer" /
// "Re-tirer" button without duplicating the outer click handler.
function AvatarModeRow({
  icon,
  label,
  sub,
  active,
  disabled,
  onClick,
  actionLabel,
}: {
  icon: React.ReactNode;
  label: string;
  sub: string;
  active: boolean;
  disabled: boolean;
  onClick: () => void;
  actionLabel?: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      disabled={disabled}
      onClick={onClick}
      className={`group flex items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
        active
          ? 'border-primary bg-primary/5'
          : 'border-border hover:bg-accent/40'
      }`}
    >
      <span
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${
          active
            ? 'bg-primary text-primary-foreground'
            : 'bg-muted text-muted-foreground'
        }`}
      >
        {icon}
      </span>
      <span className="flex flex-1 flex-col">
        <span className="text-sm font-medium">{label}</span>
        <span className="text-muted-foreground text-xs">{sub}</span>
      </span>
      {actionLabel && (
        <span className="text-primary text-xs font-medium">{actionLabel}</span>
      )}
    </button>
  );
}

// Random snarky messages shown on a failed unlock attempt. They rotate so
// users don't just see the same sentence every time, which would make the
// joke go stale very fast.
const FAILED_UNLOCK_MESSAGES = [
  "Ce n'est pas ça. L'indice est bien caché.",
  'Non. Très loin, même.',
  'Raté. Essaie encore, ou pas.',
  'Presque. En fait non, pas du tout.',
  'Tu chauffes. (Mensonge.)',
  'Hmm. Ton robot te juge un peu, là.',
  'Toujours pas. Un conseil : ne perds pas ta journée.',
] as const;

function FrozenAvatarPanel({
  pending,
  onUnlocked,
  startTransition,
}: {
  pending: boolean;
  onUnlocked: () => void;
  startTransition: TransitionStartFunction;
}) {
  const [attempt, setAttempt] = useState('');
  const [failCount, setFailCount] = useState(0);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!attempt.trim()) return;
    startTransition(async () => {
      const result = await attemptUnlockFrozenAvatar(attempt);
      if (result.success) {
        toast.success("Impossible. Et pourtant, vous l'avez trouvé.");
        setAttempt('');
        onUnlocked();
      } else {
        setFailCount((n) => n + 1);
        setAttempt('');
        const msg =
          FAILED_UNLOCK_MESSAGES[
            Math.floor(Math.random() * FAILED_UNLOCK_MESSAGES.length)
          ] ?? FAILED_UNLOCK_MESSAGES[0];
        toast.error(msg);
      }
    });
  };

  return (
    <>
      <p className="text-center text-sm font-medium text-green-700 dark:text-green-400">
        🔒 Cet avatar est figé à vie.
      </p>
      <p className="text-muted-foreground max-w-sm text-center text-xs italic">
        Fidèle, dévoué, et légèrement métallique. Pour en changer, il faut
        saisir la clé secrète. Un indice est caché quelque part dans
        l&apos;application.
      </p>

      <form
        onSubmit={handleSubmit}
        className="flex w-full max-w-sm flex-col gap-2"
      >
        <Label htmlFor="unlock-secret" className="sr-only">
          Clé de déverrouillage
        </Label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <KeyRound className="text-muted-foreground absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2" />
            <Input
              id="unlock-secret"
              value={attempt}
              onChange={(e) => setAttempt(e.target.value)}
              placeholder="Saisir la clé secrète"
              autoComplete="off"
              spellCheck={false}
              maxLength={40}
              className="pl-8 font-mono tracking-wider"
            />
          </div>
          <Button type="submit" size="sm" disabled={pending || !attempt.trim()}>
            Tenter
          </Button>
        </div>
        {failCount > 0 && (
          <p className="text-muted-foreground text-center text-[11px] italic">
            {failCount} tentative{failCount > 1 ? 's' : ''} ratée
            {failCount > 1 ? 's' : ''}. Le robot se marre doucement.
          </p>
        )}
      </form>
    </>
  );
}
