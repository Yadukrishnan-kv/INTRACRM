import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { logout } from '../api/endpoints';
import { useAuth } from '../auth/AuthContext';
import { navItems } from '../features';
import { initials } from '../features/admin/shared';
import { NAV_SECTIONS } from '../features/types';
import { observeTables } from '../lib/stackTables';
import { Brand } from './ui';

export function Layout() {
  const { session, me, canAny, tenantName } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => (mainRef.current ? observeTables(mainRef.current) : undefined), []);

  // Mobile menu: close on Escape and stop the page behind it from scrolling.
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenuOpen(false);
    document.addEventListener('keydown', onKey);
    document.body.classList.add('menu-open');
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.classList.remove('menu-open');
    };
  }, [menuOpen]);

  const visible = navItems.filter((item) => canAny(item.anyOf ?? []));
  const sections = NAV_SECTIONS.map((section) => ({
    section,
    items: visible.filter((i) => i.section === section).sort((a, b) => (a.order ?? 50) - (b.order ?? 50)),
  })).filter((s) => s.items.length > 0);

  async function onLogout() {
    await logout().catch(() => undefined);
    navigate('/login', { replace: true });
  }

  return (
    <div className="shell">
      <aside className={`sidebar${menuOpen ? ' sidebar-open' : ''}`}>
        <div className="sidebar-top">
          <Brand caption={tenantName ?? 'Console'} />
          <button type="button" className="icon-btn menu-toggle" aria-label="Menu" aria-expanded={menuOpen} onClick={() => setMenuOpen((o) => !o)}>
            ☰
          </button>
        </div>
        <nav aria-label="Main" onClick={() => setMenuOpen(false)} key={location.pathname}>
          {sections.map(({ section, items }) => (
            <div key={section} className="nav-section">
              {section !== 'Main' ? <span className="nav-heading">{section}</span> : null}
              {items.map((item) => (
                <NavLink key={item.to} to={item.to} end={item.end} className="nav-link">
                  {item.label}
                  {item.badge ? <item.badge /> : null}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="user">
            <span className="user-avatar" aria-hidden>
              {initials(me?.fullName ?? session?.user.fullName ?? '')}
            </span>
            <span className="user-text">
              <strong>{me?.fullName ?? session?.user.fullName}</strong>
              <span className="muted small">{me?.email ?? session?.user.email}</span>
            </span>
          </div>
          <button type="button" className="btn btn-ghost" onClick={onLogout}>
            Sign out
          </button>
        </div>
      </aside>
      {menuOpen ? <div className="menu-backdrop" aria-hidden onClick={() => setMenuOpen(false)} /> : null}
      <main className="content" ref={mainRef}>
        <Outlet />
      </main>
    </div>
  );
}
