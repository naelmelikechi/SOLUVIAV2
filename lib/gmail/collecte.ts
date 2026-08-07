import type { GmailMessageHeaders } from '@/lib/gmail/client';

/**
 * Ligne prete a inserer dans emails_envoyes pour un message Gmail rattache.
 * AUCUN champ de corps : uniquement les metadonnees necessaires a
 * l'affichage (date, sujet, expediteur, destinataires) et au rattachement.
 */
export interface LigneGmailACollecter {
  source: 'gmail';
  envoye_le: string;
  sujet: string;
  expediteur: string | null;
  destinataires: string[];
  client_id: string;
  external_id: string;
  /**
   * true si plusieurs contacts de clients DIFFERENTS figuraient parmi les
   * participants connus du message. On rattache au premier trouve (ordre :
   * expediteur, puis destinataires dans l'ordre du champ To) sans dupliquer
   * la ligne -- ce champ permet a l'appelant (le cron) de le signaler dans
   * ses logs sans que cette fonction, volontairement pure, ait d'effet de
   * bord.
   */
  ambigu: boolean;
}

/**
 * Extrait l'adresse email d'un en-tete brut, qu'il soit de la forme
 * "Nom <adresse@x.fr>" ou juste "adresse@x.fr". Comparaison insensible a la
 * casse (les en-tetes email ne le sont pas par convention, mais les
 * fournisseurs normalisent rarement la casse a l'envoi).
 */
function extraireEmail(raw: string): string {
  const match = raw.match(/<([^>]+)>/);
  const adresse = match?.[1] ?? raw;
  return adresse.trim().toLowerCase();
}

function extraireEmails(raw: string): string[] {
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map(extraireEmail);
}

/**
 * Decide si un message Gmail doit etre collecte, et pour quel client.
 *
 * C'est ici que vit la regle de perimetre : SEULS les messages dont au
 * moins un participant (expediteur OU destinataire) correspond a un
 * client_contacts.email connu sont rattaches. Un echange avec une adresse
 * inconnue n'est rattache a rien et retourne `null` -- rien n'est stocke.
 *
 * Fonction pure : pas d'IO, testable sans mock. `contactsParEmail` associe
 * une adresse email NORMALISEE (minuscules) a un client_id.
 */
export function rattacherMessage(
  entetes: GmailMessageHeaders,
  contactsParEmail: Map<string, string>,
): LigneGmailACollecter | null {
  const participants = [
    ...(entetes.de ? [extraireEmail(entetes.de)] : []),
    ...entetes.a.flatMap(extraireEmails),
  ];

  const clientsTrouves: string[] = [];
  for (const p of participants) {
    const clientId = contactsParEmail.get(p);
    if (clientId && !clientsTrouves.includes(clientId)) {
      clientsTrouves.push(clientId);
    }
  }

  const [premierClientId] = clientsTrouves;
  if (!premierClientId) return null;

  const dateIso = entetes.date
    ? new Date(entetes.date).toISOString()
    : new Date().toISOString();

  return {
    source: 'gmail',
    envoye_le: dateIso,
    sujet: entetes.sujet,
    expediteur: entetes.de,
    destinataires: entetes.a,
    client_id: premierClientId,
    external_id: entetes.id,
    ambigu: clientsTrouves.length > 1,
  };
}
