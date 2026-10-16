import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { EmptyState, PageHeader } from '../../components/ui';
import { visibleHubLinks, type HubGroup } from './logic';
import './reports.css';

const GROUPS: HubGroup[] = ['Reports', 'Dashboards'];

export function ReportsHubPage() {
  const { canAny } = useAuth();
  const links = visibleHubLinks(canAny);
  return (
    <>
      <PageHeader title="Reports" subtitle="Summaries, breakdowns and exports across the CRM." />
      {links.length === 0 ? (
        <EmptyState>No reports available for this account.</EmptyState>
      ) : (
        GROUPS.map((group) => {
          const items = links.filter((l) => l.group === group);
          if (!items.length) return null;
          return (
            <section key={group}>
              <h2 className="reports-hub-group">{group}</h2>
              <div className="reports-hub-grid">
                {items.map((item) => (
                  <Link key={item.to} to={item.to} className="card reports-hub-card">
                    <strong>{item.title}</strong>
                    <span>{item.subtitle}</span>
                  </Link>
                ))}
              </div>
            </section>
          );
        })
      )}
    </>
  );
}
