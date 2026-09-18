import { actor, MEMBERSHIP_A, TENANT_A } from '../testing/fixtures';
import { createPrismaMock } from '../testing/prisma-mock';
import { membershipRow } from '../testing/rows';
import { configStub } from '../testing/config-stub';
import { QuotationsService } from './quotations/application/quotations.service';
import { WarrantiesService } from './warranties/application/warranties.service';
import { SiteVisitsService } from './site-visits/application/site-visits.service';
import { FollowUpsService } from './tasks/application/follow-ups.service';
import { FollowUpEngineService } from './tasks/application/follow-up-engine.service';
import { TargetsService } from './targets/application/targets.service';
import { PipelineService } from './pipeline/application/pipeline.service';
import { CommsService } from './comms/application/comms.service';
import { RbacService } from './identity/application/rbac.service';
import { TeamService } from './directory/application/team.service';
import { StaffService } from './directory/application/staff.service';
import { CatalogService } from './catalog/application/catalog.service';

const now = new Date('2026-08-17T10:00:00.000Z');

function quotationRow() {
  return {
    id: 'q-1',
    quotationNumber: 'QT-0001',
    title: 'Doors',
    status: 'draft',
    currency: 'INR',
    subtotalMinor: 10000n,
    discountMinor: 0n,
    taxMinor: 0n,
    totalMinor: 10000n,
    validUntilOn: null,
    notes: null,
    terms: null,
    sentAt: null,
    followUpAt: null,
    customerDecidingAt: null,
    negotiationAt: null,
    approvedAt: null,
    wonAt: null,
    lostAt: null,
    lostReason: null,
    nextFollowUpAt: null,
    remindAt: null,
    expectedCloseOn: null,
    lastFollowedUpAt: null,
    followUpNote: null,
    assignedToMembershipId: MEMBERSHIP_A,
    assignee: { user: { fullName: 'Ada' } },
    leadId: 'lead-1',
    lead: { id: 'lead-1', leadNumber: 'LD-1', title: 'Need a door', customerName: 'Acme' },
    items: [
      {
        id: 'qi-1',
        productId: null,
        description: 'Door',
        quantity: 1,
        unitPriceMinor: 10000n,
        discountMinor: 0n,
        taxBps: 0,
        lineTotalMinor: 10000n,
        sortOrder: 0,
        deletedAt: null,
        product: null,
      },
    ],
    version: 1,
    createdAt: now,
  };
}

function warrantyRow() {
  return {
    id: 'w-1',
    tenantId: TENANT_A,
    cardNumber: 'WR-0001',
    verifyToken: 'a'.repeat(48),
    status: 'active',
    serialNumber: null,
    purchasedOn: null,
    warrantyStartOn: new Date('2026-01-01T00:00:00.000Z'),
    warrantyEndOn: new Date('2027-01-01T00:00:00.000Z'),
    coverageNotes: null,
    leadId: 'lead-1',
    quotationId: null,
    version: 1,
    lead: { leadNumber: 'LD-1', title: 'Need a door', customerName: 'Acme' },
    quotation: null,
    issuer: { user: { fullName: 'Ada' } },
    items: [
      {
        id: 'wi-1',
        productId: null,
        description: 'Door',
        serialNumber: null,
        quantity: 1,
        product: null,
      },
    ],
    tenant: { name: 'Intra' },
  };
}

function visitRow() {
  return {
    id: 'v-1',
    status: 'scheduled',
    purpose: 'Measure',
    notes: null,
    outcome: null,
    scheduledAt: now,
    checkedInAt: null,
    checkedOutAt: null,
    addressLine1: null,
    city: 'Pune',
    state: null,
    postalCode: null,
    scheduledLat: null,
    scheduledLng: null,
    checkInLat: null,
    checkInLng: null,
    checkInAccuracyM: null,
    checkOutLat: null,
    checkOutLng: null,
    checkOutAccuracyM: null,
    customerFeedback: null,
    customerRating: null,
    feedbackCapturedAt: null,
    assignedToMembershipId: MEMBERSHIP_A,
    version: 1,
    leadId: 'lead-1',
    assignee: { user: { fullName: 'Ada' } },
    lead: { id: 'lead-1', leadNumber: 'LD-1', title: 'Need a door', customerName: 'Acme' },
    photos: [],
    _count: { photos: 0 },
  };
}

