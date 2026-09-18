import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, WarrantyStatus } from '@prisma/client';
import { AuthUser } from '../../../common/auth/current-user.decorator';
import { AppConfig } from '../../../common/config/configuration';
import { AppException } from '../../../common/exceptions/app.exception';
import { ErrorCodes } from '../../../common/exceptions/error-codes';
import {
  buildPageMeta,
  decodeCursor,
  DEFAULT_PAGE_LIMIT,
  encodeCursor,
} from '../../../common/pagination/cursor-page';
import { wholeQuantity } from '../../../common/whole-quantity';
import { PrismaService } from '../../../prisma/prisma.service';
import { TIMELINE_EVENT } from '../../activities/domain/timeline-events';
import { TimelineWriter } from '../../activities/application/timeline.writer';
import { formatYmd } from '../../tasks/domain/zoned-day';
import { dateToYmd, ymdToUtcDate } from '../../targets/domain/target-period';
import { summarizeWarranties } from '../domain/warranty-report';
import {
  ISSUABLE_QUOTATION_STATUSES,
  canTransitionWarranty,
  defaultWarrantyEndOn,
  effectiveWarrantyStatus,
  newVerifyToken,
  parseWarrantyVerifyInput,
  warrantyCatalog,
  warrantyPortalRoot,
  warrantyVerifyUrl,
} from '../domain/warranty-types';
import { PORTAL_JS, renderPortalHomeHtml, renderPortalNotFoundHtml, renderPortalResultHtml } from '../domain/warranty-portal';
import { toPublicWarrantyView, toWarrantyView } from './warranty.mapper';
import { buildWarrantyPdf, qrPngBase64 } from './warranty-pdf';
import {
  ChangeWarrantyStatusRequest,
  CreateWarrantyRequest,
  UpdateWarrantyRequest,
  WarrantyItemInput,
  WarrantyListQuery,
} from '../interface/http/dto/warranty.dto';

const warrantyInclude = {
  lead: { select: { id: true, leadNumber: true, title: true, customerName: true } },
  quotation: { select: { quotationNumber: true } },
  issuer: { include: { user: { select: { fullName: true } } } },
  items: {
    where: { deletedAt: null },
    include: { product: { select: { name: true } } },
    orderBy: [{ createdAt: 'asc' as const }],
  },
} satisfies Prisma.WarrantyCardInclude;

const publicInclude = {
  ...warrantyInclude,
  tenant: { select: { name: true } },
} satisfies Prisma.WarrantyCardInclude;

type WarrantyRow = Prisma.WarrantyCardGetPayload<{ include: typeof warrantyInclude }>;
type PublicWarrantyRow = Prisma.WarrantyCardGetPayload<{ include: typeof publicInclude }>;

