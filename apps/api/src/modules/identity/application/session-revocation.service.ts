import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

/**
 * Shared session/refresh-token revocation used by both AuthService and
 * RbacService. Depends only on Prisma so it can be injected into either
 * without creating a circular dependency.
 */
@Injectable()
export class SessionRevocationService {
  constructor(private readonly prisma: PrismaService) {}

  async revokeSession(sessionId: string): Promise<void> {
    const now = new Date();
    await this.prisma.authSession.update({
      where: { id: sessionId },
      data: { status: 'revoked', revokedAt: now },
    });
    await this.prisma.refreshToken.updateMany({
      where: { sessionId, revokedAt: null },
      data: { revokedAt: now },
    });
  }

  async revokeAllForUser(userId: string): Promise<void> {
    const sessions = await this.prisma.authSession.findMany({
      where: { userId, status: 'active' },
      select: { id: true },
    });
    for (const session of sessions) {
      await this.revokeSession(session.id);
    }
  }

  /**
   * Revokes every active session (and its refresh tokens) the user holds for
   * the given tenant, and deactivates push tokens registered for that tenant.
   * Used when a membership is suspended or ended.
   */
  async revokeAllForUserInTenant(userId: string, tenantId: string): Promise<number> {
    const now = new Date();
    const sessions = await this.prisma.authSession.findMany({
      where: { userId, tenantId, status: 'active' },
      select: { id: true },
    });
    const sessionIds = sessions.map((session) => session.id);
    if (sessionIds.length > 0) {
      await this.prisma.authSession.updateMany({
        where: { id: { in: sessionIds }, status: 'active' },
        data: { status: 'revoked', revokedAt: now },
      });
      await this.prisma.refreshToken.updateMany({
        where: { sessionId: { in: sessionIds }, revokedAt: null },
        data: { revokedAt: now },
      });
    }
    await this.prisma.devicePushToken.updateMany({
      where: { userId, tenantId, revokedAt: null },
      data: { revokedAt: now },
    });
    return sessionIds.length;
  }
}
