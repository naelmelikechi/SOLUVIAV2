# Module Projet - Lot 3 : données financières sur deux flux

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Afficher les quatre montants financiers d'un projet sur les **deux flux** qui le concernent : la commission que SOLUVIA facture au client, et le financement que le CFA facture à l'OPCO dans Eduvia.

**Architecture:** Une fonction pure agrège les huit montants à partir de données déjà en base ; aucun moteur de facturation n'est réécrit, les deux existants sont réutilisés. La page de détail montre un seul tableau à la fois, sélectionné par flux.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase, Vitest.

**Spec de référence:** `docs/superpowers/specs/2026-08-06-module-projet-synthese-details-design.md`, section E.

---

## Contexte pour l'implémenteur

### Deux flux, pas un

Il y a deux facturations distinctes sur un projet, et le CDP a besoin de voir les deux :

- **Notre commission** : ce que SOLUVIA facture au client pour sa prestation.
- **Le financement OPCO** : ce que le CFA facture à l'OPCO dans Eduvia.

Ni les mêmes montants, ni les mêmes échéances, ni le même interlocuteur. **Un OPCO qui ne règle pas n'est pas le même problème qu'un client qui ne règle pas**, et les deux se pilotent séparément.

### Les quatre montants, sur chaque flux

| Montant                  | Commission SOLUVIA                        | Financement OPCO (Eduvia)                                           |
| ------------------------ | ----------------------------------------- | ------------------------------------------------------------------- |
| Produit                  | production x taux de commission           | NPEC des contrats non archivés, proratisé en cas de rupture         |
| Facturé                  | factures émises, net des avoirs           | jalons transmis (`invoice_state` renseigné)                         |
| En retard de facturation | ce qui est exigible et non encore facturé | jalons dont la date d'ouverture est passée et toujours non transmis |
| En retard d'encaissement | factures échues, non payées               | jalons transmis depuis plus de N jours et non réglés                |

**Le retard de facturation n'est pas le « reste à facturer » affiché aujourd'hui.** Le reste à facturer inclut ce qui n'est pas encore exigible ; le retard ne compte que ce qui aurait **déjà dû** partir. C'est la distinction qui fait tout l'intérêt de l'indicateur, ne la perds pas en route.

### Ce qui existe déjà et doit être réutilisé, pas réécrit

- `lib/queries/projets.ts` : `getProjetFinance(projetId)` donne `production_opco`, `taux_commission`, `facture_soluvia`, `encaisse_soluvia` et leurs variantes TTC.
- `lib/utils/montant-ht.ts` : `productionSoluviaHt(productionOpco, tauxCommission)`, formule partagée avec la carte de synthèse.
- `lib/queries/contrats-a-facturer.ts` : `selectContratsAFacturer` et `selectContratsNonFactures`, fonctions **pures**, modèle engagement.
- `lib/queries/echeancier-dues.ts` : `computeEcheancierDues` et `currentMoisCutoff`, fonctions **pures**, modèle échéancier.
- `eduvia_invoice_steps` : `opening_date`, `invoice_state` (`NULL` = non transmis, `TRANSMIS`, `REGLE`), `total_amount`, `paid_amount`, `opco_settled_amount`, `invoice_sent_at`.
- `factures` : `montant_ht`, `date_echeance`, `statut` (`a_emettre`, `emise`, `payee`, `en_retard`, `avoir`), `est_avoir`.

### Pièges de ce codebase

- **Montants en HT** côté commission (convention établie). Le TTC reste en second rang là où il l'est déjà.
- **Les avoirs sont stockés en négatif** : on les somme tels quels, jamais de re-négation.
- Le projet `0016-HEO-APP` **double-facture volontairement** (deux modèles de facturation) : tout garde-fou anti-double a été retiré, n'en réintroduis pas.
- **Ne jamais supprimer une facture** (numérotation gapless).
- `npm test` avant chaque push, jamais `--no-verify`.

