import { FollowUpStatus, FollowUpType } from '@prisma/client';
import { classifyFollowUpBucket, FollowUpEngineBucket } from '../domain/follow-up-engine';
import { isOverdueFollowUp } from '../domain/follow-up-types';

export type FollowUpView = {
  id: string;
  type: string;
  title: string;
  notes: string | null;
  dueAt: string;
  remindAt: string | null;
  priority: number;
  status: string;
  assignedToMembershipId: string;
  assigneeName: string | null;
  leadId: string;
  leadNumber: string | null;
  leadTitle: string | null;
  completedAt: string | null;
  rescheduleCount: number;
  lastRescheduledAt: string | null;
  overdue: boolean;
  engineBucket: FollowUpEngineBucket | null;
  version: number;
};

export type FollowUpMappedRow = {
  id: string;
  type: FollowUpType | string;
  title: string;
  notes: string | null;
  dueAt: Date;
  remindAt?: Date | null;
  priority: number;
  status: FollowUpStatus | string;
  assignedToMembershipId: string;
  completedAt: Date | null;
  rescheduleCount?: number;
  lastRescheduledAt?: Date | null;
  version: number;
  leadId?: string;
  assignee?: { user: { fullName: string } } | null;
  lead?: {
    id: string;
    leadNumber: string;
    title: string;
    customerName: string | null;
  } | null;
};

export function toFollowUpView(
  row: FollowUpMappedRow,
  lead?: { id: string; leadNumber: string; title: string } | null,
  clock?: { now: Date; timeZone: string },
): FollowUpView {
  const leadId = row.lead?.id ?? lead?.id ?? row.leadId ?? '';
  const now = clock?.now ?? new Date();
  const timeZone = clock?.timeZone ?? 'Asia/Kolkata';
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    notes: row.notes,
    dueAt: row.dueAt.toISOString(),
    remindAt: row.remindAt?.toISOString() ?? null,
    priority: row.priority,
    status: row.status,
    assignedToMembershipId: row.assignedToMembershipId,
    assigneeName: row.assignee?.user.fullName ?? null,
    leadId,
    leadNumber: row.lead?.leadNumber ?? lead?.leadNumber ?? null,
    leadTitle: row.lead?.title ?? lead?.title ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    rescheduleCount: row.rescheduleCount ?? 0,
    lastRescheduledAt: row.lastRescheduledAt?.toISOString() ?? null,
    overdue: isOverdueFollowUp(row.status, row.dueAt, now),
    engineBucket: classifyFollowUpBucket({
      status: row.status,
      dueAt: row.dueAt,
      now,
      timeZone,
    }),
    version: row.version,
  };
}
