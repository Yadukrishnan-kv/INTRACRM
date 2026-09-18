import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ErrorCodes } from '../common/exceptions/error-codes';
import { actor, MEMBERSHIP_A, TENANT_A } from '../testing/fixtures';
import { createPrismaMock } from '../testing/prisma-mock';
import { membershipRow, namedRow } from '../testing/rows';
import { configStub } from '../testing/config-stub';
import { DashboardService } from './dashboard/application/dashboard.service';
import { AnalyticsService } from './analytics/application/analytics.service';
import { PerformanceService } from './performance/application/performance.service';
import { TargetsService } from './targets/application/targets.service';
import { NotificationsService } from './notifications/application/notifications.service';
import { PushTokensService } from './notifications/application/push-tokens.service';
import { SearchService } from './search/application/search.service';
import { TracksService } from './audit/application/tracks.service';
import { SyncService } from './sync/application/sync.service';
import { WarrantiesService } from './warranties/application/warranties.service';
import { QuotationsService } from './quotations/application/quotations.service';
import { FollowUpsService } from './tasks/application/follow-ups.service';
import { FollowUpEngineService } from './tasks/application/follow-up-engine.service';
import { SiteVisitsService } from './site-visits/application/site-visits.service';
import { PipelineService } from './pipeline/application/pipeline.service';
import { TimelineService } from './activities/application/timeline.service';
import { TimelineWriter } from './activities/application/timeline.writer';
import { AuditWriter, trackPayload } from './audit/application/audit.writer';
import { StaffService } from './directory/application/staff.service';
import { TeamService } from './directory/application/team.service';
import { ReportExportService } from './reporting/application/report-export.service';
import { CommsService } from './comms/application/comms.service';
import { CommsGateway } from './comms/application/comms.gateway';
import { LeadCatalogService } from './crm-leads/application/lead-catalog.service';
import { QuotationFollowUpService } from './quotations/application/quotation-follow-up.service';
import { LocalFileStore } from './site-visits/infrastructure/local-file-store';
import { NotificationWriter } from './notifications/application/notification.writer';
import { PinoLogger } from '../common/logging/pino-logger';
import { summarizeStaff } from './directory/application/staff-report.service';

