import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
}

export function PageHeader({ title, description, actions, className }: PageHeaderProps) {
  return (
    <div className={cn('flex flex-wrap items-end justify-between gap-3', className)}>
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

interface StatCardProps {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: LucideIcon;
  tone?: 'default' | 'primary' | 'accent';
  className?: string;
}

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = 'default',
  className,
}: StatCardProps) {
  return (
    <div
      className={cn(
        'glass glass-sheen rounded-xl p-4 transition-shadow duration-200 hover:shadow-xl hover:shadow-black/15',
        className,
      )}
    >
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        {Icon && <Icon className="size-3.5" />}
        {label}
      </div>
      <div
        className={cn(
          'tabular-nums mt-1.5 text-2xl leading-tight font-semibold',
          tone === 'primary' && 'text-primary',
          tone === 'accent' && 'text-accent',
        )}
      >
        {value}
      </div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border px-6 py-14 text-center',
        className,
      )}
    >
      {Icon && <Icon className="size-8 text-muted-foreground/50" />}
      <div>
        <p className="font-medium">{title}</p>
        {description && (
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}
