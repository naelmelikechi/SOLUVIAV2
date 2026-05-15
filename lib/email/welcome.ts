// Welcome emails par role. 4 templates HTML, palette SOLUVIA (#16a34a),
// logo officiel hote sur app.mysoluvia.com.
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

interface Section {
  title: string;
  body: string;
}

const FICHE_DE_TEMPS_REMINDER = `
      <div style="margin:20px 0 0;padding:14px 16px;background:#fffbeb;border-left:3px solid #f59e0b;border-radius:6px;">
        <p style="margin:0 0 6px;color:#78350f;font-size:14px;font-weight:600;">Important : la fiche de temps</p>
        <p style="margin:0;color:#78350f;font-size:13px;line-height:1.6;">
          Chaque collaborateur doit remplir sa fiche de temps <strong>chaque semaine</strong>, sans exception. Elle permet de ventiler tes heures par projet et par activité (face à face, préparation, suivi, administratif). C'est la base de la facturation OPCO, du suivi de rentabilité et de la conformité Qualiopi : si elle n'est pas à jour, on perd la visibilité côté pilotage et côté facturation. Tu y accèdes depuis le menu "Mon temps" dans la barre latérale.
        </p>
      </div>`;

function shell(opts: {
  greeting: string;
  intro: string;
  pitch: string;
  sections: Section[];
  closing: string;
  outro?: string;
}): string {
  const sectionsHtml = opts.sections
    .map(
      (s) => `
      <div style="margin:0 0 16px;padding:14px 16px;background:#f7fbf7;border-left:3px solid #16a34a;border-radius:6px;">
        <p style="margin:0 0 4px;color:#1a2e1a;font-size:14px;font-weight:600;">${s.title}</p>
        <p style="margin:0;color:#2d4a2d;font-size:13px;line-height:1.6;">${s.body}</p>
      </div>`,
    )
    .join('');
  const outro = opts.outro
    ? `<p style="margin:20px 0 0;padding:12px 14px;background:#fff7ed;border-left:3px solid #ea580c;border-radius:6px;color:#7c2d12;font-size:12px;line-height:1.5;font-style:italic;">${opts.outro}</p>`
    : '';
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;background-color:#f5f7f5;">
  <div style="max-width:560px;margin:40px auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #d4e4d4;">
    <div style="background:#ffffff;padding:24px 32px;border-bottom:1px solid #e5e7eb;text-align:center;">
      <img src="https://app.mysoluvia.com/logo.png" alt="SOLUVIA" width="160" height="32" style="display:inline-block;height:32px;width:auto;border:0;outline:none;text-decoration:none;" />
    </div>
    <div style="padding:32px;">
      <h2 style="margin:0 0 16px;font-size:18px;color:#1a2e1a;">${opts.greeting}</h2>
      <p style="margin:0 0 12px;color:#2d4a2d;font-size:14px;line-height:1.6;">${opts.intro}</p>
      <p style="margin:0 0 20px;color:#2d4a2d;font-size:14px;line-height:1.6;">${opts.pitch}</p>
      ${sectionsHtml}
      ${FICHE_DE_TEMPS_REMINDER}
      <p style="margin:20px 0 0;color:#2d4a2d;font-size:14px;line-height:1.6;">${opts.closing}</p>
      <div style="text-align:center;margin:28px 0 4px;">
        <a href="https://app.mysoluvia.com" style="display:inline-block;background:#16a34a;color:#ffffff;text-decoration:none;padding:12px 32px;border-radius:8px;font-size:14px;font-weight:600;">Accéder à Soluvia</a>
      </div>
      ${outro}
      <p style="margin:32px 0 0;color:#6b8a6b;font-size:13px;line-height:1.6;">À très vite,<br/><strong>L'équipe SOLUVIA</strong></p>
    </div>
    <div style="background:#f0f5f0;padding:16px 32px;border-top:1px solid #d4e4d4;">
      <p style="margin:0;color:#6b8a6b;font-size:11px;text-align:center;">SOLUVIA - Plateforme de pilotage pour organismes de formation</p>
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
      greeting: `Bonjour ${prenom},`,
      intro:
        'Bienvenue sur Soluvia. Ton compte administrateur est prêt et tu as accès à toute la plateforme.',
      pitch:
        "Soluvia rassemble en un seul endroit tout ce qu'il faut pour piloter ton organisme : tes projets de formation, tes contrats, ta facturation, ta qualité et tes indicateurs. Plus besoin de jongler entre tableurs et emails.",
      sections: [
        {
          title: "Une vue d'ensemble en page d'accueil",
          body: "Dès la connexion, tu vois les chiffres clés : chiffre d'affaires, projets en cours, factures en attente, performance commerciale. Tout est mis à jour en temps réel.",
        },
        {
          title: 'Tes projets, contrats et clients au même endroit',
          body: "Chaque projet rassemble ses sessions, ses apprenants, ses contrats et ses factures. Tu peux passer de l'un à l'autre en un clic, sans rien chercher.",
        },
        {
          title: 'La facturation OPCO simplifiée',
          body: 'Émission des factures DECA, apprentissage et factures libres, suivi des paiements, relances automatiques. Les PDF sont archivés et la numérotation respecte la règle légale.',
        },
        {
          title: "Les paramètres et la gestion d'équipe",
          body: "Tu peux créer des utilisateurs, leur attribuer un rôle, ajuster les paramètres de l'organisme et consulter l'historique des actions importantes.",
        },
      ],
      closing:
        'Explore librement : les actions importantes sont protégées et rien ne se perd. Si tu repères quelque chose qui cloche, il y a un bouton "Signaler un bug" en bas à droite de chaque page.',
    }),
  };
}

