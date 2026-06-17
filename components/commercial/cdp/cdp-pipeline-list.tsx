'use client';

import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardAction,
  CardContent,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { formatDate } from '@/lib/utils/formatters';
import type { CdpPipelineClient } from '@/lib/queries/cdp';

interface CdpPipelineListProps {
  cdpNom: string;
  clients: CdpPipelineClient[];
}

export function CdpPipelineList({ cdpNom, clients }: CdpPipelineListProps) {
  const router = useRouter();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Portefeuille de {cdpNom}</CardTitle>
        <CardAction>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push('/commercial/cdp')}
          >
            <X className="size-4" />
            Fermer
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {clients.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Aucun client sous gestion.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-foreground border-b text-left">
                <th className="py-2 font-medium">Raison sociale</th>
                <th className="py-2 font-medium">Trigramme</th>
                <th className="py-2 font-medium">Affecté le</th>
                <th className="py-2 text-right font-medium">Projets actifs</th>
              </tr>
            </thead>
            <tbody>
              {clients.map((c) => (
                <tr key={c.id} className="border-b last:border-0">
                  <td className="py-2 font-medium">{c.raison_sociale}</td>
                  <td className="py-2">{c.trigramme}</td>
                  <td className="py-2">
                    {c.cdp_affecte_at ? formatDate(c.cdp_affecte_at) : '-'}
                  </td>
                  <td className="py-2 text-right tabular-nums">
                    {c.nbProjetsActifs}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}
