// oxlint-disable-next-line react-doctor/prefer-dynamic-import
import {
  Document,
  Image,
  Page,
  Path,
  Polyline,
  renderToBuffer,
  StyleSheet,
  Svg,
  Text,
  View,
  type DocumentProps,
} from '@react-pdf/renderer';
import { createElement, type ReactElement, type ReactNode } from 'react';
import { LOGO_SOLUVIA_DATA_URI } from '@/lib/assets/logo-soluvia';
import type {
  SyntheseSaisies,
  SyntheseSnapshotV2,
} from '@/lib/queries/passation';
import {
  CANAL_ORIGINE_LABELS,
  INITIATEUR_LABELS,
  JALONS_CALENDRIER,
  NIVEAU_CHARGE_LABELS,
  NIVEAU_RISQUE_LABELS,
  ROLE_DECISION_LABELS,
  TUNNEL_LABELS,
  TYPE_FORMATION_LABELS,
  TYPE_RDV_LABELS,
  TYPOLOGIE_CLIENT_LABELS,
} from '@/lib/utils/constants';

/* Charte de la maquette document-synthese-passation.html */
const CORAIL = '#ed6572';
const CORAIL_SOFT = '#fdeef0';
const CORAIL_BORDER = '#f3d3d7';
const ANTHRACITE = '#22221e';
const INK = '#2c2c28';
const MUTED = '#8c8c86';
const LINE = '#ebebe7';

// Data URI : le filesystem serverless Vercel n'embarque pas public/logo.png
// (logo absent des PDFs generes en prod, constat dossier CAP AVENIR 2026-07).
const LOGO_SRC = LOGO_SOLUVIA_DATA_URI;

