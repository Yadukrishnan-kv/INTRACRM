import { actor, MEMBERSHIP_A, TENANT_A, USER_A } from '../testing/fixtures';
import { createPrismaMock } from '../testing/prisma-mock';
import { membershipRow } from '../testing/rows';
import { encodeCursor } from '../common/pagination/cursor-page';
import { QuotationsService } from './quotations/application/quotations.service';
import { WarrantiesService } from './warranties/application/warranties.service';
import { SiteVisitsService } from './site-visits/application/site-visits.service';
import { FollowUpsService } from './tasks/application/follow-ups.service';
import { FollowUpEngineService } from './tasks/application/follow-up-engine.service';
import { TargetsService } from './targets/application/targets.service';
import { CommsService } from './comms/application/comms.service';
import { RbacService } from './identity/application/rbac.service';
import { TeamService } from './directory/application/team.service';
import { StaffService } from './directory/application/staff.service';
import { TimelineService } from './activities/application/timeline.service';
import { QuotationFollowUpService } from './quotations/application/quotation-follow-up.service';
import { SearchService } from './search/application/search.service';
import { configStub } from '../testing/config-stub';

const now = new Date('2026-08-17T10:00:00.000Z');

function quotationRow(overrides: Record<string, unknown> = {}) {
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
    assignee: { userId: USER_A, user: { fullName: 'Ada', id: USER_A } },
    leadId: 'lead-1',
    lead: {
      id: 'lead-1',
      leadNumber: 'LD-1',
      title: 'Need a door',
      customerName: 'Acme',
      owner: { userId: USER_A, user: { fullName: 'Ada' } },
    },
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
    ...overrides,
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
    createdAt: now,
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

function visitRow(overrides: Record<string, unknown> = {}) {
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
    ...overrides,
  };
}

function followUpRow(overrides: Record<string, unknown> = {}) {
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
    assignee: { user: { fullName: 'Ada' }, userId: USER_A },
    lead: { id: 'lead-1', leadNumber: 'LD-1', title: 'Need a door', customerName: 'Acme' },
    ...overrides,
  };
}

function staffRow() {
  return {
    id: MEMBERSHIP_A,
    status: 'active',
    designation: 'AE',
    employeeCode: 'E-1',
    userId: USER_A,
    user: { id: USER_A, fullName: 'Ada', email: 'a@b.c', lastLoginAt: null },
    roles: [{ role: { id: 'r1', code: 'tenant.founder', name: 'Founder', deletedAt: null } }],
    teamLinks: [],
    team: { id: 'team-1', code: 'sales', name: 'Sales', deletedAt: null },
  };
}

function teamRow() {
  return {
    id: 'team-1',
    code: 'sales',
    name: 'Sales',
    isActive: true,
    members: [],
  };
}

function gateway() {
  return {
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
    sendWhatsapp: jest.fn().mockResolvedValue({
      ok: true,
      provider: 'device',
      mode: 'device',
      launchUri: 'https://wa.me/919999999999',
      providerMessageId: null,
      error: null,
    }),
    capabilities: jest.fn().mockReturnValue({ call: { mode: 'device' }, sms: { mode: 'device' } }),
  };
}

