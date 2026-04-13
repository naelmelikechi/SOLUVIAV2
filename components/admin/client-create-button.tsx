'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ClientFormDialog } from '@/components/admin/client-form-dialog';

export function ClientCreateButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="mr-2 h-4 w-4" />
        Nouveau client
      </Button>
      <ClientFormDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
