import { redirect } from 'next/navigation';

// /crm sans sous-route : renvoie vers le dashboard CRM (la sidebar pointe
// directement dessus, mais l'URL nue doit fonctionner aussi).
export default function CrmIndexPage() {
  redirect('/crm/dashboard');
}