describe('lifecycle coverage for remaining service paths', () => {
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
      primaryEmail: 'acme@example.test',
      city: 'Pune',
      customerName: 'Acme',
      stageId: 's1',
      pipelineId: 'p1',
      version: 1,
    });
  });

  it('updates quotations, sends them, changes status, and schedules follow-up', async () => {
    const quotations = new QuotationsService(
      prisma as never,
      timeline as never,
      { dashboard: jest.fn(), tickForActor: jest.fn(), notifyPendingQuotation: jest.fn() } as never,
      audit as never,
      { syncWonQuotation: jest.fn() } as never,
    );
    (prisma.quotation.findFirst as jest.Mock).mockResolvedValue(quotationRow());
    await expect(
      quotations.update(user, 'q-1', {
        title: 'Steel doors',
        notes: 'Updated',
        items: [{ description: 'Door', quantity: 2, unitPriceMinor: 5000 }],
      } as never),
    ).resolves.toMatchObject({ quotationNumber: 'QT-0001' });
    await expect(quotations.send(user, 'q-1', {} as never)).resolves.toBeDefined();
    await expect(
      quotations.list(user, {
        leadId: 'lead-1',
        assignedToMembershipId: MEMBERSHIP_A,
        status: 'draft',
        cursor: encodeCursor({ createdAt: now.toISOString(), id: 'q-1' }),
      } as never),
    ).resolves.toMatchObject({ data: [] });
    await expect(quotations.list(user, { pending: true } as never)).resolves.toMatchObject({ data: [] });
    await expect(quotations.list(user, { cursor: 'not-a-cursor' } as never)).rejects.toBeDefined();

    (prisma.quotation.findFirst as jest.Mock).mockResolvedValue(quotationRow({ status: 'sent' }));
    await expect(
      quotations.changeStatus(user, 'q-1', { status: 'follow_up' } as never),
    ).resolves.toBeDefined();
    await expect(
      quotations.scheduleFollowUp(user, 'q-1', {
        nextFollowUpAt: now.toISOString(),
        note: 'Ping them',
      } as never),
    ).resolves.toBeDefined();
    await expect(quotations.report(user, { assignedToMembershipId: MEMBERSHIP_A } as never)).resolves.toBeDefined();
  });

  it('updates warranties, changes status, and renders the public portal', async () => {
    const warranties = new WarrantiesService(prisma as never, timeline as never, configStub() as never);
    (prisma.warrantyCard.findFirst as jest.Mock).mockResolvedValue(warrantyRow());
    await expect(
      warranties.update(user, 'w-1', {
        warrantyStartOn: '2026-01-01',
        warrantyEndOn: '2027-06-01',
        serialNumber: 'SN-1',
        coverageNotes: 'Parts',
      } as never),
    ).resolves.toMatchObject({ cardNumber: 'WR-0001' });
    await expect(warranties.changeStatus(user, 'w-1', { status: 'claimed' } as never)).resolves.toBeDefined();
    await expect(
      warranties.list(user, {
        leadId: 'lead-1',
        quotationId: 'q-1',
        q: 'WR',
        status: 'active',
        cursor: encodeCursor({ createdAt: now.toISOString(), id: 'w-1' }),
      } as never),
    ).resolves.toMatchObject({ data: [] });
    await expect(warranties.list(user, { status: 'expired' } as never)).resolves.toMatchObject({ data: [] });
    const html = await warranties.publicViewHtml('a'.repeat(48));
    expect(html).toContain('html');
  });

  it('walks a site visit from check-in through notes, photos, and close-out', async () => {
    const files = {
      save: jest.fn().mockResolvedValue({ storageKey: 'visits/v-1.jpg', checksumSha256: 'abc' }),
      remove: jest.fn(),
      resolve: jest.fn().mockReturnValue('/tmp/v-1.jpg'),
    };
    const visits = new SiteVisitsService(prisma as never, timeline as never, files as never);
    (prisma.siteVisit.findFirst as jest.Mock).mockResolvedValue(visitRow());
    await expect(
      visits.update(user, 'v-1', { purpose: 'Measure + install', city: 'Pune', version: 1 } as never),
    ).resolves.toMatchObject({ city: 'Pune' });
    await expect(
      visits.checkIn(user, 'v-1', {
        location: { latitude: 18.52, longitude: 73.85, accuracyMeters: 8 },
        notes: 'Arrived',
        version: 1,
      } as never),
    ).resolves.toBeDefined();
    (prisma.siteVisit.findFirst as jest.Mock).mockResolvedValue(visitRow({ status: 'in_progress' }));
    await expect(
      visits.checkOut(user, 'v-1', {
        location: { latitude: 18.52, longitude: 73.85 },
        version: 1,
      } as never),
    ).resolves.toBeDefined();
    await expect(visits.saveNotes(user, 'v-1', { notes: 'Need extra hinges', version: 1 } as never)).resolves.toBeDefined();
    await expect(
      visits.saveFeedback(user, 'v-1', { customerFeedback: 'Good', customerRating: 5, version: 1 } as never),
    ).resolves.toBeDefined();
    await expect(
      visits.addPhoto(user, 'v-1', {
        contentType: 'image/jpeg',
        contentBase64: Buffer.from('photo-bytes').toString('base64'),
        fileName: 'door.jpg',
        caption: 'Front',
        location: { latitude: 18.52, longitude: 73.85 },
      } as never),
    ).resolves.toBeDefined();
    await expect(
      visits.complete(user, 'v-1', {
        outcome: 'Measured',
        location: { latitude: 18.52, longitude: 73.85 },
        version: 1,
      } as never),
    ).resolves.toBeDefined();
    (prisma.siteVisit.findFirst as jest.Mock).mockResolvedValue(visitRow());
    await expect(visits.cancel(user, 'v-1', { reason: 'Rain', version: 1 } as never)).resolves.toBeDefined();
    await expect(visits.markNoShow(user, 'v-1', { reason: 'No answer', version: 1 } as never)).resolves.toBeDefined();
    (prisma.siteVisit.findFirst as jest.Mock).mockResolvedValue(
      visitRow({
        photos: [
          {
            id: 'ph-1',
            fileId: 'file-1',
            deletedAt: null,
            file: { storageKey: 'k', contentType: 'image/jpeg', originalFilename: 'door.jpg', byteSize: 12n },
            capturedAt: now,
            caption: 'Front',
            capturedLat: null,
            capturedLng: null,
            capturedAccuracyM: null,
            sortOrder: 0,
          },
        ],
      }),
    );
    await expect(visits.removePhoto(user, 'v-1', 'ph-1')).resolves.toBeDefined();
    await expect(
      visits.list(user, {
        leadId: 'lead-1',
        assignedToMembershipId: MEMBERSHIP_A,
        status: 'scheduled',
        overdue: true,
        cursor: encodeCursor({ scheduledAt: now.toISOString(), id: 'v-1' }),
      } as never),
    ).resolves.toMatchObject({ data: [] });
    (prisma.siteVisit.findMany as jest.Mock).mockResolvedValue([visitRow()]);
    await expect(visits.listForLead(user, 'lead-1')).resolves.toHaveLength(1);
    await expect(visits.report(user, { assignedToMembershipId: MEMBERSHIP_A } as never)).resolves.toBeDefined();
  });

  it('updates, reschedules, and completes follow-ups and ticks the engine', async () => {
    const engine = new FollowUpEngineService(prisma as never, { notifyInApp: jest.fn() } as never);
    const followUps = new FollowUpsService(prisma as never, timeline as never, engine, audit as never);
    (prisma.followUp.findFirst as jest.Mock).mockResolvedValue(followUpRow());
    (prisma.followUp.update as jest.Mock).mockResolvedValue(followUpRow({ title: 'Call now', notes: 'Urgent' }));
    await expect(
      followUps.update(user, 'fu-1', { title: 'Call now', notes: 'Urgent', version: 1 } as never),
    ).resolves.toMatchObject({ id: 'fu-1' });
    (prisma.followUp.update as jest.Mock).mockResolvedValue(
      followUpRow({ dueAt: new Date('2026-08-18T10:00:00.000Z'), rescheduleCount: 1 }),
    );
    await expect(
      followUps.reschedule(user, 'fu-1', {
        dueAt: '2026-08-18T10:00:00.000Z',
        reason: 'Busy',
        version: 1,
      } as never),
    ).resolves.toBeDefined();
    (prisma.followUp.update as jest.Mock).mockResolvedValue(
      followUpRow({ status: 'completed', completedAt: now }),
    );
    await expect(followUps.complete(user, 'fu-1', { notes: 'Done', version: 1 } as never)).resolves.toMatchObject({
      status: 'completed',
    });
    await expect(
      followUps.list(user, {
        leadId: 'lead-1',
        assignedToMembershipId: MEMBERSHIP_A,
        type: 'call',
        status: 'pending',
        overdue: true,
        bucket: 'today',
        cursor: encodeCursor({ dueAt: now.toISOString(), id: 'fu-1' }),
      } as never),
    ).resolves.toMatchObject({ data: [] });
    await expect(followUps.list(user, { cursor: 'bad' } as never)).rejects.toBeDefined();
    (prisma.followUp.findMany as jest.Mock).mockResolvedValue([followUpRow()]);
    await expect(followUps.listForLead(user, 'lead-1')).resolves.toHaveLength(1);
    await expect(
      followUps.report(user, {
        assignedToMembershipId: MEMBERSHIP_A,
        from: now.toISOString(),
        to: now.toISOString(),
      } as never),
    ).resolves.toBeDefined();

    (prisma.tenant.findMany as jest.Mock).mockResolvedValue([{ id: TENANT_A, timezone: 'Asia/Kolkata' }]);
    (prisma.followUp.findMany as jest.Mock).mockResolvedValue([
      followUpRow({ dueAt: new Date('2026-08-16T08:00:00.000Z') }),
    ]);
    (prisma.lead.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'lead-1',
        leadNumber: 'LD-1',
        title: 'Need a door',
        updatedAt: now,
        owner: { userId: USER_A, user: { fullName: 'Ada' } },
      },
    ]);
    await expect(engine.tick({ tenantId: TENANT_A })).resolves.toMatchObject({ tenants: 1 });
    await expect(engine.tickForActor(user)).resolves.toMatchObject({ tenants: 1 });
    await expect(engine.gaps(user)).resolves.toEqual([
      expect.objectContaining({ leadNumber: 'LD-1', ownerName: 'Ada' }),
    ]);
  });

  it('updates targets and covers directory, RBAC, comms, timeline, and search', async () => {
    (prisma.kpiDefinition.findUnique as jest.Mock).mockResolvedValue({ code: 'revenue' });
    (prisma.target.findFirst as jest.Mock).mockResolvedValue({
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
    });
    const targets = new TargetsService(prisma as never);
    await expect(
      targets.update(user, 'tg-1', { targetValue: 120000, notes: 'Stretch', version: 1 } as never),
    ).resolves.toMatchObject({ id: 'tg-1' });
    await expect(targets.list(user, { metricCode: 'revenue', scopeType: 'tenant' } as never)).resolves.toBeDefined();

    const comms = new CommsService(prisma as never, gateway() as never);
    await expect(comms.sms(user, 'lead-1', { body: 'Hi from Intra' } as never)).resolves.toMatchObject({
      channel: 'sms',
    });
    await expect(comms.whatsapp(user, 'lead-1', { body: 'WhatsApp ping' } as never)).resolves.toMatchObject({
      channel: 'whatsapp',
    });
    (prisma.messageTemplate.findFirst as jest.Mock).mockResolvedValue({
      id: 'tpl-1',
      channel: 'sms',
      code: 'hello',
      name: 'Hello',
      body: 'Hi {{name}}',
    });
    (prisma.messageTemplate.update as jest.Mock).mockResolvedValue({
      id: 'tpl-1',
      channel: 'sms',
      code: 'hello',
      name: 'Hello there',
      body: 'Hi {{name}}',
    });
    await expect(comms.updateTemplate(user, 'tpl-1', { name: 'Hello there' } as never)).resolves.toMatchObject({
      name: 'Hello there',
    });
    await expect(comms.deleteTemplate(user, 'tpl-1')).resolves.toEqual({ deleted: true });

    const redis = { get: jest.fn().mockResolvedValue(null), set: jest.fn(), del: jest.fn(), scan: jest.fn().mockResolvedValue(['0', []]) };
    const rbac = new RbacService(prisma as never, redis as never);
    (prisma.role.findMany as jest.Mock).mockResolvedValue([{ id: 'r-admin', code: 'tenant.admin' }]);
    (prisma.user.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.user.create as jest.Mock).mockResolvedValue({ id: 'u-new', fullName: 'Bo', email: 'bo@x.y' });
    (prisma.membership.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.membership.create as jest.Mock).mockResolvedValue({
      id: 'm-new',
      status: 'active',
      designation: 'AE',
      employeeCode: null,
      user: { id: 'u-new', fullName: 'Bo', email: 'bo@x.y' },
      roles: [{ role: { id: 'r-admin', code: 'tenant.admin', name: 'Admin', deletedAt: null } }],
    });
    await expect(
      rbac.assignUser(user, { email: 'bo@x.y', fullName: 'Bo', roleIds: ['r-admin'] } as never),
    ).resolves.toMatchObject({ user: { email: 'bo@x.y' } });
    (prisma.role.findFirst as jest.Mock).mockResolvedValue({
      id: 'r-custom',
      isSystem: false,
      code: 'custom.x',
      name: 'Custom',
      description: null,
      isDefault: false,
      tenantId: TENANT_A,
      permissions: [{ permission: { code: 'lead:read' } }],
    });
    (prisma.role.update as jest.Mock).mockResolvedValue({
      id: 'r-custom',
      code: 'custom.x',
      name: 'Custom 2',
      description: 'Ops',
      isSystem: false,
      isDefault: false,
      tenantId: TENANT_A,
      permissions: [{ permission: { code: 'lead:read' } }],
    });
    await expect(rbac.updateRole(user, 'r-custom', { name: 'Custom 2', description: 'Ops' })).resolves.toMatchObject({
      name: 'Custom 2',
    });
    (prisma.permission.findMany as jest.Mock).mockResolvedValue([{ id: 'p1', code: 'lead:read' }]);
    await expect(rbac.replacePermissions(user, 'r-custom', { permissionCodes: ['lead:read'] })).resolves.toBeDefined();
    await expect(rbac.deleteRole(user, 'r-custom')).resolves.toEqual({ deleted: true });
    (prisma.membership.findFirst as jest.Mock).mockResolvedValue({
      id: MEMBERSHIP_A,
      userId: USER_A,
      tenantId: TENANT_A,
      deletedAt: null,
      status: 'active',
      designation: 'AE',
      employeeCode: 'E-1',
      user: { id: USER_A, fullName: 'Ada', email: 'a@b.c' },
      roles: [{ role: { id: 'r1', code: 'tenant.sales_staff', name: 'Staff', deletedAt: null } }],
    });
    (prisma.membership.update as jest.Mock).mockResolvedValue({
      id: MEMBERSHIP_A,
      status: 'suspended',
      designation: 'AE',
      employeeCode: 'E-1',
      user: { id: USER_A, fullName: 'Ada', email: 'a@b.c' },
      roles: [{ role: { id: 'r1', code: 'tenant.sales_staff', name: 'Staff', deletedAt: null } }],
    });
    await expect(rbac.updateMembership(user, MEMBERSHIP_A, { status: 'suspended' } as never)).resolves.toMatchObject({
      status: 'suspended',
    });

    const teams = new TeamService(prisma as never);
    (prisma.team.findFirst as jest.Mock).mockResolvedValue(teamRow());
    (prisma.team.update as jest.Mock).mockResolvedValue({ ...teamRow(), name: 'Inside sales' });
    await expect(teams.get(TENANT_A, 'team-1')).resolves.toMatchObject({ code: 'sales' });
    await expect(teams.update(user, 'team-1', { name: 'Inside sales', isActive: true } as never)).resolves.toMatchObject({
      name: 'Inside sales',
    });
    (prisma.membership.findMany as jest.Mock).mockResolvedValue([{ id: MEMBERSHIP_A }]);
    await expect(teams.replaceMembers(user, 'team-1', { membershipIds: [MEMBERSHIP_A] } as never)).resolves.toBeDefined();
    await expect(teams.requireTeams(TENANT_A, [])).resolves.toEqual([]);
    (prisma.team.findMany as jest.Mock).mockResolvedValue([teamRow()]);
    await expect(teams.requireTeams(TENANT_A, ['team-1'])).resolves.toHaveLength(1);
    await expect(teams.remove(user, 'team-1')).resolves.toEqual({ deleted: true });

    const staff = new StaffService(
      prisma as never,
      { assignUser: jest.fn(), assignRoles: jest.fn(), updateMembership: jest.fn(), invalidate: jest.fn() } as never,
      teams,
    );
    (prisma.membership.findFirst as jest.Mock).mockResolvedValue(staffRow());
    await expect(staff.update(user, MEMBERSHIP_A, { designation: 'AM', fullName: 'Ada Lovelace' } as never)).resolves.toMatchObject({
      id: MEMBERSHIP_A,
    });
    await expect(staff.assignTeams(user, MEMBERSHIP_A, { teamIds: ['team-1'] } as never)).resolves.toBeDefined();
    await expect(staff.setStatus(user, MEMBERSHIP_A, { active: false } as never)).resolves.toBeDefined();
    await expect(staff.assignRoles(user, MEMBERSHIP_A, { roleIds: ['r1'] } as never)).resolves.toBeDefined();

    const writer = { record: jest.fn().mockResolvedValue({ id: 'act-1' }) };
    const timelineService = new TimelineService(prisma as never, writer as never);
    await expect(
      timelineService.addSiteVisit(user, 'lead-1', {
        scheduledAt: now.toISOString(),
        purpose: 'Measure',
        city: 'Pune',
      } as never),
    ).resolves.toMatchObject({ leadId: 'lead-1' });
    (prisma.quotation.create as jest.Mock).mockResolvedValue({
      id: 'q-2',
      quotationNumber: 'QT-0002',
      status: 'sent',
      totalMinor: 5000n,
      currency: 'INR',
      sentAt: now,
    });
    await expect(
      timelineService.sendQuotation(user, 'lead-1', { totalMinor: 5000, notes: 'Sent' } as never),
    ).resolves.toMatchObject({ status: 'sent' });
    (prisma.leadActivity.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'act-1',
        eventCode: 'lead.created',
        subject: 'Created',
        body: null,
        occurredAt: now,
        metadata: null,
        actor: { user: { fullName: 'Ada' } },
        lead: { id: 'lead-1', leadNumber: 'LD-1', title: 'Need a door', customerName: 'Acme' },
      },
    ]);
    await expect(
      timelineService.list(user, {
        leadId: 'lead-1',
        eventCode: 'lead.created',
        cursor: encodeCursor({ occurredAt: now.toISOString(), id: 'act-1' }),
      } as never),
    ).resolves.toMatchObject({ data: expect.any(Array) });

    const search = new SearchService(prisma as never, redis as never);
    (prisma.lead.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'lead-1',
        leadNumber: 'LD-1',
        title: 'Need a door',
        customerName: 'Acme',
        primaryPhone: '+919999999999',
        lifecycleStatus: 'open',
        city: 'Pune',
      },
    ]);
    await expect(search.search(user, { q: 'Acme' })).resolves.toMatchObject({
      hits: expect.any(Array),
    });
    await expect(search.search(user, { q: '+919999999999' })).resolves.toBeDefined();
    (prisma.quotation.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'q-1',
        quotationNumber: 'QT-0001',
        title: 'Doors',
        status: 'sent',
        leadId: 'lead-1',
        lead: { leadNumber: 'LD-1', customerName: 'Acme', title: 'Need a door', primaryPhone: '+919999999999' },
      },
    ]);
    await expect(search.search(user, { q: 'QT-0001' })).resolves.toMatchObject({
      hits: [expect.objectContaining({ type: 'quotation', quotationNumber: 'QT-0001' })],
    });

    const qFollow = new QuotationFollowUpService(prisma as never, { notifyInApp: jest.fn() } as never);
    (prisma.tenant.findMany as jest.Mock).mockResolvedValue([{ id: TENANT_A, timezone: 'Asia/Kolkata' }]);
    (prisma.quotation.findMany as jest.Mock).mockResolvedValue([
      quotationRow({
        status: 'sent',
        nextFollowUpAt: new Date('2026-08-16T08:00:00.000Z'),
        expectedCloseOn: new Date('2026-08-10T00:00:00.000Z'),
      }),
    ]);
    (prisma.quotation.findFirst as jest.Mock).mockResolvedValue(
      quotationRow({
        status: 'sent',
        nextFollowUpAt: new Date('2026-08-16T08:00:00.000Z'),
      }),
    );
    await expect(qFollow.tick({ tenantId: TENANT_A })).resolves.toMatchObject({ tenants: 1 });
    await expect(qFollow.tickForActor(user)).resolves.toMatchObject({ tenants: 1 });
    await expect(qFollow.notifyPendingQuotation(TENANT_A, 'q-1')).resolves.toBeGreaterThanOrEqual(0);
  });
});
