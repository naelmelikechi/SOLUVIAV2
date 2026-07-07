/**
 * Référentiel géographique français - source de vérité unique pour la
 * correspondance département → région (zéro drift : la région n'est jamais
 * stockée seule quand un département existe, elle est recalculée d'ici).
 *
 * Données statiques (aucun appel réseau). Les villes, elles, sont recherchées à
 * la volée via l'API Géo du gouvernement (cf. zone-combobox).
 */

/** Départements groupés par région (code INSEE → nom). 101 entrées (métropole + Corse + DOM). */
const DEPARTEMENTS_PAR_REGION: Record<string, [string, string][]> = {
  'Auvergne-Rhône-Alpes': [
    ['01', 'Ain'],
    ['03', 'Allier'],
    ['07', 'Ardèche'],
    ['15', 'Cantal'],
    ['26', 'Drôme'],
    ['38', 'Isère'],
    ['42', 'Loire'],
    ['43', 'Haute-Loire'],
    ['63', 'Puy-de-Dôme'],
    ['69', 'Rhône'],
    ['73', 'Savoie'],
    ['74', 'Haute-Savoie'],
  ],
  'Bourgogne-Franche-Comté': [
    ['21', "Côte-d'Or"],
    ['25', 'Doubs'],
    ['39', 'Jura'],
    ['58', 'Nièvre'],
    ['70', 'Haute-Saône'],
    ['71', 'Saône-et-Loire'],
    ['89', 'Yonne'],
    ['90', 'Territoire de Belfort'],
  ],
  Bretagne: [
    ['22', "Côtes-d'Armor"],
    ['29', 'Finistère'],
    ['35', 'Ille-et-Vilaine'],
    ['56', 'Morbihan'],
  ],
  'Centre-Val de Loire': [
    ['18', 'Cher'],
    ['28', 'Eure-et-Loir'],
    ['36', 'Indre'],
    ['37', 'Indre-et-Loire'],
    ['41', 'Loir-et-Cher'],
    ['45', 'Loiret'],
  ],
  Corse: [
    ['2A', 'Corse-du-Sud'],
    ['2B', 'Haute-Corse'],
  ],
  'Grand Est': [
    ['08', 'Ardennes'],
    ['10', 'Aube'],
    ['51', 'Marne'],
    ['52', 'Haute-Marne'],
    ['54', 'Meurthe-et-Moselle'],
    ['55', 'Meuse'],
    ['57', 'Moselle'],
    ['67', 'Bas-Rhin'],
    ['68', 'Haut-Rhin'],
    ['88', 'Vosges'],
  ],
  'Hauts-de-France': [
    ['02', 'Aisne'],
    ['59', 'Nord'],
    ['60', 'Oise'],
    ['62', 'Pas-de-Calais'],
    ['80', 'Somme'],
  ],
  'Île-de-France': [
    ['75', 'Paris'],
    ['77', 'Seine-et-Marne'],
    ['78', 'Yvelines'],
    ['91', 'Essonne'],
    ['92', 'Hauts-de-Seine'],
    ['93', 'Seine-Saint-Denis'],
    ['94', 'Val-de-Marne'],
    ['95', "Val-d'Oise"],
  ],
  Normandie: [
    ['14', 'Calvados'],
    ['27', 'Eure'],
    ['50', 'Manche'],
    ['61', 'Orne'],
    ['76', 'Seine-Maritime'],
  ],
  'Nouvelle-Aquitaine': [
    ['16', 'Charente'],
    ['17', 'Charente-Maritime'],
    ['19', 'Corrèze'],
    ['23', 'Creuse'],
    ['24', 'Dordogne'],
    ['33', 'Gironde'],
    ['40', 'Landes'],
    ['47', 'Lot-et-Garonne'],
    ['64', 'Pyrénées-Atlantiques'],
    ['79', 'Deux-Sèvres'],
    ['86', 'Vienne'],
    ['87', 'Haute-Vienne'],
  ],
  Occitanie: [
    ['09', 'Ariège'],
    ['11', 'Aude'],
    ['12', 'Aveyron'],
    ['30', 'Gard'],
    ['31', 'Haute-Garonne'],
    ['32', 'Gers'],
    ['34', 'Hérault'],
    ['46', 'Lot'],
    ['48', 'Lozère'],
    ['65', 'Hautes-Pyrénées'],
    ['66', 'Pyrénées-Orientales'],
    ['81', 'Tarn'],
    ['82', 'Tarn-et-Garonne'],
  ],
  'Pays de la Loire': [
    ['44', 'Loire-Atlantique'],
    ['49', 'Maine-et-Loire'],
    ['53', 'Mayenne'],
    ['72', 'Sarthe'],
    ['85', 'Vendée'],
  ],
  "Provence-Alpes-Côte d'Azur": [
    ['04', 'Alpes-de-Haute-Provence'],
    ['05', 'Hautes-Alpes'],
    ['06', 'Alpes-Maritimes'],
    ['13', 'Bouches-du-Rhône'],
    ['83', 'Var'],
    ['84', 'Vaucluse'],
  ],
  Guadeloupe: [['971', 'Guadeloupe']],
  Martinique: [['972', 'Martinique']],
  Guyane: [['973', 'Guyane']],
  'La Réunion': [['974', 'La Réunion']],
  Mayotte: [['976', 'Mayotte']],
};

