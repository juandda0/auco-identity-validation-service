export type Step = 'validate' | 'risk' | 'sign' | 'audit';

const STEPS: { id: Step; label: string }[] = [
  { id: 'validate', label: '1 Validate' },
  { id: 'risk', label: '2 Risk' },
  { id: 'sign', label: '3 Sign' },
  { id: 'audit', label: '4 Audit' },
];

export function Header({ step }: { step: Step }) {
  const current = STEPS.findIndex((s) => s.id === step);
  return (
    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-line bg-white px-6 py-4 sm:px-8">
      <div className="flex items-center gap-3">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#0F3D66" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 3l8 4v5c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V7l8-4z" />
          <path d="M8.5 12l2.5 2.5 4.5-5" />
        </svg>
        <div className="flex flex-col">
          <span className="text-base font-bold tracking-tight">Mini digital notary</span>
          <span className="text-xs text-subtle">Demo inspired by AUCO · not a real product</span>
        </div>
      </div>
      <nav aria-label="Steps">
        <ol className="flex flex-wrap gap-2 text-[13px]">
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
              {s.label}
              {i < current && ' ✓'}
            </li>
          ))}
        </ol>
      </nav>
    </header>
  );
}
