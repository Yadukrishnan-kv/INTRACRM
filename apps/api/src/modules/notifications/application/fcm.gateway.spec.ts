import { cert, deleteApp, getApps, initializeApp } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { configStub } from '../../../testing/config-stub';
import { FcmGateway } from './fcm.gateway';
import { PinoLogger } from '../../../common/logging/pino-logger';

jest.mock('firebase-admin/app', () => ({
  getApps: jest.fn(() => []),
  initializeApp: jest.fn(() => ({ name: 'intra-leads' })),
  cert: jest.fn((value: unknown) => value),
  deleteApp: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('firebase-admin/messaging', () => ({
  getMessaging: jest.fn(),
}));

const fcmConfig = {
  projectId: 'intra-leads',
  clientEmail: 'fcm@intra-leads.iam.gserviceaccount.com',
  privateKey: '-----BEGIN PRIVATE KEY-----\nMIIE\n-----END PRIVATE KEY-----\n',
};

describe('FcmGateway', () => {
  const logger = { warn: jest.fn() } as unknown as PinoLogger;

  beforeEach(() => {
    jest.clearAllMocks();
    (getApps as jest.Mock).mockReturnValue([]);
    (initializeApp as jest.Mock).mockReturnValue({ name: 'intra-leads' });
  });

  it('sends multicast messages and collects invalid tokens', async () => {
    (getMessaging as jest.Mock).mockReturnValue({
      sendEachForMulticast: jest.fn().mockResolvedValue({
        successCount: 1,
        failureCount: 2,
        responses: [
          { success: true },
          { success: false, error: { code: 'messaging/invalid-registration-token', message: 'bad' } },
          { success: false, error: { code: 'unavailable', message: 'retry' } },
        ],
      }),
    });
    const gateway = new FcmGateway(
      configStub({ fcm: fcmConfig }) as never,
      logger,
    );
    expect(gateway.isConfigured).toBe(true);
    expect(cert).toHaveBeenCalled();
    expect(initializeApp).toHaveBeenCalled();
    await expect(
      gateway.send({
        tokens: ['good', 'bad', 'flaky'],
        title: 'Assigned',
        body: 'LD-1',
        eventType: 'lead.assigned',
        resourceType: 'lead',
        resourceId: 'lead-1',
        notificationId: 'n-1',
      }),
    ).resolves.toEqual({
      successCount: 1,
      failureCount: 2,
      invalidTokens: ['bad'],
    });
    expect(logger.warn).toHaveBeenCalled();
    await expect(gateway.send({ tokens: [], title: 't', body: 'b', eventType: 'lead.assigned' })).resolves.toEqual({
      successCount: 0,
      failureCount: 0,
      invalidTokens: [],
    });
    await gateway.onModuleDestroy();
    expect(deleteApp).toHaveBeenCalled();
  });

  it('reuses an existing Firebase app named intra-leads', async () => {
    const existing = { name: 'intra-leads' };
    (getApps as jest.Mock).mockReturnValue([existing]);
    const gateway = new FcmGateway(configStub({ fcm: fcmConfig }) as never, logger);
    expect(gateway.isConfigured).toBe(true);
    expect(initializeApp).not.toHaveBeenCalled();
    await gateway.onModuleDestroy();
  });
});
