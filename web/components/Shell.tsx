'use client';

import type { ReactNode } from 'react';
import { API_URL } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { Icon, type IconName } from './icons';
import { Preferences } from './Preferences';

export type Step = 'country' | 'person' | 'risk' | 'sign' | 'audit';

export const STEPS: { id: Step; icon: IconName }[] = [
  { id: 'country', icon: 'globe' },
  { id: 'person', icon: 'idCard' },
  { id: 'risk', icon: 'shield' },
  { id: 'sign', icon: 'pen' },
  { id: 'audit', icon: 'list' },
];

/*
 * Each step orbits the brand on a dotted ring (px inside a 320 x 520 box,
 * rings centred at x=40, y=260). Pure decoration: hidden from assistive tech,
 * which gets the same progress from the mobile indicator and the headings.
 */
const ORBITS: Record<Step, { x: number; y: number }> = {
  country: { x: 136, y: 145 },
  person: { x: 270, y: 150 },
  risk: { x: 250, y: 260 },
  sign: { x: 109, y: 318 },
  audit: { x: 255, y: 410 },
};
const RINGS = [90, 150, 210, 270];

function Brand() {
  const { t } = useI18n();
  return (
    <div className="flex items-center gap-2">
      <span className="flex size-7 items-center justify-center rounded-full bg-primary text-on-primary">
        <Icon name="shield" className="size-4" strokeWidth={2} />
      </span>
      <span className="text-sm font-semibold text-ink">{t.brand}</span>
    </div>
  );
}

function Orbit({ current }: { current: number }) {
  const { t } = useI18n();
  return (
    <div className="relative mx-auto h-[520px] w-[320px]" aria-hidden="true">
      {RINGS.map((r) => (
        <span
          key={r}
          className="absolute rounded-full border border-dashed border-line-strong"
          style={{ width: r * 2, height: r * 2, left: 40 - r, top: 260 - r }}
        />
      ))}
      {STEPS.map((step, i) => {
        const { x, y } = ORBITS[step.id];
        const active = i === current;
        const done = i < current;
        return (
          <div
            key={step.id}
            className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1.5"
            style={{ left: x, top: y }}
          >
            <span
              className={`flex items-center justify-center rounded-full border shadow-sm transition-all ${
                active
                  ? 'size-11 border-primary bg-primary text-on-primary'
                  : done
                    ? 'size-9 border-line bg-surface text-success'
                    : 'size-9 border-line bg-surface text-subtle'
              }`}
            >
              <Icon name={done ? 'check' : step.icon} className={active ? 'size-5' : 'size-4'} />
            </span>
            <span
              className={`whitespace-nowrap text-[11px] ${active ? 'font-semibold text-ink' : 'text-subtle'}`}
            >
              {t.steps[step.id]}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Split onboarding layout. Phones: one white column with a compact progress
 * bar. Large screens: a grey side panel with the step orbit, and the content
 * in an inset white panel.
 */
export function Shell({
  step,
  wide = false,
  children,
}: {
  step: Step;
  wide?: boolean;
  children: ReactNode;
}) {
  const { t } = useI18n();
  const current = STEPS.findIndex((s) => s.id === step);
  return (
    <div className="min-h-dvh bg-surface lg:flex lg:bg-canvas lg:p-3">
      <aside className="hidden shrink-0 flex-col justify-between overflow-hidden p-5 lg:sticky lg:top-3 lg:flex lg:h-[calc(100dvh-1.5rem)] lg:w-[340px] lg:self-start">
        <Brand />
        <Orbit current={current} />
        <dl className="flex flex-col gap-3 text-sm">
          <div>
            <dt className="text-subtle">{t.apiLabel}</dt>
            <dd>
              <a className="font-semibold text-ink hover:underline" href={`${API_URL}/docs`} target="_blank" rel="noreferrer">
                {API_URL.replace(/^https?:\/\//, '')}/docs
              </a>
            </dd>
          </div>
          <div>
            <dt className="text-subtle">{t.aboutLabel}</dt>
            <dd className="font-semibold text-ink">{t.about}</dd>
          </div>
          <div className="pt-1">
            <Preferences />
          </div>
        </dl>
      </aside>

      <div className="flex min-h-dvh flex-col bg-surface lg:min-h-[calc(100dvh-1.5rem)] lg:flex-1 lg:rounded-2xl lg:border lg:border-line lg:shadow-xs">
        <header className="sticky top-0 z-10 border-b border-line bg-surface/95 px-4 pb-3 pt-4 backdrop-blur sm:px-6 lg:hidden">
          <div className="flex items-center justify-between gap-3">
            <Brand />
            <Preferences />
          </div>
          <p className="mt-3 text-xs text-subtle">{t.stepOf(current + 1, STEPS.length)}</p>
          <div className="mt-1.5 grid grid-cols-5 gap-1.5" aria-hidden="true">
            {STEPS.map((s, i) => (
              <span key={s.id} className={`h-1 rounded-full ${i <= current ? 'bg-primary' : 'bg-line'}`} />
            ))}
          </div>
        </header>

        <main className="flex flex-1 justify-center px-4 pb-6 pt-8 sm:px-6 sm:pt-12 lg:items-center lg:py-12">
          <div className={`w-full ${wide ? 'max-w-[720px]' : 'max-w-[440px]'}`}>{children}</div>
        </main>
      </div>
    </div>
  );
}
