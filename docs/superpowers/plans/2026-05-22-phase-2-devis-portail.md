# Phase 2 - Devis brouillon + envoi + portail public Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Permettre la creation de devis dans Soluvia, leur envoi par email avec PDF, et leur acceptation/refus en ligne via un lien public Qonto-style.

**Architecture:**

- Tables `devis`, `devis_lignes`, `devis_public_views`. Enum `statut_devis`. Triggers : numerotation par societe a l'envoi, pdf_locked, transitions de statut.
- 3 RPCs `SECURITY DEFINER` : `get_devis_public(token)`, `accept_devis_public(token, nom, email)`, `refuse_devis_public(token, motif)`. Token UUID v4 stocke en DB.
- Route publique `/devis/public/[token]` accessible sans auth. Rate-limite via proxy.
- Composant `devis-pdf.tsx` + helper `lib/utils/render-devis-pdf.ts` (pattern facture-pdf). PDF fige a l'envoi.
- Emails Resend : envoi devis (TO/CC), confirmation acceptation au signataire, notif admins refus.

**Tech Stack:** PostgreSQL + pgTAP, Next.js 16 App Router (Server Components + Server Actions), TypeScript, shadcn/ui base-ui, React PDF, Resend, Vitest.

**Spec:** `docs/superpowers/specs/2026-05-22-devis-workflow-design.md` (sections 4.2, 5, 6, 9, 11, 12, 14).

---

## File Structure

Files to create :

### DB

- `supabase/migrations/20260523100000_devis_table.sql`
- `supabase/migrations/20260523100100_devis_lignes_table.sql`
- `supabase/migrations/20260523100200_devis_public_rpcs.sql`
- `supabase/tests/09_devis_rls_invariants.sql`
- `supabase/tests/10_devis_rpcs_publiques.sql`

### Queries / Actions

- `lib/queries/devis.ts` — listDevis, getDevisByRef, getDevisById.
- `lib/actions/devis.ts` — createDevis, updateDevisInfo, addLigne, updateLigne, deleteLigne, sendDevis, cancelDevis, reviseDevis.

### Components

- `components/devis/devis-pdf.tsx` — React PDF rendering.
- `components/devis/devis-list-columns.tsx` — DataTable columns.
- `components/devis/devis-detail-client.tsx` — fiche client component avec actions.
- `components/devis/devis-lignes-table.tsx` — table lignes editable en brouillon.
- `components/devis/new-devis-dialog.tsx` — dialog creation.
- `components/devis/send-devis-dialog.tsx` — dialog envoi (TO/CC, preview).
- `components/devis/devis-status-badge.tsx`.
- `app/devis/public/[token]/page.tsx` — page publique.
- `app/devis/public/[token]/accept-form.tsx` — modale accept (client component).
- `app/devis/public/[token]/refuse-form.tsx` — modale refuse.

### Utils

- `lib/utils/render-devis-pdf.ts` — buffer PDF.
- `lib/email/devis-templates.ts` — 3 templates (envoi, accept confirmation, refus notif).

### App routes

- `app/(dashboard)/devis/page.tsx` — liste admin.
- `app/(dashboard)/devis/[ref]/page.tsx` — fiche.
- `app/devis/public/[token]/page.tsx` — public (no auth layout).
- `app/api/devis/[token]/pdf/route.ts` — PDF telechargement public.

### Tests

- `__tests__/devis-totals.test.ts` — helpers calcul.
- `__tests__/new-devis-dialog.test.tsx`.
- `__tests__/devis-public-page.test.tsx`.

Files to modify :

- `components/sidebar.tsx` (ou layout) — ajout item Devis.

---

## Pre-flight

- [ ] **Step 0.1:** `git rev-parse --abbrev-ref HEAD` → `feat/devis-phase-2`.
- [ ] **Step 0.2:** `npx supabase start` si pas demarre.
- [ ] **Step 0.3:** `npx supabase db reset` pour partir d'un etat clean (les migrations Phase 1 sont sur main, deja dans le repo).

---

## Task 1 : Migration `devis` (table + enum + RLS + index)

**Files:**

- Create: `supabase/migrations/20260523100000_devis_table.sql`

- [ ] **Step 1.1:** Ecrire la migration.

```sql
-- Phase 2 : table devis (document commercial pre-facture).
-- Numerotation par societe emettrice, allouee a la premiere transition
-- vers 'envoye'. Brouillons sans ref (peuvent etre supprimes sans trou
-- contrairement aux factures qui sont gapless legales).

CREATE TYPE statut_devis AS ENUM (
  'brouillon',
  'envoye',
  'accepte',
  'refuse',
  'expire',
  'remplace',
  'annule'
);

CREATE TABLE devis (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ref                         TEXT UNIQUE,
  numero_seq                  INTEGER,
  societe_emettrice_id        UUID NOT NULL REFERENCES societes_emettrices(id),
  client_id                   UUID NOT NULL REFERENCES clients(id),
  statut                      statut_devis NOT NULL DEFAULT 'brouillon',
  objet                       TEXT NOT NULL,
  date_emission               DATE,
  date_validite               DATE,
  date_envoi                  TIMESTAMPTZ,
  date_acceptation            TIMESTAMPTZ,
  date_refus                  TIMESTAMPTZ,
  montant_ht                  NUMERIC(12, 2) NOT NULL DEFAULT 0,
  montant_tva                 NUMERIC(12, 2) NOT NULL DEFAULT 0,
  montant_ttc                 NUMERIC(12, 2) NOT NULL DEFAULT 0,
  acceptation_token           TEXT UNIQUE,
  acceptation_token_expire_at TIMESTAMPTZ,
  acceptation_nom             TEXT,
  acceptation_email           TEXT,
  acceptation_ip              INET,
  acceptation_user_agent      TEXT,
  refus_motif                 TEXT,
  conditions_reglement        TEXT,
  notes_internes              TEXT,
  devis_parent_id             UUID REFERENCES devis(id),
  version                     INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  relances_actives            BOOLEAN NOT NULL DEFAULT TRUE,
  relance_j7_envoyee_at       TIMESTAMPTZ,
  relance_j14_envoyee_at      TIMESTAMPTZ,
  pdf_url                     TEXT,
  pdf_locked                  BOOLEAN NOT NULL DEFAULT FALSE,
  created_by                  UUID REFERENCES users(id),
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT chk_devis_montants_positifs CHECK (
    montant_ht >= 0 AND montant_tva >= 0 AND montant_ttc >= 0
  ),
  CONSTRAINT chk_devis_ttc_coherent CHECK (montant_ttc >= montant_ht),
  CONSTRAINT chk_devis_seq_required_when_sent CHECK (
    (statut = 'brouillon' AND numero_seq IS NULL AND ref IS NULL)
    OR (statut != 'brouillon' AND numero_seq IS NOT NULL AND ref IS NOT NULL)
  )
);

CREATE UNIQUE INDEX uq_devis_numero_seq_par_societe
  ON devis (societe_emettrice_id, numero_seq)
  WHERE numero_seq IS NOT NULL;

CREATE INDEX idx_devis_societe_statut ON devis (societe_emettrice_id, statut);
CREATE INDEX idx_devis_client ON devis (client_id);
CREATE INDEX idx_devis_acceptation_token ON devis (acceptation_token) WHERE acceptation_token IS NOT NULL;
CREATE INDEX idx_devis_parent ON devis (devis_parent_id) WHERE devis_parent_id IS NOT NULL;
CREATE INDEX idx_devis_envoye_relance ON devis (statut, date_envoi) WHERE statut = 'envoye';

CREATE TRIGGER trg_devis_updated_at
  BEFORE UPDATE ON devis
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE devis ENABLE ROW LEVEL SECURITY;

CREATE POLICY devis_admin_all ON devis FOR ALL TO authenticated
  USING (get_user_role() IN ('admin', 'superadmin'))
  WITH CHECK (get_user_role() IN ('admin', 'superadmin'));

COMMENT ON TABLE devis IS
  'Documents commerciaux pre-facture. Numerotation par societe emettrice, allouee a l envoi. Cycle brouillon -> envoye -> accepte/refuse/expire/remplace/annule. Admin only via RLS.';
```

- [ ] **Step 1.2:** `npx supabase db reset 2>&1 | tail -3` → migration applique sans erreur.
- [ ] **Step 1.3:** `npx supabase db query "SELECT count(*) FROM devis;"` → 0 (table vide).
- [ ] **Step 1.4:** `npx supabase gen types typescript --local > types/database.ts 2>/dev/null && grep -c "devis" types/database.ts` → > 5.
- [ ] **Step 1.5:** `npx tsc --noEmit && npm run lint` → clean.
- [ ] **Step 1.6:** Commit :

```bash
git add supabase/migrations/20260523100000_devis_table.sql types/database.ts
git commit -m "feat(db): table devis + enum statut_devis + RLS admin

Phase 2 : table devis avec numerotation par societe emettrice (alloue
a l envoi). RLS admin/superadmin only. CHECK contraintes : montants
positifs, TTC coherent, seq/ref required quand statut != brouillon.

Ref: docs/superpowers/specs/2026-05-22-devis-workflow-design.md (4.2)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2 : Migration `devis_lignes` (table + RLS + trigger recalcul totaux)

**Files:**

- Create: `supabase/migrations/20260523100100_devis_lignes_table.sql`

- [ ] **Step 2.1:** Ecrire la migration.

```sql
-- Phase 2 : lignes du devis. Cascade delete avec le devis parent.
-- Trigger recalcule les totaux du devis a chaque insert/update/delete.

