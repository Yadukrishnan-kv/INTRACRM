import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { App, cert, deleteApp, getApps, initializeApp } from 'firebase-admin/app';
import { getMessaging, SendResponse } from 'firebase-admin/messaging';
import { AppConfig } from '../../../common/config/configuration';
import { PinoLogger } from '../../../common/logging/pino-logger';
import { fcmDataPayload } from '../domain/notification-events';

export type FcmSendInput = {
  tokens: string[];
  title: string;
  body: string;
  eventType: string;
  resourceType?: string | null;
  resourceId?: string | null;
  notificationId?: string | null;
};

export type FcmSendResult = {
  successCount: number;
  failureCount: number;
  invalidTokens: string[];
};

const INVALID_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
  'messaging/invalid-argument',
]);

@Injectable()
export class FcmGateway implements OnModuleDestroy {
  private readonly app: App | null;

  constructor(
    config: ConfigService<AppConfig, true>,
    private readonly logger: PinoLogger,
  ) {
    const fcm = config.get('fcm', { infer: true });
    if (!fcm) {
      this.app = null;
      return;
    }
    const existing = getApps().find((candidate) => candidate.name === 'intra-leads') ?? null;
    this.app =
      existing ??
      initializeApp(
        {
          credential: cert({
            projectId: fcm.projectId,
            clientEmail: fcm.clientEmail,
            privateKey: fcm.privateKey,
          }),
        },
        'intra-leads',
      );
  }

  get isConfigured(): boolean {
    return this.app !== null;
  }

  async send(input: FcmSendInput): Promise<FcmSendResult> {
    if (!this.app || input.tokens.length === 0) {
      return { successCount: 0, failureCount: 0, invalidTokens: [] };
    }
    const response = await getMessaging(this.app).sendEachForMulticast({
      tokens: input.tokens,
      notification: {
        title: input.title,
        body: input.body,
      },
      data: fcmDataPayload(input),
      android: {
        priority: 'high',
      },
      apns: {
        payload: {
          aps: {
            sound: 'default',
          },
        },
      },
    });
    const invalidTokens: string[] = [];
    response.responses.forEach((item: SendResponse, index: number) => {
      if (item.success) {
        return;
      }
      const code = item.error?.code ?? '';
      const token = input.tokens[index];
      if (token && INVALID_TOKEN_CODES.has(code)) {
        invalidTokens.push(token);
      } else if (item.error) {
        this.logger.warn(`FCM send failed code=${code} message=${item.error.message}`);
      }
    });
    return {
      successCount: response.successCount,
      failureCount: response.failureCount,
      invalidTokens,
    };
  }

  async onModuleDestroy(): Promise<void> {
    if (this.app) {
      await deleteApp(this.app);
    }
  }
}
