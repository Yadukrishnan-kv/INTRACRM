import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

export type MenuLink = { to: string; title: string; subtitle?: string; show?: boolean };

/** Card with a heading and a list of navigation rows (mobile IconMenuTile group). */
export function MenuGroup({ title, links, children }: { title: string; links: MenuLink[]; children?: ReactNode }) {
  const visible = links.filter((l) => l.show !== false);
  if (visible.length === 0 && !children) return null;
  return (
    <section className="card">
      <p className="admin-group-title">{title}</p>
      <ul className="admin-menu">
        {visible.map((l) => (
          <li key={l.to}>
            <Link to={l.to}>
              <span>
                <span className="admin-menu-title">{l.title}</span>
                {l.subtitle ? <span className="muted small" style={{ display: 'block' }}>{l.subtitle}</span> : null}
              </span>
              <span className="admin-chevron" aria-hidden>
                ›
              </span>
            </Link>
          </li>
        ))}
        {children}
      </ul>
    </section>
  );
}

export function BackLink({ to, label }: { to: string; label: string }) {
  return (
    <Link to={to} className="back-link">
      ← {label}
    </Link>
  );
}

/** Toggleable chips for picking several ids (roles, teams). */
export function ChipPicker({
  options, selected, onToggle, disabled,
}: {
  options: Array<{ id: string; label: string; hint?: string }>;
  selected: ReadonlySet<string>;
  onToggle: (id: string) => void;
  disabled?: boolean;
}) {
  if (options.length === 0) return <p className="muted small">Nothing to choose from yet.</p>;
  return (
    <div className="admin-chips">
      {options.map((o) => {
        const on = selected.has(o.id);
        return (
          <button
            key={o.id}
            type="button"
            className={`chip${on ? ' chip-active' : ''}`}
            aria-pressed={on}
            title={o.hint}
            disabled={disabled}
            onClick={() => onToggle(o.id)}
          >
            {on ? '✓ ' : ''}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? `${parts[0]![0]}${parts[parts.length - 1]![0]}` : (parts[0]?.slice(0, 2) ?? '?');
  return letters.toUpperCase();
}
