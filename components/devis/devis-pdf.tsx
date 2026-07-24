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
import type { DevisPdfData } from '@/lib/queries/devis';
import { SIGNATURE_SOLUVIA_DATA_URI } from '@/lib/assets/signature-soluvia';
import { type ReactElement } from 'react';
import { formatClientAddressLines } from '@/lib/utils/fr-address';
import { formatEur } from '@/lib/pdf/format';
import { docStyles, createTotalsStyles } from '@/lib/pdf/commercial-doc-styles';
import { DestinataireBlock, TotalsBlock, PaymentRow } from '@/lib/pdf/blocks';

// Styles specifiques au devis ; le socle commun (page, header, table, RIB,
// footer, totaux) vit dans lib/pdf/commercial-doc-styles.
const styles = StyleSheet.create({
  colLibelle: { width: '50%' },
  colQte: { width: '10%', textAlign: 'right' },
  colPu: { width: '17%', textAlign: 'right' },
  colMontant: { width: '17%', textAlign: 'right' },
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
});

const totalsStyles = createTotalsStyles(220);

function formatDate(s: string | null | undefined): string {
  if (!s) return '-';
  return new Date(s).toLocaleDateString('fr-FR');
}

export function DevisPdf({
  devis,
}: {
  devis: DevisPdfData;
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
      <Page size="A4" style={docStyles.page}>
        {/* Header */}
        <View style={docStyles.header}>
          <View>
            {soc?.logo_url ? (
              // eslint-disable-next-line jsx-a11y/alt-text
              <Image src={soc.logo_url} style={docStyles.logo} />
            ) : null}
            <Text style={docStyles.bold}>
              {soc?.raison_sociale ?? 'SOLUVIA'}
            </Text>
            <Text>{soc?.adresse}</Text>
            <Text>
              {soc?.code_postal} {soc?.ville}
            </Text>
            <Text style={docStyles.muted}>SIRET {soc?.siret}</Text>
            <Text style={docStyles.muted}>TVA {soc?.tva_intracom}</Text>
          </View>
          <View style={docStyles.headerRight}>
            <Text style={docStyles.docTitle}>DEVIS</Text>
            <Text style={docStyles.docRef}>{devis.ref ?? 'Brouillon'}</Text>
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
        {client ? (
          <DestinataireBlock
            label="Devis pour"
            raisonSociale={client.raison_sociale}
            addressLines={formatClientAddressLines(
              client.adresse,
              client.localisation,
            )}
            siret={client.siret}
            tva={client.tva_intracommunautaire}
          />
        ) : (
          <DestinataireBlock
            label="Devis pour"
            emptyText="Client non spécifié"
          />
        )}

        {/* Objet */}
        <View style={{ marginBottom: 16 }}>
          <Text style={docStyles.label}>Objet</Text>
          <Text>{devis.objet}</Text>
        </View>

        {/* Table lignes */}
        <View style={docStyles.tableHeader}>
          <Text style={[docStyles.colNum, docStyles.bold]}>#</Text>
          <Text style={[styles.colLibelle, docStyles.bold]}>Libellé</Text>
          <Text style={[styles.colQte, docStyles.bold]}>Qté</Text>
          <Text style={[styles.colPu, docStyles.bold]}>PU HT</Text>
          <Text style={[styles.colMontant, docStyles.bold]}>Montant HT</Text>
        </View>
        {lignes.map((l, idx) => (
          <View key={l.ordre} style={docStyles.tableRow} wrap={false}>
            <Text style={docStyles.colNum}>{idx + 1}</Text>
            <View style={styles.colLibelle}>
              <Text>{l.libelle}</Text>
              {l.description ? (
                <Text style={[docStyles.muted, { fontSize: 8 }]}>
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
        <TotalsBlock
          styles={totalsStyles}
          rows={[
            {
              label: 'Sous-total HT',
              value: formatEur(Number(devis.montant_ht)),
            },
            ...Object.entries(tvaGroups).map(([taux, montant]) => ({
              label: `TVA ${taux}%`,
              value: formatEur(montant),
            })),
          ]}
          ttc={formatEur(Number(devis.montant_ttc))}
        />

        {/* Modalites de paiement + RIB */}
        <View style={docStyles.paymentBox} wrap={false}>
          <Text style={docStyles.label}>Modalités de paiement</Text>
          <Text style={{ marginTop: 4 }}>{conditions}</Text>
          {soc?.banque_nom ? (
            <>
              <PaymentRow label="Banque" value={soc.banque_nom} />
              {soc.banque_iban ? (
                <PaymentRow label="IBAN" value={soc.banque_iban} />
              ) : null}
              {soc.banque_bic ? (
                <PaymentRow label="BIC" value={soc.banque_bic} />
              ) : null}
            </>
          ) : null}
        </View>

        {/* Signature */}
        <View style={styles.signatureRow} wrap={false}>
          <View style={styles.signatureBox}>
            <Text style={docStyles.label}>Pour {raisonSociale}</Text>
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
            <Text style={docStyles.label}>Bon pour accord - Client</Text>
            <Text style={[docStyles.muted, { fontSize: 8 }]}>
              {`Date, cachet et signature précédés de la mention manuscrite "Bon pour accord"`}
            </Text>
          </View>
        </View>

        {/* Footer */}
        <View style={docStyles.footer} fixed>
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
