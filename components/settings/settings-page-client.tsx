'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  User,
  Lock,
  Palette,
  Bot,
  Dices,
  LockKeyhole,
  RotateCcw,
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
  regenerateAvatar,
  lockAvatar,
  unlockAvatar,
} from '@/lib/actions/settings';
import { isAdmin as checkIsAdmin } from '@/lib/utils/roles';

interface SettingsPageClientProps {
  user: {
    id: string;
    email: string;
    nom: string;
    prenom: string;
    role: string;
    avatar_seed: string | null;
    avatar_regen_date: string | null;
  };
}

export function SettingsPageClient({ user }: SettingsPageClientProps) {
  const router = useRouter();

  // Profile state
  const [prenom, setPrenom] = useState(user.prenom);
  const [nom, setNom] = useState(user.nom);
  const [profileLoading, setProfileLoading] = useState(false);

  // Password state
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);

  // Avatar state
  const [avatarSeed, setAvatarSeed] = useState<string | null>(user.avatar_seed);
  const [regenUsed, setRegenUsed] = useState(
    user.avatar_regen_date === new Date().toISOString().slice(0, 10),
  );
  const [avatarPending, startAvatarTransition] = useTransition();
  const isLocked = avatarSeed !== null;

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prenom.trim() || !nom.trim()) {
      toast.error('Le prénom et le nom sont requis');
      return;
    }
    setProfileLoading(true);
    const result = await updateProfile(prenom.trim(), nom.trim());
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
            Chaque jour, un nouveau compagnon robotique vous est attribué. Si
            vous tombez amoureux de votre robot du jour, figez-le pour
            l&apos;éternité. Ou lancez les dés pour tenter votre chance.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center gap-4">
            <div className="relative">
              <img
                src={getAvatarUrl(user.email, avatarSeed, 128)}
                alt="Votre robot"
                width={128}
                height={128}
                className="rounded-2xl border-2 border-dashed border-[var(--border)] p-2"
              />
              {isLocked && (
                <div className="absolute -top-2 -right-2 rounded-full bg-green-500 p-1 text-white shadow-md">
                  <LockKeyhole className="h-3.5 w-3.5" />
                </div>
              )}
            </div>

            <p className="text-muted-foreground text-center text-xs italic">
              {isLocked
                ? '🔒 Ce robot est votre compagnon permanent. Fidèle, dévoué, et légèrement métallique.'
                : '🎰 Nouveau robot chaque matin ! Comme une boîte de chocolats, mais en plus crunchy.'}
            </p>

            <div className="flex flex-wrap justify-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={avatarPending || regenUsed}
                title={
                  regenUsed
                    ? 'Revenez demain pour un nouveau robot !'
                    : undefined
                }
                onClick={() =>
                  startAvatarTransition(async () => {
                    const result = await regenerateAvatar();
                    if (result.success && result.seed) {
                      setAvatarSeed(result.seed);
                      setRegenUsed(true);
                      toast.success(
                        'Nouveau robot généré ! Revenez demain pour retenter votre chance.',
                      );
                    } else {
                      toast.error(result.error ?? 'Erreur');
                    }
                  })
                }
              >
                <Dices className="mr-1.5 h-4 w-4" />
                {regenUsed ? "Déjà tiré aujourd'hui" : 'Nouveau robot'}
              </Button>

              {!isLocked ? (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={avatarPending}
                  onClick={() =>
                    startAvatarTransition(async () => {
                      const result = await lockAvatar();
                      if (result.success) {
                        setAvatarSeed(
                          user.email +
                            new Date()
                              .toISOString()
                              .slice(0, 10)
                              .replace(/-0/g, '-')
                              .replace(/-/g, '-'),
                        );
                        toast.success('Robot figé ! Il ne changera plus.');
                      } else {
                        toast.error(result.error ?? 'Erreur');
                      }
                    })
                  }
                >
                  <LockKeyhole className="mr-1.5 h-4 w-4" />
                  Garder celui-ci
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={avatarPending}
                  onClick={() =>
                    startAvatarTransition(async () => {
                      const result = await unlockAvatar();
                      if (result.success) {
                        setAvatarSeed(null);
                        toast.success('Mode quotidien réactivé !');
                      } else {
                        toast.error(result.error ?? 'Erreur');
                      }
                    })
                  }
                >
                  <RotateCcw className="mr-1.5 h-4 w-4" />
                  Mode quotidien
                </Button>
              )}
            </div>
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
              <Label>Role</Label>
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
