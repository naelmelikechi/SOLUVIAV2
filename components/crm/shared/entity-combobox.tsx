'use client';
import { useState } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/crm/utils';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';

export type Option = { value: string; label: string };

export function EntityCombobox({
  options,
  value,
  onChange,
  placeholder = 'Sélectionner…',
}: {
  options: Option[];
  value: string | null;
  onChange: (v: string | null) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            role="combobox"
            className="w-full justify-between font-normal"
          />
        }
      >
        {selected?.label ?? placeholder}
        <ChevronsUpDown className="ml-2 h-4 w-4 opacity-50" />
      </PopoverTrigger>
      <PopoverContent className="w-(--anchor-width) p-0">
        <Command>
          <CommandInput placeholder="Rechercher…" />
          <CommandList>
            <CommandEmpty>Aucun résultat.</CommandEmpty>
            <CommandGroup>
              {options.map((o) => (
                <CommandItem
                  key={o.value}
                  value={o.label}
                  onSelect={() => {
                    onChange(o.value === value ? null : o.value);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      'mr-2 h-4 w-4',
                      value === o.value ? 'opacity-100' : 'opacity-0',
                    )}
                  />
                  {o.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
