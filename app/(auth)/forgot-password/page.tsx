'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/api/auth/callback`,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    setSuccess(true);
    setLoading(false);
  }

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

      {success ? (
        <div className="space-y-4">
          <div className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700 dark:bg-green-950/50 dark:text-green-400">
            Un email a été envoyé à <span className="font-medium">{email}</span>
            . Vérifiez votre boîte de réception.
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
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="vous@exemple.fr"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                disabled={loading}
              />
            </div>

            {error && (
              <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950/50 dark:text-red-400">
                {error}
              </div>
            )}

            <Button
              type="submit"
              className="w-full"
              size="lg"
              disabled={loading}
            >
              {loading ? 'Envoi en cours...' : 'Envoyer le lien'}
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
