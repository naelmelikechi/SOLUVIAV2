import type { Metadata } from 'next';
import { ThemeProvider } from 'next-themes';
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from '@/components/ui/sonner';
import './globals.css';

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ?? 'https://soluvia.vercel.app';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'SOLUVIA',
    template: '%s · SOLUVIA',
  },
  description:
    'Plateforme de pilotage stratégique pour organismes de formation',
  applicationName: 'SOLUVIA',
  // SaaS authentifie : pas de pages produit a indexer. Les seules pages
  // publiques sont login / mentions / politique - suffisamment generiques.
  // robots.ts override par segment si besoin.
  robots: {
    index: false,
    follow: false,
    googleBot: { index: false, follow: false },
  },
  openGraph: {
    type: 'website',
    locale: 'fr_FR',
    url: siteUrl,
    siteName: 'SOLUVIA',
    title: 'SOLUVIA',
    description:
      'Plateforme de pilotage stratégique pour organismes de formation',
  },
  twitter: {
    card: 'summary',
    title: 'SOLUVIA',
    description:
      'Plateforme de pilotage stratégique pour organismes de formation',
  },
  icons: {
    icon: '/favicon.ico',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" className="h-full antialiased" suppressHydrationWarning>
      <body className="flex min-h-full flex-col">
        <a
          href="#main-content"
          className="bg-background sr-only z-50 rounded-md px-3 py-2 text-sm focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:ring-2"
        >
          Aller au contenu principal
        </a>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <TooltipProvider>
            {children}
            <Toaster />
          </TooltipProvider>
        </ThemeProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
