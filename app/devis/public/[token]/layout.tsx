import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Devis - Acceptation en ligne' };

// Pas de html/body ici : le layout racine app/layout.tsx les fournit deja.
// Cette route est hors route group (dashboard), elle herite directement du
// root layout sans sidebar ni auth shell.
export default function PublicDevisLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gray-50">
      <main className="mx-auto max-w-3xl px-4 py-8">{children}</main>
    </div>
  );
}
