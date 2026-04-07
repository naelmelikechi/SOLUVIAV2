import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <h1 className="text-foreground text-4xl font-bold">404</h1>
        <p className="text-muted-foreground mt-2">Page introuvable</p>
        <Link
          href="/projets"
          className="bg-primary text-primary-foreground hover:bg-primary/90 mt-4 inline-block rounded-lg px-4 py-2 text-sm font-medium"
        >
          Retour aux projets
        </Link>
      </div>
    </div>
  );
}
