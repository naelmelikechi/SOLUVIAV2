import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Info } from 'lucide-react';

interface Props {
  title: string;
  tooltip: string;
  subtitle?: string;
}

export function KpiCardPlaceholder({ title, tooltip, subtitle }: Props) {
  return (
    <Card className="border-dashed">
      <CardHeader className="pb-2">
        <CardTitle className="text-muted-foreground flex items-center gap-1.5 text-sm font-medium">
          {title}
          <Tooltip>
            <TooltipTrigger>
              <Info className="size-3.5 cursor-help" />
            </TooltipTrigger>
            <TooltipContent>
              <p className="max-w-xs text-xs">{tooltip}</p>
            </TooltipContent>
          </Tooltip>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-muted-foreground font-mono text-2xl font-bold">
          N/D
        </div>
        {subtitle && (
          <p className="text-muted-foreground mt-1 text-xs">{subtitle}</p>
        )}
      </CardContent>
    </Card>
  );
}
