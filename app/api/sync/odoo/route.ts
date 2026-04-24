import { NextResponse } from 'next/server';

export const maxDuration = 10;

// INTEGRATION ODOO DESACTIVEE
//
// Le client Odoo est encore un stub (aucun appel XML-RPC reel). Le cron
// associe a ete retire de vercel.json (commit 574281d). Cette route reste
// volontairement presente pour que la reactivation soit un simple retour
// de la logique + reinscription du cron, mais elle refuse tout appel pour
// eviter qu'un test manuel ou un deploiement mal configure ne declenche
// un sync sur un client non fonctionnel.
export async function GET() {
  return NextResponse.json(
    {
      success: false,
      error: 'odoo_sync_disabled',
      message:
        'La synchronisation Odoo est desactivee tant que le client n est pas implemente.',
    },
    { status: 501 },
  );
}
