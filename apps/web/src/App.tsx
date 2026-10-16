import { Navigate, Outlet, useLocation, useRoutes } from 'react-router-dom';
import { useAuth } from './auth/AuthContext';
import { Layout } from './components/Layout';
import { EmptyState, ErrorState, Spinner } from './components/ui';
import { appRoutes, navItems, publicRoutes } from './features';
import { LoginPage } from './pages/LoginPage';

function RequireAuth() {
  const { session, me, meLoading } = useAuth();
  const location = useLocation();
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  if (meLoading) return <Spinner label="Loading your workspace…" />;
  if (!me) return <ErrorState error={new Error('Could not load your profile.')} onRetry={() => window.location.reload()} />;
  return <Outlet />;
}

/** "/" lands on the first page this role can open, like the mobile home. */
function Home() {
  const { canAny } = useAuth();
  const first = [...navItems]
    .filter((n) => canAny(n.anyOf ?? []))
    .sort((a, b) => (a.section === 'Main' ? 0 : 1) - (b.section === 'Main' ? 0 : 1) || (a.order ?? 50) - (b.order ?? 50))[0];
  return first ? <Navigate to={first.to} replace /> : <EmptyState>Your role has no pages in the web console yet.</EmptyState>;
}

export function App() {
  return useRoutes([
    { path: '/login', element: <LoginPage /> },
    ...publicRoutes,
    {
      element: <RequireAuth />,
      children: [
        {
          element: <Layout />,
          children: [
            { index: true, element: <Home /> },
            ...appRoutes,
            { path: '*', element: <EmptyState>Page not found.</EmptyState> },
          ],
        },
      ],
    },
  ]);
}
