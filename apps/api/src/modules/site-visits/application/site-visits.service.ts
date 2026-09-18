import { readFile } from 'node:fs/promises';
import { HttpStatus, Injectable } from '@nestjs/common';
import { FileStatus, MembershipStatus, Prisma, SiteVisitStatus } from '@prisma/client';
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
import { TIMELINE_EVENT } from '../../activities/domain/timeline-events';
import { TimelineWriter } from '../../activities/application/timeline.writer';
import {
  canCancel,
  canCaptureField,
  canCheckIn,
  canCheckOut,
  canComplete,
  canMarkNoShow,
  resolveCheckOutAt,
  isAllowedPhotoType,
  MAX_SITE_VISIT_PHOTO_BYTES,
  MAX_SITE_VISIT_PHOTOS,
  photoExtension,
  siteVisitCatalog,
} from '../domain/site-visit-types';
import { summarizeSiteVisits } from '../domain/site-visit-report';
import { LocalFileStore } from '../infrastructure/local-file-store';
import { SiteVisitView, toSiteVisitView } from './site-visit.mapper';
import {
  AddSiteVisitPhotoRequest,
  CancelSiteVisitRequest,
  CheckInSiteVisitRequest,
  CheckOutSiteVisitRequest,
  CompleteSiteVisitRequest,
  CreateSiteVisitBody,
  GeoPointRequest,
  SiteVisitFeedbackRequest,
  SiteVisitListQuery,
  SiteVisitNotesRequest,
  SiteVisitReportQuery,
  UpdateSiteVisitRequest,
} from '../interface/http/dto/site-visit.dto';

const visitInclude = {
  assignee: { include: { user: true } },
  lead: { select: { id: true, leadNumber: true, title: true, customerName: true } },
  photos: {
    where: { deletedAt: null },
    include: { file: true },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  },
} satisfies Prisma.SiteVisitInclude;

const visitListInclude = {
  assignee: { include: { user: true } },
  lead: { select: { id: true, leadNumber: true, title: true, customerName: true } },
  _count: { select: { photos: { where: { deletedAt: null } } } },
} satisfies Prisma.SiteVisitInclude;

type VisitRow = Prisma.SiteVisitGetPayload<{ include: typeof visitInclude }>;