const styles = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    color: INK,
    backgroundColor: '#ffffff',
    display: 'flex',
    flexDirection: 'column',
  },
  /* header / footer */
  ph: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 28,
    paddingHorizontal: 45,
  },
  phLeft: { flexDirection: 'row', alignItems: 'center' },
  phLogo: { height: 15, width: 74, objectFit: 'contain' },
  phTitle: {
    fontSize: 10,
    color: MUTED,
    fontFamily: 'Helvetica-Bold',
    borderLeftWidth: 1,
    borderLeftColor: LINE,
    paddingLeft: 10,
    marginLeft: 10,
  },
  phStep: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  phNum: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: CORAIL,
    alignItems: 'center',
    justifyContent: 'center',
  },
  phNumText: { color: '#ffffff', fontSize: 12, fontFamily: 'Helvetica-Bold' },
  phStepTitle: {
    color: CORAIL,
    fontFamily: 'Helvetica-Bold',
    fontSize: 11,
    letterSpacing: 0.4,
  },
  pf: {
    marginTop: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 45,
    paddingBottom: 20,
  },
  pfText: { fontSize: 8, color: MUTED },
  pbody: {
    paddingTop: 16,
    paddingHorizontal: 45,
    paddingBottom: 18,
    flexGrow: 1,
    flexDirection: 'column',
  },
  h1: {
    fontSize: 24,
    fontFamily: 'Helvetica-Bold',
    color: ANTHRACITE,
  },
  lead: { fontSize: 11.5, color: MUTED, marginTop: 4 },
  cols: { flexDirection: 'row', gap: 20, marginTop: 14, flexGrow: 1 },
  desc: { fontSize: 11, lineHeight: 1.5, color: INK },
  descBold: { fontFamily: 'Helvetica-Bold', color: ANTHRACITE },
  /* bullets */
  pts: { flexDirection: 'column', gap: 8, marginTop: 12 },
  ptRow: { flexDirection: 'row', gap: 9, alignItems: 'flex-start' },
  ptBadge: {
    width: 19,
    height: 19,
    borderRadius: 6,
    backgroundColor: CORAIL_SOFT,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  ptBadgeText: { color: CORAIL, fontSize: 10, fontFamily: 'Helvetica-Bold' },
  ptText: { fontSize: 10.5, lineHeight: 1.35, color: INK, flex: 1 },
  ptStrong: { fontFamily: 'Helvetica-Bold', color: ANTHRACITE },
  /* encart corail (keep) */
  keep: {
    marginTop: 14,
    backgroundColor: CORAIL_SOFT,
    borderLeftWidth: 4,
    borderLeftColor: CORAIL,
    borderTopRightRadius: 10,
    borderBottomRightRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 13,
  },
  keepK: {
    fontSize: 8.5,
    fontFamily: 'Helvetica-Bold',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: CORAIL,
    marginBottom: 3,
  },
  keepP: { fontSize: 10.5, lineHeight: 1.4, color: INK },
  /* callcard */
  callcard: {
    alignSelf: 'center',
    borderRadius: 14,
    backgroundColor: CORAIL_SOFT,
    borderWidth: 1,
    borderColor: CORAIL_BORDER,
    flexDirection: 'column',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 30,
    paddingHorizontal: 24,
    width: 290,
  },
  ccIcon: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: CORAIL,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ccTitle: {
    fontSize: 17,
    fontFamily: 'Helvetica-Bold',
    color: ANTHRACITE,
    textAlign: 'center',
  },
  ccSub: {
    fontSize: 11,
    color: INK,
    lineHeight: 1.5,
    textAlign: 'center',
    maxWidth: 220,
  },
  ccFacts: { flexDirection: 'row', gap: 9, marginTop: 6, alignSelf: 'stretch' },
  ccFact: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: LINE,
    borderRadius: 10,
    paddingVertical: 11,
    paddingHorizontal: 6,
    alignItems: 'center',
  },
  ccFactB: {
    fontSize: 12,
    color: CORAIL,
    fontFamily: 'Helvetica-Bold',
    textAlign: 'center',
  },
  ccFactS: { fontSize: 8.5, color: MUTED, marginTop: 2, textAlign: 'center' },
  /* interlocuteurs (vsteps) */
  vert: {
    flexGrow: 1,
    flexDirection: 'column',
    justifyContent: 'space-between',
    marginTop: 14,
    gap: 8,
  },
  vstep: {
    flexDirection: 'row',
    gap: 15,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: LINE,
    borderLeftWidth: 4,
    borderLeftColor: CORAIL,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 18,
  },
  vstepN: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: CORAIL,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  vstepNText: { color: '#ffffff', fontFamily: 'Helvetica-Bold', fontSize: 14 },
  vstepT: { fontSize: 12.5, fontFamily: 'Helvetica-Bold', color: ANTHRACITE },
  vstepD: { fontSize: 10.5, color: MUTED, lineHeight: 1.4, marginTop: 2 },
  /* couverture */
  coverTop: {
    flexGrow: 1,
    paddingTop: 45,
    paddingHorizontal: 62,
    flexDirection: 'column',
  },
  coverLogo: {
    height: 52,
    width: 258,
    objectFit: 'contain',
    alignSelf: 'center',
  },
  coverMain: { marginTop: 'auto', marginBottom: 'auto' },
  coverKicker: {
    color: CORAIL,
    fontFamily: 'Helvetica-Bold',
    fontSize: 12,
    letterSpacing: 1.8,
    textTransform: 'uppercase',
  },
  coverTitle: {
    fontSize: 54,
    fontFamily: 'Helvetica-Bold',
    color: ANTHRACITE,
    lineHeight: 1.02,
    marginTop: 12,
  },
  coverRule: {
    width: 60,
    height: 4,
    backgroundColor: CORAIL,
    borderRadius: 2,
    marginVertical: 18,
  },
  coverSub: { fontSize: 15, color: MUTED, maxWidth: 480, lineHeight: 1.5 },
  coverFeatures: { flexDirection: 'row', gap: 24, marginTop: 22 },
  coverFeature: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  coverFeatureBadge: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: CORAIL_SOFT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverFeatureText: {
    fontSize: 11.5,
    fontFamily: 'Helvetica-Bold',
    color: INK,
  },
  coverRef: { fontSize: 11, color: MUTED, marginTop: 18 },
  coverBand: {
    backgroundColor: CORAIL,
    paddingVertical: 32,
    paddingHorizontal: 62,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  bandFlow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  bandChip: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  bandChipBadge: {
    width: 21,
    height: 21,
    borderRadius: 11,
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bandChipBadgeText: {
    color: '#ffffff',
    fontSize: 10.5,
    fontFamily: 'Helvetica-Bold',
  },
  bandChipText: { color: '#ffffff', fontSize: 11 },
  bandArrow: { color: '#ffffff', opacity: 0.6, fontSize: 13 },
  bandTag: {
    color: '#ffffff',
    fontSize: 10.5,
    fontFamily: 'Helvetica-Bold',
    letterSpacing: 0.4,
  },
  /* conclusion */
  conclBody: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 45,
  },
  conclCheck: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: CORAIL,
    alignItems: 'center',
    justifyContent: 'center',
  },
  conclFlow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 24,
  },
  conclChipBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: CORAIL_SOFT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  conclChipBadgeText: {
    color: CORAIL,
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
  },
  conclChipText: {
    fontSize: 10.5,
    fontFamily: 'Helvetica-Bold',
    color: ANTHRACITE,
  },
  conclArrow: { color: MUTED, fontSize: 11 },
  /* section 8 masquée (variante CDP) */
  maskedCard: {
    alignSelf: 'center',
    marginTop: 'auto',
    marginBottom: 'auto',
    borderRadius: 14,
    backgroundColor: CORAIL_SOFT,
    borderWidth: 1,
    borderColor: CORAIL_BORDER,
    alignItems: 'center',
    gap: 12,
    paddingVertical: 40,
    paddingHorizontal: 50,
  },
});

/* ------------------------------ helpers ------------------------------- */

function txt(v: string | number | null | undefined): string {
  if (v == null || v === '') return '-';
  return String(v);
}

