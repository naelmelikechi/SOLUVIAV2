/**
 * Generation one-shot du devis WEETEL (DEV-SOL-0001) aligne sur le visuel
 * SOLUVIA (cf. components/facturation/facture-pdf.tsx).
 *
 * Usage : npx tsx scripts/render-devis-weetel.ts
 * Sortie : ~/Downloads/DEVIS-SOL-0001.pdf
 */
import { writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { homedir } from 'node:os';
import { createElement, type ReactElement } from 'react';
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Image,
  renderToBuffer,
} from '@react-pdf/renderer';

const LOGO_PATH = resolve(process.cwd(), 'public', 'logo.png');

const styles = StyleSheet.create({
  page: {
    padding: 40,
    paddingBottom: 100,
    fontSize: 9,
    fontFamily: 'Helvetica',
    color: '#1a1a1a',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 30,
  },
  headerRight: { textAlign: 'right' },
  logo: { width: 130, height: 26, marginBottom: 8, objectFit: 'contain' },
  docTitle: { fontSize: 14, fontFamily: 'Helvetica-Bold', marginBottom: 4 },
  docRef: {
    fontSize: 12,
    fontFamily: 'Helvetica-Bold',
    color: '#d97706',
    marginBottom: 2,
  },
  label: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 6,
  },
  sectionBox: {
    backgroundColor: '#f9fafb',
    borderRadius: 4,
    padding: 12,
    marginBottom: 16,
  },
  bold: { fontFamily: 'Helvetica-Bold' },
  muted: { color: '#6b7280' },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#f3f4f6',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
    paddingVertical: 5,
    paddingHorizontal: 8,
  },
  colNum: { width: '6%' },
  colCertif: { width: '54%' },
  colQte: { width: '10%', textAlign: 'right' },
  colPu: { width: '15%', textAlign: 'right' },
  colMontant: { width: '15%', textAlign: 'right' },
  totalsContainer: { marginTop: 16, alignItems: 'flex-end' },
  totalsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: 220,
    paddingVertical: 3,
  },
  totalsTtc: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: 220,
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: '#1a1a1a',
    marginTop: 4,
  },
  totalsTtcLabel: { fontSize: 11, fontFamily: 'Helvetica-Bold' },
  totalsTtcValue: { fontSize: 11, fontFamily: 'Helvetica-Bold' },
  paymentBox: {
    marginTop: 18,
    padding: 12,
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#bbf7d0',
    borderRadius: 4,
  },
  paymentRow: { flexDirection: 'row', marginTop: 3 },
  paymentLabel: { width: 70, color: '#6b7280' },
  paymentValue: { flex: 1, fontFamily: 'Helvetica-Bold' },
  signatureRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 24,
    gap: 12,
  },
  signatureBox: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 4,
    padding: 12,
    minHeight: 80,
  },
  footer: {
    position: 'absolute',
    bottom: 40,
    left: 40,
    right: 40,
    fontSize: 7,
    color: '#9ca3af',
    lineHeight: 1.4,
  },
});

function formatEur(n: number): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
  })
    .format(n)
    .replace(/[  ]/g, ' ');
}

const RNCP_LIGNES: string[] = [
  'Maçon',
  'Peintre en bâtiment',
  'Carreleur-chapiste',
  'Chef de chantier travaux publics routes et canalisations',
  'Menuisier aluminium',
  "Électricien d'équipement du bâtiment",
  "Électricien d'installation et de maintenance des systèmes automatisés",
  "Technicien d'intervention en froid commercial et climatisation",
  "Technicien d'intervention en froid industriel",
  "Technicien d'intervention en froid et équipements de cuisines professionnelles",
  "Technicien de maintenance d'ascenseur",
  'Agent de maintenance des bâtiments',
  'Agent technique de réception et de valorisation de déchets',
  'Technicien de traitement des eaux',
  'Soudeur assembleur industriel',
  'Mécanicien réparateur en marine de plaisance',
  'Agent de maintenance en marine de plaisance',
  'Agent Magasinier',
  'Préparateur de commandes en entrepôt',
  'Développeur web et web mobile',
  "Concepteur développeur d'applications",
  'Vendeur-conseil en magasin',
  "Manager d'unité marchande",
  'Cuisinier',
  'Réceptionniste en hôtellerie',
  "Employé d'étage en hôtellerie",
  'Gouvernant en hôtellerie',
  'Gestionnaire de paie',
  "Employé administratif et d'accueil",
  'Secrétaire assistant médico-social',
  'Assistant de direction',
  'Assistant ressources humaines',
  "Formateur professionnel d'adultes",
  "Agent de propreté et d'hygiène",
  'Ouvrier du paysage',
  'Technicien supérieur en automatique et informatique industrielle',
];

