'use client';

import { useState, type ReactNode } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

interface Props {
  stats: ReactNode;
  configuration: ReactNode | null;
}

export function InternesTabs({ stats, configuration }: Props) {
  const [value, setValue] = useState<string>('stats');

  return (
    <Tabs value={value} onValueChange={(v) => setValue(v as string)}>
      <TabsList>
        <TabsTrigger value="stats">Statistiques</TabsTrigger>
        {configuration && (
          <TabsTrigger value="config">Configuration</TabsTrigger>
        )}
      </TabsList>
      <TabsContent value="stats" className="mt-4">
        {stats}
      </TabsContent>
      {configuration && (
        <TabsContent value="config" className="mt-4">
          {configuration}
        </TabsContent>
      )}
    </Tabs>
  );
}