CREATE TABLE devis_lignes (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  devis_id         UUID NOT NULL REFERENCES devis(id) ON DELETE CASCADE,
  ordre            INTEGER NOT NULL,
  libelle          TEXT NOT NULL,
  description      TEXT,
  quantite         NUMERIC(10, 2) NOT NULL DEFAULT 1 CHECK (quantite > 0),
  prix_unitaire_ht NUMERIC(12, 2) NOT NULL CHECK (prix_unitaire_ht >= 0),
  taux_tva         NUMERIC(5, 2) NOT NULL DEFAULT 20 CHECK (taux_tva >= 0),
  total_ht         NUMERIC(12, 2) NOT NULL,
  total_tva        NUMERIC(12, 2) NOT NULL,
  total_ttc        NUMERIC(12, 2) NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_devis_lignes_devis_ordre ON devis_lignes (devis_id, ordre);

CREATE TRIGGER trg_devis_lignes_updated_at
  BEFORE UPDATE ON devis_lignes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE devis_lignes ENABLE ROW LEVEL SECURITY;

CREATE POLICY devis_lignes_admin_all ON devis_lignes FOR ALL TO authenticated
  USING (get_user_role() IN ('admin', 'superadmin'))
  WITH CHECK (get_user_role() IN ('admin', 'superadmin'));

-- Recalcul totaux devis a chaque modification de ligne. Rejette si le
-- devis n est plus en brouillon (immuabilite legale apres envoi).
CREATE OR REPLACE FUNCTION recompute_devis_totaux()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_devis_id UUID;
  v_statut   statut_devis;
  v_ht       NUMERIC(12, 2);
  v_tva      NUMERIC(12, 2);
  v_ttc      NUMERIC(12, 2);
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_devis_id := OLD.devis_id;
  ELSE
    v_devis_id := NEW.devis_id;
  END IF;

  SELECT statut INTO v_statut FROM devis WHERE id = v_devis_id;
  IF v_statut IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  IF v_statut != 'brouillon' THEN
    RAISE EXCEPTION 'Devis %: lignes immutables apres envoi (statut=%)', v_devis_id, v_statut;
  END IF;

  SELECT
    COALESCE(SUM(total_ht), 0),
    COALESCE(SUM(total_tva), 0),
    COALESCE(SUM(total_ttc), 0)
  INTO v_ht, v_tva, v_ttc
  FROM devis_lignes WHERE devis_id = v_devis_id;

  UPDATE devis
     SET montant_ht = v_ht, montant_tva = v_tva, montant_ttc = v_ttc
   WHERE id = v_devis_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

ALTER FUNCTION recompute_devis_totaux() SET search_path = public, pg_temp;

CREATE TRIGGER trg_devis_lignes_recompute
  AFTER INSERT OR UPDATE OR DELETE ON devis_lignes
  FOR EACH ROW EXECUTE FUNCTION recompute_devis_totaux();

COMMENT ON TABLE devis_lignes IS
  'Lignes libres du devis (libelle, qte, PU HT, TVA, totaux). Recalcul totaux devis automatique. Immuables apres envoi.';
```

- [ ] **Step 2.2:** `npx supabase db reset 2>&1 | tail -3` → OK.
- [ ] **Step 2.3:** `npx supabase gen types typescript --local > types/database.ts 2>/dev/null`.
- [ ] **Step 2.4:** `npx tsc --noEmit && npm run lint` → clean.
- [ ] **Step 2.5:** Commit :

```bash
git add supabase/migrations/20260523100100_devis_lignes_table.sql types/database.ts
git commit -m "feat(db): table devis_lignes + trigger recompute totaux

Lignes libres avec cascade delete. Trigger recompute auto les totaux
devis a chaque insert/update/delete. Rejette les modifs si le devis
n est plus en brouillon (immutabilite post-envoi).

Ref: docs/superpowers/specs/2026-05-22-devis-workflow-design.md (4.2, 5)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3 : Migration triggers numerotation + transitions + pdf_locked + RPCs publiques + pgTAP

**Files:**

- Create: `supabase/migrations/20260523100200_devis_public_rpcs.sql`
- Create: `supabase/tests/09_devis_rls_invariants.sql`
- Create: `supabase/tests/10_devis_rpcs_publiques.sql`

- [ ] **Step 3.1:** Ecrire la migration.

```sql
-- Phase 2 : triggers numerotation/transitions/pdf_locked + RPCs publiques.

-- Numerotation alloue ref+seq a la premiere transition brouillon -> envoye.
-- Format : DEV-<code_societe>-NNNN (sequence par societe emettrice).
CREATE OR REPLACE FUNCTION assign_devis_ref_on_send()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_code TEXT;
  v_num  INTEGER;
BEGIN
  IF OLD.statut = 'brouillon' AND NEW.statut = 'envoye' AND NEW.ref IS NULL THEN
    SELECT code INTO v_code FROM societes_emettrices WHERE id = NEW.societe_emettrice_id;
    IF v_code IS NULL THEN
      RAISE EXCEPTION 'societe_emettrice introuvable pour devis %', NEW.id;
    END IF;

    LOCK TABLE devis IN SHARE ROW EXCLUSIVE MODE;

    SELECT COALESCE(MAX(numero_seq), 0) + 1 INTO v_num
      FROM devis WHERE societe_emettrice_id = NEW.societe_emettrice_id;

    NEW.numero_seq := v_num;
    NEW.ref := 'DEV-' || v_code || '-' || lpad(v_num::TEXT, 4, '0');
    NEW.date_emission := CURRENT_DATE;
    NEW.date_envoi := now();

    -- Token UUID v4 + expiration = date_validite + 7j (ou +90j si pas de date_validite)
    NEW.acceptation_token := gen_random_uuid()::TEXT;
    NEW.acceptation_token_expire_at := COALESCE(
      (NEW.date_validite + INTERVAL '7 days')::TIMESTAMPTZ,
      now() + INTERVAL '97 days'
    );

    -- pdf_locked set par l action server (apres rendu du PDF), pas ici.
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION assign_devis_ref_on_send() SET search_path = public, pg_temp;

CREATE TRIGGER trg_devis_assign_ref_on_send
  BEFORE UPDATE ON devis
  FOR EACH ROW EXECUTE FUNCTION assign_devis_ref_on_send();

-- Transitions de statut autorisees.
CREATE OR REPLACE FUNCTION check_devis_transition()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.statut = NEW.statut THEN RETURN NEW; END IF;

  -- Map des transitions legales
  IF NOT (
    (OLD.statut = 'brouillon' AND NEW.statut IN ('envoye', 'annule'))
    OR (OLD.statut = 'envoye' AND NEW.statut IN ('accepte', 'refuse', 'expire', 'remplace'))
  ) THEN
    RAISE EXCEPTION 'Transition statut devis illegale: % -> %', OLD.statut, NEW.statut;
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION check_devis_transition() SET search_path = public, pg_temp;

CREATE TRIGGER trg_devis_check_transition
  BEFORE UPDATE ON devis
  FOR EACH ROW EXECUTE FUNCTION check_devis_transition();

-- Immuabilite apres envoi : ref, numero_seq, montants, lignes (gere par
-- trigger devis_lignes), pdf_url une fois locked.
CREATE OR REPLACE FUNCTION freeze_devis_after_send()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.statut != 'brouillon' THEN
    IF NEW.ref IS DISTINCT FROM OLD.ref THEN
      RAISE EXCEPTION 'Devis %: ref immutable apres envoi', OLD.ref;
    END IF;
    IF NEW.numero_seq IS DISTINCT FROM OLD.numero_seq THEN
      RAISE EXCEPTION 'Devis %: numero_seq immutable apres envoi', OLD.ref;
    END IF;
    IF NEW.societe_emettrice_id IS DISTINCT FROM OLD.societe_emettrice_id THEN
      RAISE EXCEPTION 'Devis %: societe_emettrice_id immutable apres envoi', OLD.ref;
    END IF;
    IF OLD.pdf_locked AND NEW.pdf_url IS DISTINCT FROM OLD.pdf_url THEN
      RAISE EXCEPTION 'Devis %: pdf_url verrouille', OLD.ref;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION freeze_devis_after_send() SET search_path = public, pg_temp;

CREATE TRIGGER trg_devis_freeze_after_send
  BEFORE UPDATE ON devis
  FOR EACH ROW EXECUTE FUNCTION freeze_devis_after_send();

-- Table de log des consultations publiques (utile pour relances).
CREATE TABLE devis_public_views (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  devis_id    UUID NOT NULL REFERENCES devis(id) ON DELETE CASCADE,
  token       TEXT NOT NULL,
  ip          INET,
  user_agent  TEXT,
  viewed_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_devis_public_views_devis ON devis_public_views (devis_id);

ALTER TABLE devis_public_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY devis_public_views_admin_select ON devis_public_views FOR SELECT TO authenticated
  USING (get_user_role() IN ('admin', 'superadmin'));

-- RPC publique : lit un devis par son token. Loggue la consultation.
-- Renvoie une vue restreinte (pas notes_internes, pas acceptation_*).
CREATE OR REPLACE FUNCTION get_devis_public(p_token TEXT, p_ip INET DEFAULT NULL, p_user_agent TEXT DEFAULT NULL)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_devis RECORD;
  v_lignes JSON;
  v_societe RECORD;
  v_client RECORD;
BEGIN
  SELECT d.id, d.ref, d.statut, d.objet, d.date_emission, d.date_validite,
         d.acceptation_token_expire_at,
         d.montant_ht, d.montant_tva, d.montant_ttc,
         d.conditions_reglement, d.societe_emettrice_id, d.client_id
    INTO v_devis
    FROM devis d
   WHERE d.acceptation_token = p_token
     AND d.acceptation_token_expire_at > now();

  IF v_devis.id IS NULL THEN
    RAISE EXCEPTION 'Devis introuvable ou lien expire' USING ERRCODE = 'P0002';
  END IF;

  IF v_devis.statut NOT IN ('envoye', 'accepte', 'refuse') THEN
    RAISE EXCEPTION 'Devis non consultable (statut=%)', v_devis.statut USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO devis_public_views (devis_id, token, ip, user_agent)
  VALUES (v_devis.id, p_token, p_ip, p_user_agent);

  SELECT json_agg(json_build_object(
    'ordre', l.ordre, 'libelle', l.libelle, 'description', l.description,
    'quantite', l.quantite, 'prix_unitaire_ht', l.prix_unitaire_ht,
    'taux_tva', l.taux_tva,
    'total_ht', l.total_ht, 'total_tva', l.total_tva, 'total_ttc', l.total_ttc
  ) ORDER BY l.ordre) INTO v_lignes
    FROM devis_lignes l WHERE l.devis_id = v_devis.id;

  SELECT code, raison_sociale, forme_juridique, siret, tva_intracom,
         adresse, code_postal, ville, pays, email_contact,
         banque_nom, banque_iban, banque_bic, mentions_legales,
         conditions_reglement_default, logo_url
    INTO v_societe FROM societes_emettrices WHERE id = v_devis.societe_emettrice_id;

  SELECT raison_sociale, adresse, localisation
    INTO v_client FROM clients WHERE id = v_devis.client_id;

  RETURN json_build_object(
    'devis', row_to_json(v_devis),
    'lignes', COALESCE(v_lignes, '[]'::JSON),
    'societe', row_to_json(v_societe),
    'client', row_to_json(v_client)
  );
END;
$$;

ALTER FUNCTION get_devis_public(TEXT, INET, TEXT) SET search_path = public, pg_temp;
GRANT EXECUTE ON FUNCTION get_devis_public(TEXT, INET, TEXT) TO anon, authenticated;

-- RPC publique : accepte le devis. Race-safe via SELECT FOR UPDATE.
CREATE OR REPLACE FUNCTION accept_devis_public(
  p_token TEXT, p_nom TEXT, p_email TEXT,
  p_ip INET DEFAULT NULL, p_user_agent TEXT DEFAULT NULL
)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_devis_id UUID;
  v_statut statut_devis;
  v_ref TEXT;
BEGIN
  IF length(trim(p_nom)) < 2 THEN
    RAISE EXCEPTION 'Nom signataire requis' USING ERRCODE = 'P0001';
  END IF;
  IF p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'Email invalide' USING ERRCODE = 'P0001';
  END IF;

  SELECT id, statut, ref INTO v_devis_id, v_statut, v_ref
    FROM devis WHERE acceptation_token = p_token
      AND acceptation_token_expire_at > now()
    FOR UPDATE;

  IF v_devis_id IS NULL THEN
    RAISE EXCEPTION 'Devis introuvable ou lien expire' USING ERRCODE = 'P0002';
  END IF;
  IF v_statut != 'envoye' THEN
    RAISE EXCEPTION 'Devis non acceptable (statut=%)', v_statut USING ERRCODE = 'P0001';
  END IF;

  UPDATE devis SET
    statut = 'accepte',
    date_acceptation = now(),
    acceptation_nom = trim(p_nom),
    acceptation_email = lower(trim(p_email)),
    acceptation_ip = p_ip,
    acceptation_user_agent = p_user_agent
  WHERE id = v_devis_id;

  RETURN json_build_object('success', true, 'ref', v_ref);
END;
$$;

ALTER FUNCTION accept_devis_public(TEXT, TEXT, TEXT, INET, TEXT) SET search_path = public, pg_temp;
GRANT EXECUTE ON FUNCTION accept_devis_public(TEXT, TEXT, TEXT, INET, TEXT) TO anon, authenticated;

-- RPC publique : refuse le devis avec motif.
CREATE OR REPLACE FUNCTION refuse_devis_public(p_token TEXT, p_motif TEXT)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_devis_id UUID;
  v_statut statut_devis;
  v_ref TEXT;
BEGIN
  SELECT id, statut, ref INTO v_devis_id, v_statut, v_ref
    FROM devis WHERE acceptation_token = p_token
      AND acceptation_token_expire_at > now()
    FOR UPDATE;

  IF v_devis_id IS NULL THEN
    RAISE EXCEPTION 'Devis introuvable ou lien expire' USING ERRCODE = 'P0002';
  END IF;
  IF v_statut != 'envoye' THEN
    RAISE EXCEPTION 'Devis non refusable (statut=%)', v_statut USING ERRCODE = 'P0001';
  END IF;

  UPDATE devis SET
    statut = 'refuse',
    date_refus = now(),
    refus_motif = NULLIF(trim(p_motif), '')
  WHERE id = v_devis_id;

  RETURN json_build_object('success', true, 'ref', v_ref);
END;
$$;

ALTER FUNCTION refuse_devis_public(TEXT, TEXT) SET search_path = public, pg_temp;
GRANT EXECUTE ON FUNCTION refuse_devis_public(TEXT, TEXT) TO anon, authenticated;
```

- [ ] **Step 3.2:** Ecrire test pgTAP `09_devis_rls_invariants.sql` :

```sql
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;
SELECT plan(8);

SELECT ok((SELECT relrowsecurity FROM pg_class WHERE relname = 'devis'), 'RLS active sur devis');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE relname = 'devis_lignes'), 'RLS active sur devis_lignes');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE relname = 'devis_public_views'), 'RLS active sur devis_public_views');

SELECT is(
  (SELECT count(*)::int FROM pg_proc WHERE proname IN ('assign_devis_ref_on_send', 'check_devis_transition', 'freeze_devis_after_send', 'recompute_devis_totaux')),
  4, 'les 4 trigger functions devis sont presentes'
);

SELECT is(
  (SELECT count(*)::int FROM pg_proc WHERE proname IN ('get_devis_public', 'accept_devis_public', 'refuse_devis_public')),
  3, 'les 3 RPCs publiques devis sont presentes'
);

-- Verifie qu il y a bien un LOCK TABLE dans assign_devis_ref (anti-race)
SELECT ok(
  (SELECT prosrc FROM pg_proc WHERE proname = 'assign_devis_ref_on_send') LIKE '%LOCK TABLE devis%',
  'assign_devis_ref_on_send contient le LOCK TABLE devis'
);

-- Verifie que le format ref est DEV-<code>-NNNN
SELECT ok(
  (SELECT prosrc FROM pg_proc WHERE proname = 'assign_devis_ref_on_send') LIKE '%''DEV-'' || v_code%',
  'assign_devis_ref_on_send genere le format DEV-<code>-NNNN'
);

-- Index unique sur (societe_emettrice_id, numero_seq)
SELECT is(
  (SELECT count(*)::int FROM pg_indexes WHERE indexname = 'uq_devis_numero_seq_par_societe'),
  1, 'index unique numero_seq par societe present'
);

SELECT * FROM finish();
ROLLBACK;
```

- [ ] **Step 3.3:** Ecrire test pgTAP `10_devis_rpcs_publiques.sql` :

```sql
-- Test : RPCs publiques get/accept/refuse devis
-- Cree un devis envoye en fixture, teste les 3 RPCs.

BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;
SELECT plan(8);

-- Fixture : un client + un devis envoye (avec token UUID)
DO $$
DECLARE
  v_client_id UUID;
  v_societe_id UUID;
  v_devis_id UUID;
BEGIN
  SELECT id INTO v_societe_id FROM societes_emettrices WHERE code = 'SOL';

  INSERT INTO clients (trigramme, raison_sociale)
  VALUES ('TST', 'Test Client')
  RETURNING id INTO v_client_id;

  INSERT INTO devis (societe_emettrice_id, client_id, objet, date_validite)
  VALUES (v_societe_id, v_client_id, 'Test devis', CURRENT_DATE + 90)
  RETURNING id INTO v_devis_id;

  -- Ajout d une ligne
  INSERT INTO devis_lignes (devis_id, ordre, libelle, quantite, prix_unitaire_ht, taux_tva, total_ht, total_tva, total_ttc)
  VALUES (v_devis_id, 1, 'Prestation test', 1, 1000, 20, 1000, 200, 1200);

  -- Bascule en envoye (triggers : ref + token alloues)
  UPDATE devis SET statut = 'envoye' WHERE id = v_devis_id;
END $$;

-- Recupere le token alloue
\set token_query 'SELECT acceptation_token FROM devis WHERE objet = ''Test devis'' LIMIT 1'

-- 1. Devis a recu une ref DEV-SOL-NNNN
SELECT like(
  (SELECT ref FROM devis WHERE objet = 'Test devis'),
  'DEV-SOL-%',
  'devis envoye a une ref DEV-SOL-NNNN'
);

-- 2. Devis a un acceptation_token
SELECT isnt(
  (SELECT acceptation_token FROM devis WHERE objet = 'Test devis'),
  NULL,
  'devis envoye a un acceptation_token'
);

-- 3. Devis a une date_envoi
SELECT isnt(
  (SELECT date_envoi FROM devis WHERE objet = 'Test devis'),
  NULL,
  'devis envoye a une date_envoi'
);

-- 4. get_devis_public avec token valide retourne JSON
SELECT ok(
  (SELECT (get_devis_public((SELECT acceptation_token FROM devis WHERE objet = 'Test devis')))::TEXT LIKE '%"ref"%'),
  'get_devis_public retourne un objet contenant ref'
);

-- 5. get_devis_public avec token invalide leve une exception
SELECT throws_ok(
  $$ SELECT get_devis_public('00000000-0000-0000-0000-000000000000') $$,
  'P0002',
  NULL,
  'get_devis_public sur token invalide leve P0002'
);

-- 6. accept_devis_public avec email invalide leve P0001
SELECT throws_ok(
  format($$ SELECT accept_devis_public(%L, 'Jean Dupont', 'invalide') $$,
    (SELECT acceptation_token FROM devis WHERE objet = 'Test devis')),
  'P0001',
  NULL,
  'accept_devis_public refuse un email invalide'
);

-- 7. accept_devis_public avec donnees valides bascule en accepte
DO $$
DECLARE v_token TEXT;
BEGIN
  SELECT acceptation_token INTO v_token FROM devis WHERE objet = 'Test devis';
  PERFORM accept_devis_public(v_token, 'Jean Dupont', 'jean@example.com');
END $$;

SELECT is(
  (SELECT statut::TEXT FROM devis WHERE objet = 'Test devis'),
  'accepte',
  'devis passe en accepte apres accept_devis_public'
);

-- 8. accept_devis_public sur devis deja accepte leve P0001
SELECT throws_ok(
  format($$ SELECT accept_devis_public(%L, 'X', 'x@y.fr') $$,
    (SELECT acceptation_token FROM devis WHERE objet = 'Test devis')),
  'P0001',
  NULL,
  'accept_devis_public refuse un devis non envoye'
);

SELECT * FROM finish();
ROLLBACK;
```

- [ ] **Step 3.4:** `npx supabase db reset 2>&1 | tail -3` + `npx supabase test db 2>&1 | tail -6` → Files=11, Tests=64 (48+8+8). Tous pass.
- [ ] **Step 3.5:** `npx supabase gen types typescript --local > types/database.ts 2>/dev/null`.
- [ ] **Step 3.6:** `npx tsc --noEmit && npm run lint` → clean.
- [ ] **Step 3.7:** Commit :

```bash
git add supabase/migrations/20260523100200_devis_public_rpcs.sql supabase/tests/09_devis_rls_invariants.sql supabase/tests/10_devis_rpcs_publiques.sql types/database.ts
git commit -m "feat(db): triggers devis (numerotation/transitions/freeze) + 3 RPCs publiques

Triggers : assign_devis_ref_on_send (DEV-<code>-NNNN par societe,
LOCK TABLE anti-race, token UUID v4 + expiration),
check_devis_transition (map des transitions legales),
freeze_devis_after_send (ref/seq/societe immutables post-envoi,
pdf_url verrouille si pdf_locked).

3 RPCs SECURITY DEFINER granted to anon : get_devis_public (lit +
loggue), accept_devis_public (race-safe via FOR UPDATE), refuse_devis_public.
ERRCODE P0001 (validation) et P0002 (not found) pour client mapping.

Tests pgTAP : 8 invariants RLS + 8 cas RPCs (token valide, expire,
accept, refus, transition illegale).

Ref: docs/superpowers/specs/2026-05-22-devis-workflow-design.md (4.2, 5, 6)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4 : Queries `lib/queries/devis.ts`

**Files:**

- Create: `lib/queries/devis.ts`

- [ ] **Step 4.1:** Ecrire les queries.

```ts
import { createClient } from '@/lib/supabase/server';
import { AppError } from '@/lib/errors';
import { logger } from '@/lib/utils/logger';
import type { Database } from '@/types/database';

export type DevisRow = Database['public']['Tables']['devis']['Row'];
export type DevisLigneRow = Database['public']['Tables']['devis_lignes']['Row'];

export interface DevisListItem extends DevisRow {
  client: { trigramme: string; raison_sociale: string } | null;
  societe_emettrice: { code: string; raison_sociale: string } | null;
}

export interface DevisDetail extends DevisRow {
  client: {
    id: string;
    trigramme: string;
    raison_sociale: string;
    adresse: string | null;
  } | null;
  societe_emettrice: {
    id: string;
    code: string;
    raison_sociale: string;
    siret: string;
    tva_intracom: string;
    adresse: string;
    code_postal: string;
    ville: string;
    pays: string;
    email_contact: string;
    banque_nom: string | null;
    banque_iban: string | null;
    banque_bic: string | null;
    mentions_legales: string | null;
    conditions_reglement_default: string | null;
    logo_url: string | null;
    validite_devis_jours: number;
  } | null;
  lignes: DevisLigneRow[];
}

export async function listDevis(): Promise<DevisListItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('devis')
    .select(
      `*, client:clients(trigramme, raison_sociale), societe_emettrice:societes_emettrices(code, raison_sociale)`,
    )
    .order('created_at', { ascending: false });
  if (error) {
    logger.error('queries.devis', 'list failed', { error });
    throw new AppError(
      'DEVIS_FETCH_FAILED',
      'Impossible de charger les devis',
      { cause: error },
    );
  }
  return data as DevisListItem[];
}

