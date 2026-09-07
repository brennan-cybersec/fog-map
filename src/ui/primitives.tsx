/**
 * Interface primitives.
 *
 * Small and deliberately few. Every surface in the product is built from these,
 * which is what keeps a map HUD, a statistics panel and an achievement list
 * feeling like one application rather than three.
 */

import type { ReactNode } from 'react';

export function Panel({
  className = '',
  children,
  ...rest
}: { className?: string; children: ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`panel ${className}`} {...rest}>
      {children}
    </div>
  );
}

export function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <div className="stat__value">{value}</div>
      <div className="stat__label">{label}</div>
    </div>
  );
}

export function Meter({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div
      className="meter"
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className="meter__fill" style={{ width: `${pct}%` }} />
    </div>
  );
}

export function RailButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className="rail__btn"
      // aria-pressed rather than a class alone, so the toggle state is exposed
      // to assistive technology and not only to sighted users.
      aria-pressed={active ?? false}
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

/**
 * Icons.
 *
 * Drawn inline as stroked geometry rather than pulled from an icon font, so the
 * whole set shares one weight and one corner treatment. Mismatched icons are
 * one of the loudest tells of an unfinished product.
 */
const iconProps = {
  width: 19,
  height: 19,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

export const Icon = {
  Compass: () => (
    <svg {...iconProps}>
      <circle cx="12" cy="12" r="9" />
      <path d="m15.5 8.5-2 5-5 2 2-5z" />
    </svg>
  ),
  Chart: () => (
    <svg {...iconProps}>
      <path d="M4 19V9M9.5 19V5M15 19v-7M20.5 19v-4" />
    </svg>
  ),
  Trophy: () => (
    <svg {...iconProps}>
      <path d="M7 4h10v5a5 5 0 0 1-10 0z" />
      <path d="M7 6H4.5v1.5A3 3 0 0 0 7.5 10M17 6h2.5v1.5A3 3 0 0 1 16.5 10" />
      <path d="M12 14v3M9 20h6" />
    </svg>
  ),
  Clock: () => (
    <svg {...iconProps}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5.2l3 1.8" />
    </svg>
  ),
  Search: () => (
    <svg {...iconProps}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4 4" />
    </svg>
  ),
  Shield: () => (
    <svg {...iconProps}>
      <path d="M12 3.5 19 6v5.5c0 4.2-2.9 7.6-7 9-4.1-1.4-7-4.8-7-9V6z" />
      <path d="m9.2 12 2 2 3.6-3.6" />
    </svg>
  ),
  Locate: () => (
    <svg {...iconProps}>
      <circle cx="12" cy="12" r="3.2" />
      <circle cx="12" cy="12" r="7.5" />
      <path d="M12 2v2.2M12 19.8V22M22 12h-2.2M4.2 12H2" />
    </svg>
  ),
};

/** The product mark: a survey rosette with one revealed quadrant. */
export function BrandMark({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9.2" stroke="rgba(243,241,236,0.35)" strokeWidth="1.3" />
      <path
        d="M12 2.8a9.2 9.2 0 0 1 9.2 9.2H12z"
        fill="var(--accent)"
        opacity="0.9"
      />
      <circle cx="12" cy="12" r="2.1" fill="none" stroke="var(--text)" strokeWidth="1.3" />
    </svg>
  );
}
