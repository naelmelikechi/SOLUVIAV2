import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/** Rendu markdown lecture seule pour les descriptions de fiches/tâches. */
export function ProcessMarkdown({ children }: { children: string }) {
  return (
    <div className="[&_a]:text-primary [&_code]:bg-muted text-sm leading-relaxed [&_a]:underline [&_code]:rounded [&_code]:px-1 [&_ol]:my-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-1 [&_strong]:font-semibold [&_ul]:my-1 [&_ul]:list-disc [&_ul]:pl-5">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  );
}
