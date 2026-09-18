import { PassThrough } from 'node:stream';
import { actor } from '../testing/fixtures';
import { CommsController } from './comms/interface/http/comms.controller';
import { SearchController } from './search/interface/http/search.controller';
import { AnalyticsController } from './analytics/interface/http/analytics.controller';
import { DashboardController } from './dashboard/interface/http/dashboard.controller';
import { PipelineController } from './pipeline/interface/http/pipeline.controller';
import { StageChangesController } from './pipeline/interface/http/stage-changes.controller';
import { TimelineController } from './activities/interface/http/timeline.controller';
import { TracksController } from './audit/interface/http/tracks.controller';
import { NotificationsController } from './notifications/interface/http/notifications.controller';
import { ReportExportController } from './reporting/interface/http/report-export.controller';
import { AnalyticsReportController } from './reporting/interface/http/analytics-report.controller';
import { TrackReportController } from './reporting/interface/http/track-report.controller';
import { StaffController } from './directory/interface/http/staff.controller';
import { TeamController } from './directory/interface/http/team.controller';
import { WarrantiesController } from './warranties/interface/http/warranties.controller';
import { LeadWarrantiesController } from './warranties/interface/http/lead-warranties.controller';
import { PublicWarrantyController } from './warranties/interface/http/public-warranty.controller';
import { QuotationsController } from './quotations/interface/http/quotations.controller';
import { LeadQuotationsController } from './quotations/interface/http/lead-quotations.controller';
import { FollowUpsController } from './tasks/interface/http/follow-ups.controller';
import { TargetsController } from './targets/interface/http/targets.controller';
import { PerformanceController } from './performance/interface/http/performance.controller';
import { SiteVisitsController } from './site-visits/interface/http/site-visits.controller';
import { LeadSiteVisitsController } from './site-visits/interface/http/lead-site-visits.controller';
import { StaffReportController } from './reporting/interface/http/staff-report.controller';
import { PipelineReportController } from './reporting/interface/http/pipeline-report.controller';
import { DashboardReportController } from './reporting/interface/http/dashboard-report.controller';
import { FollowUpReportController } from './reporting/interface/http/follow-up-report.controller';
import { QuotationReportController } from './reporting/interface/http/quotation-report.controller';
import { SalesReportController } from './reporting/interface/http/sales-report.controller';
import { SiteVisitReportController } from './reporting/interface/http/site-visit-report.controller';
import { TargetReportController } from './reporting/interface/http/target-report.controller';
import { PerformanceReportController } from './reporting/interface/http/performance-report.controller';
import { WarrantyReportController } from './reporting/interface/http/warranty-report.controller';

function svc(): never {
  return new Proxy(
    {},
    {
      get: () => jest.fn().mockResolvedValue({ ok: true }),
    },
  ) as never;
}

