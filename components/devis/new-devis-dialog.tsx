'use client';

// Stub T8 - implementation complete en Task 9
export function NewDevisDialog(_props: {
  societes: {
    id: string;
    code: string;
    raison_sociale: string;
    est_defaut: boolean | null;
  }[];
  clients?: { id: string; trigramme: string; raison_sociale: string }[];
}) {
  return (
    <button
      disabled
      className="cursor-not-allowed rounded-md bg-gray-100 px-4 py-2 text-sm text-gray-400"
    >
      Nouveau devis
    </button>
  );
}
