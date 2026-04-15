import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Mentions légales - SOLUVIA',
};

export default function MentionsLegalesPage() {
  return (
    <div className="border-border bg-card max-w-2xl rounded-lg border p-8">
      <Link
        href="/login"
        className="text-muted-foreground hover:text-foreground mb-6 inline-flex items-center gap-1.5 text-sm transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Retour
      </Link>

      <h1 className="mb-6 text-2xl font-semibold">Mentions légales</h1>

      <div className="text-foreground/90 space-y-6 text-sm leading-relaxed">
        <section>
          <h2 className="mb-2 text-base font-semibold">Éditeur du site</h2>
          <p>
            SOLUVIA SAS
            <br />
            Société par actions simplifiée au capital de 10 000 euros
            <br />
            Siège social : 15 rue de la Formation, 75008 Paris, France
            <br />
            RCS Paris 901 234 567
            <br />
            N° TVA intracommunautaire : FR 12 901234567
            <br />
            Directeur de la publication : Le Président de SOLUVIA SAS
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold">Hébergement</h2>
          <p>
            Le site est hébergé par Vercel Inc.
            <br />
            440 N Baxter St, Los Angeles, CA 90012, États-Unis
            <br />
            Site web :{' '}
            <a
              href="https://vercel.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline-offset-2 hover:underline"
            >
              vercel.com
            </a>
          </p>
          <p className="mt-2">
            Les données sont stockées par Supabase Inc.
            <br />
            970 Toa Payoh North, Singapour
            <br />
            Site web :{' '}
            <a
              href="https://supabase.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline-offset-2 hover:underline"
            >
              supabase.com
            </a>
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold">
            Activité de la plateforme
          </h2>
          <p>
            SOLUVIA est une plateforme SaaS de gestion opérationnelle destinée
            aux organismes de formation. Elle permet le suivi de projets, la
            gestion du temps, la facturation et le pilotage qualité.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold">
            Propriété intellectuelle
          </h2>
          <p>
            L&apos;ensemble du contenu de cette plateforme (textes, graphismes,
            logos, icônes, images, logiciels) est la propriété exclusive de
            SOLUVIA SAS ou de ses partenaires et est protégé par les lois
            françaises et internationales relatives à la propriété
            intellectuelle.
          </p>
          <p className="mt-2">
            Toute reproduction, représentation, modification, publication ou
            adaptation de tout ou partie de ces éléments est interdite sans
            l&apos;autorisation écrite préalable de SOLUVIA SAS.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold">
            Limitation de responsabilité
          </h2>
          <p>
            SOLUVIA SAS s&apos;efforce de fournir des informations exactes et
            mises à jour. Cependant, elle ne saurait être tenue responsable des
            erreurs, omissions ou résultats obtenus par l&apos;utilisation de
            ces informations.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold">Droit applicable</h2>
          <p>
            Les présentes mentions légales sont soumises au droit français. En
            cas de litige, les tribunaux de Paris seront compétents.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold">Contact</h2>
          <p>
            Pour toute question relative aux mentions légales, vous pouvez nous
            contacter à l&apos;adresse :{' '}
            <a
              href="mailto:contact@soluvia.fr"
              className="text-primary underline-offset-2 hover:underline"
            >
              contact@soluvia.fr
            </a>
          </p>
        </section>
      </div>

      <div className="text-muted-foreground mt-8 border-t pt-4 text-center text-xs">
        <Link
          href="/politique-de-confidentialite"
          className="hover:text-foreground underline-offset-2 hover:underline"
        >
          Politique de confidentialité
        </Link>
      </div>
    </div>
  );
}
