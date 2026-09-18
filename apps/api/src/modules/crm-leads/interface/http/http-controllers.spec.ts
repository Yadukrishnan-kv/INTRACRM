import { actor } from '../../../../testing/fixtures';
import { LeadsController } from './leads.controller';
import { BillingController } from '../../../billing/interface/http/billing.controller';
import { BillingWebhookController } from '../../../billing/interface/http/billing-webhook.controller';
import { SyncController } from '../../../sync/interface/http/sync.controller';
import { LeadReportController } from '../../../reporting/interface/http/lead-report.controller';
import { CatalogController } from '../../../catalog/interface/http/catalog.controller';

describe('HTTP controllers', () => {
  const user = actor();

  it('delegates lead routes', () => {
    const leads = {
      lookups: jest.fn(),
      list: jest.fn(),
      create: jest.fn(),
      get: jest.fn(),
      update: jest.fn(),
      assign: jest.fn(),
      remove: jest.fn(),
      listAssignments: jest.fn(),
      listTracks: jest.fn(),
      listActivities: jest.fn(),
      addActivity: jest.fn(),
      listFollowUps: jest.fn(),
      addFollowUp: jest.fn(),
      completeFollowUp: jest.fn(),
      report: jest.fn(),
    };
    const controller = new LeadsController(leads as never);
    controller.lookups(user);
    controller.list(user, {});
    controller.create(user, { title: 'Lead' } as never);
    controller.get(user, 'lead-1');
    controller.update(user, 'lead-1', { title: 'Lead 2' });
    controller.assign(user, 'lead-1', { ownerMembershipId: 'm1' });
    controller.remove(user, 'lead-1');
    controller.listAssignments(user, 'lead-1');
    controller.listTracks(user, 'lead-1', {});
    controller.listActivities(user, 'lead-1', {});
    controller.addActivity(user, 'lead-1', { type: 'note', body: 'hi' } as never);
    controller.listFollowUps(user, 'lead-1');
    controller.addFollowUp(user, 'lead-1', { dueAt: new Date().toISOString() } as never);
    controller.completeFollowUp(user, 'lead-1', 'fu-1', {} as never);
    expect(leads.get).toHaveBeenCalledWith(user, 'lead-1');
    new LeadReportController(leads as never).report(user, {});
    expect(leads.report).toHaveBeenCalled();
  });

  it('delegates billing, webhook, sync, and catalog', () => {
    const billing = {
      capabilities: jest.fn(),
      snapshot: jest.fn(),
      syncCustomer: jest.fn(),
      syncInvoice: jest.fn(),
      refreshPayment: jest.fn(),
      handleWebhook: jest.fn(),
    };
    const billingHttp = new BillingController(billing as never);
    billingHttp.capabilities();
    billingHttp.snapshot(user, 'lead-1');
    billingHttp.syncCustomer(user, 'lead-1');
    billingHttp.syncInvoice(user, 'q-1');
    billingHttp.refreshPayment(user, 'inv-1');
    new BillingWebhookController(billing as never).handle('http', 'sig', { event: 'customer.upserted', tenantId: user.tenantId ?? '' }, { rawBody: Buffer.from('{}') } as never);

    const sync = { pull: jest.fn() };
    new SyncController(sync as never).pull(user, {});
    expect(sync.pull).toHaveBeenCalled();

    const catalog = {
      overview: jest.fn(),
      lookups: jest.fn(),
      listProducts: jest.fn(),
      createProduct: jest.fn(),
      updateProduct: jest.fn(),
      deleteProduct: jest.fn(),
      listCategories: jest.fn(),
      createCategory: jest.fn(),
      updateCategory: jest.fn(),
      deleteCategory: jest.fn(),
      listSources: jest.fn(),
      createSource: jest.fn(),
      updateSource: jest.fn(),
      deleteSource: jest.fn(),
      listQualities: jest.fn(),
      createQuality: jest.fn(),
      updateQuality: jest.fn(),
      deleteQuality: jest.fn(),
      listLeadStatuses: jest.fn(),
      createLeadStatus: jest.fn(),
      updateLeadStatus: jest.fn(),
      deleteLeadStatus: jest.fn(),
      listWarrantyPeriods: jest.fn(),
      createWarrantyPeriod: jest.fn(),
      updateWarrantyPeriod: jest.fn(),
      deleteWarrantyPeriod: jest.fn(),
    };
    const catalogHttp = new CatalogController(catalog as never);
    catalogHttp.overview(user);
    catalogHttp.lookups(user);
    catalogHttp.listProducts(user, {});
    catalogHttp.createProduct(user, { name: 'Door', sku: 'D1' } as never);
    catalogHttp.updateProduct(user, 'id', { name: 'Door' } as never);
    catalogHttp.deleteProduct(user, 'id');
    catalogHttp.listCategories(user, {});
    catalogHttp.createCategory(user, { name: 'Cat' } as never);
    catalogHttp.updateCategory(user, 'id', { name: 'Cat' } as never);
    catalogHttp.deleteCategory(user, 'id');
    catalogHttp.listSources(user, {});
    catalogHttp.createSource(user, { name: 'Web', code: 'web' });
    catalogHttp.updateSource(user, 'id', { name: 'Web' });
    catalogHttp.deleteSource(user, 'id');
    catalogHttp.listQualities(user, {});
    catalogHttp.createQuality(user, { name: 'Hot', code: 'hot' });
    catalogHttp.updateQuality(user, 'id', { name: 'Hot' });
    catalogHttp.deleteQuality(user, 'id');
    catalogHttp.listLeadStatuses(user);
    catalogHttp.createLeadStatus(user, { name: 'New', code: 'new' } as never);
    catalogHttp.updateLeadStatus(user, 'id', { name: 'New' } as never);
    catalogHttp.deleteLeadStatus(user, 'id');
    catalogHttp.listWarrantyPeriods(user, {});
    catalogHttp.createWarrantyPeriod(user, { name: '1Y', months: 12 } as never);
    catalogHttp.updateWarrantyPeriod(user, 'id', { name: '1Y' } as never);
    catalogHttp.deleteWarrantyPeriod(user, 'id');
    expect(catalog.overview).toHaveBeenCalledWith(user);
  });
});
