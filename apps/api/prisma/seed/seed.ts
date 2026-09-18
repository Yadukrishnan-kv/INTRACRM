import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

const DEMO_EMAIL = 'admin@intraleads.local';
const DEMO_PASSWORD = 'IntraLeads1!';
const DEMO_TENANT_SLUG = 'intra-demo';

type Id = { id: string };
type Named = { id: string; code: string; name: string };

async function main(): Promise<void> {
  if (process.env.SEED_ENABLED !== 'true') {
    return;
  }

  await prisma.permission.upsert({
    where: { code: 'lead:read' },
    update: {},
    create: {
      code: 'lead:read',
      resource: 'lead',
      action: 'read',
      description: 'Read leads in scope',
    },
  });

  const tenant = await ensureTenant();
  const admin = await ensureAdminUser();
  const member = await ensureAdminMembership(tenant.id, admin.id);
  await assignFounderRole(member.id);
  await seedLeadCatalog(tenant.id, admin.id);
  await seedDemoVolume(tenant.id, admin.id, member.id);
}

async function ensureTenant() {
  let tenant = await prisma.tenant.findFirst({
    where: { slug: DEMO_TENANT_SLUG, deletedAt: null },
  });
  if (!tenant) {
    tenant = await prisma.tenant.create({
      data: {
        slug: DEMO_TENANT_SLUG,
        name: 'INTRA Steel Doors & Windows',
        status: 'active',
      },
    });
  } else {
    tenant = await prisma.tenant.update({
      where: { id: tenant.id },
      data: { name: 'INTRA Steel Doors & Windows', status: 'active' },
    });
  }
  return tenant;
}

async function ensureAdminUser() {
  let user = await prisma.user.findFirst({
    where: { email: DEMO_EMAIL, deletedAt: null },
  });
  const passwordHash = await argon2.hash(DEMO_PASSWORD, { type: argon2.argon2id });
  if (!user) {
    user = await prisma.user.create({
      data: {
        email: DEMO_EMAIL,
        fullName: 'Platform Admin',
        status: 'active',
        isPlatformAdmin: true,
        emailVerifiedAt: new Date(),
        credential: {
          create: {
            passwordHash,
            passwordAlgo: 'argon2id',
          },
        },
      },
    });
  } else {
    await prisma.user.update({
      where: { id: user.id },
      data: { status: 'active', isPlatformAdmin: true },
    });
    await prisma.userCredential.upsert({
      where: { userId: user.id },
      update: {
        passwordHash,
        passwordAlgo: 'argon2id',
        passwordUpdatedAt: new Date(),
        failedAttempts: 0,
        lockedUntil: null,
      },
      create: {
        userId: user.id,
        passwordHash,
        passwordAlgo: 'argon2id',
      },
    });
  }
  return user;
}

async function ensureAdminMembership(tenantId: string, userId: string) {
  const membership = await prisma.membership.findFirst({
    where: { tenantId, userId, deletedAt: null },
  });
  const member =
    membership ??
    (await prisma.membership.create({
      data: {
        tenantId,
        userId,
        status: 'active',
        designation: 'Founder',
        employeeCode: 'EMP-000',
        joinedAt: new Date(),
      },
    }));
  if (membership && membership.status !== 'active') {
    await prisma.membership.update({
      where: { id: membership.id },
      data: { status: 'active', joinedAt: membership.joinedAt ?? new Date() },
    });
  }
  return member;
}

async function assignFounderRole(membershipId: string): Promise<void> {
  const founder = await prisma.role.findFirst({
    where: { code: 'tenant.founder', tenantId: null, deletedAt: null },
  });
  const admin = await prisma.role.findFirst({
    where: { code: 'tenant.admin', tenantId: null, deletedAt: null },
  });
  const role = founder ?? admin;
  if (!role) {
    return;
  }
  await prisma.membershipRole.upsert({
    where: {
      membershipId_roleId: { membershipId, roleId: role.id },
    },
    update: {},
    create: { membershipId, roleId: role.id },
  });
}

async function seedLeadCatalog(tenantId: string, actorUserId: string): Promise<void> {
  await ensureCodedRows(
    () =>
      prisma.leadSource.findMany({
        where: { tenantId, deletedAt: null },
      }),
    (row) =>
      prisma.leadSource.create({
        data: { tenantId, createdBy: actorUserId, updatedBy: actorUserId, ...row },
      }),
    [
      { code: 'website', name: 'Website', sortOrder: 10 },
      { code: 'walk_in', name: 'Walk-in', sortOrder: 20 },
      { code: 'referral', name: 'Referral', sortOrder: 30 },
      { code: 'campaign', name: 'Campaign', sortOrder: 40 },
      { code: 'exhibition', name: 'Exhibition', sortOrder: 50 },
      { code: 'dealer', name: 'Dealer', sortOrder: 60 },
      { code: 'google_ads', name: 'Google Ads', sortOrder: 70 },
      { code: 'facebook', name: 'Facebook', sortOrder: 80 },
      { code: 'instagram', name: 'Instagram', sortOrder: 90 },
      { code: 'cold_call', name: 'Cold call', sortOrder: 100 },
      { code: 'tender', name: 'Tender', sortOrder: 110 },
      { code: 'partner', name: 'Channel partner', sortOrder: 120 },
    ],
  );

  await ensureCodedRows(
    () =>
      prisma.leadQualityOption.findMany({
        where: { tenantId, deletedAt: null },
      }),
    (row) =>
      prisma.leadQualityOption.create({
        data: { tenantId, createdBy: actorUserId, updatedBy: actorUserId, ...row },
      }),
    [
      { code: 'hot', name: 'Hot', sortOrder: 10 },
      { code: 'warm', name: 'Warm', sortOrder: 20 },
      { code: 'cold', name: 'Cold', sortOrder: 30 },
      { code: 'very_hot', name: 'Very hot', sortOrder: 5 },
      { code: 'vip', name: 'VIP', sortOrder: 8 },
      { code: 'qualified', name: 'Qualified', sortOrder: 25 },
      { code: 'lukewarm', name: 'Lukewarm', sortOrder: 28 },
      { code: 'recycled', name: 'Recycled', sortOrder: 40 },
      { code: 'unknown', name: 'Unknown', sortOrder: 50 },
      { code: 'dead', name: 'Dead', sortOrder: 60 },
      { code: 'nurture', name: 'Nurture', sortOrder: 35 },
      { code: 'unqualified', name: 'Unqualified', sortOrder: 70 },
    ],
  );

  await ensureCodedRows(
    () =>
      prisma.lossReason.findMany({
        where: { tenantId, deletedAt: null },
      }),
    (row) =>
      prisma.lossReason.create({
        data: { tenantId, createdBy: actorUserId, updatedBy: actorUserId, ...row },
      }),
    [
      { code: 'price', name: 'Price' },
      { code: 'competitor', name: 'Competitor' },
      { code: 'no_response', name: 'No response' },
      { code: 'not_interested', name: 'Not interested' },
      { code: 'other', name: 'Other' },
      { code: 'budget', name: 'Budget freeze' },
      { code: 'timing', name: 'Timing' },
      { code: 'location', name: 'Location' },
      { code: 'credit', name: 'Credit terms' },
      { code: 'product_fit', name: 'Product fit' },
      { code: 'delay', name: 'Delivery delay' },
      { code: 'quality', name: 'Quality concern' },
    ],
  );

  let pipeline = await prisma.pipeline.findFirst({
    where: { tenantId, deletedAt: null, isActive: true },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
  });
  if (!pipeline) {
    pipeline = await prisma.pipeline.create({
      data: {
        tenantId,
        code: 'default',
        name: 'Door & window sales',
        isDefault: true,
        createdBy: actorUserId,
        updatedBy: actorUserId,
      },
    });
  } else {
    pipeline = await prisma.pipeline.update({
      where: { id: pipeline.id },
      data: { name: 'Door & window sales', updatedBy: actorUserId },
    });
  }

  const stages = [
    { code: 'new', name: 'New', sortOrder: 10, winProbabilityBps: 1000, isOpen: true, isWon: false, isLost: false },
    { code: 'contacted', name: 'Contacted', sortOrder: 20, winProbabilityBps: 2500, isOpen: true, isWon: false, isLost: false },
    { code: 'qualified', name: 'Qualified', sortOrder: 30, winProbabilityBps: 4000, isOpen: true, isWon: false, isLost: false },
    { code: 'site_visit', name: 'Site Visit', sortOrder: 40, winProbabilityBps: 5500, isOpen: true, isWon: false, isLost: false },
    { code: 'quotation', name: 'Quotation', sortOrder: 50, winProbabilityBps: 7000, isOpen: true, isWon: false, isLost: false },
    { code: 'negotiation', name: 'Negotiation', sortOrder: 60, winProbabilityBps: 8500, isOpen: true, isWon: false, isLost: false },
    { code: 'won', name: 'Won', sortOrder: 70, winProbabilityBps: 10000, isOpen: false, isWon: true, isLost: false },
    { code: 'lost', name: 'Lost', sortOrder: 80, winProbabilityBps: 0, isOpen: false, isWon: false, isLost: true },
    { code: 'hold', name: 'On hold', sortOrder: 65, winProbabilityBps: 5000, isOpen: true, isWon: false, isLost: false },
    { code: 'nurture', name: 'Nurture', sortOrder: 15, winProbabilityBps: 1500, isOpen: true, isWon: false, isLost: false },
  ];
  for (const stage of stages) {
    const existing = await prisma.pipelineStage.findFirst({
      where: { pipelineId: pipeline.id, code: stage.code, deletedAt: null },
    });
    if (!existing) {
      await prisma.pipelineStage.create({
        data: {
          tenantId,
          pipelineId: pipeline.id,
          createdBy: actorUserId,
          updatedBy: actorUserId,
          ...stage,
        },
      });
    } else {
      await prisma.pipelineStage.update({
        where: { id: existing.id },
        data: {
          name: stage.name,
          sortOrder: stage.sortOrder,
          winProbabilityBps: stage.winProbabilityBps,
          isOpen: stage.isOpen,
          isWon: stage.isWon,
          isLost: stage.isLost,
          updatedBy: actorUserId,
        },
      });
    }
  }
}

