import { Navigate } from 'react-router-dom';
import { P } from '../../auth/permissions';
import { guarded, type FeatureModule } from '../types';
import { QuotationDetailPage } from './QuotationDetailPage';
import { QuotationFormPage } from './QuotationFormPage';
import { QuotationsPage } from './QuotationsPage';
import { VerifyWarrantyPage } from './VerifyWarrantyPage';
import { WarrantiesPage } from './WarrantiesPage';
import { WarrantyDetailPage } from './WarrantyDetailPage';
import { WarrantyFormPage } from './WarrantyFormPage';

export const salesModule: FeatureModule = {
  routes: [
    { path: 'quotations', element: guarded([P.quotationRead], <QuotationsPage />) },
    { path: 'quotations/create', element: guarded([P.quotationCreate], <QuotationFormPage />) },
    { path: 'quotations/:quotationId', element: guarded([P.quotationRead], <QuotationDetailPage />) },
    { path: 'quotations/:quotationId/edit', element: guarded([P.quotationCreate], <QuotationFormPage />) },
    { path: 'warranties', element: guarded([P.warrantyRead], <WarrantiesPage />) },
    { path: 'warranties/create', element: guarded([P.warrantyCreate], <WarrantyFormPage />) },
    { path: 'warranties/:warrantyId', element: guarded([P.warrantyRead], <WarrantyDetailPage />) },
    { path: 'warranties/:warrantyId/edit', element: guarded([P.warrantyUpdate], <WarrantyFormPage />) },
  ],
  publicRoutes: [
    { path: 'verify-warranty', element: <VerifyWarrantyPage /> },
    // Mobile's camera scan route; the web flow takes the URL/token by hand.
    { path: 'verify-warranty/scan', element: <Navigate to="/verify-warranty" replace /> },
    { path: 'verify-warranty/:token', element: <VerifyWarrantyPage /> },
  ],
  nav: [
    { to: '/quotations', label: 'Quotations', section: 'Sales', anyOf: [P.quotationRead], order: 10 },
    { to: '/warranties', label: 'Warranties', section: 'Sales', anyOf: [P.warrantyRead], order: 20 },
  ],
};