export type Departement = { code: string; nom: string; region: string };

/** Liste à plat des 101 départements (code, nom, région). */
export const DEPARTEMENTS: Departement[] = Object.entries(
  DEPARTEMENTS_PAR_REGION,
).flatMap(([region, deps]) =>
  deps.map(([code, nom]) => ({ code, nom, region })),
);

/** Noms des régions (13 métropole + DOM), dans l'ordre du référentiel. */
export const REGIONS: string[] = Object.keys(DEPARTEMENTS_PAR_REGION);

const BY_CODE = new Map(DEPARTEMENTS.map((d) => [d.code, d]));

/** Normalise un code département saisi ("1" → "01", "2a" → "2A"). */
export function normalizeDepartement(
  code: string | null | undefined,
): string | null {
  if (!code) return null;
  const s = code.trim().toUpperCase();
  if (s === '') return null;
  if (s === '2A' || s === '2B') return s;
  if (/^\d{3}$/.test(s)) return s; // DOM
  if (/^\d$/.test(s)) return `0${s}`;
  if (/^\d{2}$/.test(s)) return s;
  return s;
}

/** Région d'un département (ou null si code inconnu). */
export function regionForDepartement(
  code: string | null | undefined,
): string | null {
  const c = normalizeDepartement(code);
  return c ? (BY_CODE.get(c)?.region ?? null) : null;
}

/** Codes département d'une région (pour le filtre par région). */
export function departementsForRegion(
  region: string | null | undefined,
): string[] {
  if (!region) return [];
  return (DEPARTEMENTS_PAR_REGION[region] ?? []).map(([code]) => code);
}

/** Libellé d'affichage d'un département ("69 - Rhône"). */
export function departementLabel(
  code: string | null | undefined,
): string | null {
  const c = normalizeDepartement(code);
  if (!c) return null;
  const d = BY_CODE.get(c);
  return d ? `${d.code} - ${d.nom}` : c;
}

/** true si le code correspond à un département connu. */
export function isKnownDepartement(code: string | null | undefined): boolean {
  const c = normalizeDepartement(code);
  return c != null && BY_CODE.has(c);
}

/** true si la chaîne correspond à une région connue. */
export function isKnownRegion(region: string | null | undefined): boolean {
  return region != null && region in DEPARTEMENTS_PAR_REGION;
}

export type LocalZone =
  | { type: 'departement'; code: string; label: string; region: string }
  | { type: 'region'; label: string; region: string };

function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** Recherche locale (départements + régions) par nom ou code, insensible aux accents. */
export function searchLocalZones(query: string, limit = 8): LocalZone[] {
  const q = stripAccents(query.trim().toLowerCase());
  if (q === '') return [];
  const regions: LocalZone[] = REGIONS.filter((r) =>
    stripAccents(r.toLowerCase()).includes(q),
  ).map((r) => ({ type: 'region', label: r, region: r }));
  const deps: LocalZone[] = DEPARTEMENTS.filter(
    (d) =>
      d.code.toLowerCase().startsWith(q) ||
      stripAccents(d.nom.toLowerCase()).includes(q),
  ).map((d) => ({
    type: 'departement',
    code: d.code,
    label: `${d.code} - ${d.nom}`,
    region: d.region,
  }));
  return [...deps, ...regions].slice(0, limit);
}
