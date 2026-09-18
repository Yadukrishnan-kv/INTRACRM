import { HttpStatus, Injectable } from '@nestjs/common';
import { ActivityType } from '@prisma/client';
import { AuthUser } from '../../../common/auth/current-user.decorator';
import { AppException } from '../../../common/exceptions/app.exception';
import { ErrorCodes } from '../../../common/exceptions/error-codes';
import { PrismaService } from '../../../prisma/prisma.service';
import { TIMELINE_EVENT } from '../../activities/domain/timeline-events';
import { parseLeadPhone } from '../../crm-leads/domain/lead-validation';
import {
  assertMessageBody,
  COMMS_CHANNEL,
  COMMS_STATUS,
  DEFAULT_MESSAGE_TEMPLATES,
  MessageTemplateChannel,
  renderTemplate,
} from '../domain/comms';
import {
  CreateMessageTemplateRequest,
  SendCallRequest,
  SendMessageRequest,
  UpdateMessageTemplateRequest,
} from '../interface/http/dto/comms.dto';
import { CommsGateway } from './comms.gateway';

export type OutboundView = {
  id: string;
  channel: string;
  to: string;
  body: string | null;
  status: string;
  mode: string;
  provider: string;
  launchUri: string | null;
  activityId: string | null;
  warning: string | null;
};

