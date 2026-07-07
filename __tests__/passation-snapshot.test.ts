import { describe, it, expect, vi } from 'vitest';

// queries/passation importe le client serveur (next/headers) : neutralise.
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));

import { normalizeSnapshot } from '@/lib/queries/passation';
import type { Json } from '@/types/database';

describe('normalizeSnapshot', () => {
  it('contenu null -> squelette vide exploitable par le rendu', () => {
    const s = normalizeSnapshot(null);
    expect(s.version).toBe(2);
    expect(s.identite.raisonSociale).toBe('-');
    expect(s.contacts).toEqual([]);
    expect(s.documents).toHaveLength(7);
    expect(s.documents.every((d) => d.present === false)).toBe(true);
  });

  it('snapshot V2 : passe-plat', () => {
    const v2 = normalizeSnapshot(null);
    v2.identite.raisonSociale = 'ACME';
    const out = normalizeSnapshot(v2 as unknown as Json);
    expect(out).toBe(v2 as unknown as ReturnType<typeof normalizeSnapshot>);
  });

  it('snapshot V1 (Rows bruts) : adapte les champs connus', () => {
    // Forme historique : SyntheseData = Rows serialisees (cf. git main).
    const v1 = {
      prospect: {
        nom: 'Groupe Test',
        type_prospect: 'entreprise',
        siren: '123456789',
        siret: '12345678900011',
        forme_juridique: 'SAS',
        adresse: '1 rue du Test, Lyon',
        code_naf: '4120B',
        naf_libelle: 'Construction',
        effectif_tranche: '100-249',
        region: 'AURA',
        site_web: 'test.fr',
        canal_origine: 'reseau_direction',
        taux_npec: 35,
        duree_contrat_ans: 3,
        mois_demarrage: 3,
        volume_an1: 15,
        volume_an2: 40,
        volume_an3: 70,
        volume_garanti_seuil: null,
        leviers: ['Volume garanti'],
        perimetre_missions: 'Missions A-K',
        // Champs sections 6/8 : purges par la migration, mais on verifie
        // qu'ils sont ignores meme s'ils trainent dans un vieux snapshot.
        points_vigilance: 'NE DOIT PAS FUIR',
        notes_inter_equipe: 'NE DOIT PAS FUIR',
      },
      commercial: { prenom: 'Iladj', nom: 'Toure' },
      client: { raison_sociale: 'Groupe Test SAS' },
      contacts: [
        {
          nom: 'Jean Dupont',
          poste: 'DG',
          email: 'j@test.fr',
          telephone: '0600000000',
          role_decision: 'sponsor',
          sensibilites: 'prefere le telephone',
        },
      ],
      rdvs: [
        {
          date_prevue: '2026-02-19T09:00:00Z',
          date_realisee: '2026-02-19T09:30:00Z',
          type_rdv: 'presentation',
          statut: 'realise',
          objet: 'Presentation',
        },
      ],
      signature: {
        signed_at: '2026-06-12T10:00:00Z',
        signed_document_path: 'x/y.pdf',
      },
      referenceDossier: 'SLV-2026-ABCDEF12',
      dateProduction: '2026-06-13T09:00:00Z',
    };

    const s = normalizeSnapshot(v1 as unknown as Json);
    expect(s.version).toBe(2);
    expect(s.meta.referenceDossier).toBe('SLV-2026-ABCDEF12');
    expect(s.meta.developpeur).toBe('Iladj Toure');
    expect(s.meta.tunnel).toBe('entreprise');
    expect(s.meta.dateSignature).toBe('2026-06-12T10:00:00Z');
    // La raison sociale du client convertit prime sur le nom prospect.
    expect(s.identite.raisonSociale).toBe('Groupe Test SAS');
    expect(s.identite.siren).toBe('123456789');
    expect(s.engagements.tauxNpec).toBe(35);
    expect(s.engagements.volumeAn3).toBe(70);
    expect(s.engagements.leviers).toEqual(['Volume garanti']);
    expect(s.contacts).toHaveLength(1);
    expect(s.contacts[0]!.role).toBe('sponsor');
    // RDV : date realisee prioritaire.
    expect(s.historique.rdvs[0]!.date).toBe('2026-02-19T09:30:00Z');
    // Contrat signe coche dans les documents.
    expect(s.documents[0]!.present).toBe(true);
    // Nouveaux champs absents en V1 -> null/vides, pas d'erreur.
    expect(s.identite.nbImplantations).toBeNull();
    expect(s.engagements.formationsRncp).toEqual([]);
    expect(s.calendrier).toEqual({});
    // Les saisies 6/8 ne transitent JAMAIS par le snapshot normalise.
    const json = JSON.stringify(s);
    expect(json).not.toContain('NE DOIT PAS FUIR');
  });
});
