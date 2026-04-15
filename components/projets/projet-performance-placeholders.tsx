import { GraduationCap, Trophy, Wallet, UserX, TrendingUp } from 'lucide-react';
import { Card } from '@/components/ui/card';

const placeholders = [
  { title: 'Pédagogie', icon: GraduationCap },
  { title: 'Réussite', icon: Trophy },
  { title: 'Financement', icon: Wallet },
  { title: 'Abandons', icon: UserX },
  { title: 'Rentabilité', icon: TrendingUp },
] as const;

export function ProjetPerformancePlaceholders() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {placeholders.map(({ title, icon: Icon }) => (
        <Card
          key={title}
          className="flex flex-col items-center justify-center gap-3 border-dashed p-6 text-center"
        >
          <div className="bg-muted flex h-10 w-10 items-center justify-center rounded-lg">
            <Icon className="text-muted-foreground h-5 w-5" />
          </div>
          <div>
            <h4 className="text-muted-foreground text-sm font-semibold">
              {title}
            </h4>
            <p className="text-muted-foreground/70 mt-1 text-xs">
              Données disponibles après synchronisation Eduvia
            </p>
          </div>
        </Card>
      ))}
    </div>
  );
}
