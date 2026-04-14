'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ProjetCreateDialog } from '@/components/projets/projet-create-dialog';

interface ProjetCreateButtonProps {
  clients: { id: string; raison_sociale: string }[];
  typologies: { id: string; code: string; libelle: string }[];
  users: { id: string; nom: string; prenom: string }[];
}

export function ProjetCreateButton({
  clients,
  typologies,
  users,
}: ProjetCreateButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus className="mr-1.5 h-4 w-4" />
        Nouveau projet
      </Button>
      <ProjetCreateDialog
        open={open}
        onOpenChange={setOpen}
        clients={clients}
        typologies={typologies}
        users={users}
      />
    </>
  );
}