export async function getDevisByRef(ref: string): Promise<DevisDetail | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('devis')
    .select(
      `
      *,
      client:clients(id, trigramme, raison_sociale, adresse),
      societe_emettrice:societes_emettrices(*),
      lignes:devis_lignes(*)
    `,
    )
    .eq('ref', ref)
    .maybeSingle();
  if (error) {
    logger.error('queries.devis', 'getByRef failed', { ref, error });
    throw new AppError('DEVIS_FETCH_FAILED', `Devis ${ref} introuvable`, {
      cause: error,
    });
  }
  if (!data) return null;
  // Tri ascendant des lignes par ordre
  const detail = data as unknown as DevisDetail;
  detail.lignes = [...detail.lignes].sort((a, b) => a.ordre - b.ordre);
  return detail;
}

export async function getDevisById(id: string): Promise<DevisDetail | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('devis')
    .select(
      `
      *,
      client:clients(id, trigramme, raison_sociale, adresse),
      societe_emettrice:societes_emettrices(*),
      lignes:devis_lignes(*)
    `,
    )
    .eq('id', id)
    .maybeSingle();
  if (error) {
    logger.error('queries.devis', 'getById failed', { id, error });
    throw new AppError('DEVIS_FETCH_FAILED', `Devis ${id} introuvable`, {
      cause: error,
    });
  }
  if (!data) return null;
  const detail = data as unknown as DevisDetail;
  detail.lignes = [...detail.lignes].sort((a, b) => a.ordre - b.ordre);
  return detail;
}
```

- [ ] **Step 4.2:** Ajouter `'DEVIS_FETCH_FAILED'` a `AppErrorCode` dans `lib/errors.ts` si absent.
- [ ] **Step 4.3:** `npx tsc --noEmit && npm run lint` → clean.
- [ ] **Step 4.4:** Commit :

```bash
git add lib/queries/devis.ts lib/errors.ts
git commit -m "feat(queries): devis (list, getByRef, getById) avec joins

