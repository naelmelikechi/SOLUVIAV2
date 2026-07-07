'use client';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Send } from 'lucide-react';
import { Button } from '@/components/crm/ui/button';
import { Card, CardContent } from '@/components/crm/ui/card';
import { sendRecapNow } from '@/lib/crm/actions/recap';

export function RecapPreview({
  html,
  kpis,
}: {
  html: string;
  kpis: {
    apprentis: number;
    ouvertes: number;
    conversion: number;
    relancesDues: number;
  };
}) {
  const [pending, start] = useTransition();
  const [sent, setSent] = useState<string | null>(null);

  const onSend = () =>
    start(async () => {
      try {
        const r = await sendRecapNow();
        if (r.sent) {
          setSent(r.recipients.join(', '));
          toast.success(`Récap envoyé à ${r.recipients.join(', ')}`);
        } else {
          toast.info("Récap déjà envoyé aujourd'hui (cron).");
        }
      } catch {
        toast.error("Échec de l'envoi. Vérifier RESEND_API_KEY.");
      }
    });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={onSend} disabled={pending}>
          <Send className="mr-2 h-4 w-4" />
          {pending ? 'Envoi…' : 'Envoyer maintenant'}
        </Button>
        {sent && (
          <span className="text-muted-foreground text-sm">
            Dernier envoi : {sent}
          </span>
        )}
        <span className="text-muted-foreground ml-auto text-sm">
          {kpis.ouvertes} opp. ouvertes · {kpis.relancesDues} relance(s) due(s)
        </span>
      </div>
      <Card>
        <CardContent className="p-0">
          <iframe
            title="Aperçu du récap"
            srcDoc={html}
            className="h-[720px] w-full rounded-lg border-0"
            sandbox=""
          />
        </CardContent>
      </Card>
    </div>
  );
}
