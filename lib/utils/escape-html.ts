/**
 * Escape les caracteres HTML dans une string user-controlled avant
 * interpolation dans un template HTML (emails, exports HTML, etc.).
 *
 * Pourquoi : un nom client (raison_sociale) ou prenom utilisateur peut
 * contenir des caracteres speciaux. Les clients de mail bloquent rarement
 * les scripts mais une injection comme `"><a href="evil">Cliquez ici</a>`
 * dans `raison_sociale` apparait rendue dans Gmail/Outlook, vecteur de
 * phishing lateral.
 */
const HTML_ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
  '/': '&#x2F;',
  '`': '&#x60;',
  '=': '&#x3D;',
};

export function escapeHtml(input: string | null | undefined): string {
  if (input === null || input === undefined) return '';
  return String(input).replace(/[&<>"'`=/]/g, (c) => HTML_ESCAPE_MAP[c] ?? c);
}