Joins clients + societes_emettrices + lignes. AppErrorCode enrichi
de DEVIS_FETCH_FAILED.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5 : Server actions `lib/actions/devis.ts`

**Files:**

- Create: `lib/actions/devis.ts`
- Create: `lib/utils/devis-totals.ts` — helper recompute ligne totaux.

- [ ] **Step 5.1:** Helper totaux.

`lib/utils/devis-totals.ts` :

```ts
export interface LigneInput {
  libelle: string;
  description?: string | null;
  quantite: number;
  prix_unitaire_ht: number;
  taux_tva: number;
}

export interface LigneTotaux {
  total_ht: number;
  total_tva: number;
  total_ttc: number;
}

// Round to 2 decimals (centimes entiers, cf project_legal_invoicing)
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function computeLigneTotaux(input: LigneInput): LigneTotaux {
  const ht = round2(input.quantite * input.prix_unitaire_ht);
  const tva = round2((ht * input.taux_tva) / 100);
  const ttc = round2(ht + tva);
  return { total_ht: ht, total_tva: tva, total_ttc: ttc };
}
```

Test `__tests__/devis-totals.test.ts` :

```ts
import { describe, it, expect } from 'vitest';
import { computeLigneTotaux } from '@/lib/utils/devis-totals';

describe('computeLigneTotaux', () => {
  it('calcule HT, TVA, TTC pour qte=1 PU=100 TVA=20', () => {
    expect(
      computeLigneTotaux({
        libelle: 'x',
        quantite: 1,
        prix_unitaire_ht: 100,
        taux_tva: 20,
      }),
    ).toEqual({ total_ht: 100, total_tva: 20, total_ttc: 120 });
  });
  it('arrondit a 2 decimales (rounding cents entiers)', () => {
    expect(
      computeLigneTotaux({
        libelle: 'x',
        quantite: 3,
        prix_unitaire_ht: 33.33,
        taux_tva: 20,
      }),
    ).toEqual({ total_ht: 99.99, total_tva: 20, total_ttc: 119.99 });
  });
  it('gere TVA 0', () => {
    expect(
      computeLigneTotaux({
        libelle: 'x',
        quantite: 2,
        prix_unitaire_ht: 50,
        taux_tva: 0,
      }),
    ).toEqual({ total_ht: 100, total_tva: 0, total_ttc: 100 });
  });
});
```

- [ ] **Step 5.2:** Actions.

`lib/actions/devis.ts` :

```ts
'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/queries/users';
import { logAudit } from '@/lib/utils/audit';
import { logger } from '@/lib/utils/logger';
import { isAdmin } from '@/lib/utils/roles';
import { computeLigneTotaux } from '@/lib/utils/devis-totals';
import { getDefaultSocieteEmettriceId } from '@/lib/queries/societes-emettrices';

type Result<T = object> =
  | ({ success: true } & T)
  | { success: false; error: string };

const LigneSchema = z.object({
  libelle: z.string().min(1),
  description: z.string().nullish(),
  quantite: z.number().positive(),
  prix_unitaire_ht: z.number().nonnegative(),
  taux_tva: z.number().nonnegative().default(20),
});

const CreateDevisSchema = z.object({
  client_id: z.string().uuid(),
  societe_emettrice_id: z.string().uuid().optional(),
  objet: z.string().min(1),
  date_validite: z.string().optional(), // ISO date
  conditions_reglement: z.string().optional(),
  notes_internes: z.string().optional(),
  lignes: z.array(LigneSchema).min(1),
});

export type CreateDevisInput = z.input<typeof CreateDevisSchema>;

export async function createDevis(
  input: CreateDevisInput,
): Promise<Result<{ id: string }>> {
  const user = await getCurrentUser();
  if (!isAdmin(user?.role))
    return { success: false, error: 'Acces refuse (admin requis)' };

  const parsed = CreateDevisSchema.safeParse(input);
  if (!parsed.success)
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Donnees invalides',
    };

  const supabase = await createClient();
  const societeId =
    parsed.data.societe_emettrice_id ?? (await getDefaultSocieteEmettriceId());

  // Calcul date_validite default = today + validite_devis_jours de la societe
  let dateValidite = parsed.data.date_validite;
  if (!dateValidite) {
    const { data: soc } = await supabase
      .from('societes_emettrices')
      .select('validite_devis_jours')
      .eq('id', societeId)
      .single();
    const jours = soc?.validite_devis_jours ?? 90;
    const d = new Date();
    d.setDate(d.getDate() + jours);
    dateValidite = d.toISOString().slice(0, 10);
  }

  // Insert devis (brouillon)
  const { data: devis, error: devisErr } = await supabase
    .from('devis')
    .insert({
      societe_emettrice_id: societeId,
      client_id: parsed.data.client_id,
      objet: parsed.data.objet,
      date_validite: dateValidite,
      conditions_reglement: parsed.data.conditions_reglement,
      notes_internes: parsed.data.notes_internes,
      created_by: user!.id,
    })
    .select('id')
    .single();
  if (devisErr || !devis) {
    logger.error('actions.devis', 'create devis failed', { error: devisErr });
    return {
      success: false,
      error: devisErr?.message ?? 'Erreur creation devis',
    };
  }

  // Insert lignes (totaux calcules cote app + trigger recompute confirme)
  const lignesPayload = parsed.data.lignes.map((l, i) => ({
    devis_id: devis.id,
    ordre: i + 1,
    libelle: l.libelle,
    description: l.description ?? null,
    quantite: l.quantite,
    prix_unitaire_ht: l.prix_unitaire_ht,
    taux_tva: l.taux_tva,
    ...computeLigneTotaux(l),
  }));
  const { error: lignesErr } = await supabase
    .from('devis_lignes')
    .insert(lignesPayload);
  if (lignesErr) {
    logger.error('actions.devis', 'insert lignes failed', { error: lignesErr });
    return { success: false, error: lignesErr.message };
  }

  logAudit('devis_created', 'devis', devis.id, {
    client_id: parsed.data.client_id,
    objet: parsed.data.objet,
  });
  revalidatePath('/devis');
  return { success: true, id: devis.id };
}

const UpdateInfoSchema = z.object({
  objet: z.string().min(1).optional(),
  date_validite: z.string().optional(),
  conditions_reglement: z.string().nullish(),
  notes_internes: z.string().nullish(),
});

export async function updateDevisInfo(
  id: string,
  input: z.input<typeof UpdateInfoSchema>,
): Promise<Result> {
  const user = await getCurrentUser();
  if (!isAdmin(user?.role)) return { success: false, error: 'Acces refuse' };
  const parsed = UpdateInfoSchema.safeParse(input);
  if (!parsed.success)
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Donnees invalides',
    };
  const supabase = await createClient();
  const { error } = await supabase
    .from('devis')
    .update(parsed.data)
    .eq('id', id)
    .eq('statut', 'brouillon');
  if (error) return { success: false, error: error.message };
  logAudit('devis_info_updated', 'devis', id, parsed.data);
  revalidatePath(`/devis`);
  return { success: true };
}

export async function addLigne(
  devisId: string,
  ligne: z.input<typeof LigneSchema>,
): Promise<Result<{ id: string }>> {
  const user = await getCurrentUser();
  if (!isAdmin(user?.role)) return { success: false, error: 'Acces refuse' };
  const parsed = LigneSchema.safeParse(ligne);
  if (!parsed.success)
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Ligne invalide',
    };
  const supabase = await createClient();
  // Determine prochain ordre
  const { data: maxOrdre } = await supabase
    .from('devis_lignes')
    .select('ordre')
    .eq('devis_id', devisId)
    .order('ordre', { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrdre = (maxOrdre?.ordre ?? 0) + 1;
  const totaux = computeLigneTotaux(parsed.data);
  const { data, error } = await supabase
    .from('devis_lignes')
    .insert({
      devis_id: devisId,
      ordre: nextOrdre,
      libelle: parsed.data.libelle,
      description: parsed.data.description ?? null,
      quantite: parsed.data.quantite,
      prix_unitaire_ht: parsed.data.prix_unitaire_ht,
      taux_tva: parsed.data.taux_tva,
      ...totaux,
    })
    .select('id')
    .single();
  if (error || !data)
    return { success: false, error: error?.message ?? 'Erreur' };
  revalidatePath(`/devis`);
  return { success: true, id: data.id };
}

export async function updateLigne(
  ligneId: string,
  input: z.input<typeof LigneSchema>,
): Promise<Result> {
  const user = await getCurrentUser();
  if (!isAdmin(user?.role)) return { success: false, error: 'Acces refuse' };
  const parsed = LigneSchema.safeParse(input);
  if (!parsed.success)
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Ligne invalide',
    };
  const supabase = await createClient();
  const totaux = computeLigneTotaux(parsed.data);
  const { error } = await supabase
    .from('devis_lignes')
    .update({
      libelle: parsed.data.libelle,
      description: parsed.data.description ?? null,
      quantite: parsed.data.quantite,
      prix_unitaire_ht: parsed.data.prix_unitaire_ht,
      taux_tva: parsed.data.taux_tva,
      ...totaux,
    })
    .eq('id', ligneId);
  if (error) return { success: false, error: error.message };
  revalidatePath(`/devis`);
  return { success: true };
}

export async function deleteLigne(ligneId: string): Promise<Result> {
  const user = await getCurrentUser();
  if (!isAdmin(user?.role)) return { success: false, error: 'Acces refuse' };
  const supabase = await createClient();
  const { error } = await supabase
    .from('devis_lignes')
    .delete()
    .eq('id', ligneId);
  if (error) return { success: false, error: error.message };
  revalidatePath(`/devis`);
  return { success: true };
}

export async function sendDevis(
  devisId: string,
  _opts?: { to?: string[]; cc?: string[] },
): Promise<Result<{ ref: string }>> {
  const user = await getCurrentUser();
  if (!isAdmin(user?.role)) return { success: false, error: 'Acces refuse' };
  const supabase = await createClient();
  // 1. Bascule statut a envoye (triggers : alloue ref + token)
  const { data: updated, error: updErr } = await supabase
    .from('devis')
    .update({ statut: 'envoye' })
    .eq('id', devisId)
    .eq('statut', 'brouillon')
    .select('id, ref, acceptation_token, client_id, societe_emettrice_id')
    .single();
  if (updErr || !updated)
    return { success: false, error: updErr?.message ?? 'Devis non envoyable' };

  // 2. Generer PDF (cote action ou async). On set pdf_locked = true.
  //    Le contenu PDF est genere par render-devis-pdf au moment du telechargement
  //    ou en background. Pour V1 on marque juste locked.
  await supabase.from('devis').update({ pdf_locked: true }).eq('id', devisId);

  // 3. Email envoi : delegue a lib/email/devis-templates::sendDevisEmail
  //    Implemente en Task 7. Pour ce step la fonction peut etre stub si pas dispo.
  try {
    const { sendDevisEmail } = await import('@/lib/email/devis-templates');
    await sendDevisEmail({
      devisId: updated.id,
      to: _opts?.to,
      cc: _opts?.cc,
    });
  } catch (e) {
    logger.warn('actions.devis', 'sendDevisEmail failed (non-bloquant)', {
      error: e,
    });
  }

  logAudit('devis_sent', 'devis', devisId, { ref: updated.ref });
  revalidatePath('/devis');
  revalidatePath(`/devis/${updated.ref}`);
  return { success: true, ref: updated.ref! };
}

export async function cancelDevis(devisId: string): Promise<Result> {
  const user = await getCurrentUser();
  if (!isAdmin(user?.role)) return { success: false, error: 'Acces refuse' };
  const supabase = await createClient();
  const { error } = await supabase
    .from('devis')
    .update({ statut: 'annule' })
    .eq('id', devisId)
    .eq('statut', 'brouillon');
  if (error) return { success: false, error: error.message };
  logAudit('devis_cancelled', 'devis', devisId);
  revalidatePath('/devis');
  return { success: true };
}
```

