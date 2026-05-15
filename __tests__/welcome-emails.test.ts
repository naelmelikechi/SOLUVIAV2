process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';

import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/email/_send', () => ({
  sendEmail: vi.fn().mockResolvedValue({ success: true }),
}));

import {
  buildWelcomeAdmin,
  buildWelcomeSuperadmin,
  buildWelcomeCdp,
  buildWelcomeCommercial,
  sendWelcomeEmail,
} from '@/lib/email/welcome';

describe('welcome email builders', () => {
  describe('buildWelcomeAdmin', () => {
    it('inclut le prenom du destinataire echappe', () => {
      const { subject, html } = buildWelcomeAdmin({ prenom: '<Marc>' });
      expect(html).toContain('&lt;Marc&gt;');
      expect(html).not.toContain('<Marc>');
      expect(subject).toBe('Bienvenue sur Soluvia - votre cockpit de pilotage');
    });

    it('contient les 4 bullets admin', () => {
      const { html } = buildWelcomeAdmin({ prenom: 'Marc' });
      expect(html).toMatch(/Vue d.ensemble et indicateurs/);
      expect(html).toMatch(/projets, contrats et clients/);
      expect(html).toMatch(/Facturation OPCO/);
      expect(html).toMatch(/Administration\s*:\s*utilisateurs/);
    });

    it('contient le CTA vers app.mysoluvia.com', () => {
      const { html } = buildWelcomeAdmin({ prenom: 'Marc' });
      expect(html).toContain('https://app.mysoluvia.com');
      expect(html).toMatch(/Acc.der a Soluvia/i);
    });

    it("ne contient pas d'em-dashes", () => {
      const { html, subject } = buildWelcomeAdmin({ prenom: 'Marc' });
      expect(html).not.toContain('—');
      expect(subject).not.toContain('—');
    });
  });

  describe('buildWelcomeSuperadmin', () => {
    it("mentionne l'acces technique complet et la note d'usage avise", () => {
      const { subject, html } = buildWelcomeSuperadmin({ prenom: 'Marc' });
      expect(subject).toBe('Bienvenue sur Soluvia - acces superadmin');
      expect(html).toMatch(/acces technique complet/);
      expect(html).toMatch(/journal d.audit/);
      expect(html).toMatch(/operations sensibles/);
    });
  });

  describe('buildWelcomeCdp', () => {
    it('a le bon subject et les bullets cdp', () => {
      const { subject, html } = buildWelcomeCdp({ prenom: 'Sophie' });
      expect(subject).toBe(
        'Bienvenue sur Soluvia - votre espace chef de projet',
      );
      expect(html).toMatch(/portefeuille/);
      expect(html).toMatch(/Saisie du temps/);
      expect(html).toMatch(/qualite/i);
      expect(html).toMatch(/Notifications temps reel/);
    });
  });

  describe('buildWelcomeCommercial', () => {
    it('a le bon subject et les bullets commercial', () => {
      const { subject, html } = buildWelcomeCommercial({ prenom: 'Lea' });
      expect(subject).toBe('Bienvenue sur Soluvia - votre pipeline commercial');
      expect(html).toMatch(/Pipeline prospects/);
      expect(html).toMatch(/projets convertis/);
      expect(html).toMatch(/taux de conversion/);
      expect(html).toMatch(/chefs de projet/);
    });
  });
});

describe('sendWelcomeEmail dispatcher', () => {
  it('expose une fonction async qui prend un user', () => {
    expect(typeof sendWelcomeEmail).toBe('function');
  });
});
