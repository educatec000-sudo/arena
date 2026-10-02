import {
  ButtonHTMLAttributes,
  cloneElement,
  InputHTMLAttributes,
  isValidElement,
  ReactElement,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
  useEffect,
  useId,
} from 'react';
import { cn } from '@/utils/format';

/**
 * Biblioteca de componentes de UI.
 *
 * Todos seguem a identidade visual do projeto original (navy/slate, bordas de
 * 1px, cantos de 14px) definida em `styles/global.css`.
 */

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'default' | 'primary' | 'ok' | 'gold' | 'danger' | 'ghost';
  size?: 'sm' | 'md';
  loading?: boolean;
  icon?: ReactNode;
};

export function Button({
  variant = 'default',
  size = 'md',
  loading = false,
  icon,
  children,
  className,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      className={cn('btn', size === 'sm' && 'sm', variant !== 'default' && variant, className)}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? <span className="spinner sm" /> : icon}
      {children}
    </button>
  );
}

export function Card({
  children,
  className,
  title,
  subtitle,
  action,
}: {
  children?: ReactNode;
  className?: string;
  title?: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className={cn('card', className)}>
      {(title || action) && (
        <header className="card-head">
          <div>
            {title && <h2>{title}</h2>}
            {subtitle && <p className="muted small">{subtitle}</p>}
          </div>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

export function Badge({
  children,
  tone = 'default',
  className,
}: {
  children: ReactNode;
  tone?: 'default' | 'ok' | 'warn' | 'err' | 'pri' | 'gold';
  className?: string;
}) {
  return <span className={cn('badge', tone !== 'default' && tone, className)}>{children}</span>;
}

/** Rótulo + controle: padrão de formulário do app. */
/** Rótulo + controle: padrão de formulário do app (com acessibilidade). */
export function Field({
  label,
  hint,
  error,
  children,
  className,
}: {
  label?: ReactNode;
  hint?: ReactNode;
  error?: string;
  children: ReactNode;
  className?: string;
}) {
  const generatedId = useId();
  const describedBy = hint || error ? `${generatedId}-desc` : undefined;

  // Associa <label> ao controle sem exigir que quem usa passe um id manualmente.
  const control =
    isValidElement(children) && label
      ? cloneElement(children as ReactElement<Record<string, unknown>>, {
          id: (children.props as { id?: string }).id ?? generatedId,
          ...(describedBy ? { 'aria-describedby': describedBy } : {}),
        })
      : children;

  return (
    <div className={cn('field', className)}>
      {label && (
        <label className="f" htmlFor={generatedId}>
          {label}
        </label>
      )}
      {control}
      {error ? (
        <span id={describedBy} className="field-error">
          {error}
        </span>
      ) : hint ? (
        <span id={describedBy} className="field-hint">
          {hint}
        </span>
      ) : null}
    </div>
  );
}

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn('input', className)} {...rest} />;
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn('input select', className)} {...rest}>
      {children}
    </select>
  );
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn('input textarea', className)} {...rest} />;
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="spinner-wrap">
      <span className="spinner" />
      {label && <span className="muted small">{label}</span>}
    </div>
  );
}

export function EmptyState({
  icon = '📭',
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon">{icon}</div>
      <h3>{title}</h3>
      {description && <p className="muted small">{description}</p>}
      {action}
    </div>
  );
}

/** Barra de progresso (metas, cobertura, desempenho). */
export function ProgressBar({
  value,
  tone = 'default',
  label,
}: {
  value: number;
  tone?: 'default' | 'ok' | 'gold' | 'err';
  label?: ReactNode;
}) {
  const safe = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
  return (
    <div className="progress-wrap">
      <div className={cn('bar', tone !== 'default' && tone)}>
        <i style={{ width: `${safe}%` }} />
      </div>
      {label && <span className="tiny muted">{label}</span>}
    </div>
  );
}

export function Kpi({
  value,
  label,
  tone,
}: {
  value: ReactNode;
  label: string;
  tone?: string;
}) {
  return (
    <div className="kpi">
      <b style={tone ? { color: tone } : undefined}>{value}</b>
      <span>{label}</span>
    </div>
  );
}

export function Modal({
  open,
  title,
  onClose,
  children,
  footer,
  size = 'md',
}: {
  open: boolean;
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}) {
  const titleId = useId();

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className={cn('modal', size)}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="modal-head">
          <h3 id={titleId}>{title}</h3>
          <button type="button" className="btn sm ghost" onClick={onClose} aria-label="Fechar">
            ✕
          </button>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-foot">{footer}</footer>}
      </div>
    </div>
  );
}

export function Pagination({
  page,
  totalPages,
  onChange,
}: {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;
  return (
    <nav className="pagination" aria-label="Paginação">
      <Button size="sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        ◀ Anterior
      </Button>
      <span className="muted small">
        Página {page} de {totalPages}
      </span>
      <Button size="sm" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>
        Próxima ▶
      </Button>
    </nav>
  );
}

export function Table({
  head,
  children,
}: {
  head: ReactNode[];
  children: ReactNode;
}) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {head.map((cell, index) => (
              <th key={index}>{cell}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export { cn };