describe('application services coverage', () => {
  const prisma = createPrismaMock();
  const user = actor();

  beforeEach(() => {
    (prisma.tenant.findFirst as jest.Mock).mockResolvedValue({
      id: TENANT_A,
      timezone: 'Asia/Kolkata',
    });
    (prisma.membership.findMany as jest.Mock).mockResolvedValue([membershipRow()]);
  });

  it('builds dashboard, analytics, and performance boards from empty aggregates', async () => {
    const performance = new PerformanceService(prisma as never);
    const targets = new TargetsService(prisma as never);
    const dashboard = new DashboardService(prisma as never, performance, targets);
    const analytics = new AnalyticsService(prisma as never);

    expect(dashboard.catalog().widgets.length).toBeGreaterThan(0);
    expect(analytics.catalog().metrics.length).toBeGreaterThan(0);
    await expect(performance.catalog(user)).resolves.toMatchObject({ teams: [] });

    const board = await dashboard.overview(user);
    expect(board.widgets.leads.primary).toBe(0);
    await expect(dashboard.widget(user, 'leads')).resolves.toMatchObject({
      widget: expect.objectContaining({ code: 'leads' }),
    });
    await expect(dashboard.widget(user, 'nope')).rejects.toMatchObject({ code: ErrorCodes.BAD_REQUEST });
    await expect(dashboard.report(user)).resolves.toBeDefined();
    await expect(dashboard.mine(user)).resolves.toMatchObject({
      membership: expect.objectContaining({ id: MEMBERSHIP_A }),
    });

    const analyticsBoard = await analytics.overview(user);
    expect(analyticsBoard.widgets.leads).toBeDefined();
    await expect(analytics.widget(user, 'leads')).resolves.toBeDefined();
    await expect(analytics.mine(user)).resolves.toBeDefined();
    await expect(analytics.report(user)).resolves.toBeDefined();
    await expect(analytics.funnelReport(user)).resolves.toBeDefined();
    await expect(analytics.mineFunnel(user)).resolves.toBeDefined();

    await expect(performance.board(user, {})).resolves.toMatchObject({ rankedOutOf: 1 });
    await expect(performance.me(user, {})).resolves.toMatchObject({
      staff: expect.objectContaining({ membershipId: MEMBERSHIP_A }),
    });
    await expect(performance.report(user, {})).resolves.toMatchObject({ totals: expect.any(Object) });
    await expect(targets.catalog(user)).resolves.toMatchObject({ staff: expect.any(Array) });
    await expect(targets.progress(user)).resolves.toBeDefined();
    await expect(targets.currentForStaff(user)).resolves.toEqual([]);
    await expect(targets.list(user, {})).resolves.toMatchObject({ data: [] });
    await expect(targets.report(user, {})).resolves.toBeDefined();
  });

  it('covers notifications, search, tracks, sync, and writers', async () => {
    const notifications = new NotificationsService(prisma as never);
    expect(notifications.catalog().events.length).toBeGreaterThan(0);
    await expect(notifications.list(user, {})).resolves.toMatchObject({ data: [] });
    await expect(notifications.listPreferences(user)).resolves.toMatchObject({
      data: expect.arrayContaining([expect.objectContaining({ eventType: 'lead.assigned' })]),
    });
    (prisma.notification.findFirst as jest.Mock).mockResolvedValue({
      id: 'n1',
      userId: user.userId,
      tenantId: TENANT_A,
      eventType: 'lead.assigned',
      title: 'Assigned',
      body: 'LD-1',
      resourceType: 'lead',
      resourceId: 'lead-1',
      readAt: new Date(),
      createdAt: new Date(),
    });
    await expect(notifications.markRead(user, 'n1')).resolves.toBeDefined();
    (prisma.notificationPreference.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.notificationPreference.create as jest.Mock).mockResolvedValue({
      eventType: 'lead.assigned',
      inApp: true,
      push: true,
    });
    await expect(
      notifications.upsertPreference(user, {
        eventType: 'lead.assigned',
        inAppEnabled: true,
        pushEnabled: false,
      } as never),
    ).resolves.toBeDefined();

    const push = new PushTokensService(prisma as never);
    await push.register(user, { deviceId: 'dev-1', platform: 'android', token: 'tok' } as never);
    (prisma.devicePushToken.findFirst as jest.Mock).mockResolvedValue({ id: 'tok-1' });
    await push.revokeDevice(user, 'dev-1');
    await push.revokeAllForUser(user.userId);

    const redis = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue('OK'),
    };
    const search = new SearchService(prisma as never, redis as never);
    expect(search.catalog().fields.length).toBeGreaterThan(0);
    await expect(search.search(user, { q: '' })).resolves.toMatchObject({ hits: [] });
    await expect(search.search(user, { q: 'Acme Doors' })).resolves.toMatchObject({ hits: [] });

    const tracks = new TracksService(prisma as never);
    expect(tracks.catalog().actions.length).toBeGreaterThan(0);
    await expect(tracks.list(user, {})).resolves.toMatchObject({ data: [] });
    await expect(tracks.report(user, {})).resolves.toBeDefined();

    const sync = new SyncService(prisma as never);
    await expect(sync.pull(user, {})).resolves.toMatchObject({ leads: [], notes: [], followUps: [] });
    await expect(sync.pull(user, { updatedSince: '2026-01-01T00:00:00.000Z', limit: 10 })).resolves.toBeDefined();

    const writer = new TimelineWriter(prisma as never);
    await writer.record({
      tenantId: TENANT_A,
      leadId: 'lead-1',
      actor: user,
      eventCode: 'lead.created',
      subject: 'Created',
    });
    const audit = new AuditWriter(prisma as never);
    await audit.record({
      tenantId: TENANT_A,
      actor: user,
      action: 'create',
      resourceType: 'lead',
      resourceId: 'lead-1',
      after: trackPayload('created'),
    });
    const queue = { add: jest.fn().mockResolvedValue({}) };
    const notify = new NotificationWriter(prisma as never, queue as never);
    (prisma.notificationPreference.findFirst as jest.Mock).mockResolvedValue(null);
    await notify.notify({
      tenantId: TENANT_A,
      userId: user.userId,
      eventType: 'lead.assigned',
      title: 'Lead Assigned',
      body: 'LD-1',
      resourceType: 'lead',
      resourceId: 'lead-1',
    });
    expect(queue.add).toHaveBeenCalled();
  });

  it('covers catalog-style list endpoints and directory views', async () => {
    const warranties = new WarrantiesService(prisma as never, { record: jest.fn() } as never, configStub() as never);
    await expect(warranties.catalog(user)).resolves.toMatchObject({ products: [] });
    await expect(warranties.list(user, {})).resolves.toMatchObject({ data: [] });
    expect(warranties.portalHomeHtml()).toContain('html');
    expect(warranties.portalScript().length).toBeGreaterThan(10);
    expect(warranties.portalNotFoundHtml()).toContain('html');
    await expect(warranties.report(user)).resolves.toBeDefined();

    const quotations = new QuotationsService(
      prisma as never,
      { record: jest.fn() } as never,
      { dashboard: jest.fn(), tickForActor: jest.fn() } as never,
      { record: jest.fn() } as never,
      { syncWonQuotation: jest.fn() } as never,
    );
    await expect(quotations.catalog(user)).resolves.toMatchObject({ products: [] });
    await expect(quotations.list(user, {})).resolves.toMatchObject({ data: [] });
    await expect(quotations.report(user, {})).resolves.toBeDefined();
    await expect(quotations.salesReport(user, {})).resolves.toBeDefined();

    const engine = new FollowUpEngineService(prisma as never, { notify: jest.fn() } as never);
    const followUps = new FollowUpsService(
      prisma as never,
      { record: jest.fn() } as never,
      engine,
      { record: jest.fn() } as never,
    );
    expect(followUps.catalog().types.length).toBeGreaterThan(0);
    await expect(followUps.list(user, {})).resolves.toMatchObject({ data: [] });
    await expect(followUps.report(user, {})).resolves.toBeDefined();
    await expect(engine.dashboard(user)).resolves.toMatchObject({ widgets: expect.any(Array) });
    await expect(engine.tick()).resolves.toMatchObject({ tenants: expect.any(Number) });

    const files = new LocalFileStore(configStub({ storageRoot: join(tmpdir(), 'intra-test-store') }) as never);
    const visits = new SiteVisitsService(prisma as never, { record: jest.fn() } as never, files);
    expect(visits.catalog()).toBeDefined();
    await expect(visits.list(user, {})).resolves.toMatchObject({ data: [] });
    await expect(visits.report(user, {})).resolves.toBeDefined();

    const pipeline = new PipelineService(
      prisma as never,
      { ensureDefaults: jest.fn().mockResolvedValue({ pipeline: { id: 'p1', name: 'Default', code: 'default' } }) } as never,
      { record: jest.fn() } as never,
      { record: jest.fn() } as never,
    );
    await expect(pipeline.board(user, {})).resolves.toMatchObject({ columns: [] });
    await expect(pipeline.analytics(user)).resolves.toBeDefined();

    const timeline = new TimelineService(prisma as never, { record: jest.fn() } as never);
    expect(timeline.catalog().length).toBeGreaterThan(0);
    await expect(timeline.list(user, {})).resolves.toMatchObject({ data: [] });

    const teams = new TeamService(prisma as never);
    (prisma.team.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'team-1',
        code: 'sales',
        name: 'Sales',
        isActive: true,
        members: [
          {
            membership: {
              id: MEMBERSHIP_A,
              status: 'active',
              deletedAt: null,
              user: { fullName: 'Ada', email: 'a@b.c' },
            },
          },
        ],
      },
    ]);
    await expect(teams.list(TENANT_A)).resolves.toEqual([
      expect.objectContaining({ code: 'sales', memberCount: 1 }),
    ]);

    const staff = new StaffService(prisma as never, { invalidate: jest.fn() } as never, teams);
    (prisma.membership.findMany as jest.Mock).mockResolvedValue([
      {
        id: MEMBERSHIP_A,
        status: 'active',
        designation: 'AE',
        employeeCode: 'E-1',
        user: { id: user.userId, fullName: 'Ada', email: 'a@b.c', lastLoginAt: null },
        roles: [{ role: { id: 'r1', code: 'tenant.founder', name: 'Founder', deletedAt: null } }],
        teamLinks: [],
        team: { id: 'team-1', code: 'sales', name: 'Sales', deletedAt: null },
      },
    ]);
    const roster = await staff.list(user, { q: 'Ada' });
    expect(roster[0]?.user.fullName).toBe('Ada');
    expect(summarizeStaff(roster).totals.total).toBe(1);

    const qFollow = new QuotationFollowUpService(prisma as never, { notify: jest.fn() } as never);
    await expect(qFollow.dashboard(user)).resolves.toBeDefined();
    await expect(qFollow.tick()).resolves.toMatchObject({ tenants: expect.any(Number) });
  });

  it('seeds catalog defaults, exports reports, and sends device comms', async () => {
    const catalogPrisma = createPrismaMock();
    (catalogPrisma.pipeline.create as jest.Mock).mockResolvedValue({ id: 'p1', code: 'default', name: 'Default' });
    (catalogPrisma.pipelineStage.findFirst as jest.Mock).mockImplementation(async (args: { where: { code?: string; isOpen?: boolean } }) => {
      if (args.where.code === 'new' || args.where.isOpen) {
        return { id: 's-new', code: 'new', isOpen: true };
      }
      return null;
    });
    const leadCatalog = new LeadCatalogService(catalogPrisma as never);
    await expect(leadCatalog.ensureDefaults(TENANT_A, user.userId)).resolves.toMatchObject({
      pipeline: expect.objectContaining({ id: 'p1' }),
      firstStage: expect.objectContaining({ code: 'new' }),
    });

    const generatedAt = new Date().toISOString();
    const exports = new ReportExportService(
      {
        report: jest.fn().mockResolvedValue({
          generatedAt,
          totals: {
            total: 0,
            open: 0,
            won: 0,
            lost: 0,
            unqualified: 0,
            recycled: 0,
            unassigned: 0,
            estimatedValueMinor: 0,
            wonValueMinor: 0,
            winRateBps: null,
          },
          byLifecycle: [],
          byQuality: [],
          bySource: [],
          byOwner: [],
          byStage: [],
          byCity: [],
        }),
      } as never,
      {
        report: jest.fn().mockResolvedValue({
          generatedAt,
          totals: {
            total: 0,
            pending: 0,
            completed: 0,
            cancelled: 0,
            skipped: 0,
            overdue: 0,
            today: 0,
            upcoming: 0,
            rescheduled: 0,
            completionRateBps: null,
          },
          byStatus: [],
          byType: [],
          byAssignee: [],
        }),
      } as never,
      {
        report: jest.fn().mockResolvedValue({
          generatedAt,
          totals: {
            total: 0,
            draft: 0,
            sent: 0,
            followUp: 0,
            customerDeciding: 0,
            negotiation: 0,
            approved: 0,
            won: 0,
            lost: 0,
            openValueMinor: 0,
            wonValueMinor: 0,
            lostValueMinor: 0,
            winRateBps: null,
            pending: 0,
            pendingValueMinor: 0,
            overdueReminders: 0,
            closingSoon: 0,
            closingOverdue: 0,
            noFollowUp: 0,
            averagePredictionBps: null,
          },
          byStatus: [],
          byAssignee: [],
        }),
        salesReport: jest.fn().mockResolvedValue({
          generatedAt,
          totals: {
            deals: 0,
            revenueMinor: 0,
            averageDealMinor: null,
            lostDeals: 0,
            lostValueMinor: 0,
            closedDeals: 0,
            winRateBps: null,
          },
          byAssignee: [],
          byMonth: [],
        }),
      } as never,
      {
        report: jest.fn().mockResolvedValue({
          generatedAt,
          period: { label: 'Aug 2026' },
          totals: {
            staff: 0,
            scored: 0,
            averageScoreBps: null,
            outstanding: 0,
            strong: 0,
            average: 0,
            needsWork: 0,
            noData: 0,
          },
          top: [],
          byTeam: [],
        }),
      } as never,
      {
        report: jest.fn().mockResolvedValue({
          generatedAt,
          today: '2026-08-17',
          month: { label: 'Aug 2026' },
          funnel: {
            today: {
              steps: [],
              conversion: {
                leadToQualifiedBps: null,
                qualifiedToQuotationBps: null,
                quotationToWonBps: null,
                overallBps: null,
              },
            },
            month: {
              steps: [],
              conversion: {
                leadToQualifiedBps: null,
                qualifiedToQuotationBps: null,
                quotationToWonBps: null,
                overallBps: null,
              },
            },
          },
          widgets: {},
        }),
        funnelReport: jest.fn().mockResolvedValue({
          generatedAt,
          month: { label: 'Aug 2026' },
          conversion: {
            leadToQualifiedBps: null,
            qualifiedToQuotationBps: null,
            quotationToNegotiationBps: null,
            negotiationToWonBps: null,
            overallBps: null,
          },
          stages: [],
        }),
      } as never,
      {
        report: jest.fn().mockResolvedValue({
          generatedAt,
          totals: { total: 0, create: 0, update: 0, delete: 0, assign: 0, statusChange: 0 },
          byAction: [],
          byResource: [],
          byActor: [],
          byDay: [],
        }),
      } as never,
    );
    for (const dataset of ['leads', 'follow-ups', 'quotations', 'sales', 'performance', 'analytics', 'funnel', 'tracks'] as const) {
      const file = await exports.build(user, dataset, { format: 'csv' });
      expect(file.mimeType).toContain('csv');
      expect(file.bytes.length).toBeGreaterThan(0);
    }
    await expect(exports.build(user, 'leads', { format: 'xlsx' })).resolves.toMatchObject({
      mimeType: expect.stringContaining('spreadsheet'),
    });
    await expect(exports.build(user, 'leads', { format: 'pdf' })).resolves.toMatchObject({
      mimeType: expect.stringContaining('pdf'),
    });

    const gateway = new CommsGateway(configStub() as never, { warn: jest.fn() } as unknown as PinoLogger);
    await expect(gateway.sendSms({ toE164: '+919999999999', body: 'Hi' })).resolves.toMatchObject({
      mode: 'device',
    });
    await expect(gateway.sendWhatsapp({ toE164: '+919999999999', body: 'Hi' })).resolves.toMatchObject({
      mode: 'device',
    });
    const comms = new CommsService(prisma as never, gateway);
    (prisma.messageTemplate.findMany as jest.Mock).mockResolvedValue([namedRow({ code: 'hello', name: 'Hello' })]);
    await expect(comms.listTemplates(user)).resolves.toHaveLength(1);
    (prisma.messageTemplate.findFirst as jest.Mock).mockResolvedValue(null);
    await expect(
      comms.createTemplate(user, { channel: 'sms', code: 'hello', name: 'Hello', body: 'Hi {{name}}' } as never),
    ).resolves.toBeDefined();
  });
});
