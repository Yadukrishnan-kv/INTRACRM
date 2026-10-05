import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../../../common/config/configuration';
import { PinoLogger } from '../../../common/logging/pino-logger';
import { smsUri, telUri, whatsappUri } from '../domain/comms';

export type GatewayResult = {
  ok: boolean;
  provider: string;
  mode: 'device' | 'sent';
  launchUri: string | null;
  providerMessageId: string | null;
  error: string | null;
};

export type CallInput = {
  customerE164: string;
  agentE164?: string | null;
};

export type MessageInput = {
  toE164: string;
  body: string | null;
};

const TIMEOUT_MS = 8000;

@Injectable()
export class CommsGateway {
  constructor(
    private readonly config: ConfigService<AppConfig, true>,
    private readonly logger: PinoLogger,
  ) {}

  capabilities() {
    return {
      call: {
        mode: this.canTwilioCall() ? 'bridged' : 'device',
        provider: this.canTwilioCall() ? 'twilio' : 'device',
      },
      whatsapp: {
        mode: this.canMetaWhatsapp() ? 'gateway' : 'device',
        provider: this.canMetaWhatsapp() ? 'meta' : 'device',
      },
      sms: {
        mode: this.canTwilioSms() ? 'gateway' : 'device',
        provider: this.canTwilioSms() ? 'twilio' : 'device',
      },
    };
  }

  async startCall(input: CallInput): Promise<GatewayResult> {
    const device: GatewayResult = {
      ok: true,
      provider: 'device',
      mode: 'device',
      launchUri: telUri(input.customerE164),
      providerMessageId: null,
      error: null,
    };
    if (!this.canTwilioCall() || !input.agentE164) {
      return device;
    }
    const twilio = this.config.get('comms', { infer: true }).twilio!;
    const result = await this.twilioForm(twilio, 'Calls.json', {
      To: input.agentE164,
      From: twilio.fromNumber,
      Twiml: `<Response><Dial>${escapeXml(input.customerE164)}</Dial></Response>`,
    });
    if (!result.ok) {
      this.logger.warn(`Twilio click-to-call failed; using device dialer: ${result.error}`);
      return { ...device, error: result.error };
    }
    return {
      ok: true,
      provider: 'twilio',
      mode: 'sent',
      launchUri: null,
      providerMessageId: result.id,
      error: null,
    };
  }

  async sendSms(input: MessageInput): Promise<GatewayResult> {
    const device: GatewayResult = {
      ok: true,
      provider: 'device',
      mode: 'device',
      launchUri: smsUri(input.toE164, input.body ?? undefined),
      providerMessageId: null,
      error: null,
    };
    if (!this.canTwilioSms() || !input.body) {
      return device;
    }
    const twilio = this.config.get('comms', { infer: true }).twilio!;
    const result = await this.twilioForm(twilio, 'Messages.json', {
      To: input.toE164,
      From: twilio.fromNumber,
      Body: input.body,
    });
    if (!result.ok) {
      this.logger.warn(`Twilio SMS failed; using device composer: ${result.error}`);
      return { ...device, error: result.error };
    }
    return {
      ok: true,
      provider: 'twilio',
      mode: 'sent',
      launchUri: null,
      providerMessageId: result.id,
      error: null,
    };
  }

  async sendWhatsapp(input: MessageInput): Promise<GatewayResult> {
    const device: GatewayResult = {
      ok: true,
      provider: 'device',
      mode: 'device',
      launchUri: whatsappUri(input.toE164, input.body ?? undefined),
      providerMessageId: null,
      error: null,
    };
    if (!this.canMetaWhatsapp() || !input.body) {
      return device;
    }
    const meta = this.config.get('comms', { infer: true }).metaWhatsapp!;
    try {
      const response = await fetch(
        `https://graph.facebook.com/v21.0/${encodeURIComponent(meta.phoneNumberId)}/messages`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${meta.token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to: input.toE164.replace(/^\+/, ''),
            type: 'text',
            text: { body: input.body, preview_url: false },
          }),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        },
      );
      const json = (await response.json().catch(() => ({}))) as {
        messages?: Array<{ id?: string }>;
        error?: { message?: string };
      };
      if (!response.ok) {
        this.logger.warn(
          `WhatsApp Cloud API failed; using wa.me: ${json.error?.message ?? response.status}`,
        );
        return { ...device, error: json.error?.message ?? `WhatsApp ${response.status}` };
      }
      return {
        ok: true,
        provider: 'meta',
        mode: 'sent',
        launchUri: null,
        providerMessageId: json.messages?.[0]?.id ?? null,
        error: null,
      };
    } catch {
      this.logger.warn('WhatsApp Cloud API unreachable; using wa.me');
      return { ...device, error: 'WhatsApp gateway unreachable' };
    }
  }

  private canTwilioCall() {
    const comms = this.config.get('comms', { infer: true });
    return comms.callProvider === 'twilio' && comms.twilio != null;
  }

  private canTwilioSms() {
    const comms = this.config.get('comms', { infer: true });
    return comms.smsProvider === 'twilio' && comms.twilio != null;
  }

  private canMetaWhatsapp() {
    const comms = this.config.get('comms', { infer: true });
    return comms.whatsappProvider === 'meta' && comms.metaWhatsapp != null;
  }

  private async twilioForm(
    twilio: { accountSid: string; authToken: string },
    path: string,
    body: Record<string, string>,
  ): Promise<{ ok: true; id: string | null } | { ok: false; error: string }> {
    try {
      const response = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(twilio.accountSid)}/${path}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Basic ${Buffer.from(`${twilio.accountSid}:${twilio.authToken}`).toString('base64')}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams(body),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        },
      );
      const json = (await response.json().catch(() => ({}))) as { sid?: string; message?: string };
      if (!response.ok) {
        return { ok: false, error: json.message ?? `Twilio ${response.status}` };
      }
      return { ok: true, id: json.sid ?? null };
    } catch {
      return { ok: false, error: 'Twilio unreachable' };
    }
  }
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}
