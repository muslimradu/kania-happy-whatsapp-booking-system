import type { ReactNode } from 'react';

// ── Badge ─────────────────────────────────────────────────────────────────────

type BadgeVariant = 'pending' | 'paid' | 'rejected' | 'cash' | 'active' | 'inactive';

const BADGE_CLASS: Record<BadgeVariant, string> = {
  pending:  'badge-pending',
  paid:     'badge-paid',
  rejected: 'badge-rejected',
  cash:     'badge-cash',
  active:   'badge-active',
  inactive: 'inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500',
};

export function Badge({ variant, label }: { variant: BadgeVariant; label: string }) {
  return <span className={BADGE_CLASS[variant]}>{label}</span>;
}

// ── Spinner ───────────────────────────────────────────────────────────────────

export function Spinner({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const cls = size === 'sm' ? 'w-4 h-4' : size === 'lg' ? 'w-8 h-8' : 'w-6 h-6';
  return (
    <div
      className={`${cls} animate-spin rounded-full border-2 border-primary-200 border-t-primary-500`}
      role="status"
      aria-label="Memuat..."
    />
  );
}

// ── EmptyState ────────────────────────────────────────────────────────────────

export function EmptyState({ icon, title, description }: {
  icon?: string;
  title: string;
  description?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      {icon && <span className="text-4xl mb-3">{icon}</span>}
      <p className="text-sm font-semibold text-gray-700">{title}</p>
      {description && <p className="text-xs text-gray-400 mt-1 max-w-xs">{description}</p>}
    </div>
  );
}

// ── ConfirmModal ──────────────────────────────────────────────────────────────

export function ConfirmModal({
  open, title, description, confirmLabel, confirmVariant = 'danger',
  onConfirm, onCancel, loading,
}: {
  open: boolean;
  title: string;
  description?: ReactNode;
  confirmLabel: string;
  confirmVariant?: 'primary' | 'danger';
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative card p-6 w-full max-w-sm shadow-lg">
        <h3 className="font-semibold text-gray-900 mb-2">{title}</h3>
        {description && <p className="text-sm text-gray-500 mb-5">{description}</p>}
        <div className="flex gap-3 justify-end">
          <button className="btn-secondary" onClick={onCancel} disabled={loading}>
            Batal
          </button>
          <button
            className={confirmVariant === 'danger' ? 'btn-danger' : 'btn-primary'}
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? <Spinner size="sm" /> : null}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── PageHeader ────────────────────────────────────────────────────────────────

export function PageHeader({ title, subtitle, action }: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between mb-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">{title}</h1>
        {subtitle && <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>}
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}
