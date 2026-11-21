/** Small stroke icons (24px grid), drawn here so the UI has no icon dependency. */
const PATHS = {
  globe: 'M12 3a9 9 0 100 18 9 9 0 000-18zm-9 9h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z',
  idCard: 'M3 6.5A1.5 1.5 0 014.5 5h15A1.5 1.5 0 0121 6.5v11a1.5 1.5 0 01-1.5 1.5h-15A1.5 1.5 0 013 17.5v-11zM8.5 12a2 2 0 100-4 2 2 0 000 4zm-3 4c.6-1.5 1.7-2.2 3-2.2s2.4.7 3 2.2M14 9.5h4M14 13h3',
  shield: 'M12 3l7.5 3.2v5.3c0 4.6-3.1 8.2-7.5 9.5-4.4-1.3-7.5-4.9-7.5-9.5V6.2L12 3zm-3.2 9.2l2.2 2.2 4.4-4.6',
  file: 'M14 3H7.5A1.5 1.5 0 006 4.5v15A1.5 1.5 0 007.5 21h9a1.5 1.5 0 001.5-1.5V7l-4-4zm0 0v4h4M9 12h6M9 15.5h6',
  pen: 'M4 20l1.2-4.4L15.6 5.2a2 2 0 012.8 0l.4.4a2 2 0 010 2.8L8.4 18.8 4 20zM13.5 7.3l3.2 3.2',
  list: 'M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  alert: 'M12 8v5m0 3.5v.5M10.3 3.9L2.6 17.5A2 2 0 004.3 20.5h15.4a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z',
  x: 'M6 6l12 12M18 6L6 18',
  chevronLeft: 'M15 18l-6-6 6-6',
  arrowLeft: 'M19 12H5m0 0l6 6m-6-6l6-6',
  spark: 'M12 3v4m0 10v4M3 12h4m10 0h4M6 6l2.5 2.5m7 7L18 18M18 6l-2.5 2.5m-7 7L6 18',
  hash: 'M5 9h14M5 15h14M10 3L8 21M16 3l-2 18',
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({
  name,
  className = 'size-5',
  strokeWidth = 1.8,
}: {
  name: IconName;
  className?: string;
  strokeWidth?: number;
}) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
