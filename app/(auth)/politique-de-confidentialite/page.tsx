import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Politique de confidentialite — SOLUVIA',
};

export default function PolitiqueDeConfidentialitePage() {
  return (
    <div className="border-border bg-card max-w-2xl rounded-lg border p-8">
      <Link
        href="/login"
        className="text-muted-foreground hover:text-foreground mb-6 inline-flex items-center gap-1.5 text-sm transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Retour
      </Link>

      <h1 className="mb-6 text-2xl font-semibold">
        Politique de confidentialite
      </h1>

      <div className="text-foreground/90 space-y-6 text-sm leading-relaxed">
        <section>
          <h2 className="mb-2 text-base font-semibold">Introduction</h2>
          <p>
            SOLUVIA SAS (ci-apres &laquo; SOLUVIA &raquo;) s&apos;engage a
            proteger la vie privee des utilisateurs de sa plateforme. La
            presente politique de confidentialite decrit les donnees
            personnelles collectees, les finalites de leur traitement, et les
            droits dont disposent les utilisateurs conformement au Reglement
            General sur la Protection des Donnees (RGPD — Reglement UE
            2016/679).
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold">
            Responsable du traitement
          </h2>
          <p>
            SOLUVIA SAS
            <br />
            15 rue de la Formation, 75008 Paris, France
            <br />
            Email :{' '}
            <a
              href="mailto:dpo@soluvia.fr"
              className="text-primary underline-offset-2 hover:underline"
            >
              dpo@soluvia.fr
            </a>
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold">Donnees collectees</h2>
          <p>
            Dans le cadre de l&apos;utilisation de la plateforme, nous
            collectons :
          </p>
          <ul className="mt-2 list-inside list-disc space-y-1">
            <li>
              <strong>Donnees d&apos;identification</strong> : nom, prenom,
              adresse email professionnelle
            </li>
            <li>
              <strong>Donnees de connexion</strong> : adresse IP, type de
              navigateur, horodatages de connexion
            </li>
            <li>
              <strong>Donnees professionnelles</strong> : role dans
              l&apos;organisation, saisies de temps, actions effectuees sur la
              plateforme
            </li>
            <li>
              <strong>Documents</strong> : fichiers uploades par les
              utilisateurs dans le cadre de la gestion des clients
            </li>
          </ul>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold">
            Finalites du traitement
          </h2>
          <ul className="list-inside list-disc space-y-1">
            <li>Gestion des comptes utilisateurs et authentification</li>
            <li>
              Suivi des projets, contrats et facturation des organismes de
              formation
            </li>
            <li>Saisie et suivi du temps de travail</li>
            <li>Pilotage qualite et conformite Qualiopi</li>
            <li>
              Journalisation des actions a des fins de securite et d&apos;audit
              (logs)
            </li>
            <li>Amelioration du service et support technique</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold">Base legale</h2>
          <p>
            Les traitements sont fondes sur l&apos;execution du contrat de
            service (article 6.1.b du RGPD) et l&apos;interet legitime de
            SOLUVIA pour la securite et l&apos;amelioration du service (article
            6.1.f).
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold">
            Duree de conservation
          </h2>
          <ul className="list-inside list-disc space-y-1">
            <li>
              Donnees de compte : conservees pendant la duree du contrat, puis 3
              ans apres la fin de la relation contractuelle
            </li>
            <li>Logs d&apos;audit : conserves 12 mois glissants</li>
            <li>
              Documents clients : conserves pendant la duree du contrat, puis
              supprimes sous 6 mois apres la fin de la relation
            </li>
            <li>
              Donnees de facturation : 10 ans (obligation legale comptable
              francaise)
            </li>
          </ul>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold">
            Destinataires des donnees
          </h2>
          <p>Les donnees sont accessibles :</p>
          <ul className="mt-2 list-inside list-disc space-y-1">
            <li>
              Aux membres habilites de l&apos;equipe SOLUVIA (administrateurs)
            </li>
            <li>
              Aux sous-traitants techniques : Vercel (hebergement), Supabase
              (base de donnees et authentification), Resend (envoi
              d&apos;emails)
            </li>
          </ul>
          <p className="mt-2">
            Aucune donnee n&apos;est vendue ou cedee a des tiers a des fins
            commerciales.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold">Transferts hors UE</h2>
          <p>
            Certaines donnees peuvent etre hebergees aux Etats-Unis (Vercel).
            Ces transferts sont encadres par les clauses contractuelles types de
            la Commission europeenne et le EU-US Data Privacy Framework.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold">Securite des donnees</h2>
          <p>
            SOLUVIA met en oeuvre des mesures techniques et organisationnelles
            appropriees pour proteger les donnees personnelles : chiffrement en
            transit (TLS) et au repos, controle d&apos;acces par roles (RLS),
            authentification securisee, journalisation des acces.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold">
            Droits des utilisateurs
          </h2>
          <p>
            Conformement au RGPD, vous disposez des droits suivants sur vos
            donnees personnelles :
          </p>
          <ul className="mt-2 list-inside list-disc space-y-1">
            <li>
              <strong>Droit d&apos;acces</strong> : obtenir une copie de vos
              donnees
            </li>
            <li>
              <strong>Droit de rectification</strong> : corriger des donnees
              inexactes
            </li>
            <li>
              <strong>Droit a l&apos;effacement</strong> : demander la
              suppression de vos donnees
            </li>
            <li>
              <strong>Droit a la limitation</strong> : restreindre le traitement
              de vos donnees
            </li>
            <li>
              <strong>Droit a la portabilite</strong> : recevoir vos donnees
              dans un format structure
            </li>
            <li>
              <strong>Droit d&apos;opposition</strong> : vous opposer au
              traitement de vos donnees
            </li>
          </ul>
          <p className="mt-2">
            Pour exercer ces droits, contactez-nous a :{' '}
            <a
              href="mailto:dpo@soluvia.fr"
              className="text-primary underline-offset-2 hover:underline"
            >
              dpo@soluvia.fr
            </a>
          </p>
          <p className="mt-2">
            Vous disposez egalement du droit d&apos;introduire une reclamation
            aupres de la CNIL (Commission Nationale de l&apos;Informatique et
            des Libertes) :{' '}
            <a
              href="https://www.cnil.fr"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline-offset-2 hover:underline"
            >
              www.cnil.fr
            </a>
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold">Cookies</h2>
          <p>
            La plateforme utilise uniquement des cookies strictement necessaires
            au fonctionnement du service (authentification, session
            utilisateur). Aucun cookie de tracking, publicitaire ou analytique
            n&apos;est utilise.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold">
            Modification de la politique
          </h2>
          <p>
            SOLUVIA se reserve le droit de modifier la presente politique de
            confidentialite a tout moment. Les utilisateurs seront informes de
            toute modification substantielle par notification sur la plateforme.
          </p>
          <p className="text-muted-foreground mt-2">
            Derniere mise a jour : avril 2026
          </p>
        </section>
      </div>

      <div className="text-muted-foreground mt-8 border-t pt-4 text-center text-xs">
        <Link
          href="/mentions-legales"
          className="hover:text-foreground underline-offset-2 hover:underline"
        >
          Mentions legales
        </Link>
      </div>
    </div>
  );
}
