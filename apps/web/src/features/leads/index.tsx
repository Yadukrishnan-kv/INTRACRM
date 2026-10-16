import { P } from '../../auth/permissions';
import { guarded, type FeatureModule } from '../types';
import { LeadDetailPage } from './LeadDetailPage';
import { LeadFormPage } from './LeadFormPage';
import { LeadsPage } from './LeadsPage';
import { PipelinePage } from './PipelinePage';
import { SearchPage } from './SearchPage';
import { TimelinePage } from './TimelinePage';

const SEARCH = [P.leadRead, P.quotationRead] as const;

export const leadsModule: FeatureModule = {
  routes: [
    { path: 'leads', element: guarded([P.leadRead], <LeadsPage />) },
    { path: 'leads/create', element: guarded([P.leadCreate], <LeadFormPage key="create" />) },
    { path: 'leads/:leadId', element: guarded([P.leadRead], <LeadDetailPage />) },
    { path: 'leads/:leadId/edit', element: guarded([P.leadUpdate], <LeadFormPage key="edit" />) },
    { path: 'pipeline', element: guarded([P.leadRead], <PipelinePage />) },
    { path: 'timeline', element: guarded([P.activityRead], <TimelinePage />) },
    { path: 'search', element: guarded(SEARCH, <SearchPage />) },
  ],
  nav: [
    { to: '/leads', label: 'Leads', section: 'Main', anyOf: [P.leadRead], order: 10 },
    { to: '/pipeline', label: 'Pipeline', section: 'Main', anyOf: [P.leadRead], order: 12 },
    { to: '/search', label: 'Search', section: 'Main', anyOf: SEARCH, order: 14 },
    { to: '/timeline', label: 'Timeline', section: 'Insights', anyOf: [P.activityRead], order: 5 },
  ],
};
