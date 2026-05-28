'use client';

import { useState, type ReactNode } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

interface Props {
  hasConfiguration: boolean;
  children: ReactNode;
}

export function InternesTabs({ hasConfiguration, children }: Props) {
  const [value, setValue] = useState<string>('stats');

  return (
    <Tabs value={value} onValueChange={(v) => setValue(v as string)}>
      <TabsList>
        <TabsTrigger value="stats">Statistiques</TabsTrigger>
        {hasConfiguration && (
          <TabsTrigger value="config">Configuration</TabsTrigger>
        )}
      </TabsList>
      {children}
    </Tabs>
  );
}

// oxlint-disable-next-line react-doctor/no-multi-comp
export function InternesStatsPanel({ children }: { children: ReactNode }) {
  return (
    <TabsContent value="stats" className="mt-4">
      {children}
    </TabsContent>
  );
}

// oxlint-disable-next-line react-doctor/no-multi-comp
export function InternesConfigPanel({ children }: { children: ReactNode }) {
  return (
    <TabsContent value="config" className="mt-4">
      {children}
    </TabsContent>
  );
}
