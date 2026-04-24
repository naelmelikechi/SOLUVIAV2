'use client';

import { useActionState, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { requestPasswordResetAction } from '@/lib/actions/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const INITIAL_STATE = {
  success: false as boolean,
  error: undefined as string | undefined,
};

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [state, formAction, pending] = useActionState(
    requestPasswordResetAction,
    INITIAL_STATE,
  );
  const submitted = state.success;

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
        <h2 className="text-foreground mt-4 text-lg font-semibold">
          Réinitialiser votre mot de passe
        </h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Entrez votre email pour recevoir un lien de réinitialisation
        </p>
      </div>

      {submitted ? (
        <div className="space-y-4">
          <div className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700 dark:bg-green-950/50 dark:text-green-400">
            Si un compte correspond à{' '}
            <span className="font-medium">{email}</span>, un email vient
            d&apos;être envoyé. Vérifiez votre boîte de réception.
          </div>
          <div className="text-center">
            <Link
              href="/login"
              className="text-muted-foreground hover:text-primary text-sm underline-offset-4 hover:underline"
            >
              Retour à la connexion
            </Link>
          </div>
        </div>
      ) : (
        <>
          <form action={formAction} className="space-y-4">
            <input
              type="hidden"
              name="origin"
              value={
                typeof window !== 'undefined' ? window.location.origin : ''
              }
            />
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="vous@exemple.fr"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                disabled={pending}
              />
            </div>

            {state.error && (
              <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950/50 dark:text-red-400">
                {state.error}
              </div>
            )}

            <Button
              type="submit"
              className="w-full"
              size="lg"
              disabled={pending}
            >
              {pending ? 'Envoi en cours...' : 'Envoyer le lien'}
            </Button>
          </form>

          <div className="mt-4 text-center">
            <Link
              href="/login"
              className="text-muted-foreground hover:text-primary text-sm underline-offset-4 hover:underline"
            >
              Retour à la connexion
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
