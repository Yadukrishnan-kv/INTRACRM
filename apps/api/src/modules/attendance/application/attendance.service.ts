import { HttpStatus, Injectable } from '@nestjs/common';
import { MembershipStatus, Prisma } from '@prisma/client';
import { AuthUser } from '../../../common/auth/current-user.decorator';
import { AppException } from '../../../common/exceptions/app.exception';
import { ErrorCodes } from '../../../common/exceptions/error-codes';
import { PrismaService } from '../../../prisma/prisma.service';
import { PERMISSION } from '../../identity/domain/system-roles';
import {
  AttendanceDayStatus,
  DEFAULT_ATTENDANCE_TZ,
  LATE_AFTER_MINUTES,
  dayStatus,
  durationMinutes,
  eachYmd,
  lateAfterLabel,
  parseYmd,
  resolvePunchOutAt,
  workDateYmd,
} from '../domain/attendance-types';
import { AttendanceSessionView, toSessionView } from './attendance.mapper';
import { AttendanceDayQuery, PunchAttendanceRequest } from '../interface/http/dto/attendance.dto';

const sessionInclude = {
  membership: { include: { user: true } },
} satisfies Prisma.AttendanceSessionInclude;

type SessionRow = Prisma.AttendanceSessionGetPayload<{ include: typeof sessionInclude }>;

export type AttendanceDayView = {
  date: string;
  membershipId: string;
  staffName: string | null;
  firstInAt: string | null;
  lastOutAt: string | null;
  minutesWorked: number;
  status: AttendanceDayStatus;
  sessions: AttendanceSessionView[];
};

@Injectable()
export class AttendanceService {
  constructor(private readonly prisma: PrismaService) {}

  async today(actor: AuthUser) {
    const tenantId = this.requireTenant(actor);
    const membershipId = this.requireMembership(actor);
    const timeZone = await this.timezone(tenantId);
    const today = workDateYmd(new Date(), timeZone);
    const days = await this.buildDays(actor, { from: today, to: today, membershipId });
    const open = await this.findOpen(tenantId, membershipId);
    return {
      timezone: timeZone,
      lateAfter: lateAfterLabel(),
      open: open ? toSessionView(open) : null,
      today:
        days[0] ??
        this.emptyDay({
          date: today,
          membershipId,
          staffName: null,
        }),
    };
  }

  async days(actor: AuthUser, query: AttendanceDayQuery) {
    const timeZone = await this.timezone(this.requireTenant(actor));
    const to = (query.to ?? workDateYmd(new Date(), timeZone)).slice(0, 10);
    const from = (query.from ?? this.shiftYmd(to, -13)).slice(0, 10);
    const membershipId = query.membershipId ?? this.requireMembership(actor);
    const items = await this.buildDays(actor, { from, to, membershipId });
    return { timezone: timeZone, lateAfter: lateAfterLabel(), from, to, items };
  }

