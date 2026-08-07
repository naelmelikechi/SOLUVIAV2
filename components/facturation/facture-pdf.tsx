// oxlint-disable-next-line react-doctor/prefer-dynamic-import
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Image,
} from '@react-pdf/renderer';
import type { FactureDetail } from '@/lib/queries/factures';
import type { EmetteurInfo } from '@/lib/queries/parametres';
import { formatDate } from '@/lib/utils/formatters';
import { reglementParDefaut } from '@/lib/utils/facture-reglement';
import {
  AUTOLIQUIDATION_MENTION,
  resolveTvaRegime,
} from '@/lib/utils/tva-intracom';
import { formatClientAddressLines } from '@/lib/utils/fr-address';
import { buildEInvoicingMentions } from '@/lib/utils/e-invoicing-mentions';
import { formatEur } from '@/lib/pdf/format';
import { ttcLigne, ventilerTvaParTaux } from '@/lib/utils/tva-ventilation';
import { docStyles, createTotalsStyles } from '@/lib/pdf/commercial-doc-styles';
import { DestinataireBlock, TotalsBlock, PaymentRow } from '@/lib/pdf/blocks';

const EMETTEUR_FALLBACK: EmetteurInfo = {
  raison_sociale: 'SOLUVIA',
  adresse: '27 Rue Jacqueline Cochran, 79000 Niort',
  siret: '994 241 537 00012',
  tva: 'FR37994241537',
  iban: null,
  bic: null,
  banque: null,
  titulaire_compte: null,
};

// Styles specifiques a la facture ; le socle commun (page, header, table,
// RIB, footer, totaux) vit dans lib/pdf/commercial-doc-styles.
const styles = StyleSheet.create({
  headerLeft: {},
  colDeca: { width: '16%' },
  colApprenant: { width: '20%' },
  colDescription: { width: '26%' },
  colMontantHt: { width: '16%', textAlign: 'right' },
  colMontantTtc: { width: '16%', textAlign: 'right' },
  colDescriptionWide: { width: '54%' },
  colMontantHtWide: { width: '20%', textAlign: 'right' },
  colMontantTtcWide: { width: '20%', textAlign: 'right' },
  // OPCO grouping
  opcoHeader: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    marginTop: 8,
    marginBottom: 4,
    color: '#555',
  },
  opcoSubtotal: {
    fontSize: 9,
    textAlign: 'right',
    marginTop: 4,
    marginBottom: 8,
    fontFamily: 'Helvetica-Bold',
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
  legalMentions: {
    marginTop: 12,
    fontSize: 8,
    color: '#4b5563',
    lineHeight: 1.4,
  },
  draftBanner: {
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: '#fcd34d',
    borderRadius: 4,
    padding: 8,
    marginBottom: 16,
  },
  draftText: {
    color: '#b45309',
    fontFamily: 'Helvetica-Bold',
    fontSize: 12,
  },
});

const totalsStyles = createTotalsStyles(200);

interface FacturePdfProps {
  facture: FactureDetail;
  origineRef?: string | null;
  emetteur?: EmetteurInfo;
  /**
   * Render the facture as a draft preview (échéance not yet emitted).
   * Shows an "APERÇU" banner so the document cannot be mistaken for
   * a real invoice.
   */
  isDraft?: boolean;
  /**
   * Source du logo en-tete. Defaut : logo officiel Soluvia (URL absolue,
   * @react-pdf fetch au render-time). `null` = pas de logo (tests : evite
   * tout appel reseau ; data URI accepte aussi).
   */
  logoSrc?: string | null;
}

const DEFAULT_LOGO_SRC = 'https://app.mysoluvia.com/logo.png';