async function seedDemoVolume(tenantId: string, actorUserId: string, adminMembershipId: string): Promise<void> {
  const passwordHash = await argon2.hash(DEMO_PASSWORD, { type: argon2.argon2id });
  const now = new Date();
  const days = (offset: number) => new Date(now.getTime() + offset * 86_400_000);

  await ensureTenantRoles(tenantId, actorUserId);

  const sources = await prisma.leadSource.findMany({ where: { tenantId, deletedAt: null } });
  const lossReasons = await prisma.lossReason.findMany({ where: { tenantId, deletedAt: null } });
  const pipeline = await prisma.pipeline.findFirstOrThrow({
    where: { tenantId, deletedAt: null, isActive: true },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
  });
  const stages = await prisma.pipelineStage.findMany({
    where: { pipelineId: pipeline.id, deletedAt: null },
    orderBy: { sortOrder: 'asc' },
  });
  const stageByCode = Object.fromEntries(stages.map((stage) => [stage.code, stage]));

  const teams = await ensureTeams(tenantId, actorUserId);
  const staff = await ensureStaff(tenantId, actorUserId, passwordHash, teams, adminMembershipId);
  const categories = await ensureCategories(tenantId, actorUserId);
  const periods = await ensureWarrantyPeriods(tenantId, actorUserId);
  const products = await ensureProducts(tenantId, actorUserId, categories, periods);
  const leads = await ensureLeads(
    tenantId,
    actorUserId,
    pipeline.id,
    stageByCode,
    sources,
    staff,
    lossReasons,
  );
  await ensureActivities(tenantId, actorUserId, leads, staff);
  await ensureFollowUps(tenantId, actorUserId, leads, staff, days);
  await ensureSiteVisits(tenantId, actorUserId, leads, staff, days);
  await ensureAttendance(tenantId, actorUserId, staff, days);
  await ensureQuotations(tenantId, actorUserId, leads, staff, products, days);
  await ensureWarranties(tenantId, actorUserId, leads, staff, products, days);
  await ensureTargets(tenantId, actorUserId, staff, products, days);
  await ensureNotifications(tenantId, actorUserId, staff, leads);
  await ensureComms(tenantId, actorUserId, leads);
  await ensureBilling(tenantId, actorUserId, leads, days);
  await ensureAuditLogs(tenantId, actorUserId, leads);
  await ensureKpis();
}

async function ensureTenantRoles(tenantId: string, actorUserId: string): Promise<void> {
  const extras = [
    { code: 'tenant.auditor', name: 'Auditor', description: 'Read-only audit access' },
    { code: 'tenant.warehouse', name: 'Warehouse', description: 'Dispatch and warranty issue' },
    { code: 'tenant.support', name: 'Support', description: 'After-sales support' },
  ];
  for (const role of extras) {
    const existing = await prisma.role.findFirst({
      where: { tenantId, code: role.code, deletedAt: null },
    });
    if (!existing) {
      await prisma.role.create({
        data: { tenantId, createdBy: actorUserId, updatedBy: actorUserId, ...role },
      });
    }
  }
}

async function ensureTeams(tenantId: string, actorUserId: string): Promise<Named[]> {
  const rows = [
    { code: 'west', name: 'West' },
    { code: 'east', name: 'East' },
    { code: 'north', name: 'North' },
    { code: 'south', name: 'South' },
    { code: 'pune', name: 'Pune field' },
    { code: 'mumbai', name: 'Mumbai field' },
    { code: 'delhi', name: 'Delhi NCR' },
    { code: 'chennai', name: 'Chennai field' },
    { code: 'hyderabad', name: 'Hyderabad field' },
    { code: 'kolkata', name: 'Kolkata field' },
    { code: 'inside', name: 'Inside sales' },
    { code: 'key_accounts', name: 'Key accounts' },
  ];
  const created: Named[] = [];
  for (const row of rows) {
    let team = await prisma.team.findFirst({ where: { tenantId, code: row.code, deletedAt: null } });
    if (!team) {
      team = await prisma.team.create({
        data: { tenantId, createdBy: actorUserId, updatedBy: actorUserId, isActive: true, ...row },
      });
    } else if (team.name !== row.name) {
      team = await prisma.team.update({
        where: { id: team.id },
        data: { name: row.name, updatedBy: actorUserId },
      });
    }
    created.push({ id: team.id, code: team.code, name: team.name });
  }
  return created;
}

