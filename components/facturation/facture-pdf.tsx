import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import type { FactureDetail } from '@/lib/queries/factures';
import type { EmetteurInfo } from '@/lib/queries/parametres';

const EMETTEUR_FALLBACK: EmetteurInfo = {
  raison_sociale: 'SOLUVIA',
  adresse: '27 Rue Jacqueline Cochran, 79000 Niort',
  siret: '994 241 537 00012',
  tva: 'FR37994241537',
};

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontSize: 9,
    fontFamily: 'Helvetica',
    color: '#1a1a1a',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 30,
  },
  headerLeft: {},
  headerRight: {
    textAlign: 'right',
  },
  companyName: {
    fontSize: 16,
    fontFamily: 'Helvetica-Bold',
    color: '#16a34a',
    marginBottom: 4,
  },
  docTitle: {
    fontSize: 14,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 4,
  },
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
  bold: {
    fontFamily: 'Helvetica-Bold',
  },
  muted: {
    color: '#6b7280',
  },
  // Table
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
  colContrat: { width: '18%' },
  colApprenant: { width: '24%' },
  colDescription: { width: '38%' },
  colMontant: { width: '20%', textAlign: 'right' },
  // Totals
  totalsContainer: {
    marginTop: 16,
    alignItems: 'flex-end',
  },
  totalsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: 200,
    paddingVertical: 3,
  },
  totalsTtc: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: 200,
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: '#1a1a1a',
    marginTop: 4,
  },
  totalsTtcLabel: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
  },
  totalsTtcValue: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
  },
  // Footer
  footer: {
    position: 'absolute',
    bottom: 40,
    left: 40,
    right: 40,
    fontSize: 7,
    color: '#9ca3af',
    lineHeight: 1.4,
  },
  avoirBanner: {
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fca5a5',
    borderRadius: 4,
    padding: 8,
    marginBottom: 16,
  },
  avoirText: {
    color: '#dc2626',
    fontFamily: 'Helvetica-Bold',
    fontSize: 12,
  },
});

function formatEur(n: number): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
  }).format(n);
}

interface FacturePdfProps {
  facture: FactureDetail;
  origineRef?: string | null;
  emetteur?: EmetteurInfo;
}

export function FacturePdf({ facture, origineRef, emetteur }: FacturePdfProps) {
  const isAvoir = facture.est_avoir;
  const EMETTEUR = emetteur ?? EMETTEUR_FALLBACK;
  // Split adresse into street + city if it contains a comma
  const adresseParts = EMETTEUR.adresse.split(',').map((s) => s.trim());
  const adresseLigne1 = adresseParts[0] ?? EMETTEUR.adresse;
  const adresseLigne2 = adresseParts.slice(1).join(', ');

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.companyName}>{EMETTEUR.raison_sociale}</Text>
            <Text>{adresseLigne1}</Text>
            {adresseLigne2 ? <Text>{adresseLigne2}</Text> : null}
            <Text style={styles.muted}>SIRET {EMETTEUR.siret}</Text>
            <Text style={styles.muted}>TVA {EMETTEUR.tva}</Text>
          </View>
          <View style={styles.headerRight}>
            <Text style={styles.docTitle}>{isAvoir ? 'AVOIR' : 'FACTURE'}</Text>
            <Text style={styles.docRef}>{facture.ref}</Text>
            <Text>
              Date :{' '}
              {facture.date_emission
                ? new Date(facture.date_emission).toLocaleDateString('fr-FR')
                : '-'}
            </Text>
            <Text>
              Échéance :{' '}
              {facture.date_echeance
                ? new Date(facture.date_echeance).toLocaleDateString('fr-FR')
                : '-'}
            </Text>
          </View>
        </View>

        {/* Avoir reference */}
        {isAvoir && origineRef && (
          <View style={styles.avoirBanner}>
            <Text style={styles.avoirText}>
              Avoir sur la facture {origineRef}
            </Text>
            {facture.avoir_motif && (
              <Text style={{ marginTop: 2 }}>
                Motif : {facture.avoir_motif}
              </Text>
            )}
          </View>
        )}

        {/* Destinataire */}
        <View style={styles.sectionBox}>
          <Text style={styles.label}>Facturer à</Text>
          <Text style={styles.bold}>
            {facture.client?.raison_sociale ?? ''}
          </Text>
          {facture.client?.adresse && <Text>{facture.client.adresse}</Text>}
          {facture.client?.siret && (
            <Text style={styles.muted}>SIRET {facture.client.siret}</Text>
          )}
        </View>

        {/* Objet */}
        <View style={{ marginBottom: 16 }}>
          <Text style={styles.label}>Objet</Text>
          <Text>
            Commission de gestion - Projet {facture.projet?.ref ?? ''} -{' '}
            {facture.mois_concerne}
          </Text>
        </View>

        {/* Table header */}
        <View style={styles.tableHeader}>
          <Text style={[styles.colContrat, styles.bold]}>Contrat</Text>
          <Text style={[styles.colApprenant, styles.bold]}>Apprenant</Text>
          <Text style={[styles.colDescription, styles.bold]}>Description</Text>
          <Text style={[styles.colMontant, styles.bold]}>Montant HT</Text>
        </View>

        {/* Table rows */}
        {facture.lignes.map((ligne) => (
          <View key={ligne.id} style={styles.tableRow}>
            <Text style={styles.colContrat}>{ligne.contrat?.ref ?? ''}</Text>
            <Text style={styles.colApprenant}>
              {ligne.contrat
                ? `${ligne.contrat.apprenant_prenom ?? ''} ${ligne.contrat.apprenant_nom ?? ''}`.trim()
                : ''}
            </Text>
            <Text style={[styles.colDescription, styles.muted]}>
              {ligne.description}
            </Text>
            <Text style={styles.colMontant}>
              {isAvoir ? '- ' : ''}
              {formatEur(ligne.montant_ht)}
            </Text>
          </View>
        ))}

        {/* Totals */}
        <View style={styles.totalsContainer}>
          <View style={styles.totalsRow}>
            <Text style={styles.muted}>Sous-total HT</Text>
            <Text>
              {isAvoir ? '- ' : ''}
              {formatEur(facture.montant_ht)}
            </Text>
          </View>
          <View style={styles.totalsRow}>
            <Text style={styles.muted}>TVA {facture.taux_tva}%</Text>
            <Text>
              {isAvoir ? '- ' : ''}
              {formatEur(facture.montant_tva)}
            </Text>
          </View>
          <View style={styles.totalsTtc}>
            <Text style={styles.totalsTtcLabel}>Total TTC</Text>
            <Text style={styles.totalsTtcValue}>
              {isAvoir ? '- ' : ''}
              {formatEur(facture.montant_ttc)}
            </Text>
          </View>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text>
            Conditions de paiement : 30 jours fin de mois. En cas de retard de
            paiement, une pénalité égale à 3 fois le taux d&apos;intérêt légal
            sera appliquée, ainsi qu&apos;une indemnité forfaitaire de 40 € pour
            frais de recouvrement. Pas d&apos;escompte pour paiement anticipé.
          </Text>
          <Text style={{ marginTop: 4 }}>
            {EMETTEUR.raison_sociale} - SIRET {EMETTEUR.siret} - TVA{' '}
            {EMETTEUR.tva}
          </Text>
        </View>
      </Page>
    </Document>
  );
}
