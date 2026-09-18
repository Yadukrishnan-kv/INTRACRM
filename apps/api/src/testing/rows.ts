import { FollowUpStatus } from '@prisma/client';
import { MEMBERSHIP_A, TENANT_A, USER_A } from './fixtures';

export function namedRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'named-1',
    code: 'web',
    name: 'Web',
    isActive: true,
    sortOrder: 10,
    version: 1,
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

export function leadListRow(overrides: Record<string, unknown> = {}) {
  const now = new Date('2026-01-02T00:00:00.000Z');
  return {
    id: 'lead-1',
    tenantId: TENANT_A,
    leadNumber: 'LD-0001',
    title: 'Need a door',
    customerName: 'Acme',
    primaryPhone: '+919999999999',
    primaryEmail: 'acme@example.test',
    city: 'Pune',
    requirement: 'Steel door',
    sourceId: 'src-1',
    source: { id: 'src-1', name: 'Web' },
    quality: 'hot',
    estimatedValueMinor: 125000n,
    currency: 'INR',
    ownerMembershipId: MEMBERSHIP_A,
    owner: { user: { fullName: 'Ada' } },
    lifecycleStatus: 'open',
    pipelineId: 'pipe-1',
    stageId: 'stage-1',
    stage: { name: 'New' },
    followUps: [],
    version: 1,
    updatedAt: now,
    createdAt: now,
    lastActivityAt: now,
    firstAssignedAt: now,
    ...overrides,
  };
}

export function leadDetailRow(overrides: Record<string, unknown> = {}) {
  return {
    ...leadListRow(),
    activities: [],
    followUps: [
      {
        id: 'fu-1',
        type: 'call',
        title: 'Call back',
        notes: null,
        dueAt: new Date('2026-01-03T00:00:00.000Z'),
        remindAt: null,
        priority: 1,
        status: FollowUpStatus.pending,
        assignedToMembershipId: MEMBERSHIP_A,
        assignee: { user: { fullName: 'Ada' } },
        completedAt: null,
        rescheduleCount: 0,
        lastRescheduledAt: null,
        version: 1,
        leadId: 'lead-1',
      },
    ],
    ...overrides,
  };
}

export function membershipRow(overrides: Record<string, unknown> = {}) {
  return {
    id: MEMBERSHIP_A,
    tenantId: TENANT_A,
    userId: USER_A,
    designation: 'AE',
    teamId: 'team-1',
    status: 'active',
    user: { fullName: 'Ada', email: 'founder@intraleads.local' },
    team: { id: 'team-1', name: 'Sales' },
    ...overrides,
  };
}