async function ensureStaff(
  tenantId: string,
  actorUserId: string,
  passwordHash: string,
  teams: Named[],
  adminMembershipId: string,
): Promise<Array<{ id: string; userId: string; name: string }>> {
  const people = [
    { email: 'ada.rao@intraleads.local', name: 'Ada Rao', designation: 'Sales Manager', team: 'west', role: 'sales.manager', code: 'EMP-001' },
    { email: 'dev.menon@intraleads.local', name: 'Dev Menon', designation: 'Sales Executive', team: 'pune', role: 'sales.executive', code: 'EMP-002' },
    { email: 'priya.shah@intraleads.local', name: 'Priya Shah', designation: 'Sales Executive', team: 'mumbai', role: 'sales.executive', code: 'EMP-003' },
    { email: 'arjun.patel@intraleads.local', name: 'Arjun Patel', designation: 'Sales Staff', team: 'west', role: 'sales.staff', code: 'EMP-004' },
    { email: 'meera.iyer@intraleads.local', name: 'Meera Iyer', designation: 'Sales Executive', team: 'chennai', role: 'sales.executive', code: 'EMP-005' },
    { email: 'kabir.khan@intraleads.local', name: 'Kabir Khan', designation: 'Business Manager', team: 'key_accounts', role: 'business.manager', code: 'EMP-006' },
    { email: 'sana.qureshi@intraleads.local', name: 'Sana Qureshi', designation: 'Sales Staff', team: 'delhi', role: 'sales.staff', code: 'EMP-007' },
    { email: 'rohan.joshi@intraleads.local', name: 'Rohan Joshi', designation: 'Sales Executive', team: 'hyderabad', role: 'sales.executive', code: 'EMP-008' },
    { email: 'leela.nair@intraleads.local', name: 'Leela Nair', designation: 'Sales Manager', team: 'south', role: 'sales.manager', code: 'EMP-009' },
    { email: 'vikram.singh@intraleads.local', name: 'Vikram Singh', designation: 'Sales Staff', team: 'north', role: 'sales.staff', code: 'EMP-010' },
    { email: 'ananya.das@intraleads.local', name: 'Ananya Das', designation: 'Admin', team: 'inside', role: 'tenant.admin', code: 'EMP-011' },
  ];
  const staff: Array<{ id: string; userId: string; name: string }> = [
    { id: adminMembershipId, userId: actorUserId, name: 'Platform Admin' },
  ];

  for (const person of people) {
    let user = await prisma.user.findFirst({ where: { email: person.email, deletedAt: null } });
    if (!user) {
      user = await prisma.user.create({
        data: {
          email: person.email,
          fullName: person.name,
          status: 'active',
          emailVerifiedAt: new Date(),
          createdBy: actorUserId,
          updatedBy: actorUserId,
          credential: {
            create: { passwordHash, passwordAlgo: 'argon2id' },
          },
        },
      });
    }
    const team = teams.find((item) => item.code === person.team);
    let membership = await prisma.membership.findFirst({
      where: { tenantId, userId: user.id, deletedAt: null },
    });
    if (!membership) {
      membership = await prisma.membership.create({
        data: {
          tenantId,
          userId: user.id,
          status: 'active',
          designation: person.designation,
          employeeCode: person.code,
          teamId: team?.id,
          joinedAt: new Date(),
          createdBy: actorUserId,
          updatedBy: actorUserId,
        },
      });
    }
    if (team) {
      await prisma.teamMember.upsert({
        where: { teamId_membershipId: { teamId: team.id, membershipId: membership.id } },
        update: {},
        create: { teamId: team.id, membershipId: membership.id, createdBy: actorUserId },
      });
    }
    const role = await prisma.role.findFirst({
      where: { code: person.role, tenantId: null, deletedAt: null },
    });
    if (role) {
      await prisma.membershipRole.upsert({
        where: { membershipId_roleId: { membershipId: membership.id, roleId: role.id } },
        update: {},
        create: { membershipId: membership.id, roleId: role.id, createdBy: actorUserId },
      });
    }
    staff.push({ id: membership.id, userId: user.id, name: person.name });
  }
  return staff;
}

async function ensureCategories(tenantId: string, actorUserId: string): Promise<Named[]> {
  const rows = [
    { code: 'doors', name: 'Main doors', sortOrder: 10 },
    { code: 'safety_doors', name: 'Safety doors', sortOrder: 20 },
    { code: 'windows', name: 'Steel windows', sortOrder: 30 },
    { code: 'sliding_windows', name: 'Sliding windows', sortOrder: 40 },
    { code: 'french_windows', name: 'French windows', sortOrder: 50 },
    { code: 'ventilators', name: 'Ventilators', sortOrder: 60 },
    { code: 'grills', name: 'Grills', sortOrder: 70 },
    { code: 'gates', name: 'Gates', sortOrder: 80 },
    { code: 'fire_rated', name: 'Fire-rated doors', sortOrder: 90 },
    { code: 'hardware', name: 'Locks & hardware', sortOrder: 100 },
    { code: 'frames', name: 'Frames & sections', sortOrder: 110 },
  ];
  const created: Named[] = [];
  for (const row of rows) {
    let item = await prisma.productCategory.findFirst({
      where: { tenantId, code: row.code, deletedAt: null },
    });
    if (!item) {
      item = await prisma.productCategory.create({
        data: { tenantId, createdBy: actorUserId, updatedBy: actorUserId, isActive: true, ...row },
      });
    } else {
      item = await prisma.productCategory.update({
        where: { id: item.id },
        data: { name: row.name, sortOrder: row.sortOrder, isActive: true, updatedBy: actorUserId },
      });
    }
    created.push({ id: item.id, code: item.code, name: item.name });
  }
  await prisma.productCategory.updateMany({
    where: {
      tenantId,
      deletedAt: null,
      code: { notIn: rows.map((row) => row.code) },
    },
    data: { isActive: false, deletedAt: new Date(), deletedBy: actorUserId },
  });
  return created;
}

async function ensureWarrantyPeriods(tenantId: string, actorUserId: string): Promise<Named[]> {
  const rows = [
    { code: 'months_1', name: '1 month', months: 1, sortOrder: 5 },
    { code: 'months_3', name: '3 months', months: 3, sortOrder: 8 },
    { code: 'months_6', name: '6 months', months: 6, sortOrder: 10 },
    { code: 'months_12', name: '1 year', months: 12, sortOrder: 20 },
    { code: 'months_18', name: '18 months', months: 18, sortOrder: 25 },
    { code: 'months_24', name: '2 years', months: 24, sortOrder: 30 },
    { code: 'months_36', name: '3 years', months: 36, sortOrder: 40 },
    { code: 'months_48', name: '4 years', months: 48, sortOrder: 50 },
    { code: 'months_60', name: '5 years', months: 60, sortOrder: 60 },
    { code: 'months_120', name: '10 years', months: 120, sortOrder: 70 },
  ];
  const created: Named[] = [];
  for (const row of rows) {
    let item = await prisma.warrantyPeriod.findFirst({
      where: { tenantId, code: row.code, deletedAt: null },
    });
    if (!item) {
      item = await prisma.warrantyPeriod.create({
        data: { tenantId, createdBy: actorUserId, updatedBy: actorUserId, isActive: true, ...row },
      });
    } else {
      item = await prisma.warrantyPeriod.update({
        where: { id: item.id },
        data: {
          name: row.name,
          months: row.months,
          sortOrder: row.sortOrder,
          isActive: true,
          updatedBy: actorUserId,
        },
      });
    }
    created.push({ id: item.id, code: item.code, name: item.name });
  }
  return created;
}