describe('remaining HTTP controllers', () => {
  const user = actor();
  const id = '11111111-1111-4111-8111-111111111111';

  it('delegates feature controllers', () => {
    const comms = new CommsController(svc());
    comms.capabilities();
    comms.listTemplates(user, {});
    comms.createTemplate(user, { channel: 'sms', code: 'hello', name: 'Hello', body: 'Hi {{name}}' } as never);
    comms.updateTemplate(user, id, { name: 'Hello' } as never);
    comms.deleteTemplate(user, id);
    comms.call(user, id, {} as never);
    comms.whatsapp(user, id, {} as never);
    comms.sms(user, id, {} as never);

    const search = new SearchController(svc());
    search.catalog();
    search.query(user, { q: 'door' } as never);

    const analytics = new AnalyticsController(svc());
    analytics.catalog();
    analytics.mine(user);
    analytics.mineFunnel(user);
    analytics.funnel(user);
    analytics.overview(user);
    analytics.widget(user, 'win_rate');

    const dashboard = new DashboardController(svc());
    dashboard.catalog();
    dashboard.mine(user);
    dashboard.overview(user);
    dashboard.widget(user, 'open_leads');

    const pipeline = new PipelineController(svc());
    pipeline.board(user, {});
    pipeline.analytics(user, id);
    const stages = new StageChangesController(svc());
    stages.history(user, id);
    stages.change(user, id, { stageId: id } as never);

    const timeline = new TimelineController(svc());
    timeline.catalog();
    timeline.list(user, {});
    timeline.leadTimeline(user, id, {});
    timeline.addSiteVisit(user, id, {} as never);
    timeline.sendQuotation(user, id, {} as never);

    const tracks = new TracksController(svc());
    tracks.catalog();
    tracks.list(user, {});

    const notifications = new NotificationsController(svc(), svc());
    notifications.list(user, {});
    notifications.catalog();
    notifications.listPreferences(user);
    notifications.upsertPreference(user, {} as never);
    notifications.registerDevice(user, {} as never);
    notifications.revokeDevice(user, 'dev-1');
    notifications.markRead(user, id);

    const exports = new ReportExportController({
      build: jest.fn().mockResolvedValue({
        mimeType: 'text/csv',
        fileName: 'leads.csv',
        bytes: Buffer.from('a'),
      }),
    } as never);
    const res = { setHeader: jest.fn(), send: jest.fn() };
    void exports.leads(user, { format: 'csv' } as never, res as never);
    void exports.followUps(user, { format: 'csv' } as never, res as never);
    void exports.quotations(user, { format: 'csv' } as never, res as never);
    void exports.sales(user, { format: 'csv' } as never, res as never);
    void exports.performance(user, { format: 'csv' } as never, res as never);
    void exports.analytics(user, { format: 'csv' } as never, res as never);
    void exports.funnel(user, { format: 'csv' } as never, res as never);
    void exports.tracks(user, { format: 'csv' } as never, res as never);
  });

  it('delegates directory, warranties, quotations, tasks, targets, performance, visits, reports', () => {
    const staff = new StaffController(svc());
    staff.list(user, {});
    staff.create(user, {} as never);
    staff.get(user, id);
    staff.update(user, id, {} as never);
    staff.setStatus(user, id, {} as never);
    staff.assignRoles(user, id, {} as never);
    staff.assignTeams(user, id, {} as never);
    const team = new TeamController(svc());
    team.list(user);
    team.create(user, {} as never);
    team.get(user, id);
    team.update(user, id, {} as never);
    team.remove(user, id);
    team.replaceMembers(user, id, {} as never);

    const warranties = new WarrantiesController(svc());
    warranties.catalog(user);
    warranties.list(user, {});
    warranties.create(user, {} as never);
    warranties.qr(user, id);
    warranties.pdf(user, id);
    warranties.get(user, id);
    warranties.update(user, id, {} as never);
    warranties.changeStatus(user, id, {} as never);
    new LeadWarrantiesController(svc()).listForLead(user, id);
    const publicWarranty = new PublicWarrantyController({
      portalHomeHtml: () => '<html></html>',
      portalScript: () => '/* js */',
      portalNotFoundHtml: () => 'not found',
      publicViewHtml: jest.fn().mockResolvedValue('<p>ok</p>'),
      publicPdfFile: jest.fn().mockResolvedValue({ fileName: 'w.pdf', bytes: Buffer.from('x') }),
      verifyPublic: jest.fn().mockResolvedValue({ valid: true }),
    } as never);
    const res = Object.assign(new PassThrough(), {
      type: jest.fn().mockReturnThis(),
      send: jest.fn(),
      status: jest.fn().mockReturnThis(),
      setHeader: jest.fn(),
    });
    publicWarranty.home(res as never);
    publicWarranty.portalScript(res as never);
    publicWarranty.jsqr(res as never);
    void publicWarranty.view('token', res as never);
    void publicWarranty.pdf('token', res as never);
    publicWarranty.verify('token');

    const quotations = new QuotationsController(svc(), svc());
    quotations.catalog(user);
    quotations.dashboard(user);
    quotations.run(user);
    quotations.list(user, {});
    quotations.create(user, {} as never);
    quotations.get(user, id);
    quotations.update(user, id, {} as never);
    quotations.remove(user, id);
    quotations.send(user, id, {} as never);
    quotations.scheduleFollowUp(user, id, {} as never);
    quotations.changeStatus(user, id, {} as never);
    new LeadQuotationsController(svc()).listForLead(user, id);

    const followUps = new FollowUpsController(svc(), svc());
    followUps.catalog();
    followUps.dashboard(user);
    followUps.gaps(user);
    followUps.run(user);
    followUps.list(user, {});
    followUps.create(user, {} as never);
    followUps.get(user, id);
    followUps.update(user, id, {} as never);
    followUps.reschedule(user, id, {} as never);
    followUps.complete(user, id, {} as never);

    const targets = new TargetsController(svc());
    targets.catalog(user);
    targets.progress(user);
    targets.list(user, {});
    targets.create(user, {} as never);
    targets.get(user, id);
    targets.update(user, id, {} as never);
    targets.remove(user, id);

    const performance = new PerformanceController(svc());
    performance.catalog(user);
    performance.board(user, {});
    performance.me(user, {});
    performance.get(user, id, {});

    const visits = new SiteVisitsController(svc());
    visits.catalog();
    visits.list(user, {});
    visits.create(user, {} as never);
    visits.get(user, id);
    visits.update(user, id, {} as never);
    visits.checkIn(user, id, {} as never);
    visits.checkOut(user, id, {} as never);
    visits.notes(user, id, {} as never);
    visits.feedback(user, id, {} as never);
    visits.complete(user, id, {} as never);
    visits.cancel(user, id, {} as never);
    visits.noShow(user, id, {} as never);
    visits.addPhoto(user, id, {} as never);
    visits.photo(user, id, id);
    visits.removePhoto(user, id, id);
    new LeadSiteVisitsController(svc()).listForLead(user, id);

    new AnalyticsReportController(svc()).report(user);
    new AnalyticsReportController(svc()).mine(user);
    new AnalyticsReportController(svc()).funnel(user);
    new AnalyticsReportController(svc()).mineFunnel(user);
    new TrackReportController(svc()).report(user, {});
    new StaffReportController(svc()).staff(user);
    new PipelineReportController(svc()).analytics(user, id);
    new DashboardReportController(svc()).report(user);
    new DashboardReportController(svc()).mine(user);
    new FollowUpReportController(svc()).report(user, {});
    new QuotationReportController(svc()).report(user, {});
    new SalesReportController(svc()).report(user, {});
    new SiteVisitReportController(svc()).report(user, {});
    new TargetReportController(svc()).report(user, {});
    new PerformanceReportController(svc()).report(user, {});
    new WarrantyReportController(svc()).report(user);
  });
});
