// oxlint-disable-next-line react-doctor/prefer-dynamic-import
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Image,
  type DocumentProps,
} from '@react-pdf/renderer';
import type { DevisDetail } from '@/lib/queries/devis';
import { SIGNATURE_SOLUVIA_DATA_URI } from '@/lib/assets/signature-soluvia';
import { type ReactElement } from 'react';
import { formatClientAddressLines } from '@/lib/utils/fr-address';

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
  colLibelle: { width: '50%' },
  colQte: { width: '10%', textAlign: 'right' },
  colPu: { width: '17%', textAlign: 'right' },
  colMontant: { width: '17%', textAlign: 'right' },
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
  // Mentions SOLUVIA apposees automatiquement sous la signature.
  cachet: {
    marginTop: 6,
  },
  cachetName: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    color: '#1a1a1a',
  },
  cachetLine: { fontSize: 7, color: '#6b7280', marginTop: 1 },
  // Signature manuscrite scannee (data URI, fond transparent).
  signatureImg: {
    width: 150,
    height: 48,
    marginTop: 4,
    objectFit: 'contain',
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

const eurFormatter = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
});

function formatEur(n: number | null | undefined): string {
  if (n == null) return '0,00 EUR';
  // Intl fr-FR utilise U+202F (espace fine insecable) comme separateur de
  // milliers et U+00A0 avant le €. La police Helvetica du PDF n'a pas le
  // glyphe U+202F (rendu comme "/"). On normalise tout espace en espace ASCII.
  return eurFormatter.format(n).replace(/\s/g, ' ');
}

function formatDate(s: string | null | undefined): string {
  if (!s) return '-';
  return new Date(s).toLocaleDateString('fr-FR');
}