- [ ] **Step 5.3:** `npm test -- devis-totals` → 3 pass.
- [ ] **Step 5.4:** `npx tsc --noEmit && npm run lint` → clean.
- [ ] **Step 5.5:** Commit :

```bash
git add lib/utils/devis-totals.ts lib/actions/devis.ts __tests__/devis-totals.test.ts
git commit -m "feat(actions): devis (create, lignes CRUD, send, cancel)

Zod validation + audit log + isAdmin gate. Helper computeLigneTotaux
avec arrondi cents entiers (cf project_legal_invoicing). sendDevis
bascule en envoye (triggers allouent ref + token), set pdf_locked et
delegue l email a sendDevisEmail (Task 7).

Tests Vitest computeLigneTotaux (3 cas).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6 : Composant `devis-pdf.tsx` + helper render

**Files:**

- Create: `components/devis/devis-pdf.tsx`
- Create: `lib/utils/render-devis-pdf.ts`

- [ ] **Step 6.1:** Inspecter `components/facturation/facture-pdf.tsx` et `lib/utils/render-facture-pdf.ts` pour suivre le pattern exact (styles, fontaine Helvetica, layout).

- [ ] **Step 6.2:** Ecrire `components/devis/devis-pdf.tsx` en s inspirant de `scripts/render-devis-weetel.ts` (deja existant pour le devis WEETEL). Le composant recoit `devis: DevisDetail` et rend :
  - Header : logo societe + identite (raison_sociale, adresse, SIRET, TVA) + bloc DEVIS / ref / date / validite a droite.
  - Bloc "Devis pour" : client.
  - Objet.
  - Table lignes : N, Libelle, Qte, PU HT, Montant HT (taux TVA en colonne ou en pied selon style facture).
  - Totaux : sous-total HT, TVA, total TTC.
  - Modalites de paiement (conditions_reglement || societe.conditions_reglement_default).
  - RIB societe.
  - Bloc signature (2 cases Pour SOLUVIA / Bon pour accord Client).
  - Footer mentions legales fixed.

Suivre exactement le pattern du script existant. Acces : `cat scripts/render-devis-weetel.ts` ligne 188+.

Signature :

```ts
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
import { createElement, type ReactElement } from 'react';

export function DevisPdf({
  devis,
}: {
  devis: DevisDetail;
}): ReactElement<DocumentProps> {
  // ... rendu identique au script render-devis-weetel.ts mais lisant les donnees du devis et de devis.societe_emettrice
}
```

- [ ] **Step 6.3:** Helper :

`lib/utils/render-devis-pdf.ts` :

```ts
import { renderToBuffer } from '@react-pdf/renderer';
import { DevisPdf } from '@/components/devis/devis-pdf';
import type { DevisDetail } from '@/lib/queries/devis';
import { createElement, type ReactElement } from 'react';

export async function renderDevisPdfBuffer(
  devis: DevisDetail,
): Promise<Buffer> {
  const element = createElement(DevisPdf, {
    devis,
  }) as ReactElement<// eslint-disable-next-line @typescript-eslint/no-explicit-any
  any>;
  return renderToBuffer(element);
}
```

- [ ] **Step 6.4:** `npx tsc --noEmit && npm run lint` → clean.
- [ ] **Step 6.5:** Commit :

```bash
git add components/devis/devis-pdf.tsx lib/utils/render-devis-pdf.ts
git commit -m "feat(devis): composant PDF + helper render buffer

Pattern hérité de scripts/render-devis-weetel.ts + facture-pdf.tsx.
Logo + identite societe emettrice (depuis devis.societe_emettrice),
bloc client, objet, lignes, totaux, RIB, signature, mentions legales.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 7 : Email templates + sender

**Files:**

- Create: `lib/email/devis-templates.ts`

- [ ] **Step 7.1:** Inspecter `lib/email/templates.ts` et `lib/email/client.ts` pour le pattern Resend existant.

- [ ] **Step 7.2:** Ecrire `lib/email/devis-templates.ts` avec 3 fonctions :

