import { Breadcrumbs, type Crumb } from '@/components/shared/breadcrumbs';

interface PageHeaderProps {
  title: string;
  description?: string;
  /** Fil d'Ariane rendu au-dessus du titre (pages profondes). */
  breadcrumbs?: Crumb[];
  children?: React.ReactNode;
}

export function PageHeader({
  title,
  description,
  breadcrumbs,
  children,
}: PageHeaderProps) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
      <div>
        {breadcrumbs && <Breadcrumbs items={breadcrumbs} />}
        <h1 className="text-foreground text-2xl font-semibold">{title}</h1>
        {description && (
          <p className="text-muted-foreground mt-1 text-sm">{description}</p>
        )}
      </div>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </div>
  );
}