export function DevisPdf({
  devis,
}: {
  devis: DevisDetail;
}): ReactElement<DocumentProps> {
  const soc = devis.societe_emettrice;
  const client = devis.client;
  const lignes = devis.lignes ?? [];

  const conditions =
    devis.conditions_reglement ??
    soc?.conditions_reglement_default ??
    'Virement bancaire';

  const mentions =
    soc?.mentions_legales ??
    `Devis valable jusqu'au ${formatDate(devis.date_validite)}. TVA 20% applicable.`;

  const raisonSociale = soc?.raison_sociale ?? 'SOLUVIA';
  // Cachet appose automatiquement : ville d'emission + date du devis.
  const villeCachet = soc?.ville ?? 'Niort';
  const dateCachet = formatDate(
    // oxlint-disable-next-line react-doctor/rendering-hydration-mismatch-time
    devis.date_emission ?? new Date().toISOString().slice(0, 10),
  );
  // Evite la ligne d'identite dupliquee dans le footer quand
  // `mentions_legales` contient deja le SIRET (cas par defaut en base).
  const footerMentionsIdentite = soc ? mentions.includes(soc.siret) : false;

  // Group TVA rates for totals display
  const tvaGroups = lignes.reduce<Record<number, number>>((acc, l) => {
    const taux = Number(l.taux_tva);
    acc[taux] = (acc[taux] ?? 0) + Number(l.total_tva);
    return acc;
  }, {});

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            {soc?.logo_url ? (
              // eslint-disable-next-line jsx-a11y/alt-text
              <Image src={soc.logo_url} style={styles.logo} />
            ) : null}
            <Text style={styles.bold}>{soc?.raison_sociale ?? 'SOLUVIA'}</Text>
            <Text>{soc?.adresse}</Text>
            <Text>
              {soc?.code_postal} {soc?.ville}
            </Text>
            <Text style={styles.muted}>SIRET {soc?.siret}</Text>
            <Text style={styles.muted}>TVA {soc?.tva_intracom}</Text>
          </View>
          <View style={styles.headerRight}>
            <Text style={styles.docTitle}>DEVIS</Text>
            <Text style={styles.docRef}>{devis.ref ?? 'Brouillon'}</Text>
            <Text>
              Date :{' '}
              {formatDate(
                // oxlint-disable-next-line react-doctor/rendering-hydration-mismatch-time
                devis.date_emission ?? new Date().toISOString().slice(0, 10),
              )}
            </Text>
            {devis.date_validite ? (
              <Text>Validité : {formatDate(devis.date_validite)}</Text>
            ) : null}
          </View>
        </View>

        {/* Bloc client */}
        <View style={styles.sectionBox}>
          <Text style={styles.label}>Devis pour</Text>
          {client ? (
            <>
              <Text style={styles.bold}>{client.raison_sociale}</Text>
              {formatClientAddressLines(
                client.adresse,
                client.localisation,
              ).map((line, i) => (
                <Text key={i}>{line}</Text>
              ))}
              {client.siret ? (
                <Text style={styles.muted}>SIRET {client.siret}</Text>
              ) : null}
              {client.tva_intracommunautaire ? (
                <Text style={styles.muted}>
                  TVA {client.tva_intracommunautaire}
                </Text>
              ) : null}
            </>
          ) : (
            <Text style={styles.muted}>Client non spécifié</Text>
          )}
        </View>

        {/* Objet */}
        <View style={{ marginBottom: 16 }}>
          <Text style={styles.label}>Objet</Text>
          <Text>{devis.objet}</Text>
        </View>

        {/* Table lignes */}
        <View style={styles.tableHeader}>
          <Text style={[styles.colNum, styles.bold]}>#</Text>
          <Text style={[styles.colLibelle, styles.bold]}>Libellé</Text>
          <Text style={[styles.colQte, styles.bold]}>Qté</Text>
          <Text style={[styles.colPu, styles.bold]}>PU HT</Text>
          <Text style={[styles.colMontant, styles.bold]}>Montant HT</Text>
        </View>
        {lignes.map((l, idx) => (
          <View key={l.id} style={styles.tableRow} wrap={false}>
            <Text style={styles.colNum}>{idx + 1}</Text>
            <View style={styles.colLibelle}>
              <Text>{l.libelle}</Text>
              {l.description ? (
                <Text style={[styles.muted, { fontSize: 8 }]}>
                  {l.description}
                </Text>
              ) : null}
            </View>
            <Text style={styles.colQte}>{Number(l.quantite)}</Text>
            <Text style={styles.colPu}>
              {formatEur(Number(l.prix_unitaire_ht))}
            </Text>
            <Text style={styles.colMontant}>
              {formatEur(Number(l.total_ht))}
            </Text>
          </View>
        ))}

        {/* Totaux */}
        <View style={styles.totalsContainer}>
          <View style={styles.totalsRow}>
            <Text style={styles.muted}>Sous-total HT</Text>
            <Text>{formatEur(Number(devis.montant_ht))}</Text>
          </View>
          {Object.entries(tvaGroups).map(([taux, montant]) => (
            <View key={taux} style={styles.totalsRow}>
              <Text style={styles.muted}>TVA {taux}%</Text>
              <Text>{formatEur(montant)}</Text>
            </View>
          ))}
          <View style={styles.totalsTtc}>
            <Text style={styles.totalsTtcLabel}>Total TTC</Text>
            <Text style={styles.totalsTtcValue}>
              {formatEur(Number(devis.montant_ttc))}
            </Text>
          </View>
        </View>

        {/* Modalites de paiement + RIB */}
        <View style={styles.paymentBox} wrap={false}>
          <Text style={styles.label}>Modalités de paiement</Text>
          <Text style={{ marginTop: 4 }}>{conditions}</Text>
          {soc?.banque_nom ? (
            <>
              <View style={styles.paymentRow}>
                <Text style={styles.paymentLabel}>Banque</Text>
                <Text style={styles.paymentValue}>{soc.banque_nom}</Text>
              </View>
              {soc.banque_iban ? (
                <View style={styles.paymentRow}>
                  <Text style={styles.paymentLabel}>IBAN</Text>
                  <Text style={styles.paymentValue}>{soc.banque_iban}</Text>
                </View>
              ) : null}
              {soc.banque_bic ? (
                <View style={styles.paymentRow}>
                  <Text style={styles.paymentLabel}>BIC</Text>
                  <Text style={styles.paymentValue}>{soc.banque_bic}</Text>
                </View>
              ) : null}
            </>
          ) : null}
        </View>

        {/* Signature */}
        <View style={styles.signatureRow} wrap={false}>
          <View style={styles.signatureBox}>
            <Text style={styles.label}>Pour {raisonSociale}</Text>
            {/* Signature manuscrite apposee automatiquement. */}
            {/* eslint-disable-next-line jsx-a11y/alt-text */}
            <Image
              src={SIGNATURE_SOLUVIA_DATA_URI}
              style={styles.signatureImg}
            />
            {/* Cachet appose automatiquement (bloc tampon). */}
            <View style={styles.cachet}>
              <Text style={styles.cachetName}>{raisonSociale}</Text>
              {soc?.capital_social ? (
                <Text style={styles.cachetLine}>
                  {soc.forme_juridique ? `${soc.forme_juridique} ` : ''}au
                  capital de {formatEur(Number(soc.capital_social))}
                </Text>
              ) : null}
              {soc?.siret ? (
                <Text style={styles.cachetLine}>SIRET {soc.siret}</Text>
              ) : null}
              <Text style={styles.cachetLine}>
                {villeCachet}, le {dateCachet}
              </Text>
            </View>
          </View>
          <View style={styles.signatureBox}>
            <Text style={styles.label}>Bon pour accord - Client</Text>
            <Text style={[styles.muted, { fontSize: 8 }]}>
              {`Date, cachet et signature précédés de la mention manuscrite "Bon pour accord"`}
            </Text>
          </View>
        </View>

        {/* Footer */}
        <View style={styles.footer} fixed>
          <Text>{mentions}</Text>
          {soc && !footerMentionsIdentite ? (
            <Text style={{ marginTop: 4 }}>
              {soc.raison_sociale} - SIRET {soc.siret} - TVA {soc.tva_intracom}
            </Text>
          ) : null}
        </View>
      </Page>
    </Document>
  ) as ReactElement<DocumentProps>;
}