---

## Task 1 : Paramètre de délai de règlement OPCO

**Files:**

- Create: `supabase/migrations/<timestamp>_delai_reglement_opco.sql`
- Modify: `lib/queries/parametres.ts`

Le « retard d'encaissement OPCO » a besoin d'un seuil : au bout de combien de jours un jalon transmis et non réglé est-il en retard. Comme le seuil d'enlisement du lot 1, il vit dans `parametres` pour être ajustable sans redéploiement.

- [ ] **Step 1: Migration**

```sql
-- Delai au-dela duquel un jalon OPCO transmis et non regle est considere en
-- retard d'encaissement. 60 jours : ordre de grandeur constate des delais de
-- reglement OPCO. Modifiable dans /admin/parametres sans redeploiement, parce
-- que ce delai varie d'un OPCO a l'autre et se calera a l'usage.

INSERT INTO parametres (cle, valeur, categorie, description)
VALUES (
  'facturation.delai_reglement_opco_jours',
  '60',
  'facturation',
  'Nombre de jours apres transmission au-dela duquel un jalon OPCO non regle est signale en retard d encaissement'
)
ON CONFLICT (cle) DO NOTHING;
```

- [ ] **Step 2: Lecture**

Dans `lib/queries/parametres.ts`, en suivant le modèle de `getSeuilEnlisementJours` :

```ts
export const DEFAUT_DELAI_REGLEMENT_OPCO_JOURS = 60;

/**
 * Delai de reglement OPCO, en jours. Fallback sur la constante si le
 * parametre est absent ou invalide : un parametre mal saisi ne doit jamais
 * faire disparaitre l'indicateur de retard.
 */
export async function getDelaiReglementOpcoJours(): Promise<number> {
  const raw = await getParametreValeur(
    'facturation.delai_reglement_opco_jours',
  );
  if (raw == null || raw.trim() === '')
    return DEFAUT_DELAI_REGLEMENT_OPCO_JOURS;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : DEFAUT_DELAI_REGLEMENT_OPCO_JOURS;
}
```

- [ ] **Step 3: Appliquer, vérifier, committer**

