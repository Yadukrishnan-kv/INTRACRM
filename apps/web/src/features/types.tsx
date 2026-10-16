import type { ComponentType, ReactNode } from 'react';
import type { RouteObject } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { EmptyState } from '../components/ui';

export type NavSection = 'Main' | 'Sales' | 'Field' | 'Insights' | 'Admin' | 'Account';
export const NAV_SECTIONS: NavSection[] = ['Main', 'Sales', 'Field', 'Insights', 'Admin', 'Account'];

export type NavItem = {
  to: string;
  label: string;
  section: NavSection;
  /** Shown when the user holds any of these; omit for everyone signed in. */
  anyOf?: readonly string[];
  /** Lower sorts first within a section. */
  order?: number;
  /** Match the path exactly (NavLink `end`). */
  end?: boolean;
  /** Small count rendered after the label (e.g. unread notifications). */
  badge?: ComponentType;
};

export type FeatureModule = {
  /** Mounted inside the signed-in shell, paths relative to "/" (e.g. "leads/:leadId"). */
  routes: RouteObject[];
  /** Mounted outside auth (forgot password, public warranty verification). */
  publicRoutes?: RouteObject[];
  nav: NavItem[];
};

/** Renders `children` only when the user holds any of `anyOf`. */
export function Guard({ anyOf, children }: { anyOf: readonly string[]; children: ReactNode }) {
  const { canAny } = useAuth();
  return canAny(anyOf) ? <>{children}</> : <EmptyState>You don’t have access to this page.</EmptyState>;
}

export function guarded(anyOf: readonly string[], element: ReactNode): ReactNode {
  return <Guard anyOf={anyOf}>{element}</Guard>;
}