export function FacturePdf({
  facture,
  origineRef,
  emetteur,
  isDraft,
  logoSrc = DEFAULT_LOGO_SRC,
}: FacturePdfProps) {
  const isAvoir = facture.est_avoir;
  const EMETTEUR = emetteur ?? EMETTEUR_FALLBACK;
  // Split adresse into street + city if it contains a comma
  const adresseParts = EMETTEUR.adresse.split(',').map((s) => s.trim());
  const adresseLigne1 = adresseParts[0] ?? EMETTEUR.adresse;
  const adresseLigne2 = adresseParts.slice(1).join(', ');

  // Detection autoliquidation TVA intracom : client UE non-FR avec taux_tva=0.
  // Sert a afficher la mention obligatoire Art. 283-2 CGI.
  const tvaRegime = resolveTvaRegime(facture.client?.tva_intracommunautaire);
  const isAutoliquidation =
    tvaRegime.isAutoliquidation && Number(facture.taux_tva) === 0;

  // Factures libres (prestation de service) : aucune ligne rattachee a un
  // contrat -> les colonnes DECA et Apprenant sont vides et hors-sujet. On les
  // masque et on elargit Description/HT/TTC. Les factures de commission
  // (lignes avec contrat) conservent les 5 colonnes.
  const hasContratLignes = facture.lignes.some((l) => l.contrat != null);
  const colDescription = hasContratLignes
    ? styles.colDescription
    : styles.colDescriptionWide;
  const colMontantHt = hasContratLignes
    ? styles.colMontantHt
    : styles.colMontantHtWide;
  const colMontantTtc = hasContratLignes
    ? styles.colMontantTtc
    : styles.colMontantTtcWide;

  return (
    <Document>
      <Page size="A4" style={docStyles.page}>
        {/* Header */}
        <View style={docStyles.header}>
          <View style={styles.headerLeft}>
            {/* Logo officiel Soluvia. URL absolue car @react-pdf fetch
                au render-time cote serverless (filesystem read-only). */}
            {logoSrc ? (
              // eslint-disable-next-line jsx-a11y/alt-text
              <Image src={logoSrc} style={docStyles.logo} />
            ) : null}
            <Text>{adresseLigne1}</Text>
            {adresseLigne2 ? <Text>{adresseLigne2}</Text> : null}
            <Text style={docStyles.muted}>SIRET {EMETTEUR.siret}</Text>
            <Text style={docStyles.muted}>
              TVA intracommunautaire {EMETTEUR.tva}
            </Text>
          </View>
          <View style={docStyles.headerRight}>
            <Text style={docStyles.docTitle}>
              {isAvoir ? 'AVOIR' : isDraft ? 'APERÇU FACTURE' : 'FACTURE'}
            </Text>
            <Text style={docStyles.docRef}>{facture.ref}</Text>
            <Text>
              Date :{' '}
              {facture.date_emission ? formatDate(facture.date_emission) : '-'}
            </Text>
            <Text>
              Échéance :{' '}
              {facture.date_echeance ? formatDate(facture.date_echeance) : '-'}
            </Text>
            {facture.conditions_reglement && (
              <Text style={docStyles.bold}>{facture.conditions_reglement}</Text>
            )}
          </View>
        </View>

        {/* Draft banner */}
        {isDraft && (
          <View style={styles.draftBanner}>
            <Text style={styles.draftText}>
              Document provisoire - Aperçu d&apos;échéance non émise
            </Text>
            <Text style={{ marginTop: 2 }}>
              Ce PDF n&apos;est pas une facture légale. Il sera régénéré avec un
              numéro de facture officiel lors de l&apos;émission.
            </Text>
          </View>
        )}

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
        <DestinataireBlock
          label="Facturer à"
          raisonSociale={facture.client?.raison_sociale ?? ''}
          addressLines={formatClientAddressLines(
            facture.client?.adresse,
            facture.client?.localisation,
          )}
          siret={facture.client?.siret}
          tva={facture.client?.tva_intracommunautaire}
        />

        {/* Objet */}
        <View style={{ marginBottom: 16 }}>
          <Text style={docStyles.label}>Objet</Text>
          <Text>
            {facture.objet ??
              (facture.projet?.ref
                ? `Commission de gestion - Projet ${facture.projet.ref} - ${facture.mois_concerne}`
                : `Prestation - ${facture.mois_concerne}`)}
          </Text>
        </View>

        {/* Table header */}
        <View style={docStyles.tableHeader}>
          <Text style={[docStyles.colNum, docStyles.bold]}>N°</Text>
          {hasContratLignes && (
            <Text style={[styles.colDeca, docStyles.bold]}>DECA</Text>
          )}
          {hasContratLignes && (
            <Text style={[styles.colApprenant, docStyles.bold]}>Apprenant</Text>
          )}
          <Text style={[colDescription, docStyles.bold]}>Description</Text>
          <Text style={[colMontantHt, docStyles.bold]}>Montant HT</Text>
          <Text style={[colMontantTtc, docStyles.bold]}>Montant TTC</Text>
        </View>

        {/* Table rows — grouped by opco_code when multiple OPCOs present */}
        {(() => {
          const lignes = facture.lignes;

          // Build groups: opco_code -> lines. Null codes go under '_no_opco'.
          const groupMap = new Map<string, typeof lignes>();
          for (const l of lignes) {
            const key = l.opco_code ?? '_no_opco';
            const arr = groupMap.get(key) ?? [];
            arr.push(l);
            groupMap.set(key, arr);
          }

          // Sort: real codes alphabetically, _no_opco last.
          const groups = Array.from(groupMap.entries()).sort(([a], [b]) => {
            if (a === '_no_opco') return 1;
            if (b === '_no_opco') return -1;
            return a.localeCompare(b);
          });

          // Multi-OPCO when there are 2+ distinct keys (real or mixed real+null).
          const distinctOpcoCount = groups.filter(
            ([k]) => k !== '_no_opco',
          ).length;
          const hasMultipleOpcos =
            distinctOpcoCount > 1 ||
            (distinctOpcoCount === 1 && groupMap.has('_no_opco'));

          const renderLine = (
            ligne: (typeof lignes)[number],
            numero: number,
          ) => {
            // Taux PAR LIGNE quand il est renseigne, sinon le taux d'en-tete.
            // Cf. lib/utils/tva-ventilation : le taux d'en-tete est un taux
            // derive et ne doit pas etre applique aux lignes d'une facture mixte.
            const ligneTtc = ttcLigne(ligne, facture.taux_tva);
            // DECA si renseigne, sinon fallback sur la ref interne du contrat.
            const decaLabel =
              ligne.contrat?.contract_number ?? ligne.contrat?.ref ?? '';
            return (
              <View key={ligne.id} style={docStyles.tableRow}>
                <Text style={docStyles.colNum}>{numero}</Text>
                {hasContratLignes && (
                  <Text style={styles.colDeca}>{decaLabel}</Text>
                )}
                {hasContratLignes && (
                  <Text style={styles.colApprenant}>
                    {ligne.contrat
                      ? `${ligne.contrat.apprenant_prenom ?? ''} ${ligne.contrat.apprenant_nom ?? ''}`.trim()
                      : ''}
                  </Text>
                )}
                <Text style={[colDescription, docStyles.muted]}>
                  {ligne.description}
                </Text>
                <Text style={colMontantHt}>{formatEur(ligne.montant_ht)}</Text>
                <Text style={colMontantTtc}>{formatEur(ligneTtc)}</Text>
              </View>
            );
          };

          if (!hasMultipleOpcos) {
            // Single-OPCO or no OPCO: flat render as before.
            return lignes.map((ligne, i) => renderLine(ligne, i + 1));
          }

          // Multi-OPCO: render with group headers and subtotals.
          let lineNo = 0;
          return groups.map(([key, groupLines]) => {
            const label = key === '_no_opco' ? 'Non spécifié' : `OPCO : ${key}`;
            const subtotalHt =
              Math.round(
                groupLines.reduce((s, l) => s + l.montant_ht, 0) * 100,
              ) / 100;
            return (
              <View key={key}>
                <Text style={styles.opcoHeader}>{label}</Text>
                {groupLines.map((ligne) => {
                  lineNo += 1;
                  return renderLine(ligne, lineNo);
                })}
                <Text style={styles.opcoSubtotal}>
                  {`Sous-total HT ${key === '_no_opco' ? '' : key} : ${formatEur(subtotalHt)}`}
                </Text>
              </View>
            );
          });
        })()}

        {/* Totals. La TVA est ventilee PAR TAUX des qu'il y en a plusieurs :
            `facture.taux_tva` est un taux derive, recalcule par le trigger DB en
            (tva / ht) * 100. Sur une facture mixte (1 000 HT a 20 % + 500 HT a
            0 %) il vaut 13,33 %, qui ne correspond a aucun taux legal francais.
            L'art. 242 nonies A du CGI impose la ventilation par taux distinct. */}
        <TotalsBlock
          styles={totalsStyles}
          rows={[
            { label: 'Sous-total HT', value: formatEur(facture.montant_ht) },
            ...(() => {
              const ventilation = ventilerTvaParTaux(
                facture.lignes ?? [],
                facture.taux_tva,
              );
              // Un seul taux : on prefere montant_tva, valeur de reference
              // calculee par la base, plutot qu'une resomme cote client.
              if (ventilation.length <= 1) {
                return [
                  {
                    label: `TVA ${facture.taux_tva}%`,
                    value: formatEur(facture.montant_tva),
                  },
                ];
              }
              return ventilation.map(({ taux, tva }) => ({
                label: `TVA ${taux}%`,
                value: formatEur(tva),
              }));
            })(),
          ]}
          ttc={formatEur(facture.montant_ttc)}
        />

        {/* Mention autoliquidation TVA - obligatoire B2B intracom UE non-FR */}
        {isAutoliquidation && (
          <View style={{ marginTop: 12 }}>
            <Text style={[docStyles.bold, { color: '#1a1a1a' }]}>
              {AUTOLIQUIDATION_MENTION}
            </Text>
          </View>
        )}

        {/* Mentions e-invoicing 2026 : categorie d'operation (toujours) +
            option TVA sur les debits (si la societe a opte). */}
        <View style={styles.legalMentions}>
          {buildEInvoicingMentions({
            tvaSurDebits: EMETTEUR.tva_sur_debits,
          }).map((m) => (
            <Text key={m}>{m}</Text>
          ))}
        </View>

        {/* Modalites de paiement / RIB */}
        {(EMETTEUR.iban || EMETTEUR.bic) && (
          <View style={docStyles.paymentBox} wrap={false}>
            <Text style={docStyles.label}>Modalités de paiement</Text>
            <Text style={{ marginTop: 4 }}>
              {facture.conditions_reglement
                ? `Règlement par virement bancaire - ${facture.conditions_reglement}.`
                : reglementParDefaut(
                    facture.date_emission,
                    facture.date_echeance,
                  )}
            </Text>
            <Text style={{ marginTop: 2, color: '#6b7280' }}>
              Merci d&apos;indiquer la référence{' '}
              <Text style={docStyles.bold}>{facture.ref}</Text> lors du
              virement.
            </Text>
            {EMETTEUR.titulaire_compte && (
              <PaymentRow label="Titulaire" value={EMETTEUR.titulaire_compte} />
            )}
            {EMETTEUR.banque && (
              <PaymentRow label="Banque" value={EMETTEUR.banque} />
            )}
            {EMETTEUR.iban && <PaymentRow label="IBAN" value={EMETTEUR.iban} />}
            {EMETTEUR.bic && <PaymentRow label="BIC" value={EMETTEUR.bic} />}
          </View>
        )}

        {/* Footer */}
        <View style={docStyles.footer} fixed>
          <Text>
            En cas de retard de paiement, une pénalité égale à 3 fois le taux
            d&apos;intérêt légal sera appliquée, ainsi qu&apos;une indemnité
            forfaitaire de 40 € pour frais de recouvrement. Pas d&apos;escompte
            pour paiement anticipé.
          </Text>
          <Text style={{ marginTop: 4 }}>
            {EMETTEUR.mentions_legales ??
              `${EMETTEUR.raison_sociale} - SIRET ${EMETTEUR.siret} - TVA intracommunautaire ${EMETTEUR.tva}`}
          </Text>
        </View>
      </Page>
    </Document>
  );
}
