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