@Injectable()
export class SiteVisitsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly timeline: TimelineWriter,
    private readonly files: LocalFileStore,
  ) {}

  catalog() {
    return siteVisitCatalog();
  }

  async list(actor: AuthUser, query: SiteVisitListQuery) {
    const tenantId = this.requireTenant(actor);
    const limit = query.limit ?? DEFAULT_PAGE_LIMIT;
    const where: Prisma.SiteVisitWhereInput = {
      tenantId,
      deletedAt: null,
    };
    if (query.leadId) {
      where.leadId = query.leadId;
    }
    if (query.assignedToMembershipId) {
      where.assignedToMembershipId = query.assignedToMembershipId;
    }
    if (query.status) {
      where.status = query.status;
    }
    if (query.overdue === true) {
      where.status = SiteVisitStatus.scheduled;
      where.scheduledAt = { lt: new Date() };
    }
    if (query.cursor) {
      try {
        const cursor = decodeCursor(query.cursor);
        const scheduledAt = cursor.scheduledAt;
        const id = cursor.id;
        if (!scheduledAt || !id) {
          throw new Error('Invalid cursor');
        }
        where.OR = [
          { scheduledAt: { gt: new Date(scheduledAt) } },
          { scheduledAt: new Date(scheduledAt), id: { gt: id } },
        ];
      } catch {
        throw new AppException(HttpStatus.BAD_REQUEST, 'Invalid cursor', {
          code: ErrorCodes.BAD_REQUEST,
        });
      }
    }
    const rows = await this.prisma.siteVisit.findMany({
      where,
      include: visitListInclude,
      orderBy: [{ scheduledAt: 'asc' }, { id: 'asc' }],
      take: limit + 1,
    });
    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    const last = pageRows[pageRows.length - 1];
    return {
      data: pageRows.map((row) => toSiteVisitView(row)),
      page: buildPageMeta({
        limit,
        hasMore,
        nextCursor:
          hasMore && last
            ? encodeCursor({ scheduledAt: last.scheduledAt.toISOString(), id: last.id })
            : null,
      }),
    };
  }

  async get(actor: AuthUser, visitId: string): Promise<SiteVisitView> {
    const row = await this.requireVisit(this.requireTenant(actor), visitId);
    return toSiteVisitView(row);
  }

  async listForLead(actor: AuthUser, leadId: string): Promise<SiteVisitView[]> {
    const tenantId = this.requireTenant(actor);
    await this.requireLead(tenantId, leadId);
    const rows = await this.prisma.siteVisit.findMany({
      where: { tenantId, leadId, deletedAt: null },
      include: visitListInclude,
      orderBy: [{ scheduledAt: 'desc' }],
    });
    return rows.map((row) => toSiteVisitView(row));
  }

  async create(actor: AuthUser, dto: CreateSiteVisitBody): Promise<SiteVisitView> {
    const tenantId = this.requireTenant(actor);
    const lead = await this.requireLead(tenantId, dto.leadId);
    const assignee = dto.assignedToMembershipId ?? lead.ownerMembershipId ?? actor.membershipId;
    if (!assignee) {
      throw new AppException(HttpStatus.BAD_REQUEST, 'Site visit assignee is required', {
        code: ErrorCodes.VALIDATION_ERROR,
      });
    }
    await this.requireActiveStaff(tenantId, assignee);
    const created = await this.prisma.$transaction(async (tx) => {
      const visit = await tx.siteVisit.create({
        data: {
          tenantId,
          leadId: lead.id,
          assignedToMembershipId: assignee,
          purpose: emptyToNull(dto.purpose),
          notes: emptyToNull(dto.notes),
          addressLine1: emptyToNull(dto.addressLine1),
          city: emptyToNull(dto.city),
          state: emptyToNull(dto.state),
          postalCode: emptyToNull(dto.postalCode),
          scheduledAt: new Date(dto.scheduledAt),
          scheduledLat: dto.scheduledLocation?.latitude ?? null,
          scheduledLng: dto.scheduledLocation?.longitude ?? null,
          createdBy: actor.userId,
          updatedBy: actor.userId,
        },
      });
      await this.timeline.record(
        {
          tenantId,
          leadId: lead.id,
          actor,
          eventCode: TIMELINE_EVENT.siteVisitAdded,
          subject: 'Site Visit Added',
          body: [dto.purpose, dto.city, dto.scheduledAt].filter(Boolean).join(' · ') || null,
          metadata: { siteVisitId: visit.id },
        },
        tx,
      );
      return visit;
    });
    return this.get(actor, created.id);
  }

  async update(actor: AuthUser, visitId: string, dto: UpdateSiteVisitRequest): Promise<SiteVisitView> {
    const tenantId = this.requireTenant(actor);
    const visit = await this.requireVisit(tenantId, visitId);
    this.assertOpen(visit.status, 'updated');
    this.assertVersion(visit.version, dto.version);
    if (dto.assignedToMembershipId) {
      await this.requireActiveStaff(tenantId, dto.assignedToMembershipId);
    }
    const updated = await this.prisma.siteVisit.update({
      where: { id: visit.id },
      data: {
        purpose: dto.purpose !== undefined ? emptyToNull(dto.purpose) : visit.purpose,
        notes: dto.notes !== undefined ? emptyToNull(dto.notes) : visit.notes,
        addressLine1:
          dto.addressLine1 !== undefined ? emptyToNull(dto.addressLine1) : visit.addressLine1,
        city: dto.city !== undefined ? emptyToNull(dto.city) : visit.city,
        state: dto.state !== undefined ? emptyToNull(dto.state) : visit.state,
        postalCode: dto.postalCode !== undefined ? emptyToNull(dto.postalCode) : visit.postalCode,
        scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : visit.scheduledAt,
        assignedToMembershipId: dto.assignedToMembershipId ?? visit.assignedToMembershipId,
        scheduledLat: dto.scheduledLocation?.latitude ?? visit.scheduledLat,
        scheduledLng: dto.scheduledLocation?.longitude ?? visit.scheduledLng,
        updatedBy: actor.userId,
        version: { increment: 1 },
      },
    });
    return this.get(actor, updated.id);
  }

  async checkIn(actor: AuthUser, visitId: string, dto: CheckInSiteVisitRequest): Promise<SiteVisitView> {
    const tenantId = this.requireTenant(actor);
    const visit = await this.requireVisit(tenantId, visitId);
    if (!canCheckIn(visit.status)) {
      throw new AppException(HttpStatus.CONFLICT, 'Site visit cannot be checked in', {
        code: ErrorCodes.CONFLICT,
      });
    }
    this.assertVersion(visit.version, dto.version);
    await this.prisma.$transaction(async (tx) => {
      await tx.siteVisit.update({
        where: { id: visit.id },
        data: {
          status: SiteVisitStatus.in_progress,
          checkedInAt: new Date(),
          checkInLat: dto.location.latitude,
          checkInLng: dto.location.longitude,
          checkInAccuracyM: dto.location.accuracyMeters ?? null,
          notes: dto.notes !== undefined ? emptyToNull(dto.notes) : visit.notes,
          updatedBy: actor.userId,
          version: { increment: 1 },
        },
      });
      await this.timeline.record(
        {
          tenantId,
          leadId: visit.leadId,
          actor,
          eventCode: 'system',
          subject: 'Site visit checked in',
          body: this.geoBody('Checked in', dto.location),
          metadata: { siteVisitId: visit.id },
        },
        tx,
      );
    });
    return this.get(actor, visit.id);
  }

  async checkOut(
    actor: AuthUser,
    visitId: string,
    dto: CheckOutSiteVisitRequest,
  ): Promise<SiteVisitView> {
    const tenantId = this.requireTenant(actor);
    const visit = await this.requireVisit(tenantId, visitId);
    if (!canCheckOut(visit.status)) {
      throw new AppException(HttpStatus.CONFLICT, 'Site visit cannot be checked out', {
        code: ErrorCodes.CONFLICT,
      });
    }
    this.assertVersion(visit.version, dto.version);
    await this.prisma.siteVisit.update({
      where: { id: visit.id },
      data: {
        checkedOutAt: resolveCheckOutAt(visit.checkedInAt),
        checkOutLat: dto.location.latitude,
        checkOutLng: dto.location.longitude,
        checkOutAccuracyM: dto.location.accuracyMeters ?? null,
        notes: dto.notes !== undefined ? emptyToNull(dto.notes) : visit.notes,
        updatedBy: actor.userId,
        version: { increment: 1 },
      },
    });
    return this.get(actor, visit.id);
  }

  async saveNotes(
    actor: AuthUser,
    visitId: string,
    dto: SiteVisitNotesRequest,
  ): Promise<SiteVisitView> {
    const visit = await this.requireVisit(this.requireTenant(actor), visitId);
    if (!canCaptureField(visit.status)) {
      throw new AppException(HttpStatus.CONFLICT, 'Notes can only be updated on an open visit', {
        code: ErrorCodes.CONFLICT,
      });
    }
    this.assertVersion(visit.version, dto.version);
    await this.prisma.siteVisit.update({
      where: { id: visit.id },
      data: {
        notes: emptyToNull(dto.notes),
        updatedBy: actor.userId,
        version: { increment: 1 },
      },
    });
    return this.get(actor, visit.id);
  }

  async saveFeedback(
    actor: AuthUser,
    visitId: string,
    dto: SiteVisitFeedbackRequest,
  ): Promise<SiteVisitView> {
    const visit = await this.requireVisit(this.requireTenant(actor), visitId);
    if (!canCaptureField(visit.status)) {
      throw new AppException(HttpStatus.CONFLICT, 'Feedback can only be captured on an open visit', {
        code: ErrorCodes.CONFLICT,
      });
    }
    this.assertVersion(visit.version, dto.version);
    await this.prisma.siteVisit.update({
      where: { id: visit.id },
      data: {
        customerFeedback:
          dto.customerFeedback !== undefined
            ? emptyToNull(dto.customerFeedback)
            : visit.customerFeedback,
        customerRating: dto.customerRating ?? visit.customerRating,
        feedbackCapturedAt: new Date(),
        updatedBy: actor.userId,
        version: { increment: 1 },
      },
    });
    return this.get(actor, visit.id);
  }

  async complete(
    actor: AuthUser,
    visitId: string,
    dto: CompleteSiteVisitRequest,
  ): Promise<SiteVisitView> {
    const tenantId = this.requireTenant(actor);
    const visit = await this.requireVisit(tenantId, visitId);
    if (!canComplete(visit.status)) {
      throw new AppException(HttpStatus.CONFLICT, 'Site visit cannot be completed', {
        code: ErrorCodes.CONFLICT,
      });
    }
    this.assertVersion(visit.version, dto.version);
    const now = new Date();
    const needsCheckIn = visit.status === SiteVisitStatus.scheduled;
    if (needsCheckIn && !dto.location) {
      throw new AppException(HttpStatus.BAD_REQUEST, 'GPS location is required to complete', {
        code: ErrorCodes.VALIDATION_ERROR,
      });
    }
    const checkedInAt = visit.checkedInAt ?? now;
    const checkedOutAt = visit.checkedOutAt ?? resolveCheckOutAt(checkedInAt, now);
    await this.prisma.$transaction(async (tx) => {
      await tx.siteVisit.update({
        where: { id: visit.id },
        data: {
          status: SiteVisitStatus.completed,
          checkedInAt,
          checkedOutAt,
          checkInLat: needsCheckIn && dto.location ? dto.location.latitude : visit.checkInLat,
          checkInLng: needsCheckIn && dto.location ? dto.location.longitude : visit.checkInLng,
          checkInAccuracyM:
            needsCheckIn && dto.location
              ? (dto.location.accuracyMeters ?? null)
              : visit.checkInAccuracyM,
          checkOutLat: dto.location?.latitude ?? visit.checkOutLat,
          checkOutLng: dto.location?.longitude ?? visit.checkOutLng,
          checkOutAccuracyM: dto.location?.accuracyMeters ?? visit.checkOutAccuracyM,
          outcome: dto.outcome !== undefined ? emptyToNull(dto.outcome) : visit.outcome,
          notes: dto.notes !== undefined ? emptyToNull(dto.notes) : visit.notes,
          customerFeedback:
            dto.customerFeedback !== undefined
              ? emptyToNull(dto.customerFeedback)
              : visit.customerFeedback,
          customerRating: dto.customerRating ?? visit.customerRating,
          feedbackCapturedAt:
            dto.customerFeedback !== undefined || dto.customerRating !== undefined
              ? now
              : visit.feedbackCapturedAt,
          updatedBy: actor.userId,
          version: { increment: 1 },
        },
      });
      await this.timeline.record(
        {
          tenantId,
          leadId: visit.leadId,
          actor,
          eventCode: 'system',
          subject: 'Site visit completed',
          body: dto.outcome?.trim() || visit.purpose || 'Visit completed',
          metadata: { siteVisitId: visit.id },
        },
        tx,
      );
    });
    return this.get(actor, visit.id);
  }

  async cancel(actor: AuthUser, visitId: string, dto: CancelSiteVisitRequest): Promise<SiteVisitView> {
    const tenantId = this.requireTenant(actor);
    const visit = await this.requireVisit(tenantId, visitId);
    if (!canCancel(visit.status)) {
      throw new AppException(HttpStatus.CONFLICT, 'Site visit cannot be cancelled', {
        code: ErrorCodes.CONFLICT,
      });
    }
    this.assertVersion(visit.version, dto.version);
    await this.prisma.$transaction(async (tx) => {
      await tx.siteVisit.update({
        where: { id: visit.id },
        data: {
          status: SiteVisitStatus.cancelled,
          outcome: emptyToNull(dto.reason) ?? visit.outcome,
          updatedBy: actor.userId,
          version: { increment: 1 },
        },
      });
      await this.timeline.record(
        {
          tenantId,
          leadId: visit.leadId,
          actor,
          eventCode: 'system',
          subject: 'Site visit cancelled',
          body: dto.reason?.trim() || null,
          metadata: { siteVisitId: visit.id },
        },
        tx,
      );
    });
    return this.get(actor, visit.id);
  }

  async markNoShow(
    actor: AuthUser,
    visitId: string,
    dto: CancelSiteVisitRequest,
  ): Promise<SiteVisitView> {
    const tenantId = this.requireTenant(actor);
    const visit = await this.requireVisit(tenantId, visitId);
    if (!canMarkNoShow(visit.status)) {
      throw new AppException(HttpStatus.CONFLICT, 'Only a scheduled visit can be marked no-show', {
        code: ErrorCodes.CONFLICT,
      });
    }
    this.assertVersion(visit.version, dto.version);
    await this.prisma.siteVisit.update({
      where: { id: visit.id },
      data: {
        status: SiteVisitStatus.no_show,
        outcome: emptyToNull(dto.reason) ?? visit.outcome,
        updatedBy: actor.userId,
        version: { increment: 1 },
      },
    });
    return this.get(actor, visit.id);
  }

  async addPhoto(
    actor: AuthUser,
    visitId: string,
    dto: AddSiteVisitPhotoRequest,
  ): Promise<SiteVisitView> {
    const tenantId = this.requireTenant(actor);
    const visit = await this.requireVisit(tenantId, visitId);
    if (!canCaptureField(visit.status)) {
      throw new AppException(HttpStatus.CONFLICT, 'Photos can only be added on an open visit', {
        code: ErrorCodes.CONFLICT,
      });
    }
    if (!isAllowedPhotoType(dto.contentType)) {
      throw new AppException(HttpStatus.BAD_REQUEST, 'Unsupported photo type', {
        code: ErrorCodes.VALIDATION_ERROR,
      });
    }
    if (visit.photos.length >= MAX_SITE_VISIT_PHOTOS) {
      throw new AppException(HttpStatus.CONFLICT, 'Photo limit reached', {
        code: ErrorCodes.CONFLICT,
        detail: `A visit can have at most ${MAX_SITE_VISIT_PHOTOS} photos.`,
      });
    }
    const bytes = decodeBase64(dto.contentBase64);
    if (bytes.length === 0 || bytes.length > MAX_SITE_VISIT_PHOTO_BYTES) {
      throw new AppException(HttpStatus.BAD_REQUEST, 'Photo is empty or larger than 5 MB', {
        code: ErrorCodes.VALIDATION_ERROR,
      });
    }
    const saved = await this.files.save({
      tenantId,
      resourceType: 'site-visits',
      resourceId: visit.id,
      extension: photoExtension(dto.contentType),
      bytes,
    });
    try {
      await this.prisma.$transaction(async (tx) => {
        const file = await tx.storedFile.create({
          data: {
            tenantId,
            storageKey: saved.storageKey,
            bucket: 'local',
            originalFilename: emptyToNull(dto.fileName),
            contentType: dto.contentType,
            byteSize: BigInt(bytes.length),
            checksumSha256: saved.checksumSha256,
            status: FileStatus.available,
            resourceType: 'site_visit',
            resourceId: visit.id,
            uploadedBy: actor.userId,
            createdBy: actor.userId,
            updatedBy: actor.userId,
          },
        });
        await tx.siteVisitPhoto.create({
          data: {
            tenantId,
            siteVisitId: visit.id,
            fileId: file.id,
            caption: emptyToNull(dto.caption),
            capturedLat: dto.location?.latitude ?? null,
            capturedLng: dto.location?.longitude ?? null,
            capturedAccuracyM: dto.location?.accuracyMeters ?? null,
            sortOrder: visit.photos.length,
            createdBy: actor.userId,
            updatedBy: actor.userId,
          },
        });
        await tx.siteVisit.update({
          where: { id: visit.id },
          data: { updatedBy: actor.userId, version: { increment: 1 } },
        });
      });
    } catch (error) {
      await this.files.remove(saved.storageKey);
      throw error;
    }
    return this.get(actor, visit.id);
  }

  async photoContent(actor: AuthUser, visitId: string, photoId: string) {
    const visit = await this.requireVisit(this.requireTenant(actor), visitId);
    const photo = visit.photos.find((item) => item.id === photoId);
    if (!photo) {
      throw new AppException(HttpStatus.NOT_FOUND, 'Photo not found', {
        code: ErrorCodes.NOT_FOUND,
      });
    }
    const bytes = await readFile(this.files.resolve(photo.file.storageKey));
    return {
      id: photo.id,
      contentType: photo.file.contentType,
      fileName: photo.file.originalFilename,
      contentBase64: bytes.toString('base64'),
    };
  }

  async removePhoto(actor: AuthUser, visitId: string, photoId: string): Promise<SiteVisitView> {
    const tenantId = this.requireTenant(actor);
    const visit = await this.requireVisit(tenantId, visitId);
    if (!canCaptureField(visit.status)) {
      throw new AppException(HttpStatus.CONFLICT, 'Photos can only be removed on an open visit', {
        code: ErrorCodes.CONFLICT,
      });
    }
    const photo = visit.photos.find((item) => item.id === photoId);
    if (!photo) {
      throw new AppException(HttpStatus.NOT_FOUND, 'Photo not found', {
        code: ErrorCodes.NOT_FOUND,
      });
    }
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.siteVisitPhoto.update({
        where: { id: photo.id },
        data: { deletedAt: now, deletedBy: actor.userId, updatedBy: actor.userId },
      });
      await tx.storedFile.update({
        where: { id: photo.fileId },
        data: {
          status: FileStatus.deleted,
          deletedAt: now,
          deletedBy: actor.userId,
          updatedBy: actor.userId,
        },
      });
      await tx.siteVisit.update({
        where: { id: visit.id },
        data: { updatedBy: actor.userId, version: { increment: 1 } },
      });
    });
    return this.get(actor, visit.id);
  }

  async report(actor: AuthUser, query: SiteVisitReportQuery) {
    const tenantId = this.requireTenant(actor);
    const where: Prisma.SiteVisitWhereInput = { tenantId, deletedAt: null };
    if (query.assignedToMembershipId) {
      where.assignedToMembershipId = query.assignedToMembershipId;
    }
    if (query.from || query.to) {
      where.scheduledAt = {
        ...(query.from ? { gte: new Date(query.from) } : {}),
        ...(query.to ? { lt: new Date(query.to) } : {}),
      };
    }
    const rows = await this.prisma.siteVisit.findMany({
      where,
      include: {
        assignee: { include: { user: true } },
        _count: { select: { photos: { where: { deletedAt: null } } } },
      },
      take: 5000,
    });
    return summarizeSiteVisits(
      rows.map((row) => ({
        status: row.status,
        assignedToMembershipId: row.assignedToMembershipId,
        assigneeName: row.assignee.user.fullName,
        checkInLat: row.checkInLat == null ? null : Number(row.checkInLat),
        customerRating: row.customerRating,
        customerFeedback: row.customerFeedback,
        photoCount: row._count.photos,
      })),
    );
  }

  private geoBody(prefix: string, location: GeoPointRequest): string {
    return `${prefix} at ${location.latitude.toFixed(5)}, ${location.longitude.toFixed(5)}`;
  }

  private async requireVisit(tenantId: string, visitId: string): Promise<VisitRow> {
    const row = await this.prisma.siteVisit.findFirst({
      where: { id: visitId, tenantId, deletedAt: null },
      include: visitInclude,
    });
    if (!row) {
      throw new AppException(HttpStatus.NOT_FOUND, 'Site visit not found', {
        code: ErrorCodes.NOT_FOUND,
      });
    }
    return row;
  }

  private async requireLead(tenantId: string, leadId: string) {
    const lead = await this.prisma.lead.findFirst({
      where: { id: leadId, tenantId, deletedAt: null },
      select: { id: true, ownerMembershipId: true, leadNumber: true, title: true },
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
      where: {
        id: membershipId,
        tenantId,
        deletedAt: null,
        status: MembershipStatus.active,
      },
    });
    if (!staff) {
      throw new AppException(HttpStatus.UNPROCESSABLE_ENTITY, 'Assigned staff is not active', {
        code: ErrorCodes.VALIDATION_ERROR,
        errors: [
          {
            field: 'assignedToMembershipId',
            code: 'invalid',
            message: 'Staff must be an active member of this tenant.',
          },
        ],
      });
    }
  }

  private assertOpen(status: string, action: string) {
    if (!canCaptureField(status)) {
      throw new AppException(HttpStatus.CONFLICT, `Site visit cannot be ${action}`, {
        code: ErrorCodes.CONFLICT,
      });
    }
  }

  private assertVersion(current: number, incoming?: number) {
    if (incoming != null && incoming !== current) {
      throw new AppException(HttpStatus.CONFLICT, 'Site visit was updated by someone else', {
        code: ErrorCodes.STALE_VERSION,
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

function decodeBase64(value: string): Buffer {
  const comma = value.indexOf(',');
  const payload = comma >= 0 ? value.slice(comma + 1) : value;
  return Buffer.from(payload, 'base64');
}