async function ensureProducts(
  tenantId: string,
  actorUserId: string,
  categories: Named[],
  periods: Named[],
): Promise<Array<{ id: string; name: string; price: bigint }>> {
  const rows = [
    {
      sku: 'DR-STL-001',
      name: 'Plain steel main door',
      cat: 'doors',
      period: 'months_36',
      price: 18_500_00n,
      months: 36,
      description: '7×4 ft MS main door, 1.2 mm sheet, powder coated, with frame, lock and hinges.',
    },
    {
      sku: 'DR-DSGN-013',
      name: 'Designer main door',
      cat: 'doors',
      period: 'months_36',
      price: 24_800_00n,
      months: 36,
      description: 'Designer skin-panel main door in wood-finish powder coat, with frame and lockset.',
    },
    {
      sku: 'DR-DBL-008',
      name: 'Double leaf main door',
      cat: 'doors',
      period: 'months_36',
      price: 32_500_00n,
      months: 36,
      description: '8×7 ft double-leaf MS main door with transom, powder coated.',
    },
    {
      sku: 'DR-SAFE-009',
      name: 'Safety door with mesh',
      cat: 'safety_doors',
      period: 'months_36',
      price: 21_200_00n,
      months: 36,
      description: 'Outer safety door with stainless mesh, powder coated, for main entrance.',
    },
    {
      sku: 'DR-SAFE-017',
      name: 'Double safety door',
      cat: 'safety_doors',
      period: 'months_36',
      price: 38_400_00n,
      months: 36,
      description: 'Inner solid leaf plus outer mesh safety door combination.',
    },
    {
      sku: 'WN-OPN-014',
      name: 'Steel openable window',
      cat: 'windows',
      period: 'months_24',
      price: 8_400_00n,
      months: 24,
      description: 'Single-leaf casement MS window with glass and stay.',
    },
    {
      sku: 'WN-FIX-015',
      name: 'Fixed window with grill',
      cat: 'windows',
      period: 'months_24',
      price: 7_150_00n,
      months: 24,
      description: 'Fixed glass window with outer MS grill, powder coated.',
    },
    {
      sku: 'WN-SLD-002',
      name: 'Steel sliding window',
      cat: 'sliding_windows',
      period: 'months_24',
      price: 12_200_00n,
      months: 24,
      description: '2-track powder-coated MS sliding window with mosquito mesh.',
    },
    {
      sku: 'WN-FRN-003',
      name: 'French window',
      cat: 'french_windows',
      period: 'months_24',
      price: 16_800_00n,
      months: 24,
      description: 'Double-leaf openable French window with grill and powder coat.',
    },
    {
      sku: 'WN-VNT-005',
      name: 'Steel ventilator',
      cat: 'ventilators',
      period: 'months_12',
      price: 3_250_00n,
      months: 12,
      description: '2×1 ft louvered MS ventilator for kitchen and bath.',
    },
    {
      sku: 'GR-WIN-007',
      name: 'Window grill',
      cat: 'grills',
      period: 'months_36',
      price: 4_800_00n,
      months: 36,
      description: 'MS square-bar window grill, 4×4 ft, powder coated.',
    },
    {
      sku: 'GT-CMP-011',
      name: 'Compound gate',
      cat: 'gates',
      period: 'months_36',
      price: 28_500_00n,
      months: 36,
      description: '5 m MS compound gate with lock and stopper.',
    },
    {
      sku: 'GT-WCK-016',
      name: 'Wicket gate',
      cat: 'gates',
      period: 'months_36',
      price: 9_600_00n,
      months: 36,
      description: '3×6 ft personnel wicket gate with frame.',
    },
    {
      sku: 'FR-DR-010',
      name: 'Fire-rated steel door',
      cat: 'fire_rated',
      period: 'months_60',
      price: 32_900_00n,
      months: 60,
      description: '2-hour fire-rated steel door with panic bar and closer.',
    },
    {
      sku: 'FR-SEC-006',
      name: 'Door / window frame',
      cat: 'frames',
      period: 'months_24',
      price: 4_150_00n,
      months: 24,
      description: '16-gauge MS door or window frame section, cut to size.',
    },
    {
      sku: 'HW-LCK-004',
      name: 'Multipoint door lock',
      cat: 'hardware',
      period: 'months_12',
      price: 2_850_00n,
      months: 12,
      description: '3-point lockset for steel main door.',
    },
    {
      sku: 'HW-HNG-012',
      name: 'Heavy duty hinge set',
      cat: 'hardware',
      period: 'months_12',
      price: 640_00n,
      months: 12,
      description: '5-inch MS butt hinge set, 3 pieces.',
    },
    {
      sku: 'HW-HND-018',
      name: 'Door handle set',
      cat: 'hardware',
      period: 'months_12',
      price: 890_00n,
      months: 12,
      description: 'Stainless steel lever handle set with spindle.',
    },
  ];
  const skuAliases: Record<string, string> = {
    'WN-ALU-002': 'WN-SLD-002',
    'FC-GLS-003': 'WN-FRN-003',
    'GL-TGH-005': 'WN-VNT-005',
    'AL-PRF-006': 'FR-SEC-006',
    'ST-GRL-007': 'GR-WIN-007',
    'MD-KTC-008': 'DR-DBL-008',
    'MR-HCH-009': 'DR-SAFE-009',
    'AU-OPN-011': 'GT-CMP-011',
    'GN-ACS-012': 'HW-HNG-012',
  };
  const created: Array<{ id: string; name: string; price: bigint }> = [];
  for (const row of rows) {
    const oldSku = Object.entries(skuAliases).find(([, sku]) => sku === row.sku)?.[0];
    let product = await prisma.product.findFirst({
      where: { tenantId, sku: row.sku, deletedAt: null },
    });
    if (!product && oldSku) {
      product = await prisma.product.findFirst({
        where: { tenantId, sku: oldSku, deletedAt: null },
      });
    }
    const payload = {
      sku: row.sku,
      name: row.name,
      description: row.description,
      categoryId: categories.find((item) => item.code === row.cat)?.id ?? null,
      warrantyPeriodId: periods.find((item) => item.code === row.period)?.id ?? null,
      unitPriceMinor: row.price,
      warrantyMonths: row.months,
      currency: 'INR' as const,
      isActive: true,
      updatedBy: actorUserId,
    };
    if (!product) {
      product = await prisma.product.create({
        data: { tenantId, createdBy: actorUserId, ...payload },
      });
    } else {
      product = await prisma.product.update({
        where: { id: product.id },
        data: payload,
      });
    }
    created.push({ id: product.id, name: product.name, price: row.price });
  }
  await prisma.product.updateMany({
    where: {
      tenantId,
      deletedAt: null,
      sku: { notIn: rows.map((row) => row.sku) },
    },
    data: { isActive: false, deletedAt: new Date(), deletedBy: actorUserId },
  });
  return created;
}

