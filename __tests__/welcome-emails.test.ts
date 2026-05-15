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

describe('welcome email builders - structure commune', () => {
  it.each([
    ['admin', buildWelcomeAdmin],
    ['superadmin', buildWelcomeSuperadmin],
    ['cdp', buildWelcomeCdp],
    ['commercial', buildWelcomeCommercial],
  ] as const)('%s : escape le prenom, logo, CTA, pas d em-dash', (_, build) => {
    const { html, subject } = build({ prenom: '<Marc>' });
    // Echappement HTML du prenom user-supplied
    expect(html).toContain('&lt;Marc&gt;');
    expect(html).not.toContain('<Marc>');
    // Logo officiel
    expect(html).toContain('https://app.mysoluvia.com/logo.png');
    // CTA
    expect(html).toContain('https://app.mysoluvia.com');
    expect(html).toMatch(/Accéder à Soluvia/);
    // Signature
    expect(html).toMatch(/L'équipe SOLUVIA/);
    // Pas d em-dashes
    expect(html).not.toContain('—');
    expect(subject).not.toContain('—');
  });
});

describe('buildWelcomeAdmin', () => {
  it('a le bon subject et le contenu admin', () => {
    const { subject, html } = buildWelcomeAdmin({ prenom: 'Marc' });
    expect(subject).toBe('Bienvenue sur Soluvia - votre cockpit de pilotage');
    expect(html).toMatch(/compte administrateur/);
    expect(html).toMatch(/vue d'ensemble/i);
    expect(html).toMatch(/projets, contrats/i);
    expect(html).toMatch(/facturation OPCO/i);
    expect(html).toMatch(/paramètres/i);
  });
});

describe('buildWelcomeSuperadmin', () => {
  it('a le bon subject avec accent et mentionne les actions sensibles', () => {
    const { subject, html } = buildWelcomeSuperadmin({ prenom: 'Marc' });
    expect(subject).toBe('Bienvenue sur Soluvia - accès superadmin');
    expect(html).toMatch(/superadmin/i);
    expect(html).toMatch(/rôles/i);
    expect(html).toMatch(/réglages/i);
    expect(html).toMatch(/historique/i);
    expect(html).toMatch(/actions sensibles/i);
  });
});

describe('buildWelcomeCdp', () => {
  it('a le bon subject et le contenu chef de projet', () => {
    const { subject, html } = buildWelcomeCdp({ prenom: 'Sophie' });
    expect(subject).toBe('Bienvenue sur Soluvia - votre espace chef de projet');
    expect(html).toMatch(/chef de projet/i);
    expect(html).toMatch(/saisie du temps/i);
    expect(html).toMatch(/qualité/i);
    expect(html).toMatch(/alertes/i);
  });
});

describe('buildWelcomeCommercial', () => {
  it('a le bon subject et le contenu commercial', () => {
    const { subject, html } = buildWelcomeCommercial({ prenom: 'Léa' });
    expect(subject).toBe('Bienvenue sur Soluvia - votre pipeline commercial');
    expect(html).toMatch(/prospects/i);
    expect(html).toMatch(/taux de conversion/i);
    expect(html).toMatch(/chefs de projet/i);
  });
});

describe('sendWelcomeEmail dispatcher', () => {
  it('expose une fonction async qui prend un user', () => {
    expect(typeof sendWelcomeEmail).toBe('function');
  });
});
