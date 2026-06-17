'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ProspectCreateDialog } from '@/components/commercial/prospect-create-dialog';

export function ProspectCreateButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus className="mr-1.5 size-4" />
        Nouveau prospect
      </Button>
      <ProspectCreateDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
