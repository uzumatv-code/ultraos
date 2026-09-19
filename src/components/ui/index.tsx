/**
 * Ultra OS — primitivos de interface.
 *
 * Um único lugar para superfícies, controles, sinalização e tabelas.
 * Todas as cores vêm dos tokens `--ui-*` definidos em `src/index.css`,
 * portanto qualquer componente daqui funciona nos temas claro e escuro
 * sem precisar de variantes `dark:` espalhadas pelas telas.
 */

import {
  forwardRef,
  type AnchorHTMLAttributes,
  type ButtonHTMLAttributes,
  type ReactNode,
  type TdHTMLAttributes,
} from 'react';
import { ArrowRight, Loader2, type LucideIcon } from 'lucide-react';

export type Tone = 'brand' | 'success' | 'warning' | 'danger' | 'info' | 'accent' | 'neutral';

export const toneClass: Record<Tone, string> = {
  brand: 'ui-tone-brand',
  success: 'ui-tone-success',
  warning: 'ui-tone-warning',
  danger: 'ui-tone-danger',
  info: 'ui-tone-info',
  accent: 'ui-tone-accent',
  neutral: 'ui-tone-neutral',
};

export const toneBar: Record<Tone, string> = {
  brand: 'bg-brand',
  success: 'bg-signal-success',
  warning: 'bg-signal-warning',
  danger: 'bg-signal-danger',
  info: 'bg-signal-info',
  accent: 'bg-signal-accent',
  neutral: 'bg-ink-subtle',
};

export const toneText: Record<Tone, string> = {
  brand: 'text-brand-soft',
  success: 'text-signal-success',
  warning: 'text-signal-warning',
  danger: 'text-signal-danger',
  info: 'text-signal-info',
  accent: 'text-signal-accent',
  neutral: 'text-ink-muted',
};

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ');
}

/* ------------------------------------------------------------------ Botões */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
type ButtonSize = 'sm' | 'md' | 'lg';

interface UIButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: LucideIcon;
  iconRight?: LucideIcon;
  loading?: boolean;
  block?: boolean;
}

export const UIButton = forwardRef<HTMLButtonElement, UIButtonProps>(function UIButton(
  { variant = 'secondary', size = 'md', icon: Icon, iconRight: IconRight, loading, block, className, children, disabled, ...rest },
  ref,
) {
  const iconOnly = !children;
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cx(
        'ui-btn',
        `ui-btn-${variant}`,
        iconOnly ? (size === 'sm' ? 'ui-btn-icon-sm' : 'ui-btn-icon') : `ui-btn-${size}`,
        block && 'w-full',
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : Icon ? <Icon className="h-4 w-4 shrink-0" aria-hidden /> : null}
      {children ? <span className="truncate">{children}</span> : null}
      {IconRight && !loading ? <IconRight className="h-4 w-4 shrink-0" aria-hidden /> : null}
    </button>
  );
});

export function UILinkButton({
  variant = 'secondary',
  size = 'md',
  icon: Icon,
  className,
  children,
  ...rest
}: AnchorHTMLAttributes<HTMLAnchorElement> & { variant?: ButtonVariant; size?: ButtonSize; icon?: LucideIcon }) {
  return (
    <a className={cx('ui-btn', `ui-btn-${variant}`, `ui-btn-${size}`, className)} {...rest}>
      {Icon ? <Icon className="h-4 w-4 shrink-0" aria-hidden /> : null}
      {children ? <span className="truncate">{children}</span> : null}
    </a>
  );
}

/* --------------------------------------------------------------- Superfícies */

export function Panel({
  title,
  subtitle,
  icon: Icon,
  tone = 'brand',
  action,
  children,
  flush,
  className,
}: {
  title?: string;
  subtitle?: string;
  icon?: LucideIcon;
  tone?: Tone;
  action?: ReactNode;
  children: ReactNode;
  /** Remove o padding do corpo — use para tabelas e listas divididas. */
  flush?: boolean;
  className?: string;
}) {
  return (
    <section className={cx('ui-panel', flush && 'ui-panel-flush', className)}>
      {(title || action) && (
        <header className="ui-panel-header">
          <div className="flex min-w-0 items-center gap-3">
            {Icon && (
              <span className={cx('ui-icon-tile ui-icon-tile-sm', toneClass[tone])} aria-hidden>
                <Icon />
              </span>
            )}
            <div className="min-w-0">
              {title && <h2 className="ui-panel-title truncate">{title}</h2>}
              {subtitle && <p className="ui-panel-subtitle truncate">{subtitle}</p>}
            </div>
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </header>
      )}
      <div className={flush ? '' : 'ui-panel-body'}>{children}</div>
    </section>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="ui-page-header">
      <div className="min-w-0">
        {eyebrow && <p className="ui-page-eyebrow">{eyebrow}</p>}
        <h1 className="ui-page-title">{title}</h1>
        {description && <p className="ui-page-description">{description}</p>}
      </div>
      {actions && <div className="ui-page-actions">{actions}</div>}
    </header>
  );
}

