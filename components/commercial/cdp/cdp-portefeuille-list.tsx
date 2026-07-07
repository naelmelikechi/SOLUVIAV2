'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { FileText, Loader2 } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { formatDate } from '@/lib/utils/formatters';
import { getSyntheseCdpDownloadUrl } from '@/lib/actions/passation';
import type { CdpPortefeuilleClient } from '@/lib/queries/cdp';

interface CdpPortefeuilleListProps {
  clients: CdpPortefeuilleClient[];
}

/**
 * Vue "Mon portefeuille" du CDP affecté : ses clients sous gestion avec,
 * le cas échéant, le téléchargement de la synthèse de passation (variante
 * CDP, section 8 masquée - le lien signé est délivré côté serveur sous RLS).
 */
export function CdpPortefeuilleList({ clients }: CdpPortefeuilleListProps) {
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const handleDownload = async (syntheseId: string) => {
    setDownloadingId(syntheseId);
    try {
      const res = await getSyntheseCdpDownloadUrl(syntheseId);
      if (res.url) {
        window.open(res.url, '_blank', 'noopener,noreferrer');
      } else {
        toast.error(res.error ?? 'Document indisponible');
      }
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Clients sous gestion</CardTitle>
      </CardHeader>
      <CardContent>
        {clients.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Aucun client sous gestion pour le moment.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-foreground border-b text-left">
                <th className="py-2 font-medium">Raison sociale</th>
                <th className="py-2 font-medium">Trigramme</th>
                <th className="py-2 font-medium">Affecté le</th>
                <th className="py-2 text-right font-medium">Projets actifs</th>
                <th className="py-2 text-right font-medium">Passation</th>
              </tr>
            </thead>
            <tbody>
              {clients.map((c) => {
                const synthese = c.synthese;
                return (
                  <tr key={c.id} className="border-b last:border-0">
                    <td className="py-2 font-medium">{c.raison_sociale}</td>
                    <td className="py-2">{c.trigramme}</td>
                    <td className="py-2">
                      {c.cdp_affecte_at ? formatDate(c.cdp_affecte_at) : '-'}
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {c.nbProjetsActifs}
                    </td>
                    <td className="py-2 text-right">
                      {synthese?.pdf_path_cdp ? (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={downloadingId === synthese.id}
                          onClick={() => handleDownload(synthese.id)}
                        >
                          {downloadingId === synthese.id ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <FileText className="size-4" />
                          )}
                          Synthèse de passation
                        </Button>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}