`npx supabase db push` (ou `psql` si l'historique local est désynchronisé), puis `npm run typecheck && npm test`.

```bash
git add supabase/migrations lib/queries/parametres.ts
git commit -m "feat(facturation): delai de reglement OPCO parametrable"
```

---

## Task 2 : Fonction pure d'agrégation du flux OPCO

**Files:**

- Create: `lib/projets/finance-flux.ts`
- Test: `__tests__/projet-finance-flux.test.ts`

C'est le cœur du lot. Le flux commission s'appuie sur des chiffres déjà calculés ailleurs ; le flux OPCO, lui, se dérive des jalons Eduvia et n'existe nulle part. On l'isole dans une fonction pure pour le tester sur les bornes.

- [ ] **Step 1: Écrire le test**

Créer `__tests__/projet-finance-flux.test.ts` :

```ts
import { describe, it, expect } from 'vitest';
import { agregerFluxOpco, type JalonOpco } from '@/lib/projets/finance-flux';

const AUJOURD_HUI = '2026-08-07';
const DELAI = 60;

function jalon(over: Partial<JalonOpco> = {}): JalonOpco {
  return {
    id: 'j1',
    contratId: 'c1',
    stepNumber: 1,
    openingDate: '2026-01-01',
    invoiceState: null,
    totalAmount: 1000,
    paidAmount: 0,
    opcoSettledAmount: 0,
    invoiceSentAt: null,
    ...over,
  };
}

describe('agregerFluxOpco - facture', () => {
  it('compte comme facture tout jalon transmis ou regle', () => {
    const r = agregerFluxOpco(
      [
        jalon({ id: 'a', invoiceState: 'TRANSMIS' }),
        jalon({ id: 'b', invoiceState: 'REGLE' }),
        jalon({ id: 'c', invoiceState: null }),
      ],
      AUJOURD_HUI,
      DELAI,
    );
    expect(r.facture).toBe(2000);
  });
});

describe('agregerFluxOpco - retard de facturation', () => {
  it('retient un jalon ouvert et jamais transmis', () => {
    const r = agregerFluxOpco([jalon()], AUJOURD_HUI, DELAI);
    expect(r.retardFacturation).toBe(1000);
    expect(r.lignesRetardFacturation).toHaveLength(1);
  });

  it('ignore un jalon dont la date d ouverture est future', () => {
    const r = agregerFluxOpco(
      [jalon({ openingDate: '2026-12-01' })],
      AUJOURD_HUI,
      DELAI,
    );
    expect(r.retardFacturation).toBe(0);
  });

  it('ignore un jalon ouvert aujourd hui meme', () => {
    // Ouvert le jour meme : rien a reprocher, la facturation peut encore partir.
    const r = agregerFluxOpco(
      [jalon({ openingDate: AUJOURD_HUI })],
      AUJOURD_HUI,
      DELAI,
    );
    expect(r.retardFacturation).toBe(0);
  });

  it('ignore un jalon deja transmis', () => {
    const r = agregerFluxOpco(
      [jalon({ invoiceState: 'TRANSMIS' })],
      AUJOURD_HUI,
      DELAI,
    );
    expect(r.retardFacturation).toBe(0);
  });

  it('ignore un jalon sans date d ouverture', () => {
    const r = agregerFluxOpco(
      [jalon({ openingDate: null })],
      AUJOURD_HUI,
      DELAI,
    );
    expect(r.retardFacturation).toBe(0);
  });
});

describe('agregerFluxOpco - retard d encaissement', () => {
  it('retient un jalon transmis depuis plus que le delai et non regle', () => {
    const r = agregerFluxOpco(
      [
        jalon({
          invoiceState: 'TRANSMIS',
          invoiceSentAt: '2026-01-01T00:00:00Z',
        }),
      ],
      AUJOURD_HUI,
      DELAI,
    );
    expect(r.retardEncaissement).toBe(1000);
  });

  it('ne retient rien pile au delai', () => {
    // 2026-06-08 -> 2026-08-07 = 60 jours exactement
    const r = agregerFluxOpco(
      [
        jalon({
          invoiceState: 'TRANSMIS',
          invoiceSentAt: '2026-06-08T00:00:00Z',
        }),
      ],
      AUJOURD_HUI,
      DELAI,
    );
    expect(r.retardEncaissement).toBe(0);
  });

  it('ne retient jamais un jalon REGLE', () => {
    const r = agregerFluxOpco(
      [
        jalon({
          invoiceState: 'REGLE',
          invoiceSentAt: '2020-01-01T00:00:00Z',
        }),
      ],
      AUJOURD_HUI,
      DELAI,
    );
    expect(r.retardEncaissement).toBe(0);
  });

  it('deduit ce qui a deja ete regle partiellement', () => {
    const r = agregerFluxOpco(
      [
        jalon({
          invoiceState: 'TRANSMIS',
          invoiceSentAt: '2026-01-01T00:00:00Z',
          paidAmount: 400,
        }),
      ],
      AUJOURD_HUI,
      DELAI,
    );
    expect(r.retardEncaissement).toBe(600);
  });

  it('prend le plus favorable entre paid_amount et opco_settled_amount', () => {
    // Les deux colonnes disent la meme chose par deux chemins ; en retenir la
    // plus elevee evite de reclamer un montant deja encaisse.
    const r = agregerFluxOpco(
      [
        jalon({
          invoiceState: 'TRANSMIS',
          invoiceSentAt: '2026-01-01T00:00:00Z',
          paidAmount: 200,
          opcoSettledAmount: 900,
        }),
      ],
      AUJOURD_HUI,
      DELAI,
    );
    expect(r.retardEncaissement).toBe(100);
  });

  it('ne descend jamais sous zero', () => {
    const r = agregerFluxOpco(
      [
        jalon({
          invoiceState: 'TRANSMIS',
          invoiceSentAt: '2026-01-01T00:00:00Z',
          paidAmount: 1500,
        }),
      ],
      AUJOURD_HUI,
      DELAI,
    );
    expect(r.retardEncaissement).toBe(0);
  });

  it('ignore un jalon transmis sans date d envoi', () => {
    const r = agregerFluxOpco(
      [jalon({ invoiceState: 'TRANSMIS', invoiceSentAt: null })],
      AUJOURD_HUI,
      DELAI,
    );
    expect(r.retardEncaissement).toBe(0);
  });
});

describe('agregerFluxOpco - global', () => {
  it('rend des montants nuls sur un projet sans jalon', () => {
    const r = agregerFluxOpco([], AUJOURD_HUI, DELAI);
    expect(r.facture).toBe(0);
    expect(r.retardFacturation).toBe(0);
    expect(r.retardEncaissement).toBe(0);
    expect(r.lignesRetardFacturation).toEqual([]);
    expect(r.lignesRetardEncaissement).toEqual([]);
  });

  it('expose le detail ligne a ligne de chaque retard', () => {
    const r = agregerFluxOpco(
      [
        jalon({ id: 'a' }),
        jalon({
          id: 'b',
          invoiceState: 'TRANSMIS',
          invoiceSentAt: '2026-01-01T00:00:00Z',
        }),
      ],
      AUJOURD_HUI,
      DELAI,
    );
    expect(r.lignesRetardFacturation.map((l) => l.id)).toEqual(['a']);
    expect(r.lignesRetardEncaissement.map((l) => l.id)).toEqual(['b']);
    expect(r.lignesRetardEncaissement[0]!.joursDepuisEnvoi).toBeGreaterThan(60);
  });
});
```

- [ ] **Step 2: Lancer, voir échouer**

Run: `npx vitest run __tests__/projet-finance-flux.test.ts` — ÉCHEC attendu sur l'import.

- [ ] **Step 3: Implémenter**

Créer `lib/projets/finance-flux.ts` :

```ts
/**
 * Agregation du flux OPCO d'un projet, a partir des jalons Eduvia.
 *
 * Ce flux est distinct de la commission SOLUVIA : ni les memes montants, ni
 * les memes echeances, ni le meme interlocuteur. Un OPCO qui ne regle pas
 * n'est pas le meme probleme qu'un client qui ne regle pas.
 *
 * Fonction pure : le jour courant et le delai sont injectes, jamais lus ici.
 */

export interface JalonOpco {
  id: string;
  contratId: string;
  stepNumber: number;
  /** Date a partir de laquelle le jalon est facturable a l'OPCO. */
  openingDate: string | null;
  /** null = non transmis, 'TRANSMIS', 'REGLE'. */
  invoiceState: string | null;
  totalAmount: number;
  paidAmount: number;
  opcoSettledAmount: number;
  invoiceSentAt: string | null;
}

export interface LigneRetardFacturation {
  id: string;
  contratId: string;
  stepNumber: number;
  openingDate: string;
  montant: number;
  joursDepuisOuverture: number;
}

export interface LigneRetardEncaissement {
  id: string;
  contratId: string;
  stepNumber: number;
  invoiceSentAt: string;
  montantDu: number;
  joursDepuisEnvoi: number;
}

export interface FluxOpco {
  facture: number;
  retardFacturation: number;
  retardEncaissement: number;
  lignesRetardFacturation: LigneRetardFacturation[];
  lignesRetardEncaissement: LigneRetardEncaissement[];
}

function joursEntre(debutIso: string, finIso: string): number {
  const d = Date.parse(
    debutIso.length === 10 ? `${debutIso}T00:00:00Z` : debutIso,
  );
  const f = Date.parse(`${finIso}T00:00:00Z`);
  if (Number.isNaN(d) || Number.isNaN(f)) return 0;
  return Math.floor((f - d) / 86_400_000);
}

export function agregerFluxOpco(
  jalons: JalonOpco[],
  aujourdHui: string,
  delaiReglementJours: number,
): FluxOpco {
  let facture = 0;
  let retardFacturation = 0;
  let retardEncaissement = 0;
  const lignesRetardFacturation: LigneRetardFacturation[] = [];
  const lignesRetardEncaissement: LigneRetardEncaissement[] = [];

  for (const j of jalons) {
    const transmis = j.invoiceState != null;

    if (transmis) {
      facture += j.totalAmount;
    }

    // Retard de facturation : le jalon est ouvert depuis au moins un jour et
    // n'est toujours pas parti a l'OPCO. Ouvert le jour meme = rien a
    // reprocher, la transmission peut encore se faire.
    if (!transmis && j.openingDate) {
      const jours = joursEntre(j.openingDate, aujourdHui);
      if (jours > 0) {
        retardFacturation += j.totalAmount;
        lignesRetardFacturation.push({
          id: j.id,
          contratId: j.contratId,
          stepNumber: j.stepNumber,
          openingDate: j.openingDate,
          montant: j.totalAmount,
          joursDepuisOuverture: jours,
        });
      }
    }

    // Retard d'encaissement : transmis depuis plus que le delai, pas encore
    // regle. Un jalon REGLE est hors de portee quoi qu'il arrive.
    if (j.invoiceState === 'REGLE' || !transmis || !j.invoiceSentAt) {
      continue;
    }
    const joursEnvoi = joursEntre(j.invoiceSentAt, aujourdHui);
    if (joursEnvoi <= delaiReglementJours) continue;

    // Les deux colonnes disent le meme fait par deux chemins (lecture
    // Eduvia et rapprochement Odoo) : retenir la plus elevee evite de
    // reclamer un montant deja encaisse.
    const regle = Math.max(j.paidAmount, j.opcoSettledAmount);
    const du = Math.max(0, j.totalAmount - regle);
    if (du <= 0) continue;

    retardEncaissement += du;
    lignesRetardEncaissement.push({
      id: j.id,
      contratId: j.contratId,
      stepNumber: j.stepNumber,
      invoiceSentAt: j.invoiceSentAt,
      montantDu: du,
      joursDepuisEnvoi: joursEnvoi,
    });
  }

  return {
    facture,
    retardFacturation,
    retardEncaissement,
    lignesRetardFacturation,
    lignesRetardEncaissement,
  };
}
```

- [ ] **Step 4: Vérifier**

Run: `npx vitest run __tests__/projet-finance-flux.test.ts` — PASS, 16 tests.
Run: `npm run typecheck && npm run lint && npm test`

- [ ] **Step 5: Commit**

```bash
git add lib/projets/finance-flux.ts __tests__/projet-finance-flux.test.ts
git commit -m "feat(projet): agregation du flux OPCO

Fonction pure testee sur les bornes. Un jalon ouvert le jour meme n'est
pas en retard, un jalon REGLE ne peut jamais l'etre, et le montant du
retient le plus favorable entre paid_amount et opco_settled_amount pour
ne pas reclamer un montant deja encaisse."
```

---

## Task 3 : Query des deux flux

**Files:**

- Create: `lib/queries/projet-finance-detail.ts`

- [ ] **Step 1: Écrire la query**

`getProjetFinanceDetail(projetId, projetRef)` retourne les deux flux, chacun avec ses quatre montants et son détail ligne à ligne.

**Flux OPCO** : charger les `eduvia_invoice_steps` des contrats non archivés du projet, les passer à `agregerFluxOpco`. Le « produit » est `finance.production_opco`, déjà calculé par `getProjetFinance`.

**Flux commission** :

- produit : `productionSoluviaHt(finance.production_opco, finance.taux_commission)` — **utilise le helper, ne recopie pas la formule** ;
- facturé : `finance.facture_soluvia` ;
- retard d'encaissement : factures du projet dont `date_echeance < aujourd'hui`, `statut` dans (`emise`, `en_retard`) — donc ni `payee`, ni `avoir`, ni `a_emettre` ;
- retard de facturation : **selon `projets.modele_facturation`**
  - `engagement` : réutiliser `selectContratsAFacturer` (fonction pure de `lib/queries/contrats-a-facturer.ts`), filtrée sur le projet ;
  - `echeancier` : réutiliser `computeEcheancierDues` avec `currentMoisCutoff()` (fonction pure de `lib/queries/echeancier-dues.ts`), en ne gardant que les mois **strictement antérieurs** au mois courant.

**Lis ces deux fichiers avant d'écrire.** Leurs signatures sont précises et leurs entrées demandent des données particulières. Si l'une n'est pas appelable proprement au niveau d'un seul projet, dis-le dans ton rapport et propose ce que tu as fait plutôt que de recopier la logique.

- [ ] **Step 2: Vérifier et committer**

Run: `npm run typecheck && npm run lint && npm test`

```bash
git add lib/queries/projet-finance-detail.ts
git commit -m "feat(projet): query des deux flux financiers"
```

---

## Task 4 : Page de détail

**Files:**

- Modify: `app/(dashboard)/projets/[ref]/finance/page.tsx`
- Create: `components/projets/projet-finance-flux.tsx`

- [ ] **Step 1: Composant**

Deux blocs nettement séparés et titrés : **« Notre commission »** puis **« Financement OPCO »**, chacun avec ses quatre montants en bandeau.

**Contrainte de densité** : un sélecteur bascule le tableau d'un flux à l'autre. **Un seul tableau visible à la fois.** Huit chiffres et deux tableaux simultanés feraient exactement le mur d'informations que ce chantier cherche à éviter.

Le tableau montre le décompte ligne à ligne du montant sélectionné. Filtrable par montant (produit / facturé / retard de facturation / retard d'encaissement).

Côté OPCO, les montants sont ceux transmis à l'OPCO : **ne les convertis pas**, et mentionne explicitement leur nature pour éviter qu'on les compare à tort aux montants HT de la commission.

- [ ] **Step 2: Page**

Charger `getProjetFinanceDetail` et `getDelaiReglementOpcoJours`, monter le composant au-dessus des sections existantes (`ProjetFinanceSection`, `ProjetTempsSection`, échéancier).

- [ ] **Step 3: Vérifier et committer**

Run: `npm run typecheck && npm run lint && npm test && npm run build`

```bash
git add "app/(dashboard)/projets/[ref]/finance/page.tsx" components/projets/projet-finance-flux.tsx
git commit -m "feat(projet): page finance sur les deux flux"
```

---

## Task 5 : Carte de synthèse

**Files:**

- Modify: `lib/projets/synthese.ts`
- Modify: `__tests__/projet-synthese.test.ts`
- Modify: `app/(dashboard)/projets/[ref]/page.tsx`

La carte Finance de la synthèse est neutre en dur depuis le lot 0, faute de signal calculable. Ce lot lui en donne un.

- [ ] **Step 1: Colorer la carte sur le vrai signal**

Dans `lib/projets/synthese.ts`, la carte `finance` reçoit désormais un montant de **retard de facturation** et un de **retard d'encaissement**. Règle :

- un retard, quel qu'il soit, non nul → `alerte` ;
- aucun retard → `neutre`.

Pas de seuil en pourcentage : un retard de facturation est un retard, indépendamment de sa proportion. Retire le commentaire du lot 0 qui annonçait ce changement.

Le contexte de la carte devient la ligne la plus utile : le montant en retard s'il y en a un, le montant facturé sinon.

- [ ] **Step 2: Ligne OPCO sur la carte**

La spec demande une ligne OPCO **qui n'apparaît que s'il y a un problème** (« OPCO : 12 400 EUR en retard de règlement »). Huit chiffres sur une carte la rendraient illisible.

Ajoute un champ optionnel `alerteSecondaire?: string` à `CarteSynthese`, rempli uniquement quand le flux OPCO présente un retard. Le composant de carte l'affiche en petit sous le contexte, en orange.

- [ ] **Step 3: Mettre les tests à jour**

Les tests du lot 0 asserteront que la carte Finance est toujours neutre : ils doivent maintenant vérifier la nouvelle règle. Ajoute les cas : retard de facturation seul, retard d'encaissement seul, les deux, aucun. Et un test de la ligne OPCO présente ou absente.

- [ ] **Step 4: Vérifier et committer**

Run: `npm run typecheck && npm run lint && npm test && npm run build`

```bash
git add lib/projets/synthese.ts __tests__/projet-synthese.test.ts "app/(dashboard)/projets/[ref]/page.tsx" components/projets/projet-synthese-cards.tsx
git commit -m "feat(projet): la carte Finance s'allume sur un vrai retard

Le lot 0 l'avait laissee neutre faute de signal calculable : un ratio
facture/produit bas est la situation normale d'un projet qui demarre.
Le retard de facturation, lui, est un retard quelle que soit sa
proportion."
```

---

## Task 6 : Vérification

- [ ] **Step 1: Suite complète**

`npm run typecheck && npm run lint && npm test && npm run build`

- [ ] **Step 2: Contre-calcul SQL**

C'est la vérification qui compte sur un lot financier. Sur la base locale, compare les montants affichés par la query à un calcul SQL indépendant :

```sql
-- Retard de facturation OPCO attendu, pour un projet donne
SELECT SUM(s.total_amount)
  FROM eduvia_invoice_steps s
  JOIN contrats c ON c.id = s.contrat_id
 WHERE c.projet_id = '<uuid>' AND c.archive = false
   AND s.invoice_state IS NULL AND s.opening_date < CURRENT_DATE;
```

Écris l'équivalent pour les trois autres montants OPCO et compare. **Tout écart doit être expliqué avant de continuer**, jamais arrondi ou ignoré. Colle les deux séries de chiffres dans ton rapport.

- [ ] **Step 3: Vérification visuelle**

Protocole dans `.claude/skills/verify/SKILL.md`. Pièges connus : l'hydratation React ne fonctionne pas dans le navigateur headless local (injecter le cookie `sb-127-auth-token` plutôt que de passer par le formulaire de connexion), et le binaire Playwright du cache peut être corrompu (pointer `executablePath` sur `chromium_headless_shell-1223`).

Contrôler que la page finance affiche bien **un seul tableau à la fois** et que les deux blocs sont distinguables au premier coup d'œil. Capture.

- [ ] **Step 4: Nettoyer**

Supprimer les scripts temporaires, arrêter le serveur de dev. `git status --short` avant de committer, jamais `git add -A`.

---

## Points de vigilance

**Le retard de facturation n'est pas le reste à facturer.** Si tu te retrouves à afficher `produit - facturé`, tu as reconstruit l'ancien indicateur et perdu tout l'intérêt du lot.

**Ne convertis jamais les montants OPCO.** Ce sont les montants transmis à l'OPCO, dans leur unité. Les passer en HT pour « harmoniser » avec la commission produirait des chiffres qui ne correspondent à aucun document.

**`0016-HEO-APP` double-facture volontairement.** Deux modèles de facturation coexistent sur ce projet. Si un contrôle te semble détecter une anomalie sur lui, c'est probablement le comportement voulu : vérifie avant de « corriger ».
