import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Suggère les bank_lines_mirror qui matchent une facture (par montant et
// référence). Consommé par MarquerPayeeDialog (synergie #2).
//
// Critères :
//   - montant ± 0.01€ (tolérance arrondi)
//   - payment_ref contient la ref facture (ILIKE %FAC-XXX%) OU
//     écart de date < 30 jours par rapport à date_echeance
//   - top 5 résultats classés par score
//
// Auth : session utilisateur (admin/superadmin). Pas de route protégée
// par token car c'est un read pour l'UI interne.

export const dynamic = 'force-dynamic';
export const maxDuration = 10;

interface BankLineRow {
  id: string;
  date: string;
  montant: number;
  payment_ref: string | null;
  partner_name: string | null;
  societe_slug: string | null;
}

interface Suggestion extends BankLineRow {
  score: number; // 0..100
  reasons: string[];
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ ref: string }> },
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  }

  const { ref } = await params;

  const { data: facture } = await supabase
    .from('factures')
    .select('ref, montant_ttc, date_echeance, date_emission')
    .eq('ref', ref)
    .maybeSingle();
  if (!facture) {
    return NextResponse.json({ error: 'Facture introuvable' }, { status: 404 });
  }

  const ttc = Number(facture.montant_ttc);
  // Borne ± 0.01€ pour matcher les arrondis cents
  const minM = ttc - 0.01;
  const maxM = ttc + 0.01;

  // bank_lines_mirror : pas encore typée (régénérer types/database.ts après
  // supabase db push). On caste le retour pour débloquer le build.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sbAny = supabase as any;
  const { data: lines } = (await sbAny
    .from('bank_lines_mirror')
    .select('id, date, montant, payment_ref, partner_name, societe_slug')
    .gte('montant', minM)
    .lte('montant', maxM)
    .order('date', { ascending: false })
    .limit(50)) as { data: BankLineRow[] | null };

  const refUpper = (facture.ref ?? '').toUpperCase();
  const dateEch = facture.date_echeance
    ? new Date(facture.date_echeance)
    : null;

  const suggestions: Suggestion[] = (lines ?? []).map((l: BankLineRow) => {
    const reasons: string[] = [];
    let score = 50; // montant déjà OK (filtre SQL)
    reasons.push('Montant exact');

    if (refUpper && l.payment_ref?.toUpperCase().includes(refUpper)) {
      score += 40;
      reasons.push(`Réf "${facture.ref}" présente dans payment_ref`);
    }

    if (dateEch) {
      const dl = new Date(l.date);
      const diffDays = Math.abs(
        (dl.getTime() - dateEch.getTime()) / (1000 * 60 * 60 * 24),
      );
      if (diffDays <= 7) {
        score += 10;
        reasons.push(`Date ± 7j de l'échéance`);
      } else if (diffDays <= 30) {
        score += 5;
        reasons.push(`Date ± 30j de l'échéance`);
      }
    }

    return { ...l, score, reasons };
  });

  suggestions.sort((a, b) => b.score - a.score);

  return NextResponse.json({
    success: true,
    facture: { ref: facture.ref, montant_ttc: ttc },
    suggestions: suggestions.slice(0, 5),
  });
}
