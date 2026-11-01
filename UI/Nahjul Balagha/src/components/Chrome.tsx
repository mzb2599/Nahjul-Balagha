import type { ReactNode } from "react";
import { Bookmark, House, Sparkles } from "lucide-react";

export function IconButton({
  label,
  onClick,
  children,
  className = "",
  pressed,
  disabled,
}: {
  label: string;
  onClick?: () => void;
  children: ReactNode;
  className?: string;
  pressed?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className={`icon-button ${className}`}
      aria-label={label}
      title={label}
      onClick={onClick}
      aria-pressed={pressed}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

export function ProgressRing({
  value,
  size = 52,
  stroke = 4,
  color = "var(--amber)",
  track = "rgba(255,255,255,.18)",
  label,
}: {
  value: number;
  size?: number;
  stroke?: number;
  color?: string;
  track?: string;
  label?: string;
}) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <span
      className="progress-ring"
      style={{ width: size, height: size }}
      role="img"
      aria-label={label ?? `${Math.round(clamped)}% complete`}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={track}
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - clamped / 100)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <span>{Math.round(clamped)}%</span>
    </span>
  );
}

export function BottomNav({
  active,
  savedCount,
  onHome,
  onSaved,
  onAsk,
}: {
  active: "home" | "saved";
  savedCount: number;
  onHome: () => void;
  onSaved: () => void;
  onAsk: () => void;
}) {
  return (
    <nav className="bottom-nav" aria-label="Primary navigation">
      <button
        type="button"
        className={`bottom-nav-item ${active === "home" ? "is-active" : ""}`}
        onClick={onHome}
        aria-current={active === "home" ? "page" : undefined}
      >
        <House size={19} />
        <span>Home</span>
      </button>
      <button
        type="button"
        className={`bottom-nav-item ${active === "saved" ? "is-active" : ""}`}
        onClick={onSaved}
        aria-current={active === "saved" ? "page" : undefined}
      >
        <Bookmark size={19} />
        <span>Saved</span>
        {savedCount > 0 && <small className="bottom-nav-count">{savedCount}</small>}
      </button>
      <button
        type="button"
        className="bottom-nav-ask"
        onClick={onAsk}
        aria-label="Ask Sage"
      >
        <span className="bottom-nav-orb">
          <Sparkles size={18} />
        </span>
        <span>Ask AI</span>
      </button>
    </nav>
  );
}

export function Orb({ size = 88 }: { size?: number }) {
  return (
    <span
      className="sage-orb"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <span className="sage-orb-core" />
    </span>
  );
}

export function EmptyMark({ children }: { children: ReactNode }) {
  return <span className="empty-mark">{children}</span>;
}