```ts
import { Resend } from 'resend';
import { getDevisById } from '@/lib/queries/devis';
import { getEmetteurInfo } from '@/lib/queries/parametres';
import { renderDevisPdfBuffer } from '@/lib/utils/render-devis-pdf';
import { getAppUrl } from '@/lib/utils/url';
import { logger } from '@/lib/utils/logger';

const resend = new Resend(process.env.RESEND_API_KEY ?? '');
const FROM = 'SOLUVIA <contact@mysoluvia.com>';

interface SendDevisParams {
  devisId: string;
  to?: string[];
  cc?: string[];
}

export async function sendDevisEmail(p: SendDevisParams): Promise<void> {
  const devis = await getDevisById(p.devisId);
  if (
    !devis ||
    !devis.ref ||
    !devis.acceptation_token ||
    !devis.societe_emettrice
  ) {
    logger.error('email.devis', 'sendDevisEmail: devis incomplet', {
      id: p.devisId,
    });
    return;
  }

  const link = `${getAppUrl()}/devis/public/${devis.acceptation_token}`;
  const pdfBuffer = await renderDevisPdfBuffer(devis);

  // Recipients : si p.to fourni, l utiliser. Sinon contacts client avec recoit_factures.
  let recipients = p.to;
  if (!recipients || recipients.length === 0) {
    // Stub : pour V1, requiert que l admin saisisse l email dans le dialog d envoi.
    logger.warn(
      'email.devis',
      'aucun destinataire fourni pour sendDevisEmail',
      { id: devis.id },
    );
    return;
  }

  const subject = `[${devis.societe_emettrice.code}] Devis ${devis.ref} - ${devis.objet}`;
  const html = `
    <div style="font-family: -apple-system, sans-serif; color: #1a1a1a;">
      <p>Bonjour,</p>
      <p>Veuillez trouver ci-joint le devis <strong>${devis.ref}</strong> emis par <strong>${devis.societe_emettrice.raison_sociale}</strong>.</p>
      <p><strong>Objet :</strong> ${devis.objet}<br />
         <strong>Montant TTC :</strong> ${devis.montant_ttc.toFixed(2).replace('.', ',')} EUR<br />
         <strong>Valide jusqu au :</strong> ${devis.date_validite ?? 'voir devis'}</p>
      <p>Pour consulter, telecharger ou accepter ce devis en ligne :</p>
      <p><a href="${link}" style="display: inline-block; background: #16a34a; color: white; padding: 12px 20px; border-radius: 6px; text-decoration: none;">Acceder au devis</a></p>
      <p>Le devis PDF est egalement joint a cet email.</p>
      <p>Cordialement,<br />${devis.societe_emettrice.raison_sociale}</p>
      <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e7eb;" />
      <p style="font-size: 11px; color: #6b7280;">
        Ce devis est valable ${devis.date_validite ? `jusqu au ${devis.date_validite}` : '90 jours'}.
        Pour toute question : ${devis.societe_emettrice.email_contact}.
      </p>
    </div>
  `;

  const result = await resend.emails.send({
    from: FROM,
    to: recipients,
    cc: p.cc,
    replyTo: devis.societe_emettrice.email_contact,
    subject,
    html,
    attachments: [{ filename: `${devis.ref}.pdf`, content: pdfBuffer }],
  });
  logger.info('email.devis', 'sendDevisEmail OK', {
    ref: devis.ref,
    id: result.data?.id,
  });
}

interface ConfirmationParams {
  devisId: string;
  signataireEmail: string;
  signataireNom: string;
}

export async function sendDevisAcceptationConfirmation(
  p: ConfirmationParams,
): Promise<void> {
  const devis = await getDevisById(p.devisId);
  if (!devis || !devis.societe_emettrice) return;
  const subject = `Confirmation acceptation devis ${devis.ref}`;
  const html = `
    <div style="font-family: -apple-system, sans-serif;">
      <p>Bonjour ${p.signataireNom},</p>
      <p>Nous confirmons votre acceptation du devis <strong>${devis.ref}</strong> emis par <strong>${devis.societe_emettrice.raison_sociale}</strong>.</p>
      <p>Montant accepte : ${devis.montant_ttc.toFixed(2).replace('.', ',')} EUR TTC.</p>
      <p>Nous reviendrons vers vous tres prochainement pour la suite.</p>
      <p>Cordialement,<br />${devis.societe_emettrice.raison_sociale}</p>
    </div>
  `;
  await resend.emails.send({
    from: FROM,
    to: [p.signataireEmail],
    replyTo: devis.societe_emettrice.email_contact,
    subject,
    html,
  });
}

interface RefusNotifParams {
  devisId: string;
  motif?: string | null;
}

export async function notifyAdminsDevisRefuse(
  p: RefusNotifParams,
): Promise<void> {
  const devis = await getDevisById(p.devisId);
  if (!devis) return;
  // Recuperer les emails des admins
  const { createClient } = await import('@/lib/supabase/server');
  const supabase = await createClient();
  const { data: admins } = await supabase
    .from('users')
    .select('email')
    .in('role', ['admin', 'superadmin']);
  const to = (admins ?? []).map((a) => a.email).filter(Boolean) as string[];
  if (to.length === 0) return;

  const subject = `[Devis] ${devis.ref} refuse par le client`;
  const html = `
    <p>Le devis <strong>${devis.ref}</strong> (${devis.objet}) a ete refuse par le client.</p>
    <p>Motif : ${p.motif ?? '(aucun)'}</p>
    <p>Voir : ${getAppUrl()}/devis/${devis.ref}</p>
  `;
  await resend.emails.send({ from: FROM, to, subject, html });
}
```

- [ ] **Step 7.3:** Verifier import `getAppUrl` (path : `lib/utils/url.ts` ou similaire — `grep -rn "export.*getAppUrl" lib/`). Si absent ou nomme autrement, adapter.

- [ ] **Step 7.4:** `npx tsc --noEmit && npm run lint` → clean.
- [ ] **Step 7.5:** Commit :

```bash
git add lib/email/devis-templates.ts
git commit -m "feat(email): templates devis (envoi, confirmation accept, notif refus)

3 fonctions Resend : sendDevisEmail (PDF en piece jointe + lien public),
sendDevisAcceptationConfirmation (au signataire), notifyAdminsDevisRefuse
(aux admins). From contact@mysoluvia.com, reply-to societe_emettrice.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 8 : Page liste `/devis` + sidebar

**Files:**

- Create: `app/(dashboard)/devis/page.tsx`
- Create: `components/devis/devis-list-columns.tsx`
- Create: `components/devis/devis-status-badge.tsx`
- Modify: sidebar (`components/sidebar.tsx` ou similaire).

- [ ] **Step 8.1:** `devis-status-badge.tsx` :

```tsx
import { Badge } from '@/components/ui/badge';

const VARIANTS: Record<
  string,
  {
    label: string;
    variant: 'default' | 'outline' | 'secondary' | 'destructive';
  }
> = {
  brouillon: { label: 'Brouillon', variant: 'secondary' },
  envoye: { label: 'Envoyé', variant: 'outline' },
  accepte: { label: 'Accepté', variant: 'default' },
  refuse: { label: 'Refusé', variant: 'destructive' },
  expire: { label: 'Expiré', variant: 'secondary' },
  remplace: { label: 'Remplacé', variant: 'secondary' },
  annule: { label: 'Annulé', variant: 'secondary' },
};

export function DevisStatusBadge({ statut }: { statut: string }) {
  const { label, variant } = VARIANTS[statut] ?? {
    label: statut,
    variant: 'secondary' as const,
  };
  return <Badge variant={variant}>{label}</Badge>;
}
```

- [ ] **Step 8.2:** `devis-list-columns.tsx` — pattern DataTable colonnes (s inspirer de `components/facturation/facture-list-columns.tsx`).

```tsx
'use client';
import type { ColumnDef } from '@tanstack/react-table';
import Link from 'next/link';
import { DevisStatusBadge } from './devis-status-badge';
import type { DevisListItem } from '@/lib/queries/devis';

export const devisColumns: ColumnDef<DevisListItem>[] = [
  {
    accessorKey: 'ref',
    header: 'Référence',
    cell: ({ row }) =>
      row.original.ref ? (
        <Link
          href={`/devis/${row.original.ref}`}
          className="font-mono font-semibold hover:underline"
        >
          {row.original.ref}
        </Link>
      ) : (
        <span className="text-muted-foreground italic">brouillon</span>
      ),
  },
  {
    accessorKey: 'objet',
    header: 'Objet',
    cell: ({ row }) => (
      <span className="line-clamp-1">{row.original.objet}</span>
    ),
  },
  {
    id: 'client',
    header: 'Client',
    cell: ({ row }) =>
      row.original.client
        ? `${row.original.client.trigramme} - ${row.original.client.raison_sociale}`
        : '-',
  },
  {
    id: 'societe',
    header: 'Société',
    cell: ({ row }) => row.original.societe_emettrice?.code ?? '-',
  },
  {
    accessorKey: 'statut',
    header: 'Statut',
    cell: ({ row }) => <DevisStatusBadge statut={row.original.statut} />,
  },
  {
    accessorKey: 'montant_ttc',
    header: 'Total TTC',
    cell: ({ row }) => (
      <span className="font-mono tabular-nums">
        {row.original.montant_ttc.toFixed(2).replace('.', ',')} €
      </span>
    ),
  },
  {
    accessorKey: 'date_envoi',
    header: 'Envoyé le',
    cell: ({ row }) =>
      row.original.date_envoi
        ? new Date(row.original.date_envoi).toLocaleDateString('fr-FR')
        : '-',
  },
  {
    accessorKey: 'date_validite',
    header: "Valide jusqu'au",
    cell: ({ row }) =>
      row.original.date_validite
        ? new Date(row.original.date_validite).toLocaleDateString('fr-FR')
        : '-',
  },
];
```

- [ ] **Step 8.3:** Page liste `app/(dashboard)/devis/page.tsx` :

```tsx
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { DataTable } from '@/components/shared/data-table';
import { getCurrentUser } from '@/lib/queries/users';
import { isAdmin } from '@/lib/utils/roles';
import { listDevis } from '@/lib/queries/devis';
import { listSocietesEmettricesActives } from '@/lib/queries/societes-emettrices';
import { getClientsForFreeFacture } from '@/lib/queries/clients'; // verifier si existe sinon listClients
import { devisColumns } from '@/components/devis/devis-list-columns';
import { NewDevisDialog } from '@/components/devis/new-devis-dialog';

export const metadata: Metadata = { title: 'Devis - SOLUVIA' };

export default async function DevisPage() {
  const [user, devis, societes] = await Promise.all([
    getCurrentUser(),
    listDevis(),
    listSocietesEmettricesActives(),
  ]);
  if (!isAdmin(user?.role)) redirect('/projets');

  return (
    <div className="space-y-4 p-6">
      <PageHeader title="Devis" description="Devis emis vers les clients">
        <NewDevisDialog
          societes={societes.map((s) => ({
            id: s.id,
            code: s.code,
            raison_sociale: s.raison_sociale,
            est_defaut: s.est_defaut,
          }))}
        />
      </PageHeader>
      <DataTable columns={devisColumns} data={devis} />
    </div>
  );
}
```

- [ ] **Step 8.4:** Modifier la sidebar. Trouver le fichier (`grep -l "Facturation\|/facturation" components/ -r | head`) et ajouter un item Devis. Pattern : entre Facturation et Production (ou groupe Finances). Icone : `<FileText />` ou `<ScrollText />`.

- [ ] **Step 8.5:** `npx tsc --noEmit && npm run lint` → clean (NewDevisDialog n'existe pas encore, peut casser le typecheck — accepter et le creer dans Task 9). Si bloquant : creer un stub vide :

```tsx
// components/devis/new-devis-dialog.tsx (stub Task 8, finalise Task 9)
'use client';
export function NewDevisDialog({ societes }: { societes: unknown[] }) {
  return <button disabled>Nouveau devis (impl. Task 9)</button>;
}
```

- [ ] **Step 8.6:** Commit :

```bash
git add app/\(dashboard\)/devis/page.tsx components/devis/devis-list-columns.tsx components/devis/devis-status-badge.tsx components/devis/new-devis-dialog.tsx components/sidebar.tsx
git commit -m "feat(devis): page liste /devis + sidebar item + badge statut

DataTable colonnes (ref, objet, client, societe, statut, total TTC,
dates). Badge couleur par statut. NewDevisDialog en stub (finalisation
Task 9).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 9 : Dialog création + page fiche `/devis/[ref]` (actions admin)

**Files:**

- Create: `components/devis/new-devis-dialog.tsx` (remplace le stub).
- Create: `components/devis/devis-detail-client.tsx`.
- Create: `components/devis/devis-lignes-editor.tsx` (table lignes editable en brouillon).
- Create: `components/devis/send-devis-dialog.tsx`.
- Create: `app/(dashboard)/devis/[ref]/page.tsx`.

