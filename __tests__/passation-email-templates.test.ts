import { describe, it, expect, vi, beforeEach } from 'vitest';

const sendEmailMock = vi.fn().mockResolvedValue({ success: true });
vi.mock('@/lib/email/_send', () => ({
  sendEmail: (...args: unknown[]) => sendEmailMock(...args),
}));

import {
  sendPassationEscaladeDevEmail,
  sendPassationEscaladeDirectionEmail,
  sendPassationRappelReferentEmail,
  sendSyntheseGenereeEmail,
  sendSyntheseVague1Email,
} from '@/lib/email/passation-templates';

beforeEach(() => {
  sendEmailMock.mockClear();
});

describe('passation-templates', () => {
  it('vague 1 : PDF complet en piece jointe, expediteur contact@mysoluvia.com', async () => {
    const pdf = Buffer.from('%PDF-fake');
    await sendSyntheseVague1Email({
      to: ['ref@mysoluvia.com', 'dir@mysoluvia.com'],
      raisonSociale: 'Groupe Test',
      referenceDossier: 'SLV-2026-XYZ',
      developpeur: 'Iladj Toure',
      lienFiche: 'https://app.mysoluvia.com/commercial/prospects/1',
      pdfComplet: pdf,
    });
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const params = sendEmailMock.mock.calls[0]![0] as {
      from: string;
      to: string[];
      subject: string;
      html: string;
      attachments: Array<{ filename: string; content: Buffer }>;
    };
    expect(params.from).toBe('SOLUVIA <contact@mysoluvia.com>');
    expect(params.to).toHaveLength(2);
    expect(params.subject).toContain('SLV-2026-XYZ');
    expect(params.attachments).toHaveLength(1);
    expect(params.attachments[0]!.filename).toBe(
      'synthese-passation-SLV-2026-XYZ.pdf',
    );
    expect(params.attachments[0]!.content).toBe(pdf);
  });

  it('echappe le HTML dans les champs libres', async () => {
    await sendSyntheseGenereeEmail({
      to: 'dev@mysoluvia.com',
      prospectNom: '<script>alert(1)</script>',
      referenceDossier: 'SLV-2026-XYZ',
      lienFiche: 'https://app.mysoluvia.com/x',
    });
    const { html } = sendEmailMock.mock.calls[0]![0] as { html: string };
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('aucun tiret cadratin dans les sujets ni les corps', async () => {
    const common = {
      raisonSociale: 'Groupe Test',
      referenceDossier: 'SLV-2026-XYZ',
      lienFiche: 'https://app.mysoluvia.com/x',
    };
    await sendSyntheseGenereeEmail({
      to: 'a@b.fr',
      prospectNom: 'Groupe Test',
      referenceDossier: common.referenceDossier,
      lienFiche: common.lienFiche,
    });
    await sendSyntheseVague1Email({
      ...common,
      to: ['a@b.fr'],
      developpeur: null,
      pdfComplet: Buffer.from('x'),
    });
    await sendPassationEscaladeDevEmail({
      to: ['a@b.fr'],
      prospectNom: 'Groupe Test',
      referenceDossier: common.referenceDossier,
      lienFiche: common.lienFiche,
    });
    await sendPassationRappelReferentEmail({ ...common, to: ['a@b.fr'] });
    await sendPassationEscaladeDirectionEmail({ ...common, to: ['a@b.fr'] });

    for (const call of sendEmailMock.mock.calls) {
      const { subject, html } = call[0] as { subject: string; html: string };
      expect(subject).not.toContain('—');
      expect(html).not.toContain('—');
    }
  });
});
