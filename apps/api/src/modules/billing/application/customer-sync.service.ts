import { HttpStatus, Injectable } from '@nestjs/common';
import { AuthUser } from '../../../common/auth/current-user.decorator';
import { AppException } from '../../../common/exceptions/app.exception';
import { ErrorCodes } from '../../../common/exceptions/error-codes';
import { PrismaService } from '../../../prisma/prisma.service';
import { TIMELINE_EVENT } from '../../activities/domain/timeline-events';
import { TimelineWriter } from '../../activities/application/timeline.writer';
import {
  BILLING_DIRECTION,
  BILLING_RESOURCE,
  customerDisplayName,
  CustomerDraft,
  SYNC_STATUS,
} from '../domain/billing';
import { BillingGateway } from './billing.gateway';

@Injectable()
export class CustomerSyncService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: BillingGateway,
    private readonly timeline: TimelineWriter,
  ) {}

  async syncLead(actor: AuthUser, leadId: string, options?: { quiet?: boolean }) {
    const tenantId = this.requireTenant(actor);
    const lead = await this.prisma.lead.findFirst({
      where: { id: leadId, tenantId, deletedAt: null },
      select: {
        id: true,
        leadNumber: true,
        title: true,
        customerName: true,
        primaryPhone: true,
        primaryEmail: true,
        city: true,
      },
    });
    if (!lead) {
      throw new AppException(HttpStatus.NOT_FOUND, 'Lead not found', { code: ErrorCodes.NOT_FOUND });
    }
    const draft: CustomerDraft = {
      leadId: lead.id,
      leadNumber: lead.leadNumber,
      displayName: customerDisplayName(lead),
      phoneE164: lead.primaryPhone,
      email: lead.primaryEmail,
      city: lead.city,
    };
    const result = await this.gateway.upsertCustomer(draft);
    const status = result.ok ? SYNC_STATUS.synced : SYNC_STATUS.failed;
    const existing = await this.prisma.billingCustomer.findFirst({
      where: { tenantId, leadId: lead.id, deletedAt: null },
    });
    const data = {
      provider: result.provider,
      externalId: result.externalId,
      displayName: draft.displayName,
      phoneE164: draft.phoneE164,
      email: draft.email,
      city: draft.city,
      syncStatus: status,
      lastSyncedAt: result.ok ? new Date() : existing?.lastSyncedAt ?? null,
      lastError: result.error,
      updatedBy: actor.userId,
      version: existing ? { increment: 1 } : undefined,
    };
    const row = existing
      ? await this.prisma.billingCustomer.update({
          where: { id: existing.id },
          data: {
            provider: data.provider,
            externalId: data.externalId,
            displayName: data.displayName,
            phoneE164: data.phoneE164,
            email: data.email,
            city: data.city,
            syncStatus: data.syncStatus,
            lastSyncedAt: data.lastSyncedAt,
            lastError: data.lastError,
            updatedBy: actor.userId,
            version: { increment: 1 },
          },
        })
      : await this.prisma.billingCustomer.create({
          data: {
            tenantId,
            leadId: lead.id,
            provider: data.provider,
            externalId: data.externalId,
            displayName: data.displayName,
            phoneE164: data.phoneE164,
            email: data.email,
            city: data.city,
            syncStatus: data.syncStatus,
            lastSyncedAt: data.lastSyncedAt,
            lastError: data.lastError,
            createdBy: actor.userId,
            updatedBy: actor.userId,
          },
        });
    await this.prisma.billingSyncJob.create({
      data: {
        tenantId,
        resource: BILLING_RESOURCE.customer,
        direction: BILLING_DIRECTION.outbound,
        provider: result.provider,
        localId: row.id,
        externalId: row.externalId,
        status,
        error: result.error,
      },
    });
    if (result.ok && !options?.quiet) {
      await this.timeline.record({
        tenantId,
        leadId: lead.id,
        actor,
        eventCode: TIMELINE_EVENT.customerSynced,
        subject: 'Customer synced',
        body: row.displayName,
        metadata: { provider: row.provider, externalId: row.externalId },
      });
    }
    return this.toView(row);
  }

  toView(row: {
    id: string;
    leadId: string;
    provider: string;
    externalId: string;
    displayName: string;
    phoneE164: string | null;
    email: string | null;
    city: string | null;
    syncStatus: string;
    lastSyncedAt: Date | null;
    lastError: string | null;
  }) {
    return {
      id: row.id,
      leadId: row.leadId,
      provider: row.provider,
      externalId: row.externalId,
      displayName: row.displayName,
      phoneE164: row.phoneE164,
      email: row.email,
      city: row.city,
      syncStatus: row.syncStatus,
      lastSyncedAt: row.lastSyncedAt?.toISOString() ?? null,
      warning: row.lastError,
    };
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
