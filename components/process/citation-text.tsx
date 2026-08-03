'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Components } from 'react-markdown';

export type CitationSource = {
  source_fiche_id: string;
  titre: string;
  mission: string;
  url: string;
};

interface CitationTextProps {
  children: string;
  sources: CitationSource[];
}

// Marqueur porté par le `title` du lien markdown injecté, pour distinguer une
// puce de citation d'un lien normal dans la réponse (jamais affiché : lu
// uniquement par le renderer `a` ci-dessous).
const CITE_TITLE_PREFIX = 'citation:';

/**
 * Remplace chaque `[n]` du texte brut par un vrai lien markdown
 * `[[n]](url "citation:n")` quand `n` désigne une source existante — ce qui
 * laisse remark parser la citation comme un lien inline normal (donc sans
 * casser paragraphes/listes environnants), et permet au renderer `a`
 * ci-dessous de le styliser en puce cliquable. `[n]` hors bornes (ou non
 * numérique) est laissé tel quel (texte brut).
 */
function withCitationLinks(text: string, sources: CitationSource[]): string {
  if (!sources.length) return text;
  return text.replace(/\[(\d+)\]/g, (match, digits: string) => {
    const n = Number(digits);
    if (!Number.isInteger(n) || n < 1) return match;
    const source = sources[n - 1];
    if (!source) return match;
    return `[[${n}]](${source.url} "${CITE_TITLE_PREFIX}${n}")`;
  });
}

/**
 * Construit le renderer `a` de react-markdown en connaissant les `sources` du
 * tour : une puce de citation n'est acceptée que si son `title` est bien notre
 * marqueur ET que le `href` correspond EXACTEMENT à `sources[n-1].url` (borné).
 * Un lien forgé (`[x](javascript:… "citation:1")` glissé par le modèle) ne
 * passe donc jamais pour une citation de confiance et retombe sur le rendu lien
 * classique — dont l'URL a déjà été assainie par le `urlTransform` par défaut
 * de react-markdown.
 */
function makeCitationLink(
  sources: CitationSource[],
): NonNullable<Components['a']> {
  return function CitationLink({ href, title, children }) {
    if (title?.startsWith(CITE_TITLE_PREFIX) && href) {
      const n = Number(title.slice(CITE_TITLE_PREFIX.length));
      const source = Number.isInteger(n) && n >= 1 ? sources[n - 1] : undefined;
      if (source && href === source.url) {
        return (
          <Link
            href={href}
            aria-label={`Voir la source ${n}`}
            title={`Voir la source ${n}`}
            className="bg-primary/10 text-primary hover:bg-primary/20 focus-visible:outline-primary relative -top-[3px] mx-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 align-middle text-[10px] font-semibold tabular-nums no-underline focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            {children}
          </Link>
        );
      }
    }
    const external = typeof href === 'string' && /^https?:\/\//.test(href);
    return (
      <a
        href={href}
        title={title}
        target={external ? '_blank' : undefined}
        rel={external ? 'noreferrer' : undefined}
        className="text-primary underline"
      >
        {children}
      </a>
    );
  };
}

/**
 * Rendu markdown de la réponse assistant, avec les citations `[n]` du texte
 * transformées en puces cliquables reliées à `sources[n-1].url`. `[n]` hors
 * bornes reste un texte brut inoffensif (jamais de crash).
 */
export function CitationText({ children, sources }: CitationTextProps) {
  const text = withCitationLinks(children, sources);
  const components = useMemo<Components>(
    () => ({ a: makeCitationLink(sources) }),
    [sources],
  );
  return (
    <div className="[&_a]:text-primary [&_code]:bg-muted text-sm leading-relaxed [&_code]:rounded [&_code]:px-1 [&_ol]:my-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-1 [&_strong]:font-semibold [&_ul]:my-1 [&_ul]:list-disc [&_ul]:pl-5">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {text}
      </ReactMarkdown>
    </div>
  );
}
