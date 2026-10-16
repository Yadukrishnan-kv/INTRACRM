import type { ReactNode } from 'react';

export type Tab = { id: string; label: ReactNode; hidden?: boolean };

export function Tabs({ tabs, active, onChange }: { tabs: Tab[]; active: string; onChange: (id: string) => void }) {
  return (
    <div className="tabs" role="tablist">
      {tabs
        .filter((t) => !t.hidden)
        .map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={t.id === active}
            className={`tab${t.id === active ? ' tab-active' : ''}`}
            onClick={() => onChange(t.id)}
          >
            {t.label}
          </button>
        ))}
    </div>
  );
}
