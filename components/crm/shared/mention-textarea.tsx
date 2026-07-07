'use client';
import { useRef, useState } from 'react';
import { Textarea } from '@/components/crm/ui/textarea';

export type MentionOption = { value: string; label: string };

function strip(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/**
 * Textarea avec @mention : taper « @ » ouvre une liste de collègues sous le champ.
 * La sélection insère « @Nom » et mémorise l'id du profil. `onChange` renvoie le
 * texte ET les ids mentionnés encore présents dans le texte.
 */
export function MentionTextarea({
  value,
  onChange,
  options,
  placeholder,
  rows = 3,
}: {
  value: string;
  onChange: (value: string, mentionedIds: string[]) => void;
  options: MentionOption[];
  placeholder?: string;
  rows?: number;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  // mentions insérées (id ↔ label) ; on n'en garde que celles encore dans le texte.
  const [inserted, setInserted] = useState<MentionOption[]>([]);
  const [menu, setMenu] = useState<{
    open: boolean;
    query: string;
    at: number;
  }>({
    open: false,
    query: '',
    at: -1,
  });

  const idsInText = (text: string, list: MentionOption[]) => [
    ...new Set(
      list.filter((m) => text.includes(`@${m.label}`)).map((m) => m.value),
    ),
  ];

  const emit = (text: string, list: MentionOption[]) =>
    onChange(text, idsInText(text, list));

  const detect = (text: string, caret: number) => {
    const before = text.slice(0, caret);
    const at = before.lastIndexOf('@');
    if (at === -1) return setMenu({ open: false, query: '', at: -1 });
    const gap = before.slice(at + 1);
    // Pas de mention si le segment contient un retour à la ligne (token terminé).
    if (gap.includes('\n')) return setMenu({ open: false, query: '', at: -1 });
    setMenu({ open: true, query: gap, at });
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value;
    const next = inserted.filter((m) => text.includes(`@${m.label}`));
    if (next.length !== inserted.length) setInserted(next);
    emit(text, next);
    detect(text, e.target.selectionStart ?? text.length);
  };

  const pick = (opt: MentionOption) => {
    const el = ref.current;
    const caret = el?.selectionStart ?? value.length;
    const at = menu.at;
    if (at < 0) return;
    const newText = `${value.slice(0, at)}@${opt.label} ${value.slice(caret)}`;
    const list = inserted.some((m) => m.value === opt.value)
      ? inserted
      : [...inserted, opt];
    setInserted(list);
    setMenu({ open: false, query: '', at: -1 });
    emit(newText, list);
    // Replace le curseur juste après la mention insérée.
    const pos = at + opt.label.length + 2;
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(pos, pos);
    });
  };

  const q = strip(menu.query);
  const matches = menu.open
    ? options.filter((o) => strip(o.label).includes(q)).slice(0, 6)
    : [];

  return (
    <div className="relative">
      <Textarea
        ref={ref}
        value={value}
        onChange={handleChange}
        onBlur={() =>
          setTimeout(() => setMenu((m) => ({ ...m, open: false })), 150)
        }
        placeholder={placeholder}
        rows={rows}
      />
      {menu.open && matches.length > 0 && (
        <ul className="border-border bg-popover absolute z-50 mt-1 max-h-48 w-64 overflow-auto rounded-lg border p-1 shadow-md">
          {matches.map((o) => (
            <li key={o.value}>
              <button
                type="button"
                // onMouseDown (pas onClick) pour précéder le blur du textarea.
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(o);
                }}
                className="hover:bg-muted flex w-full items-center rounded-md px-2 py-1.5 text-left text-sm"
              >
                @{o.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
