import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { FileQuestion } from 'lucide-react';

export default function DashboardNotFound() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4">
      <FileQuestion className="text-muted-foreground h-12 w-12" />
      <h2 className="text-lg font-semibold">Page introuvable</h2>
      <p className="text-muted-foreground text-sm">
        La page que vous recherchez n&apos;existe pas.
      </p>
      <Link href="/dashboard">
        <Button>Retour au tableau de bord</Button>
      </Link>
    </div>
  );
}