@Injectable()
export class WarrantiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly timeline: TimelineWriter,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  async catalog(actor: AuthUser) {
    const tenantId = this.requireTenant(actor);
    const products = await this.prisma.product.findMany({
      where: { tenantId, deletedAt: null, isActive: true },
      orderBy: { name: 'asc' },
      take: 200,
      select: { id: true, sku: true, name: true, warrantyMonths: true },
    });
    return {
      ...warrantyCatalog(),
      products,
    };
  }

  async list(actor: AuthUser, query: WarrantyListQuery) {
    const tenantId = this.requireTenant(actor);
    const limit = query.limit ?? DEFAULT_PAGE_LIMIT;
    const todayYmd = await this.todayYmd(tenantId);
    const where: Prisma.WarrantyCardWhereInput = { tenantId, deletedAt: null };
    if (query.leadId) {
      where.leadId = query.leadId;
    }
    if (query.quotationId) {
      where.quotationId = query.quotationId;
    }
    if (query.q) {
      where.OR = [
        { cardNumber: { contains: query.q, mode: 'insensitive' } },
        { serialNumber: { contains: query.q, mode: 'insensitive' } },
      ];
    }
    if (query.status === 'expired') {
      where.status = WarrantyStatus.active;
      where.warrantyEndOn = { lt: ymdToUtcDate(todayYmd) };
    } else if (query.status === 'active') {
      where.status = WarrantyStatus.active;
      where.warrantyEndOn = { gte: ymdToUtcDate(todayYmd) };
    } else if (query.status) {
      where.status = query.status;
    }
    if (query.cursor) {
      try {
        const cursor = decodeCursor(query.cursor);
        const createdAt = cursor.createdAt;
        const id = cursor.id;
        if (!createdAt || !id) {
          throw new Error('Invalid cursor');
        }
        where.AND = [
          ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
          {
            OR: [
              { createdAt: { lt: new Date(createdAt) } },
              { createdAt: new Date(createdAt), id: { lt: id } },
            ],
          },
        ];
      } catch {
        throw new AppException(HttpStatus.BAD_REQUEST, 'Invalid cursor', {
          code: ErrorCodes.BAD_REQUEST,
        });
      }
    }
    const rows = await this.prisma.warrantyCard.findMany({
      where,
      include: warrantyInclude,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    const last = pageRows[pageRows.length - 1];
    return {
      data: pageRows.map((row) => this.toView(row, todayYmd)),
      page: buildPageMeta({
        limit,
        hasMore,
        nextCursor:
          hasMore && last
            ? encodeCursor({ createdAt: last.createdAt.toISOString(), id: last.id })
            : null,
      }),
    };
  }

  async get(actor: AuthUser, warrantyId: string) {
    const tenantId = this.requireTenant(actor);
    const todayYmd = await this.todayYmd(tenantId);
    return this.toView(await this.requireCard(tenantId, warrantyId), todayYmd);
  }

  async listForLead(actor: AuthUser, leadId: string) {
    const tenantId = this.requireTenant(actor);
    await this.requireLead(tenantId, leadId);
    const todayYmd = await this.todayYmd(tenantId);
    const rows = await this.prisma.warrantyCard.findMany({
      where: { tenantId, leadId, deletedAt: null },
      include: warrantyInclude,
      orderBy: [{ createdAt: 'desc' }],
    });
    return rows.map((row) => this.toView(row, todayYmd));
  }

  async create(actor: AuthUser, dto: CreateWarrantyRequest) {
    const tenantId = this.requireTenant(actor);
    const start = this.requireYmd(dto.warrantyStartOn, 'warrantyStartOn');
    const purchasedOn = dto.purchasedOn ? this.requireYmd(dto.purchasedOn, 'purchasedOn') : null;
    const quotation = dto.quotationId ? await this.requireIssuableQuotation(tenantId, dto.quotationId) : null;
    const leadId = dto.leadId ?? quotation?.leadId ?? null;
    const lead = leadId ? await this.requireLead(tenantId, leadId) : null;
    const items = this.normalizeItems(dto.items);
    const end = dto.warrantyEndOn
      ? this.requireYmd(dto.warrantyEndOn, 'warrantyEndOn')
      : await this.endFromItems(tenantId, start, items);
    if (end < start) {
      throw new AppException(HttpStatus.BAD_REQUEST, 'Warranty end must be on or after start', {
        code: ErrorCodes.BAD_REQUEST,
      });
    }
    const created = await this.prisma.$transaction(async (tx) => {
      const cardNumber = await this.nextNumber(tx, tenantId);
      const card = await tx.warrantyCard.create({
        data: {
          tenantId,
          cardNumber,
          verifyToken: newVerifyToken(),
          warrantyStartOn: ymdToUtcDate(start),
          warrantyEndOn: ymdToUtcDate(end),
          createdBy: actor.userId,
          updatedBy: actor.userId,
          ...(leadId ? { leadId } : {}),
          ...(quotation ? { quotationId: quotation.id } : {}),
          ...(lead?.contactId ? { contactId: lead.contactId } : {}),
          ...(lead?.accountId ? { accountId: lead.accountId } : {}),
          ...(emptyToNull(dto.serialNumber) ? { serialNumber: emptyToNull(dto.serialNumber) } : {}),
          ...(purchasedOn ? { purchasedOn: ymdToUtcDate(purchasedOn) } : {}),
          ...(emptyToNull(dto.coverageNotes) ? { coverageNotes: emptyToNull(dto.coverageNotes) } : {}),
          ...(actor.membershipId ? { issuedByMembershipId: actor.membershipId } : {}),
        },
      });
      for (const item of items) {
        await tx.warrantyCardItem.create({
          data: {
            tenantId,
            warrantyCardId: card.id,
            description: item.description.trim(),
            quantity: wholeQuantity(item.quantity),
            createdBy: actor.userId,
            updatedBy: actor.userId,
            ...(item.productId ? { productId: item.productId } : {}),
            ...(emptyToNull(item.serialNumber) ? { serialNumber: emptyToNull(item.serialNumber) } : {}),
          },
        });
      }
      if (leadId) {
        await this.timeline.record(
          {
            tenantId,
            leadId,
            actor,
            eventCode: TIMELINE_EVENT.warrantyIssued,
            subject: `Warranty ${cardNumber} issued`,
          },
          tx,
        );
      }
      return card.id;
    });
    return this.get(actor, created);
  }

  async update(actor: AuthUser, warrantyId: string, dto: UpdateWarrantyRequest) {
    const tenantId = this.requireTenant(actor);
    const card = await this.requireCard(tenantId, warrantyId);
    this.assertVersion(card.version, dto.version);
    const todayYmd = await this.todayYmd(tenantId);
    const effective = effectiveWarrantyStatus({
      status: card.status,
      warrantyEndOn: dateToYmd(card.warrantyEndOn) ?? todayYmd,
      todayYmd,
    });
    if (effective === 'void') {
      throw new AppException(HttpStatus.CONFLICT, 'Void warranty cards cannot be edited', {
        code: ErrorCodes.CONFLICT,
      });
    }
    const start = dto.warrantyStartOn
      ? this.requireYmd(dto.warrantyStartOn, 'warrantyStartOn')
      : dateToYmd(card.warrantyStartOn);
    const end = dto.warrantyEndOn
      ? this.requireYmd(dto.warrantyEndOn, 'warrantyEndOn')
      : dateToYmd(card.warrantyEndOn);
    if (!start || !end || end < start) {
      throw new AppException(HttpStatus.BAD_REQUEST, 'Warranty end must be on or after start', {
        code: ErrorCodes.BAD_REQUEST,
      });
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.warrantyCard.update({
        where: { id: card.id },
        data: {
          warrantyStartOn: ymdToUtcDate(start),
          warrantyEndOn: ymdToUtcDate(end),
          updatedBy: actor.userId,
          version: { increment: 1 },
          ...(dto.serialNumber !== undefined
            ? { serialNumber: emptyToNull(dto.serialNumber) }
            : {}),
          ...(dto.coverageNotes !== undefined
            ? { coverageNotes: emptyToNull(dto.coverageNotes) }
            : {}),
          ...(dto.purchasedOn !== undefined
            ? { purchasedOn: dto.purchasedOn ? ymdToUtcDate(this.requireYmd(dto.purchasedOn, 'purchasedOn')) : null }
            : {}),
        },
      });
      if (dto.items) {
        const items = this.normalizeItems(dto.items);
        await tx.warrantyCardItem.updateMany({
          where: { warrantyCardId: card.id, deletedAt: null },
          data: { deletedAt: new Date(), deletedBy: actor.userId, updatedBy: actor.userId },
        });
        for (const item of items) {
          await tx.warrantyCardItem.create({
            data: {
              tenantId,
              warrantyCardId: card.id,
              description: item.description.trim(),
              quantity: item.quantity,
              createdBy: actor.userId,
              updatedBy: actor.userId,
              ...(item.productId ? { productId: item.productId } : {}),
              ...(emptyToNull(item.serialNumber) ? { serialNumber: emptyToNull(item.serialNumber) } : {}),
            },
          });
        }
      }
    });
    return this.get(actor, warrantyId);
  }

  async changeStatus(actor: AuthUser, warrantyId: string, dto: ChangeWarrantyStatusRequest) {
    const tenantId = this.requireTenant(actor);
    const card = await this.requireCard(tenantId, warrantyId);
    this.assertVersion(card.version, dto.version);
    const todayYmd = await this.todayYmd(tenantId);
    const from = effectiveWarrantyStatus({
      status: card.status,
      warrantyEndOn: dateToYmd(card.warrantyEndOn) ?? todayYmd,
      todayYmd,
    });
    if (!canTransitionWarranty(from, dto.status)) {
      throw new AppException(HttpStatus.CONFLICT, 'Warranty status cannot change that way', {
        code: ErrorCodes.CONFLICT,
      });
    }
    await this.prisma.warrantyCard.update({
      where: { id: card.id },
      data: {
        status: dto.status,
        updatedBy: actor.userId,
        version: { increment: 1 },
      },
    });
    return this.get(actor, warrantyId);
  }

  async qr(actor: AuthUser, warrantyId: string) {
    const view = await this.get(actor, warrantyId);
    return {
      cardNumber: view.cardNumber,
      verifyUrl: view.verifyUrl,
      mimeType: 'image/png',
      contentBase64: await qrPngBase64(view.verifyUrl),
    };
  }

  async pdf(actor: AuthUser, warrantyId: string) {
    const tenantId = this.requireTenant(actor);
    const card = await this.requireCard(tenantId, warrantyId);
    const todayYmd = await this.todayYmd(tenantId);
    const view = this.toView(card, todayYmd);
    const tenantName = (await this.prisma.tenant.findFirst({
      where: { id: tenantId },
      select: { name: true },
    }))?.name ?? 'INTRA LEADS';
    const bytes = await buildWarrantyPdf({
      tenantName,
      cardNumber: view.cardNumber,
      statusLabel: view.statusLabel,
      customerName: view.customerName,
      serialNumber: view.serialNumber,
      warrantyStartOn: view.warrantyStartOn,
      warrantyEndOn: view.warrantyEndOn,
      coverageNotes: view.coverageNotes,
      verifyUrl: view.verifyUrl,
      items: view.items,
    });
    return {
      fileName: `${view.cardNumber}.pdf`,
      mimeType: 'application/pdf',
      verifyUrl: view.verifyUrl,
      contentBase64: bytes.toString('base64'),
    };
  }

  async verifyPublic(token: string) {
    const parsed = parseWarrantyVerifyInput(token) ?? token.trim().toLowerCase();
    const row = await this.requirePublicCard(parsed);
    const zone = await this.tenantZone(row.tenantId);
    return toPublicWarrantyView(row, { todayYmd: formatYmd(new Date(), zone) });
  }

  portalHomeHtml() {
    return renderPortalHomeHtml(this.portalRoot());
  }

  portalScript() {
    return PORTAL_JS;
  }

  portalNotFoundHtml() {
    return renderPortalNotFoundHtml(this.portalRoot());
  }

  async publicViewHtml(token: string) {
    const parsed = parseWarrantyVerifyInput(token);
    if (!parsed) {
      throw new AppException(HttpStatus.NOT_FOUND, 'Warranty card not found', {
        code: ErrorCodes.NOT_FOUND,
      });
    }
    const view = await this.verifyPublic(parsed);
    return renderPortalResultHtml(view, this.portalRoot(), parsed);
  }

  async publicPdfFile(token: string) {
    const parsed = parseWarrantyVerifyInput(token);
    if (!parsed) {
      throw new AppException(HttpStatus.NOT_FOUND, 'Warranty card not found', {
        code: ErrorCodes.NOT_FOUND,
      });
    }
    const row = await this.requirePublicCard(parsed);
    const zone = await this.tenantZone(row.tenantId);
    const todayYmd = formatYmd(new Date(), zone);
    const view = this.toView(row, todayYmd);
    const bytes = await buildWarrantyPdf({
      tenantName: row.tenant.name,
      cardNumber: view.cardNumber,
      statusLabel: view.statusLabel,
      customerName: view.customerName,
      serialNumber: view.serialNumber,
      warrantyStartOn: view.warrantyStartOn,
      warrantyEndOn: view.warrantyEndOn,
      coverageNotes: view.coverageNotes,
      verifyUrl: view.verifyUrl,
      items: view.items,
    });
    return {
      fileName: `${view.cardNumber.replace(/[^\w.-]+/g, '_')}.pdf`,
      bytes,
    };
  }

  async report(actor: AuthUser) {
    const tenantId = this.requireTenant(actor);
    const todayYmd = await this.todayYmd(tenantId);
    const rows = await this.prisma.warrantyCard.findMany({
      where: { tenantId, deletedAt: null },
      select: { status: true, warrantyEndOn: true },
      take: 5000,
    });
    return {
      generatedAt: new Date().toISOString(),
      ...summarizeWarranties(
        rows.map((row) => ({
          storedStatus: row.status,
          effectiveStatus: effectiveWarrantyStatus({
            status: row.status,
            warrantyEndOn: dateToYmd(row.warrantyEndOn) ?? todayYmd,
            todayYmd,
          }),
        })),
      ),
    };
  }

  private toView(row: WarrantyRow | PublicWarrantyRow, todayYmd: string) {
    return toWarrantyView(row, { todayYmd, verifyUrl: this.verifyUrl(row.verifyToken) });
  }

  private verifyUrl(token: string) {
    return warrantyVerifyUrl(
      this.config.get('url', { infer: true }),
      this.config.get('apiPrefix', { infer: true }),
      token,
    );
  }

  private portalRoot() {
    return warrantyPortalRoot(
      this.config.get('url', { infer: true }),
      this.config.get('apiPrefix', { infer: true }),
    );
  }

  private normalizeItems(items: WarrantyItemInput[]) {
    return items.map((item) => ({
      description: item.description.trim(),
      quantity: wholeQuantity(item.quantity),
      ...(item.productId ? { productId: item.productId } : {}),
      ...(emptyToNull(item.serialNumber) ? { serialNumber: emptyToNull(item.serialNumber) } : {}),
    }));
  }

  private async endFromItems(tenantId: string, start: string, items: ReturnType<WarrantiesService['normalizeItems']>) {
    const productIds = items.flatMap((item) => (item.productId ? [item.productId] : []));
    if (productIds.length === 0) {
      return defaultWarrantyEndOn(start, 12);
    }
    const products = await this.prisma.product.findMany({
      where: { tenantId, id: { in: productIds }, deletedAt: null },
      select: { warrantyMonths: true },
    });
    const months = products.reduce((max, product) => Math.max(max, product.warrantyMonths ?? 0), 0);
    return defaultWarrantyEndOn(start, months > 0 ? months : 12);
  }

  private async nextNumber(tx: Prisma.TransactionClient, tenantId: string): Promise<string> {
    const [row] = await tx.$queryRaw<Array<{ number: string }>>(
      Prisma.sql`SELECT app.next_document_number(${tenantId}::uuid, 'warranty') AS number`,
    );
    if (!row?.number) {
      throw new AppException(HttpStatus.INTERNAL_SERVER_ERROR, 'Could not allocate warranty number', {
        code: ErrorCodes.INTERNAL_ERROR,
      });
    }
    return row.number;
  }

  private async requireCard(tenantId: string, warrantyId: string): Promise<WarrantyRow> {
    const row = await this.prisma.warrantyCard.findFirst({
      where: { id: warrantyId, tenantId, deletedAt: null },
      include: warrantyInclude,
    });
    if (!row) {
      throw new AppException(HttpStatus.NOT_FOUND, 'Warranty card not found', {
        code: ErrorCodes.NOT_FOUND,
      });
    }
    return row;
  }

  private async requirePublicCard(token: string): Promise<PublicWarrantyRow> {
    const row = await this.prisma.warrantyCard.findFirst({
      where: { verifyToken: token, deletedAt: null },
      include: publicInclude,
    });
    if (!row) {
      throw new AppException(HttpStatus.NOT_FOUND, 'Warranty card not found', {
        code: ErrorCodes.NOT_FOUND,
      });
    }
    return row;
  }

  private async requireLead(tenantId: string, leadId: string) {
    const lead = await this.prisma.lead.findFirst({
      where: { id: leadId, tenantId, deletedAt: null },
      select: {
        id: true,
        contactId: true,
        accountId: true,
        title: true,
        leadNumber: true,
        customerName: true,
      },
    });
    if (!lead) {
      throw new AppException(HttpStatus.NOT_FOUND, 'Lead not found', {
        code: ErrorCodes.NOT_FOUND,
      });
    }
    return lead;
  }

  private async requireIssuableQuotation(tenantId: string, quotationId: string) {
    const quotation = await this.prisma.quotation.findFirst({
      where: { id: quotationId, tenantId, deletedAt: null },
      select: { id: true, leadId: true, status: true },
    });
    if (!quotation) {
      throw new AppException(HttpStatus.NOT_FOUND, 'Quotation not found', {
        code: ErrorCodes.NOT_FOUND,
      });
    }
    if (!(ISSUABLE_QUOTATION_STATUSES as readonly string[]).includes(quotation.status)) {
      throw new AppException(HttpStatus.CONFLICT, 'Warranty can be issued from an approved or won quotation', {
        code: ErrorCodes.CONFLICT,
      });
    }
    return quotation;
  }

  private requireYmd(value: string, field: string): string {
    const ymd = value.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
      throw new AppException(HttpStatus.BAD_REQUEST, `Invalid ${field}`, {
        code: ErrorCodes.BAD_REQUEST,
      });
    }
    return ymd;
  }

  private assertVersion(current: number, incoming?: number) {
    if (incoming != null && incoming !== current) {
      throw new AppException(HttpStatus.CONFLICT, 'Warranty was updated by someone else', {
        code: ErrorCodes.STALE_VERSION,
      });
    }
  }

  private async todayYmd(tenantId: string): Promise<string> {
    return formatYmd(new Date(), await this.tenantZone(tenantId));
  }

  private async tenantZone(tenantId: string): Promise<string> {
    const tenant = await this.prisma.tenant.findFirst({
      where: { id: tenantId, deletedAt: null },
      select: { timezone: true },
    });
    return tenant?.timezone ?? 'Asia/Kolkata';
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
  return trimmed.length > 0 ? trimmed : null;
}
