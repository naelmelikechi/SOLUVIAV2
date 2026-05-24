import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Devis - Acceptation en ligne' };

export default function PublicDevisLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr">
      <body className="bg-gray-50">
        <main className="mx-auto max-w-3xl px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
