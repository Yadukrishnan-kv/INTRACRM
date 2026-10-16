import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, type Me } from '../api/endpoints';
import { sessionStore, type Session } from './session';

type AuthState = {
  session: Session | null;
  me: Me | undefined;
  meLoading: boolean;
  can: (permission: string) => boolean;
  /** True when the user holds at least one of the permissions (or the list is empty). */
  canAny: (permissions: readonly string[]) => boolean;
  tenantName: string | null;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState(sessionStore.get());
  const queryClient = useQueryClient();

  useEffect(
    () =>
      sessionStore.subscribe((next) => {
        setSession(next);
        // Signed out (explicitly or by a failed refresh): drop every cached tenant row.
        if (!next) queryClient.clear();
      }),
    [queryClient],
  );

  const meQuery = useQuery({
    queryKey: ['me', session?.user.id, session?.tenantId],
    queryFn: api.me,
    enabled: !!session,
    staleTime: 5 * 60_000,
  });

  const value = useMemo<AuthState>(() => {
    const me = meQuery.data;
    const permissions = new Set(me?.permissions ?? []);
    return {
      session,
      me,
      meLoading: meQuery.isLoading,
      can: (permission) => permissions.has(permission),
      canAny: (list) => list.length === 0 || list.some((p) => permissions.has(p)),
      tenantName: me?.tenants.find((t) => t.id === session?.tenantId)?.name ?? null,
    };
  }, [session, meQuery.data, meQuery.isLoading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>');
  return value;
}