/* --------------------------------------------------------------- Sinalização */

export function Badge({ tone = 'neutral', dot, children, className }: { tone?: Tone; dot?: boolean; children: ReactNode; className?: string }) {
  return (
    <span className={cx('ui-badge', toneClass[tone], className)}>
      {dot && <span className="ui-dot" aria-hidden />}
      {children}
    </span>
  );
}

export function IconTile({ icon: Icon, tone = 'brand', size = 'md' }: { icon: LucideIcon; tone?: Tone; size?: 'sm' | 'md' | 'lg' }) {
  return (
    <span className={cx('ui-icon-tile', `ui-icon-tile-${size}`, toneClass[tone])} aria-hidden>
      <Icon />
    </span>
  );
}

/** Indicador numérico com contexto e destino clicável. */
export function Kpi({
  label,
  value,
  context,
  icon,
  tone = 'brand',
  linkLabel,
  onClick,
  emphasis,
}: {
  label: string;
  value: ReactNode;
  context?: string;
  icon?: LucideIcon;
  tone?: Tone;
  linkLabel?: string;
  onClick?: () => void;
  /** Destaca o valor com a cor do tom — use com parcimônia (1 por grupo). */
  emphasis?: boolean;
}) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <span className="ui-kpi-label">{label}</span>
        {icon && <IconTile icon={icon} tone={tone} size="sm" />}
      </div>
      <strong className={cx('ui-kpi-value', emphasis && toneText[tone])}>{value}</strong>
      {context && <span className="ui-kpi-context">{context}</span>}
      {linkLabel && onClick && (
        <span className="ui-kpi-link">
          {linkLabel}
          <ArrowRight aria-hidden />
        </span>
      )}
    </>
  );

  if (!onClick) return <div className="ui-kpi">{body}</div>;
  return (
    <button type="button" onClick={onClick} className="ui-kpi">
      {body}
    </button>
  );
}

/** Barra de distribuição usada em pipelines e composições de valor. */
export function Meter({ value, max, tone = 'brand' }: { value: number; max: number; tone?: Tone }) {
  const pct = max > 0 ? Math.min(100, Math.max(value > 0 ? 4 : 0, (value / max) * 100)) : 0;
  return (
    <div className="ui-meter">
      <span className={toneBar[tone]} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function EmptyState({ icon: Icon, title, description, action }: { icon: LucideIcon; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="ui-empty">
      <Icon aria-hidden />
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('ui-skeleton', className)} aria-hidden />;
}

/* -------------------------------------------------------------------- Tabela */

export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className="ui-table-wrap">
      <table className={cx('ui-table', className)}>{children}</table>
    </div>
  );
}

export function Td({ numeric, className, children, ...rest }: TdHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean }) {
  return (
    <td className={cx(numeric && 'ui-num', className)} {...rest}>
      {children}
    </td>
  );
}

/* ------------------------------------------------------------------ Controles */

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
}: {
  value: T;
  onChange: (value: T) => void;
  options: Array<{ value: T; label: string }>;
  className?: string;
}) {
  return (
    <div className={cx('ui-segment', className)} role="group">
      {options.map((option) => (
        <button key={option.value} type="button" aria-pressed={value === option.value} onClick={() => onChange(option.value)}>
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function SearchField({
  value,
  onChange,
  placeholder = 'Buscar…',
  icon: Icon,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  icon: LucideIcon;
  className?: string;
}) {
  return (
    <div className={cx('ui-search', className)}>
      <Icon aria-hidden />
      <input className="ui-field" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
    </div>
  );
}

export function Select<T extends string>({
  value,
  onChange,
  options,
  label,
  className,
}: {
  value: T;
  onChange: (value: T) => void;
  options: Array<{ value: T; label: string }>;
  label: string;
  className?: string;
}) {
  return (
    <>
      <label className="sr-only" htmlFor={`select-${label}`}>
        {label}
      </label>
      <select
        id={`select-${label}`}
        className={cx('ui-field w-auto min-w-36', className)}
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </>
  );
}