async function ensureLeads(
  tenantId: string,
  actorUserId: string,
  pipelineId: string,
  stageByCode: Record<string, { id: string; isWon: boolean; isLost: boolean }>,
  sources: Named[],
  staff: Array<{ id: string; name: string }>,
  lossReasons: Named[],
): Promise<Array<{ id: string; number: string; title: string; ownerId: string; customer: string; city: string }>> {
  const source = (code: string) => sources.find((item) => item.code === code)?.id;
  const owner = (index: number) => staff[index % staff.length];
  const rows = [
    {
      n: 'LD-0001',
      title: 'Sharma bungalow — main door',
      customer: 'Rajesh Sharma',
      city: 'Pune',
      phone: '+919999900001',
      email: 'rajesh.sharma@example.com',
      src: 'website',
      stage: 'new',
      quality: 'hot',
      value: 185_000_00n,
      req: 'Plain steel main door 7×4 ft, powder coated brown, with frame and lock.',
    },
    {
      n: 'LD-0002',
      title: 'Greenfield apartments — sliding windows',
      customer: 'Greenfield Builders',
      city: 'Ahmedabad',
      phone: '+919999900002',
      email: 'projects@greenfield.example',
      src: 'referral',
      stage: 'contacted',
      quality: 'warm',
      value: 586_000_00n,
      req: '48 steel sliding windows for Tower B, mosquito mesh, ivory powder coat.',
    },
    {
      n: 'LD-0003',
      title: 'Kapoor villa — French windows',
      customer: 'Kapoor Residence',
      city: 'Surat',
      phone: '+919999900003',
      email: 'anil.kapoor@example.com',
      src: 'exhibition',
      stage: 'qualified',
      quality: 'cold',
      value: 168_000_00n,
      req: 'French windows for hall and dining, grill on outer leaf.',
    },
    {
      n: 'LD-0004',
      title: 'City Care Hospital — fire doors',
      customer: 'City Care Hospital',
      city: 'Mumbai',
      phone: '+919999900004',
      email: 'facilities@citycare.example',
      src: 'walk_in',
      stage: 'site_visit',
      quality: 'hot',
      value: 263_200_00n,
      req: '8 fire-rated steel doors, 2-hour rating, panic bars on exits.',
    },
    {
      n: 'LD-0005',
      title: 'Vidya Niketan — compound gate',
      customer: 'Vidya Niketan School',
      city: 'Hyderabad',
      phone: '+919999900005',
      email: 'admin@vidyaniketan.example',
      src: 'website',
      stage: 'quotation',
      quality: 'warm',
      value: 38_100_00n,
      req: '5 m compound gate plus 3×6 ft wicket gate for school entrance.',
    },
    {
      n: 'LD-0006',
      title: 'Iyer Homes tower — openable windows',
      customer: 'Iyer Homes',
      city: 'Chennai',
      phone: '+919999900006',
      email: 'tenders@iyerhomes.example',
      src: 'tender',
      stage: 'negotiation',
      quality: 'vip',
      value: 1_008_000_00n,
      req: '120 steel openable windows for residential tower, grey powder coat.',
    },
    {
      n: 'LD-0007',
      title: 'Banerjee Stores — safety door',
      customer: 'Banerjee Stores',
      city: 'Kolkata',
      phone: '+919999900007',
      email: 'kb@banerjeestores.example',
      src: 'dealer',
      stage: 'won',
      quality: 'warm',
      value: 21_200_00n,
      req: 'Shopfront safety door with mesh, powder coated black.',
    },
    {
      n: 'LD-0008',
      title: 'Mehta Flats — window grills',
      customer: 'Mehta Flats',
      city: 'Delhi',
      phone: '+919999900008',
      email: 'mehta.flats@example.com',
      src: 'campaign',
      stage: 'lost',
      quality: 'cold',
      value: 115_200_00n,
      req: 'Window grills for 24 flats. Lost on price to local fabricator.',
      lost: 'price',
    },
    {
      n: 'LD-0009',
      title: 'Nair villa — coastal windows',
      customer: 'Anita Nair',
      city: 'Kochi',
      phone: '+919999900009',
      email: 'anita.nair@example.com',
      src: 'instagram',
      stage: 'contacted',
      quality: 'hot',
      value: 94_250_00n,
      req: 'Sliding windows plus kitchen ventilators, salt-air powder coat.',
    },
    {
      n: 'LD-0010',
      title: 'Joshi warehouse — compound gate',
      customer: 'Joshi Logistics',
      city: 'Nashik',
      phone: '+919999900010',
      email: 'plant@joshilogistics.example',
      src: 'cold_call',
      stage: 'qualified',
      quality: 'warm',
      value: 28_500_00n,
      req: '6 m steel compound gate for warehouse yard.',
    },
    {
      n: 'LD-0011',
      title: 'Singh Textiles — factory fire doors',
      customer: 'Singh Textiles',
      city: 'Chandigarh',
      phone: '+919999900011',
      email: 'rfq@singhtextiles.example',
      src: 'partner',
      stage: 'site_visit',
      quality: 'very_hot',
      value: 197_400_00n,
      req: '6 fire-rated steel doors for factory shop floor and stores.',
    },
    {
      n: 'LD-0012',
      title: 'Sea View Hotel — guest-room doors',
      customer: 'Sea View Hotel',
      city: 'Goa',
      phone: '+919999900012',
      email: 'projects@seaviewhotel.example',
      src: 'google_ads',
      stage: 'quotation',
      quality: 'qualified',
      value: 777_000_00n,
      req: '42 guest-room steel doors with frames, wood-finish powder coat.',
    },
  ];

  const created: Array<{
    id: string;
    number: string;
    title: string;
    ownerId: string;
    customer: string;
    city: string;
  }> = [];
  for (const [index, row] of rows.entries()) {
    const ownerMember = owner(index + 1);
    const stage = stageByCode[row.stage] ?? stageByCode.new;
    const lifecycle = stage.isWon ? 'won' : stage.isLost ? 'lost' : 'open';
    const leadFields = {
      title: row.title,
      customerName: row.customer,
      requirement: row.req,
      primaryPhone: row.phone,
      primaryEmail: row.email,
      quality: row.quality,
      estimatedValueMinor: row.value,
      city: row.city,
      state: 'IN',
      countryCode: 'IN',
      addressLine1: `${row.customer}, ${row.city}`,
      updatedBy: actorUserId,
    };
    let lead = await prisma.lead.findFirst({
      where: { tenantId, leadNumber: row.n, deletedAt: null },
    });
    if (!lead) {
      lead = await prisma.lead.create({
        data: {
          tenantId,
          leadNumber: row.n,
          sourceId: source(row.src),
          pipelineId,
          stageId: stage.id,
          ownerMembershipId: ownerMember.id,
          lifecycleStatus: lifecycle,
          currency: 'INR',
          firstAssignedAt: new Date(),
          lastActivityAt: new Date(),
          createdBy: actorUserId,
          ...leadFields,
          ...(row.lost
            ? { lostReasonId: lossReasons.find((item) => item.code === row.lost)?.id }
            : {}),
        },
      });
      await prisma.leadAssignment.create({
        data: {
          tenantId,
          leadId: lead.id,
          assignedToMembershipId: ownerMember.id,
          assignedByMembershipId: staff[0].id,
          reason: 'Assigned from factory enquiry desk',
          isCurrent: true,
          createdBy: actorUserId,
          updatedBy: actorUserId,
        },
      });
      await prisma.leadStageChange.create({
        data: {
          tenantId,
          leadId: lead.id,
          toStageId: stage.id,
          toLifecycleStatus: lifecycle,
          changedByMembershipId: staff[0].id,
          reason: 'Demo seed',
          createdBy: actorUserId,
        },
      });
    } else {
      lead = await prisma.lead.update({
        where: { id: lead.id },
        data: leadFields,
      });
    }
    created.push({
      id: lead.id,
      number: row.n,
      title: row.title,
      ownerId: ownerMember.id,
      customer: row.customer,
      city: row.city,
    });
  }
  return created;
}

async function ensureActivities(
  tenantId: string,
  actorUserId: string,
  leads: Array<{ id: string; number: string; ownerId: string }>,
  staff: Array<{ id: string }>,
): Promise<void> {
  const existing = await prisma.leadActivity.count({ where: { tenantId, deletedAt: null } });
  if (existing >= 12) {
    return;
  }
  const types = ['note', 'call', 'email', 'meeting', 'sms', 'whatsapp'] as const;
  for (const [index, lead] of leads.entries()) {
    await prisma.leadActivity.create({
      data: {
        tenantId,
        leadId: lead.id,
        type: types[index % types.length],
        eventCode: types[index % types.length],
        subject: `Site measure for ${lead.number}`,
        body: `Discussed opening sizes, powder-coat shade, and delivery for ${lead.number}.`,
        occurredAt: new Date(Date.now() - index * 3_600_000),
        durationMinutes: 10 + index,
        outcome: index % 3 === 0 ? 'connected' : 'attempted',
        performedByMembershipId: lead.ownerId,
        createdBy: actorUserId,
        updatedBy: actorUserId,
      },
    });
  }
}

async function ensureFollowUps(
  tenantId: string,
  actorUserId: string,
  leads: Array<{ id: string; number: string; title: string; ownerId: string }>,
  staff: Array<{ id: string }>,
  days: (offset: number) => Date,
): Promise<void> {
  const types = ['call', 'whatsapp', 'visit', 'meeting'] as const;
  const statuses = ['pending', 'pending', 'completed', 'cancelled'] as const;
  for (const [index, lead] of leads.entries()) {
    const existing = await prisma.followUp.findFirst({
      where: { tenantId, leadId: lead.id, title: `Follow up ${lead.number}`, deletedAt: null },
    });
    const status = statuses[index % statuses.length];
    const data = {
      type: types[index % types.length],
      title: `Follow up ${lead.number}`,
      notes: `Confirm opening sizes and powder-coat shade for ${lead.title}.`,
      dueAt: days(index - 3),
      remindAt: days(index - 4),
      priority: (index % 3) + 1,
      status,
      completedAt: status === 'completed' ? days(index - 4) : null,
      updatedBy: actorUserId,
    };
    if (existing) {
      await prisma.followUp.update({ where: { id: existing.id }, data });
      continue;
    }
    await prisma.followUp.create({
      data: {
        tenantId,
        leadId: lead.id,
        assignedToMembershipId: lead.ownerId,
        createdBy: actorUserId,
        ...data,
      },
    });
  }
  void staff;
}

