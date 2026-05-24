import { Badge } from '@/components/ui/badge';

const VARIANTS: Record<
  string,
  {
    label: string;
    variant: 'default' | 'outline' | 'secondary' | 'destructive';
  }
> = {
  brouillon: { label: 'Brouillon', variant: 'secondary' },
  envoye: { label: 'Envoyé', variant: 'outline' },
  accepte: { label: 'Accepté', variant: 'default' },
  refuse: { label: 'Refusé', variant: 'destructive' },
  expire: { label: 'Expiré', variant: 'secondary' },
  remplace: { label: 'Remplacé', variant: 'secondary' },
  annule: { label: 'Annulé', variant: 'secondary' },
};

export function DevisStatusBadge({ statut }: { statut: string }) {
  const { label, variant } = VARIANTS[statut] ?? {
    label: statut,
    variant: 'secondary' as const,
  };
  return <Badge variant={variant}>{label}</Badge>;
}
