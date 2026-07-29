import { ArrowRight, type LucideIcon } from 'lucide-react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

export type CommandTone = 'brand' | 'success' | 'warning' | 'danger' | 'info' | 'neutral';

const toneClasses: Record<CommandTone, string> = {
  brand: 'command-tone-brand',
  success: 'command-tone-success',
  warning: 'command-tone-warning',
  danger: 'command-tone-danger',
  info: 'command-tone-info',
  neutral: 'command-tone-neutral',
};

export function CommandIcon({ icon: Icon, tone = 'brand', size = 'md' }: { icon: LucideIcon; tone?: CommandTone; size?: 'sm' | 'md' | 'lg' }) {
  return (
    <span className={`command-icon ${toneClasses[tone]} command-icon-${size}`} aria-hidden="true">
      <Icon />
    </span>
  );
}

export function CommandPageHeader({
  title,
  description,
  eyebrow = 'Central de comando',
  icon,
  actions,
}: {
  title: string;
  description: string;
  eyebrow?: string;
  icon: LucideIcon;
  actions?: ReactNode;
}) {
  return (
    <header className="command-page-header">
      <div className="command-page-heading">
        <CommandIcon icon={icon} size="lg" />
        <div className="min-w-0">
          <p className="command-eyebrow">{eyebrow}</p>
          <h1>{title}</h1>
          <p className="command-page-description">{description}</p>
        </div>
      </div>
      {actions && <div className="command-page-actions">{actions}</div>}
    </header>
  );
}

export function CommandCard({
  title,
  description,
  icon,
  tone = 'brand',
  action,
  children,
  className = '',
}: {
  title?: string;
  description?: string;
  icon?: LucideIcon;
  tone?: CommandTone;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`command-card ${className}`}>
      {(title || icon || action) && (
        <header className="command-card-header">
          <div className="command-card-heading">
            {icon && <CommandIcon icon={icon} tone={tone} />}
            <div className="min-w-0">
              {title && <h2>{title}</h2>}
              {description && <p>{description}</p>}
            </div>
          </div>
          {action && <div className="command-card-action">{action}</div>}
        </header>
      )}
      <div className="command-card-content">{children}</div>
    </section>
  );
}

export function CommandTextAction({ children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" className="command-text-action" {...props}>{children}</button>;
}

export function ActionMetric({
  label,
  value,
  context,
  actionLabel,
  icon,
  tone = 'brand',
  onClick,
}: {
  label: string;
  value: ReactNode;
  context: string;
  actionLabel: string;
  icon: LucideIcon;
  tone?: CommandTone;
  onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} className="command-metric">
      <div className="command-metric-topline">
        <span className="command-metric-label">{label}</span>
        <CommandIcon icon={icon} tone={tone} />
      </div>
      <strong className="command-metric-value">{value}</strong>
      <span className="command-metric-context">{context}</span>
      <span className="command-metric-action">{actionLabel}<ArrowRight /></span>
    </button>
  );
}

export function StatusBadge({ children, tone = 'neutral' }: { children: ReactNode; tone?: CommandTone }) {
  return <span className={`command-badge ${toneClasses[tone]}`}>{children}</span>;
}
