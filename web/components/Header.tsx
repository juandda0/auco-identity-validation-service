export type Step = 'validate' | 'risk' | 'sign' | 'audit';

const STEPS: { id: Step; short: string; label: string }[] = [
  { id: 'validate', short: 'Validate', label: 'Validate identity' },
  { id: 'risk', short: 'Risk', label: 'Risk verdict' },
  { id: 'sign', short: 'Sign', label: 'Promissory note' },
  { id: 'audit', short: 'Audit', label: 'Audit timeline' },
];

export function Header({ step }: { step: Step }) {
  const current = STEPS.findIndex((s) => s.id === step);
  const currentStep = STEPS[current];
  return (
    <header className="sticky top-0 z-10 border-b border-line bg-white/95 backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6 sm:py-4">
        <div className="flex min-w-0 items-center gap-3">
          <svg className="shrink-0" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#0F3D66" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 3l8 4v5c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V7l8-4z" />
            <path d="M8.5 12l2.5 2.5 4.5-5" />
          </svg>
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-[15px] font-bold tracking-tight sm:text-base">Mini digital notary</span>
            <span className="truncate text-xs text-subtle">Demo inspired by AUCO · not a real product</span>
          </div>
        </div>

        {/* Tablet and up: every step as a pill. */}
        <nav aria-label="Steps" className="hidden sm:block">
          <ol className="flex gap-2 text-[13px]">
            {STEPS.map((s, i) => (
              <li
                key={s.id}
                aria-current={i === current ? 'step' : undefined}
                className={`rounded-full px-3 py-1.5 ${
                  i === current
                    ? 'bg-navy font-semibold text-white'
                    : i < current
                      ? 'bg-navy-soft text-navy'
                      : 'bg-[#eceae4] text-muted'
                }`}
              >
                {i + 1} {s.short}
                {i < current && ' ✓'}
              </li>
            ))}
          </ol>
        </nav>
      </div>

      {/* Phones: a compact progress indicator instead of four pills. */}
      <div className="px-4 pb-3 sm:hidden" aria-label="Progress">
        <p className="mb-1.5 text-xs text-muted">
          Step {current + 1} of {STEPS.length} · <span className="font-semibold text-ink">{currentStep?.label}</span>
        </p>
        <div className="grid grid-cols-4 gap-1" aria-hidden="true">
          {STEPS.map((s, i) => (
            <span key={s.id} className={`h-1 rounded-full ${i <= current ? 'bg-navy' : 'bg-[#eceae4]'}`} />
          ))}
        </div>
      </div>
    </header>
  );
}