const PU_HT = 600;
const TAUX_TVA = 20;

function DevisPdf(): ReactElement {
  const sousTotalHt = RNCP_LIGNES.length * PU_HT;
  const tva = (sousTotalHt * TAUX_TVA) / 100;
  const totalTtc = sousTotalHt + tva;
  const acompteHt = sousTotalHt / 2;
  const acompteTtc = totalTtc / 2;

  return createElement(
    Document,
    null,
    createElement(
      Page,
      { size: 'A4', style: styles.page },
      createElement(
        View,
        { style: styles.header },
        createElement(
          View,
          null,
          createElement(Image, { src: LOGO_PATH, style: styles.logo }),
          createElement(Text, null, '27 Rue Jacqueline Cochran'),
          createElement(Text, null, '79000 Niort'),
          createElement(
            Text,
            { style: styles.muted },
            'SIRET 994 241 537 00012',
          ),
          createElement(
            Text,
            { style: styles.muted },
            'TVA intracommunautaire FR37994241537',
          ),
        ),
        createElement(
          View,
          { style: styles.headerRight },
          createElement(Text, { style: styles.docTitle }, 'DEVIS'),
          createElement(Text, { style: styles.docRef }, 'DEV-SOL-0001'),
          createElement(Text, null, 'Date : 21 mai 2026'),
          createElement(Text, null, 'Validité : 21 août 2026'),
          createElement(Text, { style: styles.muted }, 'Devis valable 3 mois'),
        ),
      ),
      createElement(
        View,
        { style: styles.sectionBox },
        createElement(Text, { style: styles.label }, 'Devis pour'),
        createElement(Text, { style: styles.bold }, 'WEETEL'),
        createElement(Text, null, 'S.A.S.U. - Capital 200,00 €'),
        createElement(Text, null, '187 Boulevard Anatole France'),
        createElement(Text, null, '93200 Saint-Denis'),
        createElement(
          Text,
          { style: styles.muted },
          'SIRET 838 620 300 00031 - RCS Bobigny',
        ),
        createElement(
          Text,
          { style: styles.muted },
          'TVA intracommunautaire FR42 838 620 300',
        ),
      ),
      createElement(
        View,
        { style: { marginBottom: 16 } },
        createElement(Text, { style: styles.label }, 'Objet'),
        createElement(
          Text,
          null,
          "Réalisation et mise en place de 36 dossiers d'agrément pour certifications RNCP",
        ),
      ),
      createElement(
        View,
        { style: styles.tableHeader },
        createElement(Text, { style: [styles.colNum, styles.bold] }, '#'),
        createElement(
          Text,
          { style: [styles.colCertif, styles.bold] },
          'Certification RNCP',
        ),
        createElement(Text, { style: [styles.colQte, styles.bold] }, 'Qté'),
        createElement(Text, { style: [styles.colPu, styles.bold] }, 'PU HT'),
        createElement(
          Text,
          { style: [styles.colMontant, styles.bold] },
          'Montant HT',
        ),
      ),
      ...RNCP_LIGNES.map((libelle, idx) =>
        createElement(
          View,
          { key: idx, style: styles.tableRow, wrap: false },
          createElement(
            Text,
            { style: styles.colNum, key: 'n' },
            String(idx + 1),
          ),
          createElement(Text, { style: styles.colCertif, key: 'c' }, libelle),
          createElement(Text, { style: styles.colQte, key: 'q' }, '1'),
          createElement(
            Text,
            { style: styles.colPu, key: 'p' },
            formatEur(PU_HT),
          ),
          createElement(
            Text,
            { style: styles.colMontant, key: 'm' },
            formatEur(PU_HT),
          ),
        ),
      ),
      createElement(
        View,
        { style: styles.totalsContainer },
        createElement(
          View,
          { style: styles.totalsRow },
          createElement(Text, { style: styles.muted }, 'Sous-total HT'),
          createElement(Text, null, formatEur(sousTotalHt)),
        ),
        createElement(
          View,
          { style: styles.totalsRow },
          createElement(Text, { style: styles.muted }, 'TVA 20%'),
          createElement(Text, null, formatEur(tva)),
        ),
        createElement(
          View,
          { style: styles.totalsTtc },
          createElement(Text, { style: styles.totalsTtcLabel }, 'Total TTC'),
          createElement(
            Text,
            { style: styles.totalsTtcValue },
            formatEur(totalTtc),
          ),
        ),
      ),
      createElement(
        View,
        { style: styles.paymentBox, wrap: false },
        createElement(Text, { style: styles.label }, 'Modalités de paiement'),
        createElement(
          Text,
          { style: { marginTop: 4 } },
          `Acompte de 50% à la signature : ${formatEur(acompteHt)} HT — ${formatEur(acompteTtc)} TTC.`,
        ),
        createElement(
          Text,
          { style: { marginTop: 2 } },
          `Solde de 50% à la livraison des dossiers d'agrément : ${formatEur(acompteHt)} HT — ${formatEur(acompteTtc)} TTC.`,
        ),
        createElement(
          Text,
          { style: { marginTop: 4, color: '#6b7280' } },
          "Règlement par virement bancaire. Le démarrage de la prestation est conditionné à la réception de l'acompte et du devis signé.",
        ),
        createElement(
          View,
          { style: styles.paymentRow },
          createElement(Text, { style: styles.paymentLabel }, 'Titulaire'),
          createElement(Text, { style: styles.paymentValue }, 'S.A.S. SOLUVIA'),
        ),
        createElement(
          View,
          { style: styles.paymentRow },
          createElement(Text, { style: styles.paymentLabel }, 'Banque'),
          createElement(
            Text,
            { style: styles.paymentValue },
            'Crédit Agricole Charente-Maritime Deux-Sèvres',
          ),
        ),
        createElement(
          View,
          { style: styles.paymentRow },
          createElement(Text, { style: styles.paymentLabel }, 'IBAN'),
          createElement(
            Text,
            { style: styles.paymentValue },
            'FR76 1170 6337 1156 0576 1259 857',
          ),
        ),
        createElement(
          View,
          { style: styles.paymentRow },
          createElement(Text, { style: styles.paymentLabel }, 'BIC'),
          createElement(Text, { style: styles.paymentValue }, 'AGRIFRPP817'),
        ),
      ),
      createElement(
        View,
        { style: styles.signatureRow, wrap: false },
        createElement(
          View,
          { style: styles.signatureBox },
          createElement(Text, { style: styles.label }, 'Pour SOLUVIA'),
          createElement(
            Text,
            { style: [styles.muted, { fontSize: 8 }] },
            'Date, cachet et signature',
          ),
        ),
        createElement(
          View,
          { style: styles.signatureBox },
          createElement(
            Text,
            { style: styles.label },
            'Bon pour accord - Client',
          ),
          createElement(
            Text,
            { style: [styles.muted, { fontSize: 8 }] },
            'Date, cachet et signature précédés de la mention manuscrite « Bon pour accord »',
          ),
        ),
      ),
      createElement(
        View,
        { style: styles.footer, fixed: true },
        createElement(
          Text,
          null,
          "Devis valable 3 mois à compter de sa date d'émission. Prix exprimés en euros. TVA 20% applicable. Conditions de règlement : acompte de 50% à la signature du devis, solde de 50% à la livraison. Aucun escompte ne sera accordé en cas de paiement anticipé. En cas de retard de paiement, une pénalité égale à 3 fois le taux d'intérêt légal sera appliquée, ainsi qu'une indemnité forfaitaire de 40 € pour frais de recouvrement.",
        ),
        createElement(
          Text,
          { style: { marginTop: 4 } },
          'S.A.S. SOLUVIA - SIRET 994 241 537 00012 - TVA intracommunautaire FR37994241537',
        ),
      ),
    ),
  );
}

async function main() {
  // Cast aligne sur lib/utils/render-facture-pdf.ts (renderToBuffer attend
  // ReactElement<DocumentProps>, notre composant a sa propre signature).
  const element =
    DevisPdf() as ReactElement<// eslint-disable-next-line @typescript-eslint/no-explicit-any
    any>;
  const buffer = await renderToBuffer(element);
  const out = join(homedir(), 'Downloads', 'DEVIS-SOL-0001.pdf');
  writeFileSync(out, buffer);
  console.log(`✅ Devis généré : ${out}`);
  console.log(`   Taille : ${(buffer.length / 1024).toFixed(1)} Ko`);
}

main().catch((err) => {
  console.error('❌ Erreur génération devis :', err);
  process.exit(1);
});