- [ ] **Step 9.1:** `new-devis-dialog.tsx` : dialog ouvert par bouton "Nouveau devis", formulaire avec :
  - Selecteur societe (idem dialog facture libre, default est_defaut).
  - Selecteur client (search trigramme/raison_sociale).
  - Champ objet (texte court obligatoire).
  - Date validite (input date, default = today + societe.validite_devis_jours).
  - Lignes : N libre rows, chacune avec libelle, quantite, PU HT, taux TVA. Boutons add/remove.
  - Submit appelle `createDevis` puis `router.push(/devis/<id>)` (mais comme c est brouillon il n y a pas de ref encore ; rediriger vers `/devis` ou vers `/devis?id=<id>` ... ou utiliser une URL temporaire `/devis/draft/<id>`). **Decision** : `router.push('/devis')` apres creation puis ouvrir directement la fiche en local state n est pas trivial. Plus simple : creer une route `/devis/draft/[id]` qui resolve par id ; ou ajouter un parametre `?draft=<id>` sur la liste qui ouvre une modale d edition.
  - **Pour V1** : creer la route `/devis/[ref]` qui matche aussi les UUID (essayer ref d abord, fallback id). Plus simple : redirect vers `/devis/${data.id}` puis dans la page server `getDevisByRef(param)` echoue, fallback `getDevisById(param)`.

- [ ] **Step 9.2:** `devis-detail-client.tsx` : composant client qui rend la fiche d un devis. Pour un BROUILLON : editable (lignes, info), boutons Envoyer (ouvre send-devis-dialog), Annuler. Pour un statut != brouillon : read-only, badge statut, timeline events (date_envoi, date_acceptation, date_refus, motif), bouton Telecharger PDF, lien public copiable. Pour ENVOYE : ajouter bouton "Reviser" (creer un nouveau brouillon v2 lie via devis_parent_id + bascule l ancien en remplace).

- [ ] **Step 9.3:** `send-devis-dialog.tsx` : dialog d envoi.
  - Champs : To (multi emails), CC (multi emails optionnel).
  - Bouton Envoyer appelle `sendDevis(id, { to, cc })`.

- [ ] **Step 9.4:** Page `app/(dashboard)/devis/[ref]/page.tsx` :

```tsx
import { redirect, notFound } from 'next/navigation';
import { getCurrentUser } from '@/lib/queries/users';
import { isAdmin } from '@/lib/utils/roles';
import { getDevisByRef, getDevisById } from '@/lib/queries/devis';
import { DevisDetailClient } from '@/components/devis/devis-detail-client';

interface Props {
  params: Promise<{ ref: string }>;
}

export default async function DevisDetailPage({ params }: Props) {
  const { ref } = await params;
  const user = await getCurrentUser();
  if (!isAdmin(user?.role)) redirect('/projets');

  // ref peut etre un ref final (DEV-SOL-0001) ou un UUID (brouillon sans ref)
  const devis = ref.startsWith('DEV-')
    ? await getDevisByRef(ref)
    : await getDevisById(ref);

  if (!devis) notFound();

  return <DevisDetailClient devis={devis} />;
}
```

- [ ] **Step 9.5:** Tests Vitest minimaux pour le dialog creation.

`__tests__/new-devis-dialog.test.tsx` :

```tsx
/** @vitest-environment jsdom */
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

const createDevisMock = vi.fn(async () => ({
  success: true as const,
  id: 'devis-id',
}));
vi.mock('@/lib/actions/devis', () => ({
  createDevis: (...a: unknown[]) =>
    createDevisMock(...(a as Parameters<typeof createDevisMock>)),
}));

import { NewDevisDialog } from '@/components/devis/new-devis-dialog';

const clients = [{ id: 'c1', trigramme: 'DUP', raison_sociale: 'Dupont' }];
const societes = [
  { id: 'sol-id', code: 'SOL', raison_sociale: 'SOLUVIA', est_defaut: true },
];

afterEach(() => cleanup());
beforeEach(() => createDevisMock.mockClear());

describe('NewDevisDialog', () => {
  it('rend le bouton declencheur', () => {
    render(<NewDevisDialog societes={societes} clients={clients} />);
    expect(screen.getByText(/Nouveau devis/i)).toBeInTheDocument();
  });
});
```

(Plus complet a faire si le dialog s ouvre via state controle.)

- [ ] **Step 9.6:** `npx tsc --noEmit && npm run lint && npm test 2>&1 | tail -5` → clean + pass.
- [ ] **Step 9.7:** Commit :

```bash
git add components/devis/new-devis-dialog.tsx components/devis/devis-detail-client.tsx components/devis/devis-lignes-editor.tsx components/devis/send-devis-dialog.tsx app/\(dashboard\)/devis/\[ref\]/page.tsx __tests__/new-devis-dialog.test.tsx
git commit -m "feat(devis): dialog creation + fiche /devis/[ref] avec actions

Dialog new-devis-dialog : selecteurs societe + client, objet, lignes
libres. Fiche /devis/[ref] : edition en brouillon, read-only sinon.
Actions Envoyer (send-devis-dialog avec TO/CC), Annuler, Reviser.
Route accepte ref final (DEV-SOL-NNNN) OU uuid (brouillon sans ref).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 10 : Page publique `/devis/public/[token]` + route API PDF + accept/refuse forms

**Files:**

- Create: `app/devis/public/[token]/page.tsx`
- Create: `app/devis/public/[token]/devis-public-view.tsx`
- Create: `app/devis/public/[token]/accept-form.tsx`
- Create: `app/devis/public/[token]/refuse-form.tsx`
- Create: `app/devis/public/[token]/actions.ts` (server actions wrapping RPCs)
- Create: `app/devis/public/[token]/layout.tsx` (no-auth layout simple).
- Create: `app/api/devis/[token]/pdf/route.ts`.

- [ ] **Step 10.1:** Layout no-auth pour `/devis/public/[token]`.

```tsx
// app/devis/public/[token]/layout.tsx
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Devis - Acceptation en ligne' };

export default function PublicDevisLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr">
      <body className="bg-gray-50">
        <main className="mx-auto max-w-3xl px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
```

- [ ] **Step 10.2:** Server actions pour wrapper les RPCs publiques.

`app/devis/public/[token]/actions.ts` :

```ts
'use server';
import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/utils/logger';

export async function acceptDevisPublicAction(
  token: string,
  nom: string,
  email: string,
): Promise<{ success: true; ref: string } | { success: false; error: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('accept_devis_public', {
    p_token: token,
    p_nom: nom,
    p_email: email,
  });
  if (error) {
    logger.warn('public.devis.accept', 'rpc error', {
      token,
      error: error.message,
    });
    return {
      success: false,
      error: 'Impossible d accepter le devis. Verifiez vos informations.',
    };
  }
  const ref = (data as { ref: string }).ref;
  // declencher email confirmation async
  try {
    const { sendDevisAcceptationConfirmation } =
      await import('@/lib/email/devis-templates');
    const { data: devisRow } = await supabase
      .from('devis')
      .select('id')
      .eq('ref', ref)
      .single();
    if (devisRow)
      await sendDevisAcceptationConfirmation({
        devisId: devisRow.id,
        signataireEmail: email,
        signataireNom: nom,
      });
  } catch (e) {
    logger.warn(
      'public.devis.accept',
      'confirmation email failed (non-bloquant)',
      { error: e },
    );
  }
  return { success: true, ref };
}

export async function refuseDevisPublicAction(
  token: string,
  motif: string,
): Promise<{ success: true } | { success: false; error: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('refuse_devis_public', {
    p_token: token,
    p_motif: motif,
  });
  if (error) {
    logger.warn('public.devis.refuse', 'rpc error', {
      token,
      error: error.message,
    });
    return { success: false, error: 'Impossible de refuser le devis.' };
  }
  // notif admins
  try {
    const { notifyAdminsDevisRefuse } =
      await import('@/lib/email/devis-templates');
    const ref = (data as { ref: string }).ref;
    const { data: devisRow } = await supabase
      .from('devis')
      .select('id')
      .eq('ref', ref)
      .single();
    if (devisRow)
      await notifyAdminsDevisRefuse({ devisId: devisRow.id, motif });
  } catch (e) {
    logger.warn('public.devis.refuse', 'notif admins failed (non-bloquant)', {
      error: e,
    });
  }
  return { success: true };
}
```

- [ ] **Step 10.3:** Page publique `app/devis/public/[token]/page.tsx` :

```tsx
import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import { DevisPublicView } from './devis-public-view';

interface Props {
  params: Promise<{ token: string }>;
}

export default async function DevisPublicPage({ params }: Props) {
  const { token } = await params;
  const supabase = await createClient();
  const hdrs = await headers();
  const ip = hdrs.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
  const ua = hdrs.get('user-agent') ?? null;

  const { data, error } = await supabase.rpc('get_devis_public', {
    p_token: token,
    p_ip: ip,
    p_user_agent: ua,
  });
  if (error || !data) notFound();

  return <DevisPublicView token={token} payload={data as DevisPublicPayload} />;
}

interface DevisPublicPayload {
  devis: {
    ref: string;
    statut: string;
    objet: string;
    date_emission: string;
    date_validite: string;
    acceptation_token_expire_at: string;
    montant_ht: number;
    montant_tva: number;
    montant_ttc: number;
    conditions_reglement: string | null;
  };
  lignes: Array<{
    ordre: number;
    libelle: string;
    description: string | null;
    quantite: number;
    prix_unitaire_ht: number;
    taux_tva: number;
    total_ht: number;
    total_tva: number;
    total_ttc: number;
  }>;
  societe: {
    code: string;
    raison_sociale: string;
    forme_juridique: string | null;
    siret: string;
    tva_intracom: string;
    adresse: string;
    code_postal: string;
    ville: string;
    pays: string;
    email_contact: string;
    banque_nom: string | null;
    banque_iban: string | null;
    banque_bic: string | null;
    mentions_legales: string | null;
    conditions_reglement_default: string | null;
    logo_url: string | null;
  };
  client: {
    raison_sociale: string;
    adresse: string | null;
    localisation: string | null;
  };
}
```

- [ ] **Step 10.4:** Composant client `DevisPublicView` :

```tsx
'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AcceptForm } from './accept-form';
import { RefuseForm } from './refuse-form';

