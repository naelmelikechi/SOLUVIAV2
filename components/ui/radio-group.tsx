'use client';

import * as React from 'react';
import { RadioGroup as BaseRadioGroup } from '@base-ui/react/radio-group';
import { Radio } from '@base-ui/react/radio';
import { cn } from '@/lib/utils';

function RadioGroup({ className, ...props }: BaseRadioGroup.Props) {
  return (
    <BaseRadioGroup
      data-slot="radio-group"
      className={cn('grid gap-2', className)}
      {...props}
    />
  );
}
RadioGroup.displayName = 'RadioGroup';

function RadioGroupItem({ className, ...props }: Radio.Root.Props) {
  return (
    <Radio.Root
      data-slot="radio-group-item"
      className={cn(
        'border-primary text-primary focus-visible:ring-ring data-[checked]:bg-primary aspect-square h-4 w-4 rounded-full border shadow focus:outline-none focus-visible:ring-1 disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    >
      <Radio.Indicator className="flex items-center justify-center">
        <span className="bg-background block h-2 w-2 rounded-full" />
      </Radio.Indicator>
    </Radio.Root>
  );
}
RadioGroupItem.displayName = 'RadioGroupItem';

export { RadioGroup, RadioGroupItem };
