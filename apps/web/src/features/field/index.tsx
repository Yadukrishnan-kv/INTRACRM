import { P } from '../../auth/permissions';
import { guarded, type FeatureModule } from '../types';
import { AttendancePage } from './AttendancePage';
import { SiteVisitDetailPage } from './SiteVisitDetailPage';
import { SiteVisitFormPage } from './SiteVisitFormPage';
import { SiteVisitsPage } from './SiteVisitsPage';
import './field.css';

export const fieldModule: FeatureModule = {
  routes: [
    { path: 'visits', element: guarded([P.siteVisitRead], <SiteVisitsPage />) },
    { path: 'visits/create', element: guarded([P.siteVisitCreate], <SiteVisitFormPage />) },
    { path: 'visits/:visitId', element: guarded([P.siteVisitRead], <SiteVisitDetailPage />) },
    { path: 'attendance', element: guarded([P.attendanceRead], <AttendancePage />) },
  ],
  nav: [
    { to: '/visits', label: 'Site visits', section: 'Field', anyOf: [P.siteVisitRead], order: 10 },
    { to: '/attendance', label: 'Attendance', section: 'Field', anyOf: [P.attendanceRead], order: 20 },
  ],
};