function followUpRow() {
  return {
    id: 'fu-1',
    type: 'call',
    title: 'Call back',
    notes: null,
    dueAt: now,
    remindAt: null,
    priority: 2,
    status: 'pending',
    assignedToMembershipId: MEMBERSHIP_A,
    completedAt: null,
    rescheduleCount: 0,
    lastRescheduledAt: null,
    version: 1,
    leadId: 'lead-1',
    assignee: { user: { fullName: 'Ada' }, userId: actor().userId },
    lead: { id: 'lead-1', leadNumber: 'LD-1', title: 'Need a door', customerName: 'Acme' },
  };
}

function targetRow() {
  return {
    id: 'tg-1',
    scopeType: 'tenant',
    scopeId: null,
    productId: null,
    metricCode: 'revenue',
    periodType: 'monthly',
    periodStart: new Date('2026-08-01T00:00:00.000Z'),
    periodEnd: new Date('2026-08-31T00:00:00.000Z'),
    targetValue: 100000,
    notes: null,
    version: 1,
    kpi: { name: 'Revenue', unit: 'inr' },
    product: null,
  };
}

describe('mutation coverage for large services', () => {
  const user = actor();
  const prisma = createPrismaMock();
  const timeline = { record: jest.fn().mockResolvedValue({ id: 'act-1' }) };
  const audit = { record: jest.fn().mockResolvedValue({ id: 'audit-1' }) };

  beforeEach(() => {
    (prisma.tenant.findFirst as jest.Mock).mockResolvedValue({
      id: TENANT_A,
      timezone: 'Asia/Kolkata',
      name: 'Intra',
    });
    (prisma.membership.findFirst as jest.Mock).mockResolvedValue(membershipRow());
    (prisma.lead.findFirst as jest.Mock).mockResolvedValue({
      id: 'lead-1',
      ownerMembershipId: MEMBERSHIP_A,
      title: 'Need a door',
      leadNumber: 'LD-1',
      primaryPhone: '+919999999999',
      stageId: 's1',
      pipelineId: 'p1',
      version: 1,
      source: null,
      stage: { id: 's1', name: 'New', isWon: false, isLost: false, isOpen: true },
      owner: { user: { fullName: 'Ada' } },
      estimatedValueMinor: 10000n,
      currency: 'INR',
      customerName: 'Acme',
      quality: 'hot',
      lifecycleStatus: 'open',
      updatedAt: now,
    });
  });

  it('creates and reads quotations, warranties, visits, follow-ups, and targets', async () => {
    (prisma.quotation.create as jest.Mock).mockResolvedValue({ id: 'q-1' });
    (prisma.quotation.findFirst as jest.Mock).mockResolvedValue(quotationRow());
    const quotations = new QuotationsService(
      prisma as never,
      timeline as never,
      { dashboard: jest.fn(), tickForActor: jest.fn() } as never,
      audit as never,
      { syncWonQuotation: jest.fn() } as never,
    );
    await expect(
      quotations.create(user, {
        leadId: 'lead-1',
        items: [{ description: 'Door', quantity: 1, unitPriceMinor: 10000 }],
      } as never),
    ).resolves.toMatchObject({ quotationNumber: 'QT-0001' });
    await expect(quotations.get(user, 'q-1')).resolves.toMatchObject({ status: 'draft' });
    await expect(quotations.listForLead(user, 'lead-1')).resolves.toEqual([]);
    await expect(quotations.remove(user, 'q-1')).resolves.toMatchObject({ deleted: true });

    (prisma.warrantyCard.create as jest.Mock).mockResolvedValue({ id: 'w-1' });
    (prisma.warrantyCard.findFirst as jest.Mock).mockResolvedValue(warrantyRow());
    const warranties = new WarrantiesService(prisma as never, timeline as never, configStub() as never);
    await expect(
      warranties.create(user, {
        leadId: 'lead-1',
        warrantyStartOn: '2026-01-01',
        warrantyEndOn: '2027-01-01',
        items: [{ description: 'Door', quantity: 1 }],
      } as never),
    ).resolves.toMatchObject({ cardNumber: 'WR-0001' });
    await expect(warranties.get(user, 'w-1')).resolves.toMatchObject({ status: 'active' });
    await expect(warranties.listForLead(user, 'lead-1')).resolves.toEqual([]);
    await expect(warranties.verifyPublic('a'.repeat(48))).resolves.toMatchObject({ valid: true });

    (prisma.siteVisit.create as jest.Mock).mockResolvedValue({ id: 'v-1' });
    (prisma.siteVisit.findFirst as jest.Mock).mockResolvedValue(visitRow());
    const visits = new SiteVisitsService(prisma as never, timeline as never, {
      save: jest.fn(),
      remove: jest.fn(),
      resolve: jest.fn(),
    } as never);
    await expect(
      visits.create(user, { leadId: 'lead-1', scheduledAt: now.toISOString(), purpose: 'Measure', city: 'Pune' } as never),
    ).resolves.toMatchObject({ city: 'Pune' });
    await expect(visits.get(user, 'v-1')).resolves.toMatchObject({ status: 'scheduled' });
    await expect(visits.listForLead(user, 'lead-1')).resolves.toEqual([]);

    (prisma.followUp.create as jest.Mock).mockImplementation(async (args: { data: { dueAt: Date } }) => ({
      id: 'fu-1',
      dueAt: args.data.dueAt,
      status: 'pending',
    }));
    (prisma.followUp.findFirst as jest.Mock).mockResolvedValue(followUpRow());
    const followUps = new FollowUpsService(
      prisma as never,
      timeline as never,
      new FollowUpEngineService(prisma as never, { notify: jest.fn() } as never),
      audit as never,
    );
    await expect(
      followUps.create(user, { leadId: 'lead-1', dueAt: now.toISOString(), type: 'call' } as never),
    ).resolves.toMatchObject({ id: 'fu-1' });
    await expect(followUps.get(user, 'fu-1')).resolves.toMatchObject({ status: 'pending' });
    await expect(followUps.listForLead(user, 'lead-1')).resolves.toEqual([]);

    (prisma.kpiDefinition.findUnique as jest.Mock).mockResolvedValue({ code: 'revenue' });
    (prisma.target.create as jest.Mock).mockResolvedValue({ id: 'tg-1' });
    (prisma.target.findFirst as jest.Mock).mockResolvedValue(targetRow());
    const targets = new TargetsService(prisma as never);
    await expect(
      targets.create(user, {
        metricCode: 'revenue',
        scopeType: 'tenant',
        periodType: 'monthly',
        targetValue: 100000,
      } as never),
    ).resolves.toMatchObject({ metricCode: 'revenue' });
    await expect(targets.get(user, 'tg-1')).resolves.toMatchObject({ id: 'tg-1' });
    await expect(targets.remove(user, 'tg-1')).resolves.toEqual({ id: 'tg-1' });
  });

  it('renders warranty QR and PDF artifacts', async () => {
    (prisma.warrantyCard.findFirst as jest.Mock).mockResolvedValue(warrantyRow());
    const warranties = new WarrantiesService(prisma as never, timeline as never, configStub() as never);
    const qr = await warranties.qr(user, 'w-1');
    expect(qr.contentBase64.length).toBeGreaterThan(10);
    const pdf = await warranties.pdf(user, 'w-1');
    expect(pdf.fileName).toContain('WR-0001');
    const publicPdf = await warranties.publicPdfFile('a'.repeat(48));
    expect(publicPdf.bytes.length).toBeGreaterThan(10);
  });

  it('changes pipeline stage, sends a call, and lists RBAC/directory data', async () => {
    const pipeline = new PipelineService(
      prisma as never,
      { ensureDefaults: jest.fn().mockResolvedValue({ pipeline: { id: 'p1', name: 'Default', code: 'default' } }) } as never,
      timeline as never,
      audit as never,
    );
    (prisma.pipelineStage.findFirst as jest.Mock).mockResolvedValue({
      id: 's2',
      name: 'Qualified',
      isWon: false,
      isLost: false,
      isOpen: true,
      code: 'qualified',
      sortOrder: 2,
      winProbabilityBps: 2500,
    });
    (prisma.lead.update as jest.Mock).mockResolvedValue({
      id: 'lead-1',
      leadNumber: 'LD-1',
      title: 'Need a door',
      customerName: 'Acme',
      primaryPhone: '+919999999999',
      quality: 'hot',
      estimatedValueMinor: 10000n,
      currency: 'INR',
      ownerMembershipId: MEMBERSHIP_A,
      owner: { user: { fullName: 'Ada' } },
      stageId: 's2',
      stage: { id: 's2', name: 'Qualified' },
      lifecycleStatus: 'open',
      version: 2,
      updatedAt: now,
    });
    await expect(pipeline.changeStage(user, 'lead-1', { stageId: 's2' } as never)).resolves.toMatchObject({
      stageId: 's2',
    });
    await expect(pipeline.history(user, 'lead-1')).resolves.toEqual([]);

    const comms = new CommsService(prisma as never, {
      startCall: jest.fn().mockResolvedValue({
        ok: true,
        provider: 'device',
        mode: 'device',
        launchUri: 'tel:+919999999999',
        providerMessageId: null,
        error: null,
      }),
      sendSms: jest.fn().mockResolvedValue({
        ok: true,
        provider: 'device',
        mode: 'device',
        launchUri: 'sms:+919999999999',
        providerMessageId: null,
        error: null,
      }),
      capabilities: jest.fn().mockReturnValue({ call: { mode: 'device' } }),
    } as never);
    await expect(comms.call(user, 'lead-1', { notes: 'Calling now' } as never)).resolves.toMatchObject({
      mode: 'device',
    });

    const redis = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn(),
      del: jest.fn(),
      scan: jest.fn().mockResolvedValue(['0', []]),
    };
    const rbac = new RbacService(prisma as never, redis as never);
    (prisma.permission.findMany as jest.Mock).mockResolvedValue([
      { id: 'p1', code: 'lead:read', resource: 'lead', action: 'read', description: null },
    ]);
    (prisma.role.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'r1',
        code: 'custom.x',
        name: 'Custom',
        description: null,
        isSystem: false,
        isDefault: false,
        tenantId: TENANT_A,
        permissions: [{ permission: { code: 'lead:read' } }],
      },
    ]);
    await expect(rbac.listPermissions()).resolves.toHaveLength(1);
    await expect(rbac.listRoles(TENANT_A)).resolves.toHaveLength(1);
    await expect(rbac.matrix(TENANT_A)).resolves.toMatchObject({ permissions: expect.any(Array) });
    (prisma.membership.findMany as jest.Mock).mockResolvedValue([]);
    await expect(rbac.listMemberships(TENANT_A)).resolves.toEqual([]);

    const teams = new TeamService(prisma as never);
    (prisma.team.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.team.create as jest.Mock).mockResolvedValue({
      id: 'team-1',
      code: 'sales',
      name: 'Sales',
      isActive: true,
      members: [],
    });
    await expect(teams.create(user, { code: 'sales', name: 'Sales' } as never)).resolves.toMatchObject({
      code: 'sales',
    });

    const staff = new StaffService(prisma as never, { assignUser: jest.fn(), invalidate: jest.fn() } as never, teams);
    (prisma.membership.findFirst as jest.Mock).mockResolvedValue({
      id: MEMBERSHIP_A,
      status: 'active',
      designation: 'AE',
      employeeCode: 'E-1',
      userId: user.userId,
      user: { id: user.userId, fullName: 'Ada', email: 'a@b.c', lastLoginAt: null },
      roles: [{ role: { id: 'r1', code: 'tenant.founder', name: 'Founder', deletedAt: null } }],
      teamLinks: [],
      team: null,
    });
    await expect(staff.get(user, MEMBERSHIP_A)).resolves.toMatchObject({ id: MEMBERSHIP_A });

    const catalog = new CatalogService(prisma as never, {
      ensureDefaults: jest.fn().mockResolvedValue({ pipeline: { id: 'p1' } }),
    } as never);
    (prisma.product.findFirst as jest.Mock).mockResolvedValue({
      id: 'prod-1',
      sku: 'SKU-1',
      name: 'Door',
      description: null,
      categoryId: null,
      warrantyPeriodId: null,
      unitPriceMinor: 1000n,
      currency: 'INR',
      warrantyMonths: 12,
      isActive: true,
      version: 1,
      updatedAt: now,
    });
    (prisma.product.update as jest.Mock).mockResolvedValue({
      id: 'prod-1',
      sku: 'SKU-1',
      name: 'Steel door',
      description: null,
      categoryId: null,
      warrantyPeriodId: null,
      unitPriceMinor: 1000n,
      currency: 'INR',
      warrantyMonths: 12,
      isActive: true,
      version: 2,
      updatedAt: now,
      category: null,
      warrantyPeriod: null,
    });
    await expect(catalog.updateProduct(user, 'prod-1', { name: 'Steel door' })).resolves.toMatchObject({
      name: 'Steel door',
    });
    (prisma.product.count as jest.Mock).mockResolvedValue(0);
    await expect(catalog.deleteProduct(user, 'prod-1')).resolves.toEqual({ deleted: true });
  });
});
