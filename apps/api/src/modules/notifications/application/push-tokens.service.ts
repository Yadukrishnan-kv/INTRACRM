import { HttpStatus, Injectable } from '@nestjs/common';
import { AuthUser } from '../../../common/auth/current-user.decorator';
import { AppException } from '../../../common/exceptions/app.exception';
import { ErrorCodes } from '../../../common/exceptions/error-codes';
import { PrismaService } from '../../../prisma/prisma.service';
import { PushPlatform } from '../domain/notification-events';

@Injectable()
export class PushTokensService {
  constructor(private readonly prisma: PrismaService) {}

  async register(
    actor: AuthUser,
    dto: { deviceId: string; platform: PushPlatform; token: string },
  ) {
    const now = new Date();
    await this.prisma.devicePushToken.updateMany({
      where: {
        token: dto.token,
        revokedAt: null,
        NOT: {
          AND: [{ userId: actor.userId }, { deviceId: dto.deviceId }],
        },
      },
      data: { revokedAt: now },
    });
    const existing = await this.prisma.devicePushToken.findFirst({
      where: { userId: actor.userId, deviceId: dto.deviceId, revokedAt: null },
    });
    const row = existing
      ? await this.prisma.devicePushToken.update({
          where: { id: existing.id },
          data: {
            tenantId: actor.tenantId ?? existing.tenantId,
            platform: dto.platform,
            token: dto.token,
            lastSeenAt: now,
          },
        })
      : await this.prisma.devicePushToken.create({
          data: {
            userId: actor.userId,
            tenantId: actor.tenantId ?? null,
            deviceId: dto.deviceId,
            platform: dto.platform,
            token: dto.token,
            lastSeenAt: now,
          },
        });
    return this.toView(row);
  }

  async revokeDevice(actor: AuthUser, deviceId: string) {
    const row = await this.prisma.devicePushToken.findFirst({
      where: { userId: actor.userId, deviceId, revokedAt: null },
    });
    if (!row) {
      throw new AppException(HttpStatus.NOT_FOUND, 'Device token not found', {
        code: ErrorCodes.NOT_FOUND,
      });
    }
    await this.prisma.devicePushToken.update({
      where: { id: row.id },
      data: { revokedAt: new Date() },
    });
    return { revoked: true as const };
  }

  async revokeAllForUser(userId: string) {
    await this.prisma.devicePushToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private toView(row: {
    id: string;
    deviceId: string;
    platform: string;
    lastSeenAt: Date;
  }) {
    return {
      id: row.id,
      deviceId: row.deviceId,
      platform: row.platform,
      lastSeenAt: row.lastSeenAt.toISOString(),
    };
  }
}