async function ensureSiteVisits(
  tenantId: string,
  actorUserId: string,
  leads: Array<{ id: string; number: string; title?: string; ownerId: string; customer?: string; city?: string }>,
  staff: Array<{ id: string }>,
  days: (offset: number) => Date,
): Promise<void> {
  const statuses = ['scheduled', 'in_progress', 'completed', 'cancelled', 'no_show'] as const;
  for (const [index, lead] of leads.entries()) {
    const status = statuses[index % statuses.length];
    const scheduledAt = days(index - 2);
    const now = new Date();
    const checkedInAt =
      status === 'completed' || status === 'in_progress'
        ? scheduledAt.getTime() <= now.getTime()
          ? scheduledAt
          : days(-1)
        : undefined;
    const checkedOutAt =
      status === 'completed'
        ? checkedInAt && checkedInAt.getTime() < now.getTime()
          ? now
          : checkedInAt
        : undefined;
    const visitFields = {
      purpose: `Measure openings for ${lead.title ?? lead.number}`,
      notes: 'Record width, height, sill, and powder-coat shade at site.',
      outcome: status === 'completed' ? 'Sizes confirmed, send quotation' : undefined,
      addressLine1: lead.customer ? `${lead.customer} site` : 'Customer site',
      city: lead.city ?? 'Pune',
      state: 'IN',
      updatedBy: actorUserId,
    };
    const existing = await prisma.siteVisit.findFirst({
      where: { tenantId, leadId: lead.id, deletedAt: null },
    });
    if (existing) {
      await prisma.siteVisit.update({
        where: { id: existing.id },
        data: {
          purpose: visitFields.purpose,
          notes: visitFields.notes,
          addressLine1: visitFields.addressLine1,
          city: visitFields.city,
          state: visitFields.state,
          updatedBy: actorUserId,
        },
      });
      continue;
    }
    const visit = await prisma.siteVisit.create({
      data: {
        tenantId,
        leadId: lead.id,
        assignedToMembershipId: lead.ownerId,
        purpose: visitFields.purpose,
        notes: visitFields.notes,
        outcome: status === 'completed' ? 'Sizes confirmed, send quotation' : undefined,
        status,
        scheduledAt,
        checkedInAt,
        checkedOutAt,
        addressLine1: visitFields.addressLine1,
        city: visitFields.city,
        state: visitFields.state,
        scheduledLat: '18.520430',
        scheduledLng: '73.856743',
        customerRating: status === 'completed' ? 4 : undefined,
        createdBy: actorUserId,
        updatedBy: actorUserId,
      },
    });
    const file = await prisma.storedFile.create({
      data: {
        tenantId,
        storageKey: `tenants/${tenantId}/demo/${lead.number}-site.jpg`,
        bucket: 'local',
        originalFilename: `${lead.number}-site.jpg`,
        contentType: 'image/jpeg',
        byteSize: 245_000n,
        status: 'available',
        resourceType: 'site_visit',
        resourceId: visit.id,
        uploadedBy: actorUserId,
        createdBy: actorUserId,
        updatedBy: actorUserId,
      },
    });
    await prisma.siteVisitPhoto.create({
      data: {
        tenantId,
        siteVisitId: visit.id,
        fileId: file.id,
        caption: `Photo ${lead.number}`,
        sortOrder: 0,
        capturedLat: '18.520430',
        capturedLng: '73.856743',
        createdBy: actorUserId,
        updatedBy: actorUserId,
      },
    });
  }
  void staff;
}

async function ensureAttendance(
  tenantId: string,
  actorUserId: string,
  staff: Array<{ id: string; userId: string; name: string }>,
  days: (offset: number) => Date,
): Promise<void> {
  for (const member of staff.slice(0, 6)) {
    for (const offset of [-4, -3, -2, -1]) {
      const day = days(offset);
      const workDate = new Date(Date.UTC(day.getFullYear(), day.getMonth(), day.getDate()));
      const existing = await prisma.attendanceSession.findFirst({
        where: { tenantId, membershipId: member.id, workDate, deletedAt: null },
      });
      if (existing) {
        continue;
      }
      const punchedInAt = new Date(day);
      punchedInAt.setHours(offset === -1 ? 10 : 9, offset === -1 ? 40 : 5, 0, 0);
      const punchedOutAt = new Date(day);
      punchedOutAt.setHours(18, 10, 0, 0);
      await prisma.attendanceSession.create({
        data: {
          tenantId,
          membershipId: member.id,
          workDate,
          punchedInAt,
          punchedOutAt,
          inLat: '18.520430',
          inLng: '73.856743',
          inAccuracyM: '25',
          outLat: '18.520430',
          outLng: '73.856743',
          outAccuracyM: '30',
          createdBy: actorUserId,
          updatedBy: actorUserId,
        },
      });
    }
  }
}

async function ensureQuotations(
  tenantId: string,
  actorUserId: string,
  leads: Array<{ id: string; number: string; title: string; ownerId: string; customer?: string }>,
  staff: Array<{ id: string }>,
  products: Array<{ id: string; name: string; price: bigint }>,
  days: (offset: number) => Date,
): Promise<void> {
  const statuses = [
    'draft',
    'sent',
    'follow_up',
    'customer_deciding',
    'negotiation',
    'approved',
    'won',
    'lost',
    'sent',
    'follow_up',
    'approved',
    'won',
  ] as const;
  const productNames = [
    'Plain steel main door',
    'Steel sliding window',
    'French window',
    'Fire-rated steel door',
    'Compound gate',
    'Steel openable window',
    'Safety door with mesh',
    'Window grill',
    'Steel sliding window',
    'Compound gate',
    'Fire-rated steel door',
    'Designer main door',
  ];
  const quantities = [1, 8, 4, 8, 1, 12, 1, 24, 6, 1, 6, 10];
  const gst = await prisma.taxRate.findFirst({
    where: { tenantId, code: 'gst_18', deletedAt: null },
  });
  for (const [index, lead] of leads.entries()) {
    const quotationNumber = `QT-00${String(index + 1).padStart(2, '0')}`;
    const product =
      products.find((item) => item.name === productNames[index]) ?? products[index % products.length];
    if (!product) {
      continue;
    }
    const qty = quantities[index] ?? index + 1;
    const line = product.price * BigInt(qty);
    const tax = (line * 1800n) / 10000n;
    const total = line + tax;
    const status = statuses[index];
    const header = {
      title: `Quote — ${lead.customer ?? lead.number}`,
      notes: 'Includes fabrication, powder coating, and local delivery. Installation extra unless stated.',
      terms: '50% advance, 40% before dispatch, 10% after installation. GST 18% extra. Offer valid 14 days.',
      subtotalMinor: line,
      taxMinor: tax,
      totalMinor: total,
      updatedBy: actorUserId,
    };
    let quotation = await prisma.quotation.findFirst({
      where: { tenantId, quotationNumber, deletedAt: null },
    });
    if (!quotation) {
      quotation = await prisma.quotation.create({
        data: {
          tenantId,
          leadId: lead.id,
          assignedToMembershipId: lead.ownerId,
          quotationNumber,
          status,
          currency: 'INR',
          validUntilOn: days(14),
          sentAt: status === 'draft' ? undefined : days(-2),
          expectedCloseOn: days(21),
          createdBy: actorUserId,
          ...header,
        },
      });
    } else {
      quotation = await prisma.quotation.update({
        where: { id: quotation.id },
        data: header,
      });
    }
    const itemPayload = {
      productId: product.id,
      description: product.name,
      quantity: qty,
      unitPriceMinor: product.price,
      taxBps: 1800,
      taxRateIds: gst ? [gst.id] : [],
      lineTotalMinor: line,
      updatedBy: actorUserId,
    };
    const existingItem = await prisma.quotationItem.findFirst({
      where: { tenantId, quotationId: quotation.id, deletedAt: null },
      orderBy: { sortOrder: 'asc' },
    });
    if (!existingItem) {
      await prisma.quotationItem.create({
        data: {
          tenantId,
          quotationId: quotation.id,
          sortOrder: 0,
          createdBy: actorUserId,
          ...itemPayload,
        },
      });
    } else {
      await prisma.quotationItem.update({
        where: { id: existingItem.id },
        data: itemPayload,
      });
    }
  }
  void staff;
}