export function buildWelcomeSuperadmin(p: BuilderParams): BuiltEmail {
  const prenom = escapeHtml(p.prenom);
  return {
    subject: 'Bienvenue sur Soluvia - accès superadmin',
    html: shell({
      greeting: `Bonjour ${prenom},`,
      intro:
        "Bienvenue sur Soluvia. Ton compte superadmin est prêt : tu as accès à toute la plateforme, plus aux réglages techniques de l'outil.",
      pitch:
        "Soluvia rassemble en un seul endroit tout ce qu'il faut pour piloter l'organisme : projets, contrats, facturation, qualité, indicateurs. En superadmin, tu as aussi la main sur les rôles, les réglages avancés et l'historique complet des actions.",
      sections: [
        {
          title: 'Toutes les fonctions admin',
          body: "Vue d'ensemble de l'organisme, gestion des projets, contrats, clients, factures OPCO et libres, qualité, indicateurs. Tout ce qu'un admin peut faire, tu peux le faire aussi.",
        },
        {
          title: 'Gestion fine des rôles et utilisateurs',
          body: "Tu peux créer, modifier, désactiver les comptes, attribuer ou changer les rôles (admin, chef de projet, commercial). Utile pour les ajustements d'équipe.",
        },
        {
          title: 'Réglages avancés et outils connectés',
          body: "Configuration des connexions à Eduvia, Odoo et au service d'envoi d'emails. Vérification du bon fonctionnement et reprise en cas de problème.",
        },
        {
          title: 'Historique complet des actions',
          body: 'Accès au journal détaillé des opérations sensibles : qui a fait quoi, quand. Pratique pour comprendre un comportement bizarre ou retracer un événement.',
        },
      ],
      closing:
        "Au quotidien, la casquette admin suffit. Garde le superadmin pour les opérations qui sortent de l'ordinaire (réglages techniques, changement de rôle, diagnostic).",
      outro:
        "Ce rôle donne accès à des actions sensibles (suppression d'utilisateurs, modification des réglages, exports). À utiliser avec discernement : tout est enregistré dans l'historique.",
    }),
  };
}

export function buildWelcomeCdp(p: BuilderParams): BuiltEmail {
  const prenom = escapeHtml(p.prenom);
  return {
    subject: 'Bienvenue sur Soluvia - votre espace chef de projet',
    html: shell({
      greeting: `Bonjour ${prenom},`,
      intro:
        'Bienvenue sur Soluvia. Ton espace chef de projet est prêt et te permet de piloter tes projets au quotidien, sans tableurs ni emails éparpillés.',
      pitch:
        "Soluvia rassemble tes projets, ton temps, ta qualité et tes alertes au même endroit. Tu ne vois que les projets qui te sont attribués : pas besoin de filtrer, c'est automatique.",
      sections: [
        {
          title: 'Tes projets, à ta vue',
          body: 'Liste de tes projets et de tes contrats, avec pour chacun les sessions, les apprenants, les contrats et les factures. Tu trouves tout au même endroit sans avoir à chercher.',
        },
        {
          title: 'Saisie du temps simple',
          body: "Tu écris ton temps directement dans le tableau, c'est enregistré tout seul pendant que tu tapes. Tu peux ventiler par projet et par type (face à face, préparation, suivi).",
        },
        {
          title: 'Suivi qualité par projet',
          body: "Saisie des évaluations Qualiopi, suivi de la satisfaction, du taux d'abandon et de l'insertion. Export en PDF quand tu en as besoin pour ton audit.",
        },
        {
          title: 'Alertes utiles, pas spammeuses',
          body: "Une pastille apparaît dans la barre latérale dès qu'il y a une facture en retard, une saisie de temps manquante ou une tâche pour toi. Pas d'email à chaque action.",
        },
      ],
      closing:
        'Si une vue te manque ou qu\'un truc n\'est pas clair, fais-nous remonter avec le bouton "Signaler un bug" en bas à droite de chaque page : on lit tout.',
    }),
  };
}

export function buildWelcomeCommercial(p: BuilderParams): BuiltEmail {
  const prenom = escapeHtml(p.prenom);
  return {
    subject: 'Bienvenue sur Soluvia - votre pipeline commercial',
    html: shell({
      greeting: `Bonjour ${prenom},`,
      intro:
        "Bienvenue sur Soluvia. Ton accès commercial est prêt et te donne une vue claire sur tes prospects et sur l'activité commerciale de l'organisme.",
      pitch:
        "Soluvia te permet de suivre tes prospects du premier contact jusqu'à la signature, avec les indicateurs qui comptent et un lien direct avec les chefs de projet quand le deal est gagné.",
      sections: [
        {
          title: 'Ton pipeline de prospects',
          body: 'Création des prospects, qualification, relances et rendez-vous. Quand le deal est signé, tu convertis le prospect en projet de formation en un clic.',
        },
        {
          title: 'Suivi des projets que tu as gagnés',
          body: 'Une fois converti, tu gardes accès au projet en lecture : tu vois où il en est (sessions, facturation, satisfaction) sans avoir à demander.',
        },
        {
          title: 'Tes indicateurs commerciaux',
          body: "Taux de conversion, durée moyenne d'un deal, valeur du pipeline, performance par source. Tout se met à jour au fur et à mesure que tu travailles tes prospects.",
        },
        {
          title: "Lien avec l'équipe",
          body: 'Tu peux laisser des notes sur un prospect, partager des infos client avec les chefs de projet et recevoir les retours sur les projets que tu as gagnés.',
        },
      ],
      closing:
        "L'idée est de te faire gagner du temps : ce que tu remplis côté prospect remonte tout seul quand le deal devient un vrai projet, pas besoin de tout ressaisir.",
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
