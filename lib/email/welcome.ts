// Welcome emails par role. 4 templates HTML sobres, palette SOLUVIA (#16a34a).
// Builders purs (sans I/O) pour tester sans mock. Dispatcher sendWelcomeEmail
// route au bon builder selon role, passe par le hub sendEmail centralise.

import { sendEmail } from './_send';

type Role = 'admin' | 'superadmin' | 'cdp' | 'commercial';

interface BuiltEmail {
  subject: string;
  html: string;
}

interface BuilderParams {
  prenom: string;
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function shell(opts: {
  greeting: string;
  intro: string;
  pitch: string;
  bullets: string[];
  outro?: string;
}): string {
  const bulletsHtml = opts.bullets
    .map(
      (b) =>
        `<li style="margin:0 0 8px;color:#2d4a2d;font-size:14px;line-height:1.6;">${b}</li>`,
    )
    .join('');
  const outro = opts.outro
    ? `<p style="margin:16px 0 0;color:#6b8a6b;font-size:13px;line-height:1.6;font-style:italic;">${opts.outro}</p>`
    : '';
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;background-color:#f5f7f5;">
  <div style="max-width:520px;margin:40px auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #d4e4d4;">
    <div style="background:#16a34a;padding:28px 32px;text-align:center;">
      <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:1px;">SOLUVIA</h1>
    </div>
    <div style="padding:32px;">
      <h2 style="margin:0 0 16px;font-size:18px;color:#1a2e1a;">${opts.greeting}</h2>
      <p style="margin:0 0 12px;color:#2d4a2d;font-size:14px;line-height:1.6;">${opts.intro}</p>
      <p style="margin:0 0 16px;color:#2d4a2d;font-size:14px;line-height:1.6;">${opts.pitch}</p>
      <ul style="margin:0 0 24px;padding-left:20px;">${bulletsHtml}</ul>
      <div style="text-align:center;margin:24px 0;">
        <a href="https://app.mysoluvia.com" style="display:inline-block;background:#16a34a;color:#ffffff;text-decoration:none;padding:12px 32px;border-radius:8px;font-size:14px;font-weight:600;">Acceder a Soluvia</a>
      </div>
      ${outro}
    </div>
    <div style="background:#f0f5f0;padding:16px 32px;border-top:1px solid #d4e4d4;">
      <p style="margin:0;color:#6b8a6b;font-size:11px;text-align:center;">L'equipe SOLUVIA - Plateforme de pilotage pour organismes de formation</p>
    </div>
  </div>
</body>
</html>`;
}

export function buildWelcomeAdmin(p: BuilderParams): BuiltEmail {
  const prenom = escapeHtml(p.prenom);
  return {
    subject: 'Bienvenue sur Soluvia - votre cockpit de pilotage',
    html: shell({
      greeting: `Bienvenue ${prenom},`,
      intro: 'Ton compte administrateur Soluvia est actif.',
      pitch:
        "Soluvia centralise le pilotage de l'organisme : projets, contrats, facturation OPCO, qualite et indicateurs.",
      bullets: [
        "Vue d'ensemble et indicateurs de l'organisme",
        'Gestion complete des projets, contrats et clients',
        'Facturation OPCO (DECA, apprentissage, libres) et suivi des paiements',
        "Administration : utilisateurs, parametres, journal d'envoi",
      ],
    }),
  };
}

export function buildWelcomeSuperadmin(p: BuilderParams): BuiltEmail {
  const prenom = escapeHtml(p.prenom);
  return {
    subject: 'Bienvenue sur Soluvia - acces superadmin',
    html: shell({
      greeting: `Bienvenue ${prenom},`,
      intro: 'Ton compte superadmin est actif - acces technique complet.',
      pitch:
        "Soluvia centralise le pilotage de l'organisme : projets, contrats, facturation OPCO, qualite et indicateurs.",
      bullets: [
        "Vue d'ensemble et indicateurs de l'organisme",
        'Gestion complete des projets, contrats et clients',
        'Facturation OPCO (DECA, apprentissage, libres) et suivi des paiements',
        "Administration avancee : gestion des roles, parametres systemes, journal d'audit complet",
      ],
      outro:
        "Ce role donne acces a des operations sensibles - merci d'en faire un usage avise.",
    }),
  };
}

export function buildWelcomeCdp(p: BuilderParams): BuiltEmail {
  const prenom = escapeHtml(p.prenom);
  return {
    subject: 'Bienvenue sur Soluvia - votre espace chef de projet',
    html: shell({
      greeting: `Bienvenue ${prenom},`,
      intro: 'Ton espace chef de projet Soluvia est pret.',
      pitch:
        'Soluvia regroupe tous les outils dont tu as besoin pour piloter tes projets de formation au quotidien.',
      bullets: [
        'Tes projets et contrats - vue filtree sur ton portefeuille',
        'Saisie du temps avec auto-save (2s de debounce)',
        'Suivi qualite et indicateurs par projet',
        'Notifications temps reel (factures en retard, saisies manquantes)',
      ],
    }),
  };
}

export function buildWelcomeCommercial(p: BuilderParams): BuiltEmail {
  const prenom = escapeHtml(p.prenom);
  return {
    subject: 'Bienvenue sur Soluvia - votre pipeline commercial',
    html: shell({
      greeting: `Bienvenue ${prenom},`,
      intro: 'Ton acces commercial Soluvia est actif.',
      pitch:
        "Soluvia te donne une vue claire sur ton pipeline de prospects et l'avancement commercial de l'organisme.",
      bullets: [
        'Pipeline prospects : creation, suivi, conversion en projet',
        'Vue des projets convertis et de leur statut',
        'Indicateurs commerciaux et taux de conversion',
        "Collaboration avec les chefs de projet et l'equipe admin",
      ],
    }),
  };
}

function buildByRole(role: Role, prenom: string): BuiltEmail {
  switch (role) {
    case 'admin':
      return buildWelcomeAdmin({ prenom });
    case 'superadmin':
      return buildWelcomeSuperadmin({ prenom });
    case 'cdp':
      return buildWelcomeCdp({ prenom });
    case 'commercial':
      return buildWelcomeCommercial({ prenom });
  }
}

export async function sendWelcomeEmail(user: {
  email: string;
  prenom: string;
  role: Role;
}): Promise<{ success: boolean; error?: string; id?: string }> {
  const { subject, html } = buildByRole(user.role, user.prenom);
  return sendEmail({
    from: 'SOLUVIA <contact@mysoluvia.com>',
    to: user.email,
    subject,
    html,
  });
}