async function ensureWarranties(
  tenantId: string,
  actorUserId: string,
  leads: Array<{ id: string; number: string; ownerId: string }>,
  staff: Array<{ id: string }>,
  products: Array<{ id: string; name: string }>,
  days: (offset: number) => Date,
): Promise<void> {
  const statuses = ['active', 'active', 'active', 'expired', 'claimed', 'void'] as const;
  for (const [index, lead] of leads.entries()) {
    const cardNumber = `WC-00${String(index + 1).padStart(2, '0')}`;
    const existing = await prisma.warrantyCard.findFirst({
      where: { tenantId, cardNumber, deletedAt: null },
    });
    const quotation = await prisma.quotation.findFirst({
      where: { tenantId, leadId: lead.id, deletedAt: null },
    });
    const product = products[index % products.length];
    const coverage =
      'Covers fabrication defects and powder coating. On-site labour within city limits.';
    if (existing) {
      await prisma.warrantyCard.update({
        where: { id: existing.id },
        data: { coverageNotes: coverage, updatedBy: actorUserId },
      });
      const item = await prisma.warrantyCardItem.findFirst({
        where: { tenantId, warrantyCardId: existing.id, deletedAt: null },
      });
      if (item) {
        await prisma.warrantyCardItem.update({
          where: { id: item.id },
          data: { productId: product.id, description: product.name, updatedBy: actorUserId },
        });
      }
      continue;
    }
    const card = await prisma.warrantyCard.create({
      data: {
        tenantId,
        cardNumber,
        verifyToken: `vt-demo-${String(index + 1).padStart(3, '0')}`,
        leadId: lead.id,
        quotationId: quotation?.id,
        serialNumber: `SN-DEMO-${String(index + 1).padStart(4, '0')}`,
        purchasedOn: days(-30 - index),
        warrantyStartOn: days(-30 - index),
        warrantyEndOn: days(335 - index),
        status: statuses[index % statuses.length],
        coverageNotes: 'Covers fabrication defects and powder coating. On-site labour within city limits.',
        issuedByMembershipId: lead.ownerId,
        createdBy: actorUserId,
        updatedBy: actorUserId,
      },
    });
    await prisma.warrantyCardItem.create({
      data: {
        tenantId,
        warrantyCardId: card.id,
        productId: product.id,
        description: product.name,
        serialNumber: `LN-DEMO-${String(index + 1).padStart(4, '0')}`,
        quantity: 1,
        createdBy: actorUserId,
        updatedBy: actorUserId,
      },
    });
  }
  void staff;
}

async function ensureTargets(
  tenantId: string,
  actorUserId: string,
  staff: Array<{ id: string }>,
  products: Array<{ id: string }>,
  days: (offset: number) => Date,
): Promise<void> {
  await ensureKpis();
  const metrics = [
    'revenue',
    'leads_created',
    'leads_won',
    'visits_completed',
    'follow_ups_completed',
    'quotations_accepted',
    'units_sold',
    'lead_conversion',
    'follow_up_completion',
    'sales_achievement',
    'quotation_conversion',
    'revenue',
  ];
  const start = new Date('2026-08-01T00:00:00.000Z');
  const end = new Date('2026-08-31T00:00:00.000Z');
  const qStart = new Date('2026-07-01T00:00:00.000Z');
  const qEnd = new Date('2026-09-30T00:00:00.000Z');
  for (const [index, metric] of metrics.entries()) {
    const isQuarter = index === 11;
    const existing = await prisma.target.findFirst({
      where: {
        tenantId,
        metricCode: metric,
        periodStart: isQuarter ? qStart : start,
        periodType: isQuarter ? 'quarterly' : 'monthly',
        deletedAt: null,
        scopeType: index < 6 ? 'tenant' : 'membership',
      },
    });
    if (existing) {
      continue;
    }
    const target = await prisma.target.create({
      data: {
        tenantId,
        scopeType: index < 6 ? 'tenant' : 'membership',
        scopeId: index < 6 ? undefined : staff[index % staff.length].id,
        productId: index % 4 === 0 ? products[index % products.length].id : undefined,
        metricCode: metric,
        periodType: isQuarter ? 'quarterly' : 'monthly',
        periodStart: isQuarter ? qStart : start,
        periodEnd: isQuarter ? qEnd : end,
        targetValue: String(10_000 + index * 500),
        notes: `Demo ${metric} target`,
        createdBy: actorUserId,
        updatedBy: actorUserId,
      },
    });
    await prisma.achievement.create({
      data: {
        tenantId,
        targetId: target.id,
        membershipId: staff[index % staff.length].id,
        achievedValue: String(4_000 + index * 250),
        source: 'computed',
        recordedOn: days(-1),
        notes: 'Demo achievement',
        createdBy: actorUserId,
        updatedBy: actorUserId,
      },
    });
  }
}

async function ensureKpis(): Promise<void> {
  const rows = [
    { code: 'revenue', name: 'Revenue', unit: 'minor_currency' },
    { code: 'leads_created', name: 'Leads created', unit: 'count' },
    { code: 'leads_won', name: 'Leads won', unit: 'count' },
    { code: 'visits_completed', name: 'Site visits completed', unit: 'count' },
    { code: 'follow_ups_completed', name: 'Follow-ups completed', unit: 'count' },
    { code: 'quotations_accepted', name: 'Quotations accepted', unit: 'count' },
    { code: 'units_sold', name: 'Units sold', unit: 'count' },
    { code: 'lead_conversion', name: 'Lead conversion', unit: 'percent' },
    { code: 'follow_up_completion', name: 'Follow-up completion', unit: 'percent' },
    { code: 'sales_achievement', name: 'Sales achievement', unit: 'percent' },
    { code: 'quotation_conversion', name: 'Quotation conversion', unit: 'percent' },
  ];
  for (const row of rows) {
    await prisma.kpiDefinition.upsert({
      where: { code: row.code },
      update: { name: row.name, unit: row.unit },
      create: row,
    });
  }
}

async function ensureNotifications(
  tenantId: string,
  actorUserId: string,
  staff: Array<{ id: string; userId: string }>,
  leads: Array<{ id: string; number: string }>,
): Promise<void> {
  const count = await prisma.notification.count({ where: { tenantId, deletedAt: null } });
  if (count >= 12) {
    return;
  }
  const events = [
    'lead.assigned',
    'follow_up.due',
    'follow_up.overdue',
    'quotation.sent',
    'quotation.won',
    'site_visit.scheduled',
    'warranty.expiring',
    'target.missed',
    'lead.won',
    'lead.lost',
    'billing.paid',
    'system.digest',
  ];
  for (const [index, eventType] of events.entries()) {
    const lead = leads[index % leads.length];
    await prisma.notification.create({
      data: {
        tenantId,
        userId: staff[0].userId,
        eventType,
        title: eventType.replace('.', ' ').replace('_', ' '),
        body: `${lead.number} — sample ${eventType}`,
        resourceType: 'lead',
        resourceId: lead.id,
        channel: 'in_app',
        status: 'sent',
        sentAt: new Date(),
        createdBy: actorUserId,
        updatedBy: actorUserId,
      },
    });
  }
}

