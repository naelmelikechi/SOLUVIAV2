import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Politique de confidentialité - SOLUVIA',
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
        Politique de confidentialité
      </h1>

      <div className="text-foreground/90 space-y-6 text-sm leading-relaxed">
        <section>
          <h2 className="mb-2 text-base font-semibold">Introduction</h2>
          <p>
            SOLUVIA SAS (ci-après &laquo; SOLUVIA &raquo;) s&apos;engage à
            protéger la vie privée des utilisateurs de sa plateforme. La
            présente politique de confidentialité décrit les données
            personnelles collectées, les finalités de leur traitement, et les
            droits dont disposent les utilisateurs conformément au Règlement
            Général sur la Protection des Données (RGPD - Règlement UE
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
          <h2 className="mb-2 text-base font-semibold">Données collectées</h2>
          <p>
            Dans le cadre de l&apos;utilisation de la plateforme, nous
            collectons :
          </p>
          <ul className="mt-2 list-inside list-disc space-y-1">
            <li>
              <strong>Données d&apos;identification</strong> : nom, prénom,
              adresse email professionnelle
            </li>
            <li>
              <strong>Données de connexion</strong> : adresse IP, type de
              navigateur, horodatages de connexion
            </li>
            <li>
              <strong>Données professionnelles</strong> : rôle dans
              l&apos;organisation, saisies de temps, actions effectuées sur la
              plateforme
            </li>
            <li>
              <strong>Documents</strong> : fichiers uploadés par les
              utilisateurs dans le cadre de la gestion des clients
            </li>
          </ul>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold">
            Finalités du traitement
          </h2>
          <ul className="list-inside list-disc space-y-1">
            <li>Gestion des comptes utilisateurs et authentification</li>
            <li>
              Suivi des projets, contrats et facturation des organismes de
              formation
            </li>
            <li>Saisie et suivi du temps de travail</li>
            <li>Pilotage qualité et conformité Qualiopi</li>
            <li>
              Journalisation des actions à des fins de sécurité et d&apos;audit
              (logs)
            </li>
            <li>Amélioration du service et support technique</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold">Base légale</h2>
          <p>
            Les traitements sont fondés sur l&apos;exécution du contrat de
            service (article 6.1.b du RGPD) et l&apos;intérêt légitime de
            SOLUVIA pour la sécurité et l&apos;amélioration du service (article
            6.1.f).
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold">
            Durée de conservation
          </h2>
          <ul className="list-inside list-disc space-y-1">
            <li>
              Données de compte : conservées pendant la durée du contrat, puis 3
              ans après la fin de la relation contractuelle
            </li>
            <li>Logs d&apos;audit : conservés 12 mois glissants</li>
            <li>
              Documents clients : conservés pendant la durée du contrat, puis
              supprimés sous 6 mois après la fin de la relation
            </li>
            <li>
              Données de facturation : 10 ans (obligation légale comptable
              française)
            </li>
          </ul>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold">
            Destinataires des données
          </h2>
          <p>Les données sont accessibles :</p>
          <ul className="mt-2 list-inside list-disc space-y-1">
            <li>
              Aux membres habilités de l&apos;équipe SOLUVIA (administrateurs)
            </li>
            <li>
              Aux sous-traitants techniques : Vercel (hébergement), Supabase
              (base de données et authentification), Resend (envoi
              d&apos;emails)
            </li>
          </ul>
          <p className="mt-2">
            Aucune donnée n&apos;est vendue ou cédée à des tiers à des fins
            commerciales.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold">Transferts hors UE</h2>
          <p>
            Certaines données peuvent être hébergées aux États-Unis (Vercel).
            Ces transferts sont encadrés par les clauses contractuelles types de
            la Commission européenne et le EU-US Data Privacy Framework.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold">Sécurité des données</h2>
          <p>
            SOLUVIA met en oeuvre des mesures techniques et organisationnelles
            appropriées pour protéger les données personnelles : chiffrement en
            transit (TLS) et au repos, contrôle d&apos;accès par rôles (RLS),
            authentification sécurisée, journalisation des accès.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold">
            Droits des utilisateurs
          </h2>
          <p>
            Conformément au RGPD, vous disposez des droits suivants sur vos
            données personnelles :
          </p>
          <ul className="mt-2 list-inside list-disc space-y-1">
            <li>
              <strong>Droit d&apos;accès</strong> : obtenir une copie de vos
              données
            </li>
            <li>
              <strong>Droit de rectification</strong> : corriger des données
              inexactes
            </li>
            <li>
              <strong>Droit à l&apos;effacement</strong> : demander la
              suppression de vos données
            </li>
            <li>
              <strong>Droit à la limitation</strong> : restreindre le traitement
              de vos données
            </li>
            <li>
              <strong>Droit à la portabilité</strong> : recevoir vos données
              dans un format structuré
            </li>
            <li>
              <strong>Droit d&apos;opposition</strong> : vous opposer au
              traitement de vos données
            </li>
          </ul>
          <p className="mt-2">
            Pour exercer ces droits, contactez-nous à :{' '}
            <a
              href="mailto:dpo@soluvia.fr"
              className="text-primary underline-offset-2 hover:underline"
            >
              dpo@soluvia.fr
            </a>
          </p>
          <p className="mt-2">
            Vous disposez également du droit d&apos;introduire une réclamation
            auprès de la CNIL (Commission Nationale de l&apos;Informatique et
            des Libertés) :{' '}
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
            La plateforme utilise uniquement des cookies strictement nécessaires
            au fonctionnement du service (authentification, session
            utilisateur). Aucun cookie de tracking, publicitaire ou analytique
            n&apos;est utilisé.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold">
            Modification de la politique
          </h2>
          <p>
            SOLUVIA se réserve le droit de modifier la présente politique de
            confidentialité à tout moment. Les utilisateurs seront informés de
            toute modification substantielle par notification sur la plateforme.
          </p>
          <p className="text-muted-foreground mt-2">
            Dernière mise à jour : avril 2026
          </p>
        </section>
      </div>

      <div className="text-muted-foreground mt-8 border-t pt-4 text-center text-xs">
        <Link
          href="/mentions-legales"
          className="hover:text-foreground underline-offset-2 hover:underline"
        >
          Mentions légales
        </Link>
      </div>
    </div>
  );
}