  async punchIn(actor: AuthUser, dto: PunchAttendanceRequest) {
    const tenantId = this.requireTenant(actor);
    const membershipId = this.requireMembership(actor);
    const existing = await this.findOpen(tenantId, membershipId);
    if (existing) {
      throw new AppException(HttpStatus.CONFLICT, 'Already punched in', {
        code: ErrorCodes.CONFLICT,
        detail: 'Punch out before punching in again.',
      });
    }
    const now = new Date();
    const timeZone = await this.timezone(tenantId);
    try {
      const created = await this.prisma.attendanceSession.create({
        data: {
          tenantId,
          membershipId,
          workDate: parseYmd(workDateYmd(now, timeZone)),
          punchedInAt: now,
          inLat: dto.location.latitude,
          inLng: dto.location.longitude,
          inAccuracyM: dto.location.accuracyMeters ?? null,
          notes: emptyToNull(dto.notes),
          createdBy: actor.userId,
          updatedBy: actor.userId,
        },
        include: sessionInclude,
      });
      return toSessionView(created);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new AppException(HttpStatus.CONFLICT, 'Already punched in', {
          code: ErrorCodes.CONFLICT,
        });
      }
      throw error;
    }
  }

  async punchOut(actor: AuthUser, dto: PunchAttendanceRequest) {
    const tenantId = this.requireTenant(actor);
    const membershipId = this.requireMembership(actor);
    const open = await this.findOpen(tenantId, membershipId);
    if (!open) {
      throw new AppException(HttpStatus.CONFLICT, 'Not punched in', {
        code: ErrorCodes.CONFLICT,
        detail: 'Punch in first.',
      });
    }
    const updated = await this.prisma.attendanceSession.update({
      where: { id: open.id },
      data: {
        punchedOutAt: resolvePunchOutAt(open.punchedInAt),
        outLat: dto.location.latitude,
        outLng: dto.location.longitude,
        outAccuracyM: dto.location.accuracyMeters ?? null,
        notes: dto.notes !== undefined ? emptyToNull(dto.notes) : open.notes,
        updatedBy: actor.userId,
        version: { increment: 1 },
      },
      include: sessionInclude,
    });
    return toSessionView(updated);
  }

  async report(actor: AuthUser, query: AttendanceDayQuery) {
    const tenantId = this.requireTenant(actor);
    const timeZone = await this.timezone(tenantId);
    const to = (query.to ?? workDateYmd(new Date(), timeZone)).slice(0, 10);
    const from = (query.from ?? this.shiftYmd(to, -13)).slice(0, 10);
    const days = await this.buildDays(actor, {
      from,
      to,
      ...(query.membershipId ? { membershipId: query.membershipId } : {}),
    });
    const byStaff = new Map<
      string,
      {
        membershipId: string;
        name: string | null;
        presentDays: number;
        lateDays: number;
        openNow: number;
        minutesWorked: number;
      }
    >();
    const byDay = new Map<string, { date: string; present: number; late: number; open: number }>();
    for (const ymd of eachYmd(from, to)) {
      byDay.set(ymd, { date: ymd, present: 0, late: 0, open: 0 });
    }
    let presentDays = 0;
    let lateDays = 0;
    let openNow = 0;
    let minutesWorked = 0;
    for (const day of days) {
      const staff = byStaff.get(day.membershipId) ?? {
        membershipId: day.membershipId,
        name: day.staffName,
        presentDays: 0,
        lateDays: 0,
        openNow: 0,
        minutesWorked: 0,
      };
      const bucket = byDay.get(day.date);
      if (day.status === 'late') {
        lateDays += 1;
        staff.lateDays += 1;
        if (bucket) bucket.late += 1;
      } else if (day.status === 'open') {
        openNow += 1;
        staff.openNow += 1;
        if (bucket) bucket.open += 1;
      } else if (day.status === 'present') {
        presentDays += 1;
        staff.presentDays += 1;
        if (bucket) bucket.present += 1;
      }
      staff.minutesWorked += day.minutesWorked;
      minutesWorked += day.minutesWorked;
      byStaff.set(day.membershipId, staff);
    }
    return {
      generatedAt: new Date().toISOString(),
      from,
      to,
      timezone: timeZone,
      lateAfter: lateAfterLabel(),
      totals: {
        presentDays,
        lateDays,
        openNow,
        hoursWorked: Math.round((minutesWorked / 60) * 10) / 10,
        staffCount: byStaff.size,
      },
      byStaff: [...byStaff.values()].sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '')),
      byDay: [...byDay.values()],
    };
  }

  private async buildDays(
    actor: AuthUser,
    query: { from: string; to: string; membershipId?: string },
  ): Promise<AttendanceDayView[]> {
    const tenantId = this.requireTenant(actor);
    const timeZone = await this.timezone(tenantId);
    const membershipIds = await this.scopeMembershipIds(actor, query.membershipId);
    const rows = await this.prisma.attendanceSession.findMany({
      where: {
        tenantId,
        deletedAt: null,
        membershipId: { in: membershipIds },
        workDate: { gte: parseYmd(query.from), lte: parseYmd(query.to) },
      },
      include: sessionInclude,
      orderBy: [{ workDate: 'desc' }, { punchedInAt: 'asc' }],
    });
    const staff = await this.prisma.membership.findMany({
      where: { id: { in: membershipIds } },
      include: { user: true },
    });
    const nameById = new Map(staff.map((row) => [row.id, row.user.fullName]));
    const grouped = new Map<string, SessionRow[]>();
    for (const row of rows) {
      const key = `${row.membershipId}:${row.workDate.toISOString().slice(0, 10)}`;
      const list = grouped.get(key) ?? [];
      list.push(row);
      grouped.set(key, list);
    }
    const days: AttendanceDayView[] = [];
    for (const membershipId of membershipIds) {
      for (const ymd of eachYmd(query.from, query.to)) {
        const sessions = grouped.get(`${membershipId}:${ymd}`) ?? [];
        days.push(
          this.toDayView({
            date: ymd,
            membershipId,
            staffName: nameById.get(membershipId) ?? null,
            sessions,
            timeZone,
          }),
        );
      }
    }
    days.sort((a, b) => b.date.localeCompare(a.date) || (a.staffName ?? '').localeCompare(b.staffName ?? ''));
    return days;
  }

  private toDayView(input: {
    date: string;
    membershipId: string;
    staffName: string | null;
    sessions: SessionRow[];
    timeZone: string;
  }): AttendanceDayView {
    const views = input.sessions.map((row) => toSessionView(row));
    const first = input.sessions[0];
    const lastClosed = [...input.sessions].reverse().find((row) => row.punchedOutAt);
    const hasOpen = input.sessions.some((row) => row.punchedOutAt == null);
    const minutesWorked = input.sessions.reduce(
      (sum, row) => sum + durationMinutes(row.punchedInAt, row.punchedOutAt ?? new Date()),
      0,
    );
    return {
      date: input.date,
      membershipId: input.membershipId,
      staffName: input.staffName,
      firstInAt: first?.punchedInAt.toISOString() ?? null,
      lastOutAt: lastClosed?.punchedOutAt?.toISOString() ?? null,
      minutesWorked,
      status: dayStatus({
        firstInAt: first?.punchedInAt ?? null,
        hasOpen,
        timeZone: input.timeZone,
        lateAfterMinutes: LATE_AFTER_MINUTES,
      }),
      sessions: views,
    };
  }

  private emptyDay(input: {
    date: string;
    membershipId: string;
    staffName: string | null;
  }): AttendanceDayView {
    return {
      date: input.date,
      membershipId: input.membershipId,
      staffName: input.staffName,
      firstInAt: null,
      lastOutAt: null,
      minutesWorked: 0,
      status: 'absent',
      sessions: [],
    };
  }

  private async findOpen(tenantId: string, membershipId: string) {
    return this.prisma.attendanceSession.findFirst({
      where: { tenantId, membershipId, punchedOutAt: null, deletedAt: null },
      include: sessionInclude,
    });
  }

  private async scopeMembershipIds(actor: AuthUser, requested?: string): Promise<string[]> {
    const tenantId = this.requireTenant(actor);
    const selfId = this.requireMembership(actor);
    const team = this.canReadTeam(actor);
    if (requested && requested !== selfId && !team) {
      throw new AppException(HttpStatus.FORBIDDEN, 'Cannot read another staff member attendance', {
        code: ErrorCodes.FORBIDDEN,
      });
    }
    if (requested) {
      return [requested];
    }
    if (!team) {
      return [selfId];
    }
    const rows = await this.prisma.membership.findMany({
      where: { tenantId, deletedAt: null, status: MembershipStatus.active },
      select: { id: true },
    });
    return rows.map((row) => row.id);
  }

  private canReadTeam(actor: AuthUser): boolean {
    return Boolean(actor.permissions?.includes(PERMISSION.attendanceReadTeam));
  }

  private async timezone(tenantId: string): Promise<string> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { timezone: true },
    });
    return tenant?.timezone || DEFAULT_ATTENDANCE_TZ;
  }

  private shiftYmd(ymd: string, days: number): string {
    const date = parseYmd(ymd);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
  }

  private requireTenant(actor: AuthUser): string {
    if (!actor.tenantId) {
      throw new AppException(HttpStatus.BAD_REQUEST, 'Tenant required', {
        code: ErrorCodes.TENANT_REQUIRED,
      });
    }
    return actor.tenantId;
  }

  private requireMembership(actor: AuthUser): string {
    if (!actor.membershipId) {
      throw new AppException(HttpStatus.FORBIDDEN, 'Membership required', {
        code: ErrorCodes.FORBIDDEN,
      });
    }
    return actor.membershipId;
  }
}

function emptyToNull(value?: string | null): string | null {
  if (value == null) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}
