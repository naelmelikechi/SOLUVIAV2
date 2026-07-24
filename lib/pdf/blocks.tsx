import { Text, View } from '@react-pdf/renderer';
import { docStyles, type TotalsStyles } from './commercial-doc-styles';

// ---------------------------------------------------------------------------
// Blocs partages des documents commerciaux PDF (devis + factures).
// Chaque bloc reproduit le markup historique a l'identique : toute evolution
// visuelle ici s'applique aux deux documents.
// ---------------------------------------------------------------------------

/**
 * Encart destinataire ("Facturer à" / "Devis pour") : raison sociale en gras,
 * lignes d'adresse, SIRET et TVA en muted. `emptyText` court-circuite le
 * contenu (cas devis sans client).
 */
export function DestinataireBlock({
  label,
  raisonSociale,
  addressLines = [],
  siret,
  tva,
  emptyText,
}: {
  label: string;
  raisonSociale?: string | null;
  addressLines?: string[];
  siret?: string | null;
  tva?: string | null;
  emptyText?: string;
}) {
  return (
    <View style={docStyles.sectionBox}>
      <Text style={docStyles.label}>{label}</Text>
      {emptyText != null ? (
        <Text style={docStyles.muted}>{emptyText}</Text>
      ) : (
        <>
          <Text style={docStyles.bold}>{raisonSociale}</Text>
          {addressLines.map((line, i) => (
            <Text key={i}>{line}</Text>
          ))}
          {siret ? <Text style={docStyles.muted}>SIRET {siret}</Text> : null}
          {tva ? <Text style={docStyles.muted}>TVA {tva}</Text> : null}
        </>
      )}
    </View>
  );
}

/**
 * Bloc totaux aligne a droite : lignes intermediaires (Sous-total HT, TVA...)
 * puis Total TTC souligne. Les montants arrivent deja formates (formatEur).
 */
export function TotalsBlock({
  styles,
  rows,
  ttc,
}: {
  styles: TotalsStyles;
  rows: Array<{ label: string; value: string }>;
  ttc: string;
}) {
  return (
    <View style={styles.totalsContainer}>
      {rows.map((row) => (
        <View key={row.label} style={styles.totalsRow}>
          <Text style={docStyles.muted}>{row.label}</Text>
          <Text>{row.value}</Text>
        </View>
      ))}
      <View style={styles.totalsTtc}>
        <Text style={styles.totalsTtcLabel}>Total TTC</Text>
        <Text style={styles.totalsTtcValue}>{ttc}</Text>
      </View>
    </View>
  );
}

/** Ligne label/valeur de l'encart Modalites de paiement (RIB). */
export function PaymentRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={docStyles.paymentRow}>
      <Text style={docStyles.paymentLabel}>{label}</Text>
      <Text style={docStyles.paymentValue}>{value}</Text>
    </View>
  );
}
