import { Fragment } from 'react';

export interface HighlightSegment {
  text: string;
  hit: boolean;
}

/** Échappe les caractères spéciaux regex d'un terme utilisateur. */
function escapeRegExp(term: string): string {
  return term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Découpe `text` en segments, en marquant `hit: true` sur les portions qui
 * correspondent (insensible à la casse) à un terme de `query` d'au moins 3
 * lettres. Pur, sans JSX — testable indépendamment du rendu.
 */
export function splitHighlight(
  text: string,
  query: string,
): HighlightSegment[] {
  const terms = [...new Set(query.trim().toLowerCase().split(/\s+/))]
    .filter((t) => t.length >= 3)
    .map(escapeRegExp)
    .sort((a, b) => b.length - a.length);

  if (terms.length === 0 || !text) {
    return text ? [{ text, hit: false }] : [];
  }

  const splitRe = new RegExp(`(${terms.join('|')})`, 'gi');
  const exactRe = new RegExp(`^(?:${terms.join('|')})$`, 'i');
  const parts = text.split(splitRe);

  return parts
    .filter((part) => part.length > 0)
    .map((part) => ({
      text: part,
      hit: exactRe.test(part),
    }));
}

/** Rend `text` en surlignant les termes de `query` (≥3 lettres) via `<mark>`. */
export function Highlight({ text, query }: { text: string; query: string }) {
  const segments = splitHighlight(text, query);
  return (
    <>
      {segments.map((seg, i) => (
        <Fragment key={i}>
          {seg.hit ? (
            <mark className="bg-primary/15 text-primary rounded-[3px] px-0.5">
              {seg.text}
            </mark>
          ) : (
            seg.text
          )}
        </Fragment>
      ))}
    </>
  );
}
