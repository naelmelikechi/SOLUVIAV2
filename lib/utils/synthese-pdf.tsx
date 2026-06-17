// oxlint-disable-next-line react-doctor/prefer-dynamic-import
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  renderToBuffer,
  type DocumentProps,
} from '@react-pdf/renderer';
import { createElement, type ReactElement } from 'react';
import type { SyntheseData } from '@/lib/queries/passation';
import {
  TYPE_PROSPECT_LABELS,
  CANAL_ORIGINE_LABELS,
  TYPE_RDV_LABELS,
  STATUT_RDV_LABELS,
  ROLE_DECISION_LABELS,
} from '@/lib/utils/constants';

const styles = StyleSheet.create({
  page: {
    padding: 40,
    paddingBottom: 60,
    fontSize: 9,
    fontFamily: 'Helvetica',
    color: '#1a1a1a',
    lineHeight: 1.4,
  },
  header: { marginBottom: 18 },
  docTitle: { fontSize: 14, fontFamily: 'Helvetica-Bold', marginBottom: 4 },
  docRef: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: '#d97706' },
  headerMeta: { fontSize: 8, color: '#6b7280', marginTop: 4 },
  confidential: {
    marginTop: 8,
    fontSize: 7,
    color: '#b91c1c',
    fontFamily: 'Helvetica-Bold',
  },
  sectionTitle: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    marginTop: 14,
    marginBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    paddingBottom: 3,
  },
  internalTitle: { color: '#b91c1c' },
  kvRow: {
    flexDirection: 'row',
    paddingVertical: 2,
  },
  kvLabel: { width: '38%', color: '#6b7280' },
  kvValue: { width: '62%' },
  paragraph: { marginBottom: 4 },
  bold: { fontFamily: 'Helvetica-Bold' },
  muted: { color: '#6b7280' },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#f3f4f6',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  cellHeader: { fontFamily: 'Helvetica-Bold', fontSize: 8 },
  bullet: { flexDirection: 'row', paddingVertical: 1 },
  bulletDot: { width: 10 },
  internalBox: {
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    borderRadius: 4,
    padding: 10,
    marginTop: 4,
  },
  footer: {
    position: 'absolute',
    bottom: 28,
    left: 40,
    right: 40,
    fontSize: 7,
    color: '#9ca3af',
  },
});

function fmtDate(s: string | null | undefined): string {
  if (!s) return '-';
  return new Date(s).toLocaleDateString('fr-FR');
}

function txt(v: string | number | null | undefined): string {
  if (v == null || v === '') return '-';
  return String(v);
}

function leviersOf(data: SyntheseData): string[] {
  const raw = data.prospect.leviers;
  if (!Array.isArray(raw)) return [];
  return raw.filter((l): l is string => typeof l === 'string');
}

/**
 * Document de synthèse de passation (Développeur -> Chef de Projet), 8 sections.
 * `includeInterne` contrôle la section 8 (points de vigilance + notes
 * inter-équipes) : présente dans la version complète (Référent CDP + Direction),
 * masquée dans la version transmise au CDP affecté.
 */