function fmtDate(s: string | null | undefined): string {
  if (!s) return '-';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('fr-FR');
}

/** 'YYYY-MM' -> 'MM/YYYY' (jalons du calendrier prévisionnel). */
function fmtMois(s: string | null | undefined): string {
  if (!s) return '-';
  const m = /^(\d{4})-(\d{2})/.exec(s);
  return m ? `${m[2]}/${m[1]}` : s;
}

function fmtCa(v: number | null): string {
  if (v == null) return '-';
  if (v >= 1_000_000) {
    const m = v / 1_000_000;
    return `${m.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} M€`;
  }
  if (v >= 1_000) {
    return `${Math.round(v / 1_000).toLocaleString('fr-FR')} k€`;
  }
  return `${v.toLocaleString('fr-FR')} €`;
}

function initiales(nom: string): string {
  const parts = nom.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase() || '?';
}

function labelOf(labels: Record<string, string>, key: string | null): string {
  if (!key) return '-';
  return labels[key] ?? key;
}

/** Découpe un champ libre en lignes non vides (une puce par ligne). */
function lignesDe(texte: string | null): string[] {
  if (!texte) return [];
  return texte
    .split('\n')
    .map((l) => l.replace(/^\s*[-•*]\s*/, '').trim())
    .filter(Boolean);
}

/* -------------------------------- icons ------------------------------- */

type IconProps = { size?: number; color?: string; strokeWidth?: number };

function CheckIcon({
  size = 10,
  color = CORAIL,
  strokeWidth = 2.5,
}: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Polyline
        points="20 6 9 17 4 12"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

function StrokePaths({
  paths,
  size = 30,
  color = '#ffffff',
}: IconProps & { paths: string[] }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {paths.map((d) => (
        <Path
          key={d}
          d={d}
          stroke={color}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      ))}
    </Svg>
  );
}

const ICON_BUILDING = ['M3 21h18', 'M5 21V7l8-4v18', 'M19 21V11l-6-4'];
const ICON_CHART = ['M6 20v-5', 'M12 20V9', 'M18 20V5', 'M3 20h18'];
const ICON_FOLDER = [
  'M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z',
];
const ICON_USER_CHECK = [
  'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2',
  'M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
  'M16 11l2 2 4-4',
];
const ICON_LOCK = ['M5 11h14v10H5z', 'M8 11V7a4 4 0 0 1 8 0v4'];

/* ---------------------------- building blocks -------------------------- */

const ARROW = '›';

function PageShell({
  num,
  step,
  pageNo,
  children,
}: {
  num?: string;
  step: string;
  pageNo: number;
  children: ReactNode;
}) {
  return (
    <Page size="A4" orientation="landscape" style={styles.page}>
      <View style={styles.ph}>
        <View style={styles.phLeft}>
          {/* eslint-disable-next-line jsx-a11y/alt-text */}
          <Image src={LOGO_SRC} style={styles.phLogo} />
          <Text style={styles.phTitle}>Synthèse de passation client</Text>
        </View>
        <View style={styles.phStep}>
          {num ? (
            <View style={styles.phNum}>
              <Text style={styles.phNumText}>{num}</Text>
            </View>
          ) : null}
          <Text style={styles.phStepTitle}>{step}</Text>
        </View>
      </View>
      {children}
      <View style={styles.pf}>
        <Text style={styles.pfText}>
          SOLUVIA - Synthèse de passation client
        </Text>
        <Text style={styles.pfText}>{pageNo}</Text>
      </View>
    </Page>
  );
}

function Bullet({
  badge,
  strong,
  rest,
  check,
  muted,
}: {
  badge?: string;
  strong?: string;
  rest?: string;
  check?: boolean;
  muted?: boolean;
}) {
  return (
    <View style={styles.ptRow} wrap={false}>
      <View style={styles.ptBadge}>
        {check ? (
          <CheckIcon size={10} color={muted ? MUTED : CORAIL} />
        ) : (
          <Text style={styles.ptBadgeText}>{badge ?? '•'}</Text>
        )}
      </View>
      <Text style={styles.ptText}>
        {strong ? <Text style={styles.ptStrong}>{strong}</Text> : null}
        {strong && rest ? ' - ' : ''}
        {rest ?? ''}
      </Text>
    </View>
  );
}

function Keep({ k, children }: { k: string; children: ReactNode }) {
  return (
    <View style={styles.keep} wrap={false}>
      <Text style={styles.keepK}>{k}</Text>
      <Text style={styles.keepP}>{children}</Text>
    </View>
  );
}

