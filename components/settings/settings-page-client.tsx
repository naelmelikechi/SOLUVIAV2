'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { User, Lock, Palette } from 'lucide-react';
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
import { updateProfile, updatePassword } from '@/lib/actions/settings';

interface SettingsPageClientProps {
  user: {
    id: string;
    email: string;
    nom: string;
    prenom: string;
    role: string;
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

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prenom.trim() || !nom.trim()) {
      toast.error('Le prenom et le nom sont requis');
      return;
    }
    setProfileLoading(true);
    const result = await updateProfile(prenom.trim(), nom.trim());
    setProfileLoading(false);
    if (result.success) {
      toast.success('Profil mis a jour');
      router.refresh();
    } else {
      toast.error(result.error ?? 'Erreur lors de la mise a jour');
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 8) {
      toast.error('Le mot de passe doit contenir au moins 8 caracteres');
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
      toast.success('Mot de passe mis a jour');
      setNewPassword('');
      setConfirmPassword('');
    } else {
      toast.error(result.error ?? 'Erreur lors de la mise a jour');
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
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
                L&apos;email ne peut pas etre modifie
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="prenom">Prenom</Label>
                <Input
                  id="prenom"
                  value={prenom}
                  onChange={(e) => setPrenom(e.target.value)}
                  placeholder="Votre prenom"
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
                  user.role === 'admin' ? 'Administrateur' : 'Chef de projet'
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
                placeholder="Minimum 8 caracteres"
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
                placeholder="Repetez le nouveau mot de passe"
                minLength={8}
                required
              />
            </div>

            <div className="flex justify-end">
              <Button type="submit" disabled={passwordLoading}>
                {passwordLoading ? 'Mise a jour...' : 'Changer le mot de passe'}
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
            Preferences
          </CardTitle>
          <CardDescription>
            Personnalisez l&apos;apparence de l&apos;application
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Theme</p>
              <p className="text-muted-foreground text-xs">
                Choisissez entre le mode clair, sombre ou systeme
              </p>
            </div>
            <ThemeToggle />
          </div>
          <Separator className="my-4" />
          <p className="text-muted-foreground text-xs">
            Le theme est sauvegarde automatiquement dans votre navigateur.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
