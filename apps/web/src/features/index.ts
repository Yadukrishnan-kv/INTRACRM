import { adminModule } from './admin';
import { fieldModule } from './field';
import { followupsModule } from './followups';
import { leadsModule } from './leads';
import { performanceModule } from './performance';
import { reportsModule } from './reports';
import { salesModule } from './sales';
import type { FeatureModule } from './types';

export const modules: FeatureModule[] = [
  performanceModule,
  leadsModule,
  followupsModule,
  salesModule,
  fieldModule,
  reportsModule,
  adminModule,
];

export const appRoutes = modules.flatMap((m) => m.routes);
export const publicRoutes = modules.flatMap((m) => m.publicRoutes ?? []);
export const navItems = modules.flatMap((m) => m.nav);
