'use client';

// Wrapper Client uniquement pour eviter l erreur Next.js
// "Functions cannot be passed directly to Client Components" :
// SectionCard est `'use client'` et reçoit `icon: ReactNode`. Passer
// un <CalendarClock /> (forwardRef de lucide-react) depuis un Server
// Component plantait la serialisation des props (cf. Sentry SOLUVIA-C,
// 4 events sur /admin/parametres). En instanciant l icone cote client
// on contourne le probleme sans dupliquer SectionCard.

import { CalendarClock } from 'lucide-react';
import { SectionCard } from './section-card';
import { EcheanciersTemplatesSection } from './echeanciers-templates-section';
import type { EcheancierTemplate } from '@/lib/queries/echeanciers';

export function EcheanciersSectionWrapper({
  templates,
}: {
  templates: EcheancierTemplate[];
}) {
  return (
    <SectionCard
      icon={<CalendarClock className="size-4 shrink-0" />}
      title="Échéanciers de facturation"
    >
      <EcheanciersTemplatesSection templates={templates} />
    </SectionCard>
  );
}
