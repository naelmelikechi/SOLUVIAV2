import { StyleSheet } from '@react-pdf/renderer';

// ---------------------------------------------------------------------------
// Identite visuelle commune des documents commerciaux PDF (devis + factures).
// Source unique : toute evolution de charte (couleurs, typographie, table,
// encart RIB, footer) se fait ici et s'applique aux deux documents.
// Les styles specifiques a un document (colonnes de table, banners, signature)
// restent dans le composant concerne.
// ---------------------------------------------------------------------------

export const docStyles = StyleSheet.create({
  page: {
    padding: 40,
    // Footer en position absolute (bottom: 40, hauteur ~50). Sans
    // paddingBottom, le contenu coule par-dessus le footer (chevauchement
    // observe en prod sur facture multi-pages). On reserve l espace.
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

export type TotalsStyles = ReturnType<typeof createTotalsStyles>;

/**
 * Bloc totaux (Sous-total / TVA / Total TTC) : memes styles, seule la largeur
 * differe entre documents (historiquement 220 pour le devis, 200 pour la
 * facture - conserve a l'identique pour ne pas bouger le rendu).
 */
export function createTotalsStyles(width: number) {
  return StyleSheet.create({
    totalsContainer: { marginTop: 16, alignItems: 'flex-end' },
    totalsRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      width,
      paddingVertical: 3,
    },
    totalsTtc: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      width,
      paddingVertical: 6,
      borderTopWidth: 1,
      borderTopColor: '#1a1a1a',
      marginTop: 4,
    },
    totalsTtcLabel: { fontSize: 11, fontFamily: 'Helvetica-Bold' },
    totalsTtcValue: { fontSize: 11, fontFamily: 'Helvetica-Bold' },
  });
}
