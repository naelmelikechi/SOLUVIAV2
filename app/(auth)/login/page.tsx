'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { Eye, EyeOff } from 'lucide-react';
import { startAuthentication } from '@simplewebauthn/browser';
import { loginAction } from '@/lib/actions/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const INITIAL_STATE = {
  success: false as boolean,
  error: undefined as string | undefined,
};

export default function LoginPage() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [errorVisible, setErrorVisible] = useState(true);
  const [passkeyError, setPasskeyError] = useState<string | null>(null);
  const [passkeyPending, setPasskeyPending] = useState(false);
  const [state, formAction, pending] = useActionState(
    loginAction,
    INITIAL_STATE,
  );

  useEffect(() => {
    if (state.success) {
      router.refresh();
      router.push('/projets');
    }
  }, [state.success, router]);

  // Re-affiche l'erreur a chaque nouveau retour du loginAction.
  useEffect(() => {
    setErrorVisible(true);
  }, [state]);

  // Bouton "Se connecter" intelligent :
  // - Si email + mot de passe sont renseignes -> connexion email/mdp classique.
  // - Sinon -> tentative passkey (l'OS popup la liste des passkeys disponibles
  //   pour ce site, et fail proprement si aucune n'est enregistree).
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (pending || passkeyPending) return;

    const fd = new FormData(e.currentTarget);
    const email = (fd.get('email') as string | null)?.trim() ?? '';
    const password = (fd.get('password') as string | null)?.trim() ?? '';

    if (email && password) {
      formAction(fd);
      return;
    }

    if (typeof window === 'undefined' || !window.PublicKeyCredential) {
      setPasskeyError(
        'Saisissez votre email et votre mot de passe pour vous connecter.',
      );
      return;
    }

    setPasskeyError(null);
    setPasskeyPending(true);
    try {
      const optsRes = await fetch('/api/auth/webauthn/login-options', {
        method: 'POST',
      });
      if (!optsRes.ok) throw new Error('Échec de la génération du challenge');
      const options = await optsRes.json();

      const assertion = await startAuthentication({ optionsJSON: options });

      const verifyRes = await fetch('/api/auth/webauthn/login-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ response: assertion }),
      });
      const data = await verifyRes.json();
      if (!verifyRes.ok || !data.ok) {
        throw new Error(data.error ?? 'Connexion refusée');
      }

      router.refresh();
      router.push('/projets');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erreur inconnue';
      if (/NotAllowed|cancelled|abort|denied/i.test(msg)) {
        // Annulation utilisateur ou aucun passkey selectionne : on n'affiche rien.
        setPasskeyError(null);
      } else if (/Passkey inconnu|404/i.test(msg)) {
        setPasskeyError(
          "Aucun passkey n'est associé à cet appareil. Saisissez votre email et votre mot de passe.",
        );
      } else {
        setPasskeyError(msg);
      }
    } finally {
      setPasskeyPending(false);
    }
  };

  const busy = pending || passkeyPending;
  const buttonLabel = passkeyPending
    ? 'Vérification...'
    : pending
      ? 'Connexion...'
      : 'Se connecter';

  return (
    <div className="border-border bg-card mx-auto max-w-md rounded-lg border p-8">
      <div className="mb-6 flex flex-col items-center text-center">
        <Image
          src="/logo.svg"
          alt="Soluvia"
          width={160}
          height={40}
          priority
          className=""
        />
        <p className="text-muted-foreground mt-4 text-sm">
          Connectez-vous à votre compte
        </p>
      </div>

      <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            placeholder="vous@exemple.fr"
            autoComplete="email webauthn"
            disabled={busy}
            onChange={() => setErrorVisible(false)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">Mot de passe</Label>
          <div className="relative">
            <Input
              id="password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              placeholder="Laisser vide pour utiliser un passkey"
              autoComplete="current-password webauthn"
              disabled={busy}
              className="pr-10"
              onChange={() => setErrorVisible(false)}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              tabIndex={-1}
              aria-label={
                showPassword
                  ? 'Masquer le mot de passe'
                  : 'Afficher le mot de passe'
              }
              className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2 -translate-y-1/2 cursor-pointer p-1 transition-colors"
            >
              {showPassword ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>

        {state.error && errorVisible && (
          <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950/50 dark:text-red-400">
            {state.error}
          </div>
        )}

        {passkeyError && (
          <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950/50 dark:text-red-400">
            {passkeyError}
          </div>
        )}

        <Button type="submit" className="w-full" size="lg" disabled={busy}>
          {buttonLabel}
        </Button>
      </form>

      <div className="mt-4 text-center">
        <Link
          href="/forgot-password"
          className="text-muted-foreground hover:text-primary text-sm underline-offset-4 hover:underline"
        >
          Mot de passe oublié ?
        </Link>
      </div>

      <div className="text-muted-foreground mt-6 text-center text-xs">
        <Link
          href="/mentions-legales"
          className="hover:text-foreground underline-offset-2 hover:underline"
        >
          Mentions légales
        </Link>
        <span className="mx-2">&middot;</span>
        <Link
          href="/politique-de-confidentialite"
          className="hover:text-foreground underline-offset-2 hover:underline"
        >
          Politique de confidentialité
        </Link>
      </div>
    </div>
  );
}