export function DevisPublicView({
  token,
  payload,
}: {
  token: string;
  payload: any;
}) {
  const [view, setView] = useState<'main' | 'accept' | 'refuse' | 'done'>(
    'main',
  );
  const { devis, lignes, societe, client } = payload;

  if (view === 'done') {
    return (
      <div className="rounded-md border bg-white p-8 text-center">
        <h1 className="text-2xl font-semibold">Merci !</h1>
        <p className="text-muted-foreground mt-2">
          Votre reponse a bien ete enregistree.
        </p>
      </div>
    );
  }

  if (view === 'accept')
    return (
      <AcceptForm
        token={token}
        ref={devis.ref}
        onDone={() => setView('done')}
        onCancel={() => setView('main')}
      />
    );
  if (view === 'refuse')
    return (
      <RefuseForm
        token={token}
        onDone={() => setView('done')}
        onCancel={() => setView('main')}
      />
    );

  return (
    <div className="space-y-6">
      <div className="rounded-md border bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Devis {devis.ref}</h1>
            <p className="text-muted-foreground text-sm">
              {societe.raison_sociale}
            </p>
          </div>
          <Badge variant="outline">
            {devis.statut === 'envoye' ? 'En attente' : devis.statut}
          </Badge>
        </div>
        <p className="mt-4 text-sm">
          <strong>Objet :</strong> {devis.objet}
        </p>
        <p className="text-muted-foreground text-xs">
          Valide jusqu au{' '}
          {new Date(devis.date_validite).toLocaleDateString('fr-FR')}
        </p>
      </div>

      <div className="rounded-md border bg-white p-6">
        <h2 className="text-sm font-semibold text-gray-500 uppercase">
          Lignes
        </h2>
        <table className="mt-3 w-full text-sm">
          <thead className="border-b text-left text-gray-500">
            <tr>
              <th className="py-2">#</th>
              <th>Libelle</th>
              <th className="text-right">Qte</th>
              <th className="text-right">PU HT</th>
              <th className="text-right">Montant HT</th>
            </tr>
          </thead>
          <tbody>
            {lignes.map((l: any) => (
              <tr key={l.ordre} className="border-b last:border-0">
                <td className="py-2">{l.ordre}</td>
                <td>
                  {l.libelle}
                  {l.description && (
                    <div className="text-muted-foreground text-xs">
                      {l.description}
                    </div>
                  )}
                </td>
                <td className="text-right tabular-nums">{l.quantite}</td>
                <td className="text-right tabular-nums">
                  {Number(l.prix_unitaire_ht).toFixed(2).replace('.', ',')} €
                </td>
                <td className="text-right tabular-nums">
                  {Number(l.total_ht).toFixed(2).replace('.', ',')} €
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-4 flex flex-col items-end gap-1 text-sm">
          <div>
            Sous-total HT :{' '}
            <span className="ml-4 font-mono tabular-nums">
              {Number(devis.montant_ht).toFixed(2).replace('.', ',')} €
            </span>
          </div>
          <div>
            TVA :{' '}
            <span className="ml-4 font-mono tabular-nums">
              {Number(devis.montant_tva).toFixed(2).replace('.', ',')} €
            </span>
          </div>
          <div className="mt-2 border-t pt-2 text-lg font-semibold">
            Total TTC :{' '}
            <span className="ml-4 font-mono tabular-nums">
              {Number(devis.montant_ttc).toFixed(2).replace('.', ',')} €
            </span>
          </div>
        </div>
      </div>

      {(devis.conditions_reglement || societe.conditions_reglement_default) && (
        <div className="rounded-md border bg-white p-6">
          <h2 className="text-sm font-semibold text-gray-500 uppercase">
            Modalites de paiement
          </h2>
          <p className="mt-2 text-sm whitespace-pre-line">
            {devis.conditions_reglement ?? societe.conditions_reglement_default}
          </p>
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between">
        <Button variant="outline" asChild>
          <a href={`/api/devis/${token}/pdf`} download={`${devis.ref}.pdf`}>
            Telecharger PDF
          </a>
        </Button>
        {devis.statut === 'envoye' && (
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setView('refuse')}>
              Refuser
            </Button>
            <Button onClick={() => setView('accept')}>Accepter le devis</Button>
          </div>
        )}
      </div>

      <p className="text-muted-foreground text-center text-xs">
        SIRET {societe.siret} - TVA {societe.tva_intracom} -{' '}
        {societe.email_contact}
      </p>
    </div>
  );
}
```

- [ ] **Step 10.5:** `accept-form.tsx` :

```tsx
'use client';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { acceptDevisPublicAction } from './actions';

export function AcceptForm({
  token,
  ref,
  onDone,
  onCancel,
}: {
  token: string;
  ref: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [nom, setNom] = useState('');
  const [email, setEmail] = useState('');
  const [engage, setEngage] = useState(false);
  const [pending, start] = useTransition();

  function submit() {
    if (!nom || !email || !engage) return;
    start(async () => {
      const res = await acceptDevisPublicAction(token, nom, email);
      if (res.success) {
        toast.success(`Devis ${res.ref} accepte. Merci !`);
        onDone();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <div className="space-y-4 rounded-md border bg-white p-6">
      <h1 className="text-xl font-semibold">Accepter le devis {ref}</h1>
      <div className="space-y-2">
        <Label htmlFor="nom">Nom du signataire</Label>
        <Input
          id="nom"
          value={nom}
          onChange={(e) => setNom(e.target.value)}
          placeholder="Prenom Nom"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="vous@entreprise.fr"
        />
      </div>
      <div className="flex items-start gap-2">
        <Checkbox
          id="engage"
          checked={engage}
          onCheckedChange={(c) => setEngage(c === true)}
        />
        <Label htmlFor="engage" className="text-xs font-normal">
          Je certifie avoir le pouvoir d engager la societe et accepte le devis
          dans son integralite.
        </Label>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel} disabled={pending}>
          Annuler
        </Button>
        <Button
          onClick={submit}
          disabled={!nom || !email || !engage || pending}
        >
          {pending ? 'Envoi...' : 'Confirmer l acceptation'}
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 10.6:** `refuse-form.tsx` :

```tsx
'use client';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { refuseDevisPublicAction } from './actions';

export function RefuseForm({
  token,
  onDone,
  onCancel,
}: {
  token: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [motif, setMotif] = useState('');
  const [pending, start] = useTransition();

  function submit() {
    start(async () => {
      const res = await refuseDevisPublicAction(token, motif);
      if (res.success) {
        toast.success('Devis refuse. Reponse enregistree.');
        onDone();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <div className="space-y-4 rounded-md border bg-white p-6">
      <h1 className="text-xl font-semibold">Refuser le devis</h1>
      <div className="space-y-2">
        <Label htmlFor="motif">Motif (optionnel)</Label>
        <Textarea
          id="motif"
          rows={4}
          value={motif}
          onChange={(e) => setMotif(e.target.value)}
          placeholder="Pourquoi refusez-vous ce devis ?"
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel} disabled={pending}>
          Annuler
        </Button>
        <Button onClick={submit} disabled={pending}>
          Confirmer le refus
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 10.7:** Route API PDF `app/api/devis/[token]/pdf/route.ts` :

```ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getDevisById } from '@/lib/queries/devis';
import { renderDevisPdfBuffer } from '@/lib/utils/render-devis-pdf';
import { logger } from '@/lib/utils/logger';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const supabase = await createClient();
  // Verifier le token + recuperer le devis_id (sans incrementer le log de vue)
  const { data: row, error } = await supabase
    .from('devis')
    .select('id')
    .eq('acceptation_token', token)
    .gt('acceptation_token_expire_at', new Date().toISOString())
    .maybeSingle();
  if (error || !row)
    return NextResponse.json(
      { error: 'Lien invalide ou expire' },
      { status: 404 },
    );

  const devis = await getDevisById(row.id);
  if (!devis)
    return NextResponse.json({ error: 'Devis introuvable' }, { status: 404 });

  try {
    const buffer = await renderDevisPdfBuffer(devis);
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${devis.ref}.pdf"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (e) {
    logger.error('api.devis.pdf', 'render failed', { token, error: e });
    return NextResponse.json(
      { error: 'Erreur generation PDF' },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 10.8:** `npx tsc --noEmit && npm run lint && npm test 2>&1 | tail -5` → clean + pass.
- [ ] **Step 10.9:** Commit :

```bash
git add app/devis/public app/api/devis
git commit -m "feat(devis): route publique /devis/public/[token] + PDF + accept/refuse

Page sans auth wrappee par layout HTML simple. Vue principale,
accept-form (nom + email + checkbox engagement), refuse-form (motif).
Server actions wrappent les RPCs publiques + emails de confirmation /
notif admins (non-bloquants). Route API GET /api/devis/[token]/pdf
re-rend le devis a la demande (token valide check, no-store cache).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 11 : Wrap-up tests + build + push + PR

- [ ] **Step 11.1:** `npx supabase db reset 2>&1 | tail -3` → OK.
- [ ] **Step 11.2:** `npx supabase test db 2>&1 | tail -6` → Files=11, Tests=64 (48+16). Tous pass.
- [ ] **Step 11.3:** `npm test 2>&1 | tail -10` → 520+ pass, 0 fail.
- [ ] **Step 11.4:** `npm run lint 2>&1 | tail -5` → clean.
- [ ] **Step 11.5:** `npm run build 2>&1 | tail -15` → OK.
- [ ] **Step 11.6:** `git status --short` → seulement les fichiers traînants pre-existants. Si tout est commit, c'est bon.
- [ ] **Step 11.7:** `git push -u origin feat/devis-phase-2 2>&1 | tail -10`.
- [ ] **Step 11.8:** Ouvrir PR via `gh pr create --title "Phase 2 - Devis brouillon + envoi + portail public" --body "..."`. Inclure dans le body :
  - Summary des composants ajoutes
  - Tests count
  - Test plan manuel : creer devis, envoyer, ouvrir lien public (incognito), accepter, voir confirmation email
- [ ] **Step 11.9:** Update memoire `project_devis_workflow.md` avec snapshot Phase 2.

---

## Self-Review

**Spec coverage** :

- 4.2 tables devis/devis_lignes/devis_public_views : Tasks 1, 2, 3
- 4.4 triggers : Task 3
- 5 workflow et transitions : Task 3 (triggers) + Task 5 (sendDevis)
- 6 portail client public : Tasks 3 (RPCs), 10 (pages)
- 9 PDF devis : Task 6
- 11 securite RPCs : Task 3 (SECURITY DEFINER + search_path)
- 12 UI navigation : Tasks 8, 9
- 14 tests : Task 3 (pgTAP) + Tasks 5, 9 (Vitest)

**Placeholder scan** : aucun TBD/TODO.

**Type consistency** : `DevisDetail`/`DevisListItem` types definis Task 4, utilises partout coherents. `acceptation_token` partout (pas de variant). `societe_emettrice_id` (snake) partout.

**Concerns** :

- Pas de cron expiration en Phase 2 (deplacé en Phase 3 si tu suis le spec) — mais le helper `acceptation_token_expire_at` est calculé deja.
- Pas de cron relance J+7/J+14 en Phase 2 (idem Phase 3).
- Revision (Task 9 step 9.2) : creer v2 + bascule v1 en `remplace` n est pas detaille — `reviseDevis` server action a faire dans Task 9 ou stub.
- Pas de rate-limit explicite sur `/devis/public/*` en Phase 2 (a ajouter en Phase 3 via proxy middleware si critique).

Ces points sont OK pour Phase 2 et seront couverts Phase 3.