async function ensureComms(
  tenantId: string,
  actorUserId: string,
  leads: Array<{ id: string; number: string }>,
): Promise<void> {
  const templates = [
    { channel: 'sms', code: 'lead_thanks', name: 'Lead thanks', body: 'Thanks for enquiring with INTRA Steel Doors. We will confirm sizes and share a quotation.' },
    { channel: 'sms', code: 'visit_confirm', name: 'Visit confirm', body: 'Your site measurement visit for doors/windows is confirmed.' },
    { channel: 'sms', code: 'quote_ready', name: 'Quote ready', body: 'Your door and window quotation is ready. GST 18% extra.' },
    { channel: 'sms', code: 'overdue', name: 'Overdue reminder', body: 'A follow-up on your door/window enquiry is overdue. Please call the customer.' },
    { channel: 'sms', code: 'reminder', name: 'Generic reminder', body: 'Please share opening sizes so we can complete your quotation.' },
    { channel: 'sms', code: 'payment_due', name: 'Payment due', body: 'Advance for your door/window order is due before fabrication.' },
    { channel: 'whatsapp', code: 'intro', name: 'Intro', body: 'Hello from INTRA Steel Doors. How can we help with doors, windows, grills or gates?' },
    { channel: 'whatsapp', code: 'follow_up', name: 'Follow-up', body: 'Just checking in on your door and window requirement.' },
    { channel: 'whatsapp', code: 'payment', name: 'Payment', body: 'Payment received. Thank you. Fabrication will start shortly.' },
    { channel: 'whatsapp', code: 'won', name: 'Won thanks', body: 'Thank you for the order. Installation will be scheduled after dispatch.' },
    { channel: 'whatsapp', code: 'quote', name: 'Quote share', body: 'Quotation for your doors/windows is ready. Shall we walk through it?' },
    { channel: 'whatsapp', code: 'visit', name: 'Visit ping', body: 'Our engineer will reach site shortly to measure openings.' },
  ];
  for (const row of templates) {
    const existing = await prisma.messageTemplate.findFirst({
      where: { tenantId, channel: row.channel, code: row.code, deletedAt: null },
    });
    if (!existing) {
      await prisma.messageTemplate.create({
        data: { tenantId, createdBy: actorUserId, updatedBy: actorUserId, isActive: true, ...row },
      });
    } else {
      await prisma.messageTemplate.update({
        where: { id: existing.id },
        data: { name: row.name, body: row.body, updatedBy: actorUserId },
      });
    }
  }
  const existingMessages = await prisma.outboundMessage.count({
    where: { tenantId, deletedAt: null },
  });
  if (existingMessages >= 12) {
    return;
  }
  for (const [index, lead] of leads.entries()) {
    await prisma.outboundMessage.create({
      data: {
        tenantId,
        leadId: lead.id,
        channel: index % 2 === 0 ? 'whatsapp' : 'sms',
        toE164: `+9199999000${String(index + 1).padStart(2, '0')}`,
        body: `Demo ${index % 2 === 0 ? 'WhatsApp' : 'SMS'} for ${lead.number}`,
        status: 'sent',
        mode: 'device',
        provider: 'device',
        createdBy: actorUserId,
        updatedBy: actorUserId,
      },
    });
  }
}

async function ensureBilling(
  tenantId: string,
  actorUserId: string,
  leads: Array<{ id: string; number: string; title?: string; customer?: string; city?: string }>,
  days: (offset: number) => Date,
): Promise<void> {
  for (const [index, lead] of leads.entries()) {
    let customer = await prisma.billingCustomer.findFirst({
      where: { tenantId, leadId: lead.id, deletedAt: null },
    });
    const displayName = lead.customer ?? lead.title ?? lead.number;
    if (!customer) {
      customer = await prisma.billingCustomer.create({
        data: {
          tenantId,
          leadId: lead.id,
          provider: 'manual',
          externalId: `CUST-${lead.number}`,
          displayName,
          phoneE164: `+9199999000${String(index + 1).padStart(2, '0')}`,
          email: `${lead.number.toLowerCase()}@demo.local`,
          city: lead.city ?? 'Pune',
          syncStatus: 'synced',
          lastSyncedAt: new Date(),
          createdBy: actorUserId,
          updatedBy: actorUserId,
        },
      });
    } else {
      customer = await prisma.billingCustomer.update({
        where: { id: customer.id },
        data: { displayName, city: lead.city ?? customer.city, updatedBy: actorUserId },
      });
    }
    const invoiceNumber = `INV-00${String(index + 1).padStart(2, '0')}`;
    let invoice = await prisma.billingInvoice.findFirst({
      where: { tenantId, invoiceNumber, deletedAt: null },
    });
    if (!invoice) {
      const quotation = await prisma.quotation.findFirst({
        where: { tenantId, leadId: lead.id, deletedAt: null },
      });
      invoice = await prisma.billingInvoice.create({
        data: {
          tenantId,
          leadId: lead.id,
          quotationId: quotation?.id,
          billingCustomerId: customer.id,
          provider: 'manual',
          externalId: invoiceNumber,
          invoiceNumber,
          status: 'issued',
          paymentStatus: index % 4 === 0 ? 'paid' : 'unpaid',
          totalMinor: 50_000_00n + BigInt(index) * 10_000_00n,
          balanceMinor: index % 4 === 0 ? 0n : 50_000_00n,
          issuedOn: days(-10),
          dueOn: days(5),
          paidAt: index % 4 === 0 ? days(-1) : undefined,
          syncStatus: 'synced',
          createdBy: actorUserId,
          updatedBy: actorUserId,
        },
      });
      await prisma.billingPayment.create({
        data: {
          tenantId,
          invoiceId: invoice.id,
          provider: 'manual',
          externalId: `PAY-${invoiceNumber}`,
          amountMinor: index % 4 === 0 ? invoice.totalMinor : 10_000_00n,
          method: 'upi',
          status: 'captured',
          paidOn: days(-1),
          createdBy: actorUserId,
          updatedBy: actorUserId,
        },
      });
    }
  }
}

async function ensureAuditLogs(
  tenantId: string,
  actorUserId: string,
  leads: Array<{ id: string; number: string }>,
): Promise<void> {
  const count = await prisma.auditLog.count({ where: { tenantId } });
  if (count >= 12) {
    return;
  }
  const actions = [
    'lead.create',
    'lead.assign',
    'lead.stage_change',
    'follow_up.create',
    'quotation.send',
    'site_visit.check_in',
    'warranty.issue',
    'target.create',
    'member.invite',
    'role.assign',
    'invoice.sync',
    'lead.won',
  ];
  for (const [index, action] of actions.entries()) {
    const lead = leads[index % leads.length];
    await prisma.auditLog.create({
      data: {
        tenantId,
        actorId: actorUserId,
        actorType: 'user',
        action,
        resourceType: 'lead',
        resourceId: lead.id,
        afterData: { leadNumber: lead.number, demo: true },
        requestId: `seed-${index + 1}`,
      },
    });
  }
}

async function ensureCodedRows<T extends { code: string; name: string }>(
  list: () => Promise<Array<Id & { code: string }>>,
  create: (row: T) => Promise<unknown>,
  rows: T[],
): Promise<void> {
  const existing = await list();
  const codes = new Set(existing.map((row) => row.code));
  for (const row of rows) {
    if (!codes.has(row.code)) {
      await create(row);
    }
  }
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
