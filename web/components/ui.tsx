'use client';

import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';
import { API_URL, ApiError, type Verdict } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { Icon, type IconName } from './icons';

/** Logo mark, title and supporting text at the top of every step. */
export function StepHeader({
  icon,
  title,
  subtitle,
  tone = 'neutral',
}: {
  icon: IconName;
  title: string;
  subtitle?: ReactNode;
  tone?: 'neutral' | 'success' | 'warning' | 'error';
}) {
  const tones = {
    neutral: 'bg-primary text-on-primary',
    success: 'bg-success-soft text-success ring-8 ring-success-soft/50',
    warning: 'bg-warning-soft text-warning ring-8 ring-warning-soft/50',
    error: 'bg-error-soft text-error ring-8 ring-error-soft/50',
  };
  return (
    <div className="mb-6 flex flex-col gap-4 sm:mb-8">
      <span className={`flex size-10 items-center justify-center rounded-full ${tones[tone]}`}>
        <Icon name={icon} className="size-5" />
      </span>
      <div className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold text-ink sm:text-xl">{title}</h1>
        {subtitle && <p className="text-sm text-subtle">{subtitle}</p>}
      </div>
    </div>
  );
}

export function Field({
  label,
  hint,
  className = '',
  ...input
}: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  return (
    <label className={`flex flex-col gap-1.5 text-sm font-medium text-muted ${className}`}>
      {label}
      {/* text-base (16px) on phones keeps iOS Safari from zooming into the field */}
      <input
        {...input}
        className="h-11 rounded-lg border border-line-strong bg-surface px-3.5 text-base font-normal text-ink shadow-xs outline-none placeholder:text-placeholder focus:border-primary focus:ring-4 focus:ring-primary/15 sm:h-10 sm:text-sm"
      />
      {hint && <span className="text-xs font-normal text-subtle">{hint}</span>}
    </label>
  );
}

export function Button({
  variant = 'primary',
  icon,
  className = '',
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'link';
  icon?: IconName;
}) {
  const styles = {
    primary:
      'h-11 bg-primary px-4 text-on-primary shadow-xs hover:bg-primary-hover disabled:bg-line-strong disabled:text-subtle sm:h-10',
    secondary:
      'h-11 border border-line-strong bg-surface px-3.5 text-muted shadow-xs hover:bg-canvas disabled:text-placeholder sm:h-10',
    link: 'h-11 px-1 text-muted underline-offset-4 hover:text-ink hover:underline sm:h-10',
  };
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg text-sm font-semibold transition-colors disabled:cursor-not-allowed ${styles[variant]} ${className}`}
    >
      {icon && <Icon name={icon} className="size-4" strokeWidth={2} />}
      {children}
    </button>
  );
}

/**
 * Bottom action row: "Go back" on the left, the main action on the right.
 * Sticky on phones so the next step is always within thumb reach.
 */
export function Actions({ children }: { children: ReactNode }) {
  return (
    <div className="sticky bottom-0 -mx-4 mt-8 flex items-center justify-between gap-3 border-t border-line bg-surface/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
      {children}
    </div>
  );
}

/** A selectable card: icon, title and description; the selected one gets a dark border. */
export function OptionCard({
  icon,
  iconClass,
  title,
  description,
  selected,
  onSelect,
}: {
  icon: ReactNode;
  iconClass: string;
  title: string;
  description: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={`flex flex-col items-start gap-3 rounded-xl border bg-surface p-3.5 text-left transition-shadow ${
        selected
          ? 'border-primary ring-1 ring-primary'
          : 'border-line shadow-xs hover:border-line-strong'
      }`}
    >
      <span className={`flex h-5 items-center text-xs font-bold ${iconClass}`}>{icon}</span>
      <span className="flex flex-col gap-0.5">
        <span className="text-sm font-semibold text-ink">{title}</span>
        <span className="text-xs text-subtle sm:text-sm">{description}</span>
      </span>
    </button>
  );
}

const VERDICT_STYLES: Record<Verdict, string> = {
  APPROVED: 'border-success-line bg-success-soft text-success',
  REVIEW: 'border-warning-line bg-warning-soft text-warning',
  BLOCKED: 'border-error-line bg-error-soft text-error',
};

export function VerdictBadge({ verdict }: { verdict: Verdict }) {
  const { t } = useI18n();
  return (
    <span className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium ${VERDICT_STYLES[verdict]}`}>
      {t.verdicts[verdict]}
    </span>
  );
}

export function ErrorBanner({ error }: { error: unknown }) {
  const { t } = useI18n();
  if (!error) return null;
  const apiError = error instanceof ApiError ? error : null;
  // API messages stay in English (they are part of the API contract); the network
  // error is produced by the browser, so it is translated here.
  const message =
    apiError?.code === 'NETWORK_ERROR'
      ? t.networkError(API_URL)
      : error instanceof Error
        ? error.message
        : String(error);
  return (
    <div role="alert" className="mt-5 flex gap-3 rounded-xl border border-error-line bg-error-soft p-4 text-sm text-error">
      <Icon name="alert" className="mt-0.5 size-5 shrink-0" />
      <div className="min-w-0">
        <p className="font-semibold">
          {apiError ? `${apiError.status || ''} ${apiError.code}`.trim() : t.error}
        </p>
        <p className="break-words text-error-text">{message}</p>
        {apiError && apiError.details.length > 0 && (
          <ul className="mt-1.5 list-disc pl-5 text-error-text">
            {apiError.details.map((d) => (
              <li key={d.path}>
                <code className="font-mono text-xs">{d.path}</code>: {d.message}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export function Mono({ children }: { children: ReactNode }) {
  return <span className="break-all font-mono text-[13px]">{children}</span>;
}