@Injectable()
export class CommsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: CommsGateway,
  ) {}

  capabilities() {
    return this.gateway.capabilities();
  }

  async listTemplates(actor: AuthUser, channel?: MessageTemplateChannel) {
    const tenantId = this.requireTenant(actor);
    await this.ensureDefaults(tenantId, actor.userId);
    const rows = await this.prisma.messageTemplate.findMany({
      where: {
        tenantId,
        deletedAt: null,
        isActive: true,
        ...(channel ? { channel } : {}),
      },
      orderBy: [{ channel: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
    });
    return rows.map((row) => ({
      id: row.id,
      channel: row.channel,
      code: row.code,
      name: row.name,
      body: row.body,
    }));
  }

  async createTemplate(actor: AuthUser, dto: CreateMessageTemplateRequest) {
    const tenantId = this.requireTenant(actor);
    const clash = await this.prisma.messageTemplate.findFirst({
      where: { tenantId, channel: dto.channel, code: dto.code, deletedAt: null },
    });
    if (clash) {
      throw new AppException(HttpStatus.CONFLICT, 'Template already exists', {
        code: ErrorCodes.CONFLICT,
        errors: [{ field: 'code', code: 'duplicate', message: 'This template code is already in use.' }],
      });
    }
    const row = await this.prisma.messageTemplate.create({
      data: {
        tenantId,
        channel: dto.channel,
        code: dto.code,
        name: dto.name.trim(),
        body: dto.body.trim(),
        createdBy: actor.userId,
        updatedBy: actor.userId,
      },
    });
    return { id: row.id, channel: row.channel, code: row.code, name: row.name, body: row.body };
  }

  async updateTemplate(actor: AuthUser, id: string, dto: UpdateMessageTemplateRequest) {
    const tenantId = this.requireTenant(actor);
    const current = await this.prisma.messageTemplate.findFirst({
      where: { id, tenantId, deletedAt: null },
    });
    if (!current) {
      throw new AppException(HttpStatus.NOT_FOUND, 'Template not found', { code: ErrorCodes.NOT_FOUND });
    }
    const row = await this.prisma.messageTemplate.update({
      where: { id },
      data: {
        name: dto.name?.trim() ?? current.name,
        body: dto.body?.trim() ?? current.body,
        isActive: dto.isActive ?? current.isActive,
        updatedBy: actor.userId,
        version: { increment: 1 },
      },
    });
    return { id: row.id, channel: row.channel, code: row.code, name: row.name, body: row.body };
  }

  async deleteTemplate(actor: AuthUser, id: string) {
    const tenantId = this.requireTenant(actor);
    const current = await this.prisma.messageTemplate.findFirst({
      where: { id, tenantId, deletedAt: null },
    });
    if (!current) {
      throw new AppException(HttpStatus.NOT_FOUND, 'Template not found', { code: ErrorCodes.NOT_FOUND });
    }
    await this.prisma.messageTemplate.update({
      where: { id },
      data: { deletedAt: new Date(), deletedBy: actor.userId, isActive: false, version: { increment: 1 } },
    });
    return { deleted: true };
  }

  async call(actor: AuthUser, leadId: string, dto: SendCallRequest): Promise<OutboundView> {
    const notes = assertMessageBody(COMMS_CHANNEL.call, dto.notes);
    if (!notes.ok) {
      this.invalid('notes', notes.message);
    }
    return this.dispatch(actor, leadId, COMMS_CHANNEL.call, notes.body);
  }

  async whatsapp(actor: AuthUser, leadId: string, dto: SendMessageRequest): Promise<OutboundView> {
    return this.dispatchMessage(actor, leadId, COMMS_CHANNEL.whatsapp, dto);
  }

  async sms(actor: AuthUser, leadId: string, dto: SendMessageRequest): Promise<OutboundView> {
    return this.dispatchMessage(actor, leadId, COMMS_CHANNEL.sms, dto);
  }

  private async dispatchMessage(
    actor: AuthUser,
    leadId: string,
    channel: typeof COMMS_CHANNEL.whatsapp | typeof COMMS_CHANNEL.sms,
    dto: SendMessageRequest,
  ) {
    const tenantId = this.requireTenant(actor);
    const lead = await this.requireLead(tenantId, leadId);
    let body = dto.body?.trim() ?? '';
    if (!body && dto.templateCode) {
      await this.ensureDefaults(tenantId, actor.userId);
      const template = await this.prisma.messageTemplate.findFirst({
        where: {
          tenantId,
          channel,
          code: dto.templateCode,
          deletedAt: null,
          isActive: true,
        },
      });
      if (!template) {
        this.invalid('templateCode', 'Choose an active message template.');
      }
      body = renderTemplate(template.body, await this.templateVars(tenantId, lead, actor));
    }
    const checked = assertMessageBody(channel, body);
    if (!checked.ok) {
      this.invalid('body', checked.message);
    }
    return this.dispatch(actor, leadId, channel, checked.body, lead);
  }

  private async dispatch(
    actor: AuthUser,
    leadId: string,
    channel: typeof COMMS_CHANNEL.call | typeof COMMS_CHANNEL.whatsapp | typeof COMMS_CHANNEL.sms,
    body: string | null,
    loadedLead?: LeadRow,
  ): Promise<OutboundView> {
    const tenantId = this.requireTenant(actor);
    const lead = loadedLead ?? (await this.requireLead(tenantId, leadId));
    const phone = this.requirePhone(lead.primaryPhone);
    const agentPhone = actor.membershipId
      ? await this.agentPhone(tenantId, actor.membershipId)
      : null;

    const result =
      channel === COMMS_CHANNEL.call
        ? await this.gateway.startCall({ customerE164: phone, agentE164: agentPhone })
        : channel === COMMS_CHANNEL.sms
          ? await this.gateway.sendSms({ toE164: phone, body })
          : await this.gateway.sendWhatsapp({ toE164: phone, body });

    const status = result.mode === 'sent' ? COMMS_STATUS.sent : COMMS_STATUS.launched;
    const event =
      channel === COMMS_CHANNEL.call
        ? TIMELINE_EVENT.callStarted
        : channel === COMMS_CHANNEL.sms
          ? TIMELINE_EVENT.smsSent
          : TIMELINE_EVENT.whatsappSent;
    const subject =
      channel === COMMS_CHANNEL.call
        ? result.mode === 'sent'
          ? 'Click to call'
          : 'Call'
        : channel === COMMS_CHANNEL.sms
          ? 'SMS'
          : 'WhatsApp';

    const created = await this.prisma.$transaction(async (tx) => {
      const activity = await tx.leadActivity.create({
        data: {
          tenantId,
          leadId: lead.id,
          type: channel as ActivityType,
          eventCode: event,
          subject,
          body,
          performedByMembershipId: actor.membershipId ?? null,
          metadata: {
            channel,
            to: phone,
            provider: result.provider,
            mode: result.mode,
          },
          createdBy: actor.userId,
          updatedBy: actor.userId,
        },
      });
      await tx.lead.update({
        where: { id: lead.id },
        data: { lastActivityAt: new Date() },
      });
      const message = await tx.outboundMessage.create({
        data: {
          tenantId,
          leadId: lead.id,
          activityId: activity.id,
          channel,
          toE164: phone,
          body,
          status,
          mode: result.mode,
          provider: result.provider,
          providerMessageId: result.providerMessageId ?? null,
          launchUri: result.launchUri ?? null,
          error: result.error ?? null,
          createdBy: actor.userId,
          updatedBy: actor.userId,
        },
      });
      return message;
    });

    return {
      id: created.id,
      channel: created.channel,
      to: created.toE164,
      body: created.body,
      status: created.status,
      mode: created.mode,
      provider: created.provider,
      launchUri: created.launchUri,
      activityId: created.activityId,
      warning: created.error,
    };
  }

  private async ensureDefaults(tenantId: string, actorUserId?: string) {
    for (const template of DEFAULT_MESSAGE_TEMPLATES) {
      const existing = await this.prisma.messageTemplate.findFirst({
        where: { tenantId, channel: template.channel, code: template.code, deletedAt: null },
      });
      if (!existing) {
        await this.prisma.messageTemplate.create({
          data: {
            tenantId,
            channel: template.channel,
            code: template.code,
            name: template.name,
            body: template.body,
            sortOrder: template.sortOrder,
            createdBy: actorUserId ?? null,
            updatedBy: actorUserId ?? null,
          },
        });
      }
    }
  }

  private async templateVars(
    tenantId: string,
    lead: LeadRow,
    actor: AuthUser,
  ): Promise<Record<string, string>> {
    return {
      customer_name: lead.customerName?.trim() || lead.title,
      lead_title: lead.title,
      lead_number: lead.leadNumber,
      staff_name: (await this.staffName(tenantId, actor.membershipId)) ?? 'INTRA LEADS',
      city: lead.city ?? '',
    };
  }

  private async staffName(tenantId: string, membershipId?: string): Promise<string | null> {
    if (!membershipId) {
      return null;
    }
    const membership = await this.prisma.membership.findFirst({
      where: { id: membershipId, tenantId, deletedAt: null },
      include: { user: true },
    });
    return membership?.user.fullName ?? null;
  }

  private requirePhone(input?: string | null): string {
    const parsed = parseLeadPhone(input);
    if (!parsed.ok || !parsed.value) {
      throw new AppException(HttpStatus.UNPROCESSABLE_ENTITY, 'Lead has no valid phone number', {
        code: ErrorCodes.VALIDATION_ERROR,
        errors: [{ field: 'primaryPhone', code: 'required', message: 'Add a phone number before calling or messaging.' }],
      });
    }
    return parsed.value;
  }

  private async agentPhone(tenantId: string, membershipId: string): Promise<string | null> {
    const membership = await this.prisma.membership.findFirst({
      where: { id: membershipId, tenantId, deletedAt: null },
      include: { user: true },
    });
    const parsed = parseLeadPhone(membership?.user.phoneE164);
    return parsed.ok ? parsed.value : null;
  }

  private async requireLead(tenantId: string, leadId: string): Promise<LeadRow> {
    const lead = await this.prisma.lead.findFirst({
      where: { id: leadId, tenantId, deletedAt: null },
      select: {
        id: true,
        title: true,
        leadNumber: true,
        customerName: true,
        primaryPhone: true,
        city: true,
      },
    });
    if (!lead) {
      throw new AppException(HttpStatus.NOT_FOUND, 'Lead not found', { code: ErrorCodes.NOT_FOUND });
    }
    return lead;
  }

  private invalid(field: string, message: string): never {
    throw new AppException(HttpStatus.UNPROCESSABLE_ENTITY, message, {
      code: ErrorCodes.VALIDATION_ERROR,
      errors: [{ field, code: 'invalid', message }],
    });
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

type LeadRow = {
  id: string;
  title: string;
  leadNumber: string;
  customerName: string | null;
  primaryPhone: string | null;
  city: string | null;
};