export function SynthesePassationDoc({
  data,
  includeInterne,
}: {
  data: SyntheseData;
  includeInterne: boolean;
}): ReactElement<DocumentProps> {
  const p = data.prospect;
  const raisonSociale = data.client?.raison_sociale ?? p.nom;
  const developpeur = data.commercial
    ? `${data.commercial.prenom} ${data.commercial.nom}`
    : '-';
  const leviers = leviersOf(data);

  const identite: Array<[string, string]> = [
    ['Raison sociale', txt(raisonSociale)],
    ['SIREN', txt(p.siren)],
    ['SIRET', txt(p.siret)],
    ['Forme juridique', txt(p.forme_juridique)],
    ['Siège social', txt(p.adresse)],
    [
      "Secteur d'activité (NAF)",
      p.code_naf || p.naf_libelle
        ? `${txt(p.code_naf)} - ${txt(p.naf_libelle)}`
        : '-',
    ],
    ['Effectif', txt(p.effectif_tranche)],
    ['Région', txt(p.region)],
    ['Site web', txt(p.site_web)],
    ['Type de structure', TYPE_PROSPECT_LABELS[p.type_prospect]],
  ];

  const dirigeant: Array<[string, string]> = [
    ['Nom', txt(p.dirigeant_nom)],
    ['Fonction', txt(p.dirigeant_poste)],
    ['Mail', txt(p.dirigeant_email)],
    ['Téléphone', txt(p.dirigeant_telephone)],
  ];

  const modalites: Array<[string, string]> = [
    ['Taux de commission', p.taux_npec != null ? `${p.taux_npec} % NPEC` : '-'],
    [
      'Durée du contrat',
      p.duree_contrat_ans != null ? `${p.duree_contrat_ans} ans` : '-',
    ],
    [
      'Mois de démarrage facturation',
      p.mois_demarrage != null ? `Mois ${p.mois_demarrage}` : '-',
    ],
    [
      'Volume engagé Année 1',
      p.volume_an1 != null ? `${p.volume_an1} alternants` : '-',
    ],
    [
      'Volume engagé Année 2',
      p.volume_an2 != null ? `${p.volume_an2} alternants` : '-',
    ],
    [
      'Volume engagé Année 3',
      p.volume_an3 != null ? `${p.volume_an3} alternants` : '-',
    ],
    [
      'Volume garanti pluri-annuel',
      p.volume_garanti_seuil != null
        ? `Oui - seuil ${p.volume_garanti_seuil}`
        : 'Non',
    ],
  ];

  const documentsJoints: Array<[boolean, string]> = [
    [
      Boolean(data.signature?.signed_document_path),
      'Contrat-cadre signé (PDF)',
    ],
    [false, 'Annexe 2 Rémunération (PDF)'],
    [false, 'Proposition commerciale'],
    [false, 'Présentation Soluvia personnalisée'],
    [false, 'Mail de cadrage envoyé'],
    [false, 'Mail post-signature envoyé'],
  ];

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* En-tête */}
        <View style={styles.header}>
          <Text style={styles.docTitle}>
            Document de synthèse client - Passation Développeur / Chef de Projet
          </Text>
          <Text style={styles.docRef}>{data.referenceDossier}</Text>
          <Text style={styles.headerMeta}>
            Date de signature : {fmtDate(data.signature?.signed_at)} ·
            Développeur en charge : {developpeur} · Produit le{' '}
            {fmtDate(data.dateProduction)}
          </Text>
          <Text style={styles.confidential}>
            Diffusion interne Soluvia uniquement - ne jamais partager avec le
            client.
            {includeInterne
              ? ' Version complète (Référent CDP + Direction).'
              : ' Version CDP affecté (section 8 masquée).'}
          </Text>
        </View>

        {/* 1. Identité du groupe */}
        <Text style={styles.sectionTitle}>1. Identité du groupe</Text>
        {identite.map(([label, value]) => (
          <View key={label} style={styles.kvRow}>
            <Text style={styles.kvLabel}>{label}</Text>
            <Text style={styles.kvValue}>{value}</Text>
          </View>
        ))}

        {/* 2. Interlocuteurs côté groupe */}
        <Text style={styles.sectionTitle}>2. Interlocuteurs côté groupe</Text>
        {data.contacts.length === 0 ? (
          <Text style={styles.muted}>Aucun interlocuteur renseigné.</Text>
        ) : (
          <View>
            <View style={styles.tableHeader}>
              <Text style={[styles.cellHeader, { width: '24%' }]}>
                Prénom Nom
              </Text>
              <Text style={[styles.cellHeader, { width: '18%' }]}>
                Fonction
              </Text>
              <Text style={[styles.cellHeader, { width: '16%' }]}>
                Position
              </Text>
              <Text style={[styles.cellHeader, { width: '22%' }]}>Contact</Text>
              <Text style={[styles.cellHeader, { width: '20%' }]}>
                Sensibilités
              </Text>
            </View>
            {data.contacts.map((c) => {
              const principal = c.id === p.contact_principal_id;
              return (
                <View key={c.id} style={styles.tableRow}>
                  <Text style={{ width: '24%' }}>
                    {txt(c.nom)}
                    {principal ? ' (principal)' : ''}
                  </Text>
                  <Text style={{ width: '18%' }}>{txt(c.poste)}</Text>
                  <Text style={{ width: '16%' }}>
                    {c.role_decision
                      ? ROLE_DECISION_LABELS[c.role_decision]
                      : '-'}
                  </Text>
                  <Text style={{ width: '22%' }}>
                    {txt(c.email)}
                    {c.telephone ? `\n${c.telephone}` : ''}
                  </Text>
                  <Text style={{ width: '20%' }}>{txt(c.sensibilites)}</Text>
                </View>
              );
            })}
          </View>
        )}
        <View style={{ marginTop: 6 }}>
          <Text style={styles.bold}>Dirigeant / signataire</Text>
          {dirigeant.map(([label, value]) => (
            <View key={label} style={styles.kvRow}>
              <Text style={styles.kvLabel}>{label}</Text>
              <Text style={styles.kvValue}>{value}</Text>
            </View>
          ))}
        </View>

        {/* 3. Historique commercial */}
        <Text style={styles.sectionTitle}>3. Historique commercial</Text>
        <View style={styles.kvRow}>
          <Text style={styles.kvLabel}>Canal d&apos;origine</Text>
          <Text style={styles.kvValue}>
            {p.canal_origine ? CANAL_ORIGINE_LABELS[p.canal_origine] : '-'}
          </Text>
        </View>
        <View style={styles.kvRow}>
          <Text style={styles.kvLabel}>Premier contact</Text>
          <Text style={styles.kvValue}>{fmtDate(p.created_at)}</Text>
        </View>
        <Text style={[styles.bold, { marginTop: 6, marginBottom: 3 }]}>
          Chronologie des RDV
        </Text>
        {data.rdvs.length === 0 ? (
          <Text style={styles.muted}>Aucun RDV enregistré.</Text>
        ) : (
          <View>
            <View style={styles.tableHeader}>
              <Text style={[styles.cellHeader, { width: '18%' }]}>Date</Text>
              <Text style={[styles.cellHeader, { width: '24%' }]}>Type</Text>
              <Text style={[styles.cellHeader, { width: '16%' }]}>Statut</Text>
              <Text style={[styles.cellHeader, { width: '42%' }]}>Objet</Text>
            </View>
            {data.rdvs.map((r) => (
              <View key={r.id} style={styles.tableRow}>
                <Text style={{ width: '18%' }}>
                  {fmtDate(r.date_realisee ?? r.date_prevue)}
                </Text>
                <Text style={{ width: '24%' }}>
                  {TYPE_RDV_LABELS[r.type_rdv]}
                </Text>
                <Text style={{ width: '16%' }}>
                  {STATUT_RDV_LABELS[r.statut]}
                </Text>
                <Text style={{ width: '42%' }}>{txt(r.objet)}</Text>
              </View>
            ))}
          </View>
        )}
        {p.notes_import ? (
          <View style={{ marginTop: 6 }}>
            <Text style={styles.bold}>Évolution du dossier</Text>
            <Text style={styles.paragraph}>{p.notes_import}</Text>
          </View>
        ) : null}

        {/* 4. Périmètre & besoin */}
        <Text style={styles.sectionTitle}>4. Périmètre &amp; besoin</Text>
        <View style={styles.kvRow}>
          <Text style={styles.kvLabel}>Volume d&apos;apprenants estimé</Text>
          <Text style={styles.kvValue}>{txt(p.volume_apprenants)}</Text>
        </View>
        <Text style={[styles.bold, { marginTop: 6, marginBottom: 3 }]}>
          Périmètre des missions
        </Text>
        <Text style={styles.paragraph}>
          {p.perimetre_missions ? p.perimetre_missions : '-'}
        </Text>

        {/* 5. Engagements négociés */}
        <Text style={styles.sectionTitle}>
          5. Engagements négociés (annexe 2 du contrat-cadre)
        </Text>
        {modalites.map(([label, value]) => (
          <View key={label} style={styles.kvRow}>
            <Text style={styles.kvLabel}>{label}</Text>
            <Text style={styles.kvValue}>{value}</Text>
          </View>
        ))}
        <Text style={[styles.bold, { marginTop: 6, marginBottom: 3 }]}>
          Leviers complémentaires activés
        </Text>
        {leviers.length === 0 ? (
          <Text style={styles.muted}>Aucun levier renseigné.</Text>
        ) : (
          leviers.map((l) => (
            <View key={l} style={styles.bullet}>
              <Text style={styles.bulletDot}>-</Text>
              <Text>{l}</Text>
            </View>
          ))
        )}

        {/* 6. Calendrier prévisionnel */}
        <Text style={styles.sectionTitle}>6. Calendrier prévisionnel</Text>
        <View style={styles.kvRow}>
          <Text style={styles.kvLabel}>Démarrage facturation prévu</Text>
          <Text style={styles.kvValue}>
            {p.mois_demarrage != null ? `Mois ${p.mois_demarrage}` : '-'}
          </Text>
        </View>
        <Text style={[styles.muted, { marginTop: 3 }]}>
          Calendrier détaillé des jalons (NDA, UAI, Qualiopi, conventionnement
          OPCO, recrutements, 1ère cohorte) à compléter lors de la prise en main
          opérationnelle.
        </Text>

        {/* 7. Documents joints */}
        <Text style={styles.sectionTitle}>7. Documents joints</Text>
        {documentsJoints.map(([joined, label]) => (
          <View key={label} style={styles.bullet}>
            <Text style={styles.bulletDot}>{joined ? '[x]' : '[ ]'}</Text>
            <Text>{label}</Text>
          </View>
        ))}

        {/* 8. Note interne (masquée pour le CDP affecté) */}
        {includeInterne ? (
          <View>
            <Text style={[styles.sectionTitle, styles.internalTitle]}>
              8. Points de vigilance &amp; notes inter-équipes (interne)
            </Text>
            <View style={styles.internalBox}>
              <Text style={styles.bold}>Points de vigilance</Text>
              <Text style={styles.paragraph}>
                {p.points_vigilance ? p.points_vigilance : '-'}
              </Text>
              <Text style={[styles.bold, { marginTop: 6 }]}>
                Notes inter-équipes
              </Text>
              <Text style={styles.paragraph}>
                {p.notes_inter_equipe ? p.notes_inter_equipe : '-'}
              </Text>
            </View>
          </View>
        ) : null}

        <Text
          style={styles.footer}
          render={({ pageNumber, totalPages }) =>
            `${data.referenceDossier} · Synthèse de passation Soluvia · page ${pageNumber}/${totalPages}`
          }
          fixed
        />
      </Page>
    </Document>
  ) as ReactElement<DocumentProps>;
}

/** Rend le document de synthèse en buffer PDF (server-only). */
export async function renderSynthesePdf(
  data: SyntheseData,
  includeInterne: boolean,
): Promise<Buffer> {
  const element = createElement(SynthesePassationDoc, {
    data,
    includeInterne,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as ReactElement<any>;
  return renderToBuffer(element);
}
