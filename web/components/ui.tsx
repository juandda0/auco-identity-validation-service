import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';
import { ApiError, type Verdict } from '@/lib/api';

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-line bg-white p-6 sm:p-8 ${className}`}>
      {children}
    </section>
  );
}

export function Field({
  label,
  hint,
  className = '',
  ...input
}: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  return (
    <label className={`flex flex-col gap-1.5 text-sm font-semibold ${className}`}>
      {label}
      <input
        {...input}
        className="h-11 rounded-lg border border-field bg-white px-3.5 font-normal text-ink outline-none focus:border-navy focus:ring-2 focus:ring-navy/20"
      />
      {hint && <span className="text-xs font-normal text-subtle">{hint}</span>}
    </label>
  );
}

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' }) {
  const styles =
    variant === 'primary'
      ? 'bg-navy text-white hover:bg-[#0a2a47] disabled:bg-navy/50'
      : 'border border-field bg-white text-ink hover:bg-paper disabled:text-subtle';
  return (
    <button
      {...props}
      className={`inline-flex h-12 items-center justify-center rounded-lg px-6 text-[15px] font-semibold transition-colors disabled:cursor-not-allowed ${styles} ${className}`}
    />
  );
}

const VERDICT_STYLES: Record<Verdict, string> = {
  APPROVED: 'bg-approved-soft text-approved',
  REVIEW: 'bg-review-soft text-review',
  BLOCKED: 'bg-blocked-soft text-blocked',
};

export function VerdictBadge({ verdict }: { verdict: Verdict }) {
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${VERDICT_STYLES[verdict]}`}>
      {verdict}
    </span>
  );
}

export function ErrorBanner({ error }: { error: unknown }) {
  if (!error) return null;
  const apiError = error instanceof ApiError ? error : null;
  return (
    <div role="alert" className="rounded-lg border border-blocked/30 bg-blocked-soft p-4 text-sm text-blocked">
      <p className="font-semibold">
        {apiError ? `${apiError.status || ''} ${apiError.code}`.trim() : 'Error'}
      </p>
      <p>{error instanceof Error ? error.message : String(error)}</p>
      {apiError && apiError.details.length > 0 && (
        <ul className="mt-2 list-disc pl-5">
          {apiError.details.map((d) => (
            <li key={d.path}>
              <code className="font-mono">{d.path}</code>: {d.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function Mono({ children }: { children: ReactNode }) {
  return <span className="font-mono text-[13px]">{children}</span>;
}
