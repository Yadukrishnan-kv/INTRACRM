import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma, QuotationStatus } from '@prisma/client';
import { defaultReminderSchedule } from '../../quotations/domain/quotation-follow-up';
import { AuthUser } from '../../../common/auth/current-user.decorator';
import { AppException } from '../../../common/exceptions/app.exception';
import { ErrorCodes } from '../../../common/exceptions/error-codes';
import {
  buildPageMeta,
  decodeCursor,
  DEFAULT_PAGE_LIMIT,
  encodeCursor,
} from '../../../common/pagination/cursor-page';
import { PrismaService } from '../../../prisma/prisma.service';
import { TIMELINE_CATALOG, TIMELINE_EVENT, titleForEvent } from '../domain/timeline-events';
import {
  CreateSiteVisitRequest,
  SendQuotationRequest,
  TimelineQuery,
} from '../interface/http/dto/timeline.dto';
import { TimelineWriter } from './timeline.writer';

@Injectable()
export class TimelineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly writer: TimelineWriter,
  ) {}

  catalog() {
    return TIMELINE_CATALOG;
  }

  async list(actor: AuthUser, query: TimelineQuery) {
    const tenantId = this.requireTenant(actor);
    const limit = query.limit ?? DEFAULT_PAGE_LIMIT;
    const where: Prisma.LeadActivityWhereInput = {
      tenantId,
      deletedAt: null,
      ...(query.leadId ? { leadId: query.leadId } : {}),
      ...(query.eventCode ? { eventCode: query.eventCode } : {}),
    };
    if (query.leadId) {
      await this.requireLead(tenantId, query.leadId);
    }
    if (query.cursor) {
      try {
        const cursor = decodeCursor(query.cursor);
        const occurredAt = cursor.occurredAt;
        const id = cursor.id;
        if (!occurredAt || !id) {
          throw new Error('Invalid cursor');
        }
        where.AND = [
          {
            OR: [
              { occurredAt: { lt: new Date(occurredAt) } },
              { occurredAt: new Date(occurredAt), id: { lt: id } },
            ],
          },
        ];
      } catch {
        throw new AppException(HttpStatus.BAD_REQUEST, 'Invalid cursor', {
          code: ErrorCodes.BAD_REQUEST,
        });
      }
    }

    const rows = await this.prisma.leadActivity.findMany({
      where,
      include: {
        actor: { include: { user: true } },
        lead: true,
      },
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    const last = pageRows[pageRows.length - 1];
    return {
      data: pageRows.map((row) => ({
        id: row.id,
        eventCode: row.eventCode,
        title: titleForEvent(row.eventCode, row.subject),
        subject: row.subject,
        body: row.body,
        occurredAt: row.occurredAt.toISOString(),
        actorName: row.actor?.user.fullName ?? null,
        metadata: row.metadata,
        lead: {
          id: row.lead.id,
          leadNumber: row.lead.leadNumber,
          title: row.lead.title,
          customerName: row.lead.customerName,
        },
      })),
      page: buildPageMeta({
        limit,
        hasMore,
        nextCursor:
          hasMore && last
            ? encodeCursor({ occurredAt: last.occurredAt.toISOString(), id: last.id })
            : null,
      }),
    };
  }

  async addSiteVisit(actor: AuthUser, leadId: string, dto: CreateSiteVisitRequest) {
    const tenantId = this.requireTenant(actor);
    const lead = await this.requireLead(tenantId, leadId);
    const assignee = dto.assignedToMembershipId ?? lead.ownerMembershipId ?? actor.membershipId;
    if (!assignee) {
      throw new AppException(HttpStatus.BAD_REQUEST, 'Site visit assignee is required', {
        code: ErrorCodes.VALIDATION_ERROR,
      });
    }
    await this.requireActiveStaff(tenantId, assignee);
    return this.prisma.$transaction(async (tx) => {
      const visit = await tx.siteVisit.create({
        data: {
          tenantId,
          leadId,
          assignedToMembershipId: assignee,
          purpose: emptyToNull(dto.purpose),
          city: emptyToNull(dto.city),
          notes: emptyToNull(dto.notes),
          scheduledAt: new Date(dto.scheduledAt),
          createdBy: actor.userId,
          updatedBy: actor.userId,
        },
      });
      await this.writer.record(
        {
          tenantId,
          leadId,
          actor,
          eventCode: TIMELINE_EVENT.siteVisitAdded,
          subject: 'Site Visit Added',
          body: [dto.purpose, dto.city, dto.scheduledAt].filter(Boolean).join(' · ') || null,
          metadata: { siteVisitId: visit.id },
        },
        tx,
      );
      return {
        id: visit.id,
        leadId,
        scheduledAt: visit.scheduledAt.toISOString(),
        purpose: visit.purpose,
        city: visit.city,
        status: visit.status,
      };
    });
  }

  async sendQuotation(actor: AuthUser, leadId: string, dto: SendQuotationRequest) {
    const tenantId = this.requireTenant(actor);
    await this.requireLead(tenantId, leadId);
    return this.prisma.$transaction(async (tx) => {
      const [numberRow] = await tx.$queryRaw<Array<{ number: string }>>(
        Prisma.sql`SELECT app.next_document_number(${tenantId}::uuid, 'quotation') AS number`,
      );
      if (!numberRow?.number) {
        throw new AppException(HttpStatus.INTERNAL_SERVER_ERROR, 'Could not allocate quotation number', {
          code: ErrorCodes.INTERNAL_ERROR,
        });
      }
      const now = new Date();
      const tenant = await tx.tenant.findFirst({
        where: { id: tenantId },
        select: { timezone: true },
      });
      const schedule = defaultReminderSchedule({
        now,
        timeZone: tenant?.timezone ?? 'Asia/Kolkata',
        validUntilOn: dto.validUntilOn ?? null,
      });
      const quotation = await tx.quotation.create({
        data: {
          tenantId,
          leadId,
          quotationNumber: numberRow.number,
          status: QuotationStatus.sent,
          currency: (dto.currency ?? 'INR').toUpperCase(),
          subtotalMinor: BigInt(dto.totalMinor),
          totalMinor: BigInt(dto.totalMinor),
          notes: emptyToNull(dto.notes),
          sentAt: now,
          nextFollowUpAt: schedule.nextFollowUpAt,
          remindAt: schedule.remindAt,
          expectedCloseOn: new Date(`${schedule.expectedCloseOn}T00:00:00.000Z`),
          createdBy: actor.userId,
          updatedBy: actor.userId,
          ...(dto.validUntilOn ? { validUntilOn: new Date(dto.validUntilOn) } : {}),
        },
      });
      await this.writer.record(
        {
          tenantId,
          leadId,
          actor,
          eventCode: TIMELINE_EVENT.quotationSent,
          subject: 'Quotation Sent',
          body: `${numberRow.number} · ${(dto.currency ?? 'INR').toUpperCase()} ${(dto.totalMinor / 100).toFixed(0)}`,
          metadata: { quotationId: quotation.id, quotationNumber: numberRow.number },
        },
        tx,
      );
      return {
        id: quotation.id,
        leadId,
        quotationNumber: quotation.quotationNumber,
        status: quotation.status,
        totalMinor: Number(quotation.totalMinor),
        currency: quotation.currency,
        sentAt: quotation.sentAt?.toISOString() ?? now.toISOString(),
      };
    });
  }

  private async requireLead(tenantId: string, leadId: string) {
    const lead = await this.prisma.lead.findFirst({
      where: { id: leadId, tenantId, deletedAt: null },
    });
    if (!lead) {
      throw new AppException(HttpStatus.NOT_FOUND, 'Lead not found', {
        code: ErrorCodes.NOT_FOUND,
      });
    }
    return lead;
  }

  private async requireActiveStaff(tenantId: string, membershipId: string) {
    const staff = await this.prisma.membership.findFirst({
      where: { id: membershipId, tenantId, deletedAt: null, status: 'active' },
    });
    if (!staff) {
      throw new AppException(HttpStatus.UNPROCESSABLE_ENTITY, 'Assigned staff is not active', {
        code: ErrorCodes.VALIDATION_ERROR,
      });
    }
  }

  private requireTenant(actor: AuthUser): string {
    if (!actor.tenantId) {
      throw new AppException(HttpStatus.BAD_REQUEST, 'Tenant required', {
        code: ErrorCodes.TENANT_REQUIRED,
      });
    }
    return actor.tenantId;
  }
}

function emptyToNull(value?: string | null): string | null {
  if (value == null) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}