function CallCard({
  icon,
  title,
  sub,
  facts,
}: {
  icon: ReactNode;
  title: string;
  sub: string;
  facts: Array<{ b: string; s: string }>;
}) {
  return (
    <View style={styles.callcard}>
      <View style={styles.ccIcon}>{icon}</View>
      <Text style={styles.ccTitle}>{title}</Text>
      <Text style={styles.ccSub}>{sub}</Text>
      <View style={styles.ccFacts}>
        {facts.map((f) => (
          <View key={f.s} style={styles.ccFact}>
            <Text style={styles.ccFactB}>{f.b}</Text>
            <Text style={styles.ccFactS}>{f.s}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function FlowChips({ labels, band }: { labels: string[]; band?: boolean }) {
  return (
    <View style={band ? styles.bandFlow : styles.conclFlow}>
      {labels.map((l, i) => (
        <View
          key={l}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
        >
          {i > 0 ? (
            <Text style={band ? styles.bandArrow : styles.conclArrow}>
              {ARROW}
            </Text>
          ) : null}
          <View style={styles.bandChip}>
            <View style={band ? styles.bandChipBadge : styles.conclChipBadge}>
              <Text
                style={
                  band ? styles.bandChipBadgeText : styles.conclChipBadgeText
                }
              >
                {i + 1}
              </Text>
            </View>
            <Text style={band ? styles.bandChipText : styles.conclChipText}>
              {l}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

/* -------------------------------- document ----------------------------- */

export type VarianteSynthese = 'complet' | 'cdp';

/**
 * Document de synthèse de passation (Développeur -> Chef de Projet), fidèle à
 * la maquette validée : A4 paysage, couverture + vue d'ensemble + 8 sections +
 * conclusion. La variante 'cdp' remplace la section 8 (recommandation
 * d'affectation) par une page "non disponible pour votre rôle".
 */
export function SynthesePassationDoc({
  snapshot,
  saisies,
  variante,
}: {
  snapshot: SyntheseSnapshotV2;
  saisies: SyntheseSaisies;
  variante: VarianteSynthese;
}): ReactElement<DocumentProps> {
  const { meta, identite, contacts, historique, engagements, calendrier } =
    snapshot;

  const tunnel = meta.tunnel ? TUNNEL_LABELS[meta.tunnel] : null;
  const totalAlternants =
    engagements.volumeAn1 != null ||
    engagements.volumeAn2 != null ||
    engagements.volumeAn3 != null
      ? (engagements.volumeAn1 ?? 0) +
        (engagements.volumeAn2 ?? 0) +
        (engagements.volumeAn3 ?? 0)
      : null;

  const chronologie: Array<{ date: string; titre: string }> = [];
  if (historique.datePremierContact) {
    chronologie.push({
      date: fmtDate(historique.datePremierContact),
      titre: '1er contact',
    });
  }
  for (const r of historique.rdvs) {
    chronologie.push({
      date: fmtDate(r.date),
      titre: r.type
        ? `RDV ${labelOf(TYPE_RDV_LABELS, r.type)}`
        : (r.objet ?? 'RDV'),
    });
  }

  const vigilance = lignesDe(saisies.points_vigilance);
  const jalons = JALONS_CALENDRIER.map((j, i) => ({
    n: String(i + 1),
    label: j.label,
    date: fmtMois(calendrier[j.key] ?? null),
  }));
  const docsPresents = snapshot.documents.filter((d) => d.present).length;

  const identiteBullets: Array<[string, string]> = [
    [
      'Raison sociale',
      identite.formeJuridique
        ? `${identite.raisonSociale} (${identite.formeJuridique})`
        : identite.raisonSociale,
    ],
    ['SIREN', txt(identite.siren)],
    ['Siège social', txt(identite.siege)],
    [
      'Activité',
      identite.codeNaf || identite.nafLibelle
        ? `${txt(identite.codeNaf)} · ${txt(identite.nafLibelle)}`
        : '-',
    ],
    ['Site web', txt(identite.siteWeb)],
    ['Implantations', txt(identite.nbImplantations)],
    ['CA dernier exercice', fmtCa(identite.caDernierExercice)],
  ];

  const engagementsBullets: Array<[string, string]> = [
    [
      'Formations prévues (RNCP)',
      engagements.formationsRncp.length > 0
        ? engagements.formationsRncp.join(' · ')
        : '-',
    ],
    [
      'Modalité de formation',
      labelOf(TYPE_FORMATION_LABELS, engagements.typeFormation),
    ],
    [
      'Taux de commission',
      engagements.tauxNpec != null ? `${engagements.tauxNpec} % du NPEC` : '-',
    ],
    [
      'Durée du contrat',
      engagements.dureeAns != null ? `${engagements.dureeAns} ans` : '-',
    ],
    [
      'Démarrage facturation',
      engagements.moisDemarrage != null
        ? `mois ${engagements.moisDemarrage}`
        : '-',
    ],
    [
      'Volumes engagés',
      totalAlternants != null
        ? `${txt(engagements.volumeAn1)} / ${txt(engagements.volumeAn2)} / ${txt(engagements.volumeAn3)} alternants (An 1 / 2 / 3)`
        : '-',
    ],
  ];

  return (
    <Document
      title={`Synthèse de passation - ${meta.referenceDossier}`}
      author="SOLUVIA"
    >
      {/* ═══ Page 1 - Couverture ═══ */}
      <Page size="A4" orientation="landscape" style={styles.page}>
        <View style={styles.coverTop}>
          {/* eslint-disable-next-line jsx-a11y/alt-text */}
          <Image src={LOGO_SRC} style={styles.coverLogo} />
          <View style={styles.coverMain}>
            <Text style={styles.coverKicker}>
              Développeur {ARROW} Chef de Projet
            </Text>
            <Text style={styles.coverTitle}>Synthèse{'\n'}client</Text>
            <View style={styles.coverRule} />
            <Text style={styles.coverSub}>
              Le document pivot du passage de relais entre le Développeur de
              portefeuille et le Chef de Projet, produit sous 48 h après la
              signature. Il réunit tout ce que le Chef de Projet doit savoir
              pour prendre le dossier en main.
            </Text>
            <View style={styles.coverFeatures}>
              {['Produit sous 48 h', '8 sections', 'Diffusion en 2 vagues'].map(
                (f) => (
                  <View key={f} style={styles.coverFeature}>
                    <View style={styles.coverFeatureBadge}>
                      <CheckIcon size={9} />
                    </View>
                    <Text style={styles.coverFeatureText}>{f}</Text>
                  </View>
                ),
              )}
            </View>
            <Text style={styles.coverRef}>
              Dossier {meta.referenceDossier} · {identite.raisonSociale}
              {meta.dateSignature
                ? ` · signé le ${fmtDate(meta.dateSignature)}`
                : ''}
            </Text>
          </View>
        </View>
        <View style={styles.coverBand}>
          <FlowChips
            band
            labels={[
              'Signature',
              'Synthèse 48 h',
              'Affectation CDP',
              'Prise en main',
            ]}
          />
          <Text style={styles.bandTag}>Confidentiel · Interne Soluvia</Text>
        </View>
      </Page>

      {/* ═══ Page 2 - Vue d'ensemble ═══ */}
      <PageShell step="Vue d'ensemble" pageNo={2}>
        <View style={styles.pbody}>
          <Text style={styles.h1}>Le document en 8 sections</Text>
          <Text style={styles.lead}>
            Produit sous 48 h après la signature - le pivot du passage de relais
            commercial {ARROW} opérationnel.
          </Text>
          <View style={styles.cols}>
            <View style={[styles.pts, { flex: 1 }]}>
              <Bullet
                badge="1"
                strong="Identité du groupe"
                rest="qui est le client, sa taille, son secteur, son tunnel"
              />
              <Bullet
                badge="2"
                strong="Interlocuteurs"
                rest="qui décide, qui influence, comment les joindre"
              />
              <Bullet
                badge="3"
                strong="Historique commercial"
                rest="l'origine du contact et le déroulé des RDV"
              />
              <Bullet
                badge="4"
                strong="Engagements négociés"
                rest="missions, taux, volumes, leviers"
              />
            </View>
            <View style={[styles.pts, { flex: 1 }]}>
              <Bullet
                badge="5"
                strong="Calendrier prévisionnel"
                rest="les grands jalons du lancement"
              />
              <Bullet
                badge="6"
                strong="Points de vigilance"
                rest="le tacite à connaître avant le 1er contact"
              />
              <Bullet
                badge="7"
                strong="Documents joints"
                rest="les pièces du dossier"
              />
              <Bullet
                badge="8"
                strong="Recommandation d'affectation"
                rest="réservée au Référent CDP"
              />
            </View>
          </View>
          <Keep k="Confidentiel">
            Diffusion interne Soluvia uniquement. Vague 1 (à la production) :
            Référent CDP + Direction. Vague 2 (après affectation) : le Chef de
            Projet, version sans la section 8. Ne jamais partager ce document
            avec le client.
          </Keep>
        </View>
      </PageShell>

      {/* ═══ Page 3 - Section 1 · Identité ═══ */}
      <PageShell num="1" step="Identité du groupe" pageNo={3}>
        <View style={styles.pbody}>
          <Text style={styles.h1}>{identite.raisonSociale}</Text>
          <Text style={styles.lead}>{tunnel ?? 'Tunnel non renseigné'}</Text>
          <View style={styles.cols}>
            <View style={{ flex: 1.15 }}>
              <View style={[styles.pts, { marginTop: 4 }]}>
                {identiteBullets.map(([k, v]) => (
                  <Bullet key={k} strong={k} rest={v} />
                ))}
              </View>
              <Keep k="Numéro de dossier">
                {meta.referenceDossier}
                {meta.numeroContrat
                  ? ` · Contrat n° ${meta.numeroContrat}`
                  : ''}
                {meta.dateSignature
                  ? ` · signé le ${fmtDate(meta.dateSignature)}`
                  : ''}
                .
              </Keep>
            </View>
            <View style={{ flex: 0.85, justifyContent: 'center' }}>
              <CallCard
                icon={<StrokePaths paths={ICON_BUILDING} />}
                title={
                  identite.effectif
                    ? `${identite.effectif} salariés`
                    : 'Effectif non renseigné'
                }
                sub={
                  identite.region
                    ? `Groupe implanté en ${identite.region}.`
                    : 'Effectif et implantations issus de la fiche prospect.'
                }
                facts={[
                  { b: txt(identite.nbImplantations), s: 'implantations' },
                  {
                    b: fmtCa(identite.caDernierExercice),
                    s: 'CA dernier exercice',
                  },
                  {
                    b: meta.tunnel === 'cfa' ? 'Tunnel B' : 'Tunnel A',
                    s:
                      meta.tunnel === 'cfa'
                        ? 'CFA existant'
                        : 'création complète',
                  },
                ]}
              />
            </View>
          </View>
        </View>
      </PageShell>

      {/* ═══ Page 4 - Section 2 · Interlocuteurs ═══ */}
      <PageShell num="2" step="Interlocuteurs" pageNo={4}>
        <View style={styles.pbody}>
          <Text style={styles.h1}>Interlocuteurs côté groupe</Text>
          <Text style={styles.lead}>
            Qui décide, qui influence, et comment les approcher
          </Text>
          <View style={styles.vert}>
            {contacts.length === 0 ? (
              <Text style={styles.desc}>
                Aucun interlocuteur renseigné sur la fiche prospect.
              </Text>
            ) : (
              contacts.slice(0, 6).map((c, i) => (
                <View key={i} style={styles.vstep} wrap={false}>
                  <View style={styles.vstepN}>
                    <Text style={styles.vstepNText}>{initiales(c.nom)}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.vstepT}>
                      {c.nom}
                      {c.poste ? ` - ${c.poste}` : ''}
                      {c.role
                        ? ` · ${labelOf(ROLE_DECISION_LABELS, c.role)}`
                        : ''}
                    </Text>
                    <Text style={styles.vstepD}>
                      {[c.email, c.telephone].filter(Boolean).join(' · ') ||
                        'Coordonnées non renseignées'}
                      {c.sensibilites ? ` - ${c.sensibilites}` : ''}
                    </Text>
                  </View>
                </View>
              ))
            )}
          </View>
        </View>
      </PageShell>

      {/* ═══ Page 5 - Section 3 · Historique commercial ═══ */}
      <PageShell num="3" step="Historique commercial" pageNo={5}>
        <View style={styles.pbody}>
          <Text style={styles.h1}>Historique commercial</Text>
          <Text style={styles.lead}>Du premier contact à la signature</Text>
          <View style={styles.cols}>
            <View style={{ flex: 1.1 }}>
              <View style={[styles.pts, { marginTop: 4 }]}>
                <Bullet
                  strong="Canal d'origine"
                  rest={labelOf(CANAL_ORIGINE_LABELS, historique.canal)}
                />
                <Bullet
                  strong="1er contact"
                  rest={fmtDate(historique.datePremierContact)}
                />
                <Bullet
                  strong="Initiateur"
                  rest={labelOf(INITIATEUR_LABELS, historique.initiateur)}
                />
              </View>
              {historique.evolution ? (
                <Keep k="Évolution du dossier">{historique.evolution}</Keep>
              ) : null}
            </View>
            <View style={{ flex: 0.9 }}>
              <Text style={[styles.desc, styles.descBold, { marginTop: 4 }]}>
                Chronologie des rendez-vous
              </Text>
              <View style={styles.pts}>
                {chronologie.length === 0 ? (
                  <Text style={styles.desc}>Aucun rendez-vous enregistré.</Text>
                ) : (
                  chronologie
                    .slice(0, 8)
                    .map((c, i) => (
                      <Bullet
                        key={i}
                        badge={String(i + 1)}
                        strong={c.date}
                        rest={c.titre}
                      />
                    ))
                )}
              </View>
            </View>
          </View>
        </View>
      </PageShell>

      {/* ═══ Page 6 - Section 4 · Engagements négociés ═══ */}
      <PageShell num="4" step="Engagements négociés" pageNo={6}>
        <View style={styles.pbody}>
          <Text style={styles.h1}>Engagements négociés</Text>
          <Text style={styles.lead}>
            Le contrat que le Chef de Projet devra tenir - annexe 2
          </Text>
          <View style={styles.cols}>
            <View style={{ flex: 1.1 }}>
              {engagements.perimetre ? (
                <Text style={[styles.desc, { marginTop: 4 }]}>
                  <Text style={styles.descBold}>Périmètre</Text>
                  {' - '}
                  {engagements.perimetre}
                </Text>
              ) : null}
              <View style={styles.pts}>
                {engagementsBullets.map(([k, v]) => (
                  <Bullet key={k} strong={k} rest={v} />
                ))}
              </View>
              {engagements.leviers.length > 0 ? (
                <Keep
                  k={
                    engagements.leviers.length > 1
                      ? 'Leviers activés'
                      : 'Levier activé'
                  }
                >
                  {engagements.leviers.join('. ')}.
                </Keep>
              ) : null}
            </View>
            <View style={{ flex: 0.9, justifyContent: 'center' }}>
              <CallCard
                icon={<StrokePaths paths={ICON_CHART} />}
                title={
                  engagements.tauxNpec != null
                    ? `${engagements.tauxNpec} % du NPEC`
                    : 'Conditions financières'
                }
                sub="Conditions financières issues de l'annexe 2 du contrat-cadre."
                facts={[
                  {
                    b:
                      engagements.dureeAns != null
                        ? `${engagements.dureeAns} ans`
                        : '-',
                    s: 'durée',
                  },
                  {
                    b:
                      engagements.moisDemarrage != null
                        ? `Mois ${engagements.moisDemarrage}`
                        : '-',
                    s: '1ère facture',
                  },
                  {
                    b: totalAlternants != null ? String(totalAlternants) : '-',
                    s:
                      engagements.dureeAns != null
                        ? `alternants sur ${engagements.dureeAns} ans`
                        : 'alternants engagés',
                  },
                ]}
              />
            </View>
          </View>
        </View>
      </PageShell>

      {/* ═══ Page 7 - Section 5 · Calendrier prévisionnel ═══ */}
      <PageShell num="5" step="Calendrier prévisionnel" pageNo={7}>
        <View style={styles.pbody}>
          <Text style={styles.h1}>Calendrier prévisionnel</Text>
          <Text style={styles.lead}>
            Les grands jalons de la Mission A - lancement du centre
          </Text>
          <View style={styles.cols}>
            <View style={[styles.pts, { flex: 1 }]}>
              {jalons.slice(0, 5).map((j) => (
                <Bullet key={j.n} badge={j.n} strong={j.label} rest={j.date} />
              ))}
            </View>
            <View style={[styles.pts, { flex: 1 }]}>
              {jalons.slice(5).map((j) => (
                <Bullet key={j.n} badge={j.n} strong={j.label} rest={j.date} />
              ))}
            </View>
          </View>
          <Keep k="Bascule apprentissage">
            {
              "Le centre pourra facturer de la formation continue dès l'obtention du Qualiopi. L'apprentissage (CERFA + flux OPCO) ne démarrera qu'à l'ouverture officielle, avec la 1ère cohorte."
            }
          </Keep>
        </View>
      </PageShell>

      {/* ═══ Page 8 - Section 6 · Points de vigilance ═══ */}
      <PageShell num="6" step="Points de vigilance" pageNo={8}>
        <View style={styles.pbody}>
          <Text style={styles.h1}>Points de vigilance</Text>
          <Text style={styles.lead}>
            {
              "Le tacite à connaître avant le premier contact - ce qui n'est pas dans le contrat"
            }
          </Text>
          <View style={styles.cols}>
            <View style={[styles.pts, { flex: 1 }]}>
              {vigilance.length === 0 ? (
                <Text style={styles.desc}>
                  Aucun point de vigilance renseigné par le Développeur.
                </Text>
              ) : (
                vigilance
                  .slice(0, Math.ceil(vigilance.length / 2))
                  .map((v, i) => <Bullet key={i} rest={v} />)
              )}
            </View>
            <View style={[styles.pts, { flex: 1 }]}>
              {vigilance.slice(Math.ceil(vigilance.length / 2)).map((v, i) => (
                <Bullet key={i} rest={v} />
              ))}
            </View>
          </View>
          {saisies.promesses_orales ? (
            <Keep
              k={
                lignesDe(saisies.promesses_orales).length > 1
                  ? 'Promesses orales à honorer'
                  : 'Promesse orale à honorer'
              }
            >
              {saisies.promesses_orales}
            </Keep>
          ) : null}
        </View>
      </PageShell>

      {/* ═══ Page 9 - Section 7 · Documents joints ═══ */}
      <PageShell num="7" step="Documents joints" pageNo={9}>
        <View style={styles.pbody}>
          <Text style={styles.h1}>Documents joints</Text>
          <Text style={styles.lead}>
            Les pièces du dossier, archivées sur le Drive Soluvia
          </Text>
          <View style={styles.cols}>
            <View style={[styles.pts, { flex: 1.15 }]}>
              {snapshot.documents.map((d) => (
                <Bullet key={d.label} check muted={!d.present} rest={d.label} />
              ))}
            </View>
            <View style={{ flex: 0.85, justifyContent: 'center' }}>
              <CallCard
                icon={<StrokePaths paths={ICON_FOLDER} />}
                title="Dossier client"
                sub="Toutes les pièces sont classées dans l'espace du client sur le Drive Soluvia."
                facts={[
                  {
                    b: `${docsPresents}/${snapshot.documents.length}`,
                    s: 'pièces',
                  },
                  { b: 'Drive', s: 'Soluvia' },
                  { b: meta.referenceDossier, s: 'dossier' },
                ]}
              />
            </View>
          </View>
        </View>
      </PageShell>

      {/* ═══ Page 10 - Section 8 · Recommandation (confidentiel) ═══ */}
      <PageShell num="8" step="Recommandation d'affectation" pageNo={10}>
        {variante === 'cdp' ? (
          <View style={styles.pbody}>
            <View style={styles.maskedCard}>
              <View style={[styles.ccIcon, { backgroundColor: '#ffffff' }]}>
                <StrokePaths paths={ICON_LOCK} color={CORAIL} />
              </View>
              <Text style={styles.ccTitle}>
                Section 8 non disponible pour votre rôle
              </Text>
              <Text style={styles.ccSub}>
                {
                  "La recommandation d'affectation est réservée au Référent CDP, au Développeur de portefeuille et à la Direction."
                }
              </Text>
            </View>
          </View>
        ) : (
          <View style={styles.pbody}>
            <View style={[styles.keep, { marginTop: 0 }]}>
              <Text style={styles.keepK}>
                Réservé Référent CDP + Développeur + Direction
              </Text>
              <Text style={styles.keepP}>
                {
                  "Cette section sert à décider de l'affectation. Visible par le Référent CDP, le Développeur de portefeuille et la Direction - masquée pour le Chef de Projet affecté (risque de biais relationnel)."
                }
              </Text>
            </View>
            <View style={styles.cols}>
              <View style={[styles.pts, { flex: 1.1, marginTop: 4 }]}>
                <Bullet
                  strong="Typologie de client"
                  rest={labelOf(
                    TYPOLOGIE_CLIENT_LABELS,
                    saisies.typologie_client,
                  )}
                />
                <Bullet strong="CDP idéal" rest={txt(saisies.cdp_ideal)} />
                <Bullet
                  strong="CDP à éviter"
                  rest={saisies.cdp_a_eviter || 'aucun conflit antérieur connu'}
                />
                {saisies.notes_inter_equipe ? (
                  <Bullet
                    strong="Notes inter-équipe"
                    rest={saisies.notes_inter_equipe}
                  />
                ) : null}
              </View>
              <View style={{ flex: 0.9, justifyContent: 'center' }}>
                <CallCard
                  icon={<StrokePaths paths={ICON_USER_CHECK} />}
                  title="Profil recommandé"
                  sub="Synthèse de la recommandation du Développeur pour l'arbitrage."
                  facts={[
                    {
                      b: labelOf(
                        NIVEAU_CHARGE_LABELS,
                        saisies.charge_previsionnelle,
                      ),
                      s: 'charge à 6 mois',
                    },
                    {
                      b: labelOf(NIVEAU_RISQUE_LABELS, saisies.risque_churn),
                      s: 'risque de churn',
                    },
                    {
                      b: labelOf(
                        TYPOLOGIE_CLIENT_LABELS,
                        saisies.typologie_client,
                      ),
                      s: 'profil client',
                    },
                  ]}
                />
              </View>
            </View>
          </View>
        )}
      </PageShell>

      {/* ═══ Page 11 - Conclusion ═══ */}
      <PageShell step="Passation prête" pageNo={11}>
        <View style={styles.conclBody}>
          <View style={styles.conclCheck}>
            <CheckIcon size={34} color="#ffffff" strokeWidth={2.5} />
          </View>
          <Text style={[styles.coverKicker, { marginTop: 18 }]}>
            Passation prête
          </Text>
          <Text style={[styles.h1, { fontSize: 32, marginTop: 8 }]}>
            Le dossier est transmis
          </Text>
          <View style={[styles.coverRule, { alignSelf: 'center' }]} />
          <Text
            style={[
              styles.desc,
              { maxWidth: 440, fontSize: 12.5, textAlign: 'center' },
            ]}
          >
            {
              "Cette synthèse réunit tout ce qu'il faut pour prendre le dossier en main sans perte d'information. Après affectation par le Référent CDP, le Chef de Projet devient l'interlocuteur unique du client et enclenche la Mission A - le lancement du centre de formation."
            }
          </Text>
          <FlowChips
            labels={['Signature', 'Synthèse', 'Affectation', 'Lancement']}
          />
          <Text style={[styles.lead, { marginTop: 24 }]}>
            Une question sur ce dossier ?
          </Text>
          <Text
            style={{
              marginTop: 6,
              fontSize: 12.5,
              fontFamily: 'Helvetica-Bold',
              color: CORAIL,
            }}
          >
            Le Référent CDP reste votre point de contact
          </Text>
        </View>
      </PageShell>
    </Document>
  );
}

/** Rend l'une des deux variantes du PDF de synthèse en Buffer. */
export async function renderSynthesePdf(
  snapshot: SyntheseSnapshotV2,
  saisies: SyntheseSaisies,
  variante: VarianteSynthese,
): Promise<Buffer> {
  // Même hack de typage que render-devis-pdf.ts : renderToBuffer attend un
  // ReactElement<DocumentProps>, notre composant a sa propre signature.
  const element = createElement(SynthesePassationDoc, {
    snapshot,
    saisies,
    variante,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as ReactElement<any>;
  return renderToBuffer(element);
}
