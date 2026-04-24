'use client';

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
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

      <form action={formAction} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            placeholder="vous@exemple.fr"
            required
            autoComplete="email"
            disabled={pending}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">Mot de passe</Label>
          <Input
            id="password"
            name="password"
            type="password"
            placeholder="••••••••"
            required
            autoComplete="current-password"
            disabled={pending}
          />
        </div>

        {state.error && (
          <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950/50 dark:text-red-400">
            {state.error}
          </div>
        )}

        <Button type="submit" className="w-full" size="lg" disabled={pending}>
          {pending ? 'Connexion...' : 'Se connecter'}
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
