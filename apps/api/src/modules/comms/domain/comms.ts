export const COMMS_CHANNEL = {
  call: 'call',
  whatsapp: 'whatsapp',
  sms: 'sms',
} as const;

export type CommsChannel = (typeof COMMS_CHANNEL)[keyof typeof COMMS_CHANNEL];

export const COMMS_CHANNELS = [
  COMMS_CHANNEL.call,
  COMMS_CHANNEL.whatsapp,
  COMMS_CHANNEL.sms,
] as const;

export const MESSAGE_TEMPLATE_CHANNELS = [COMMS_CHANNEL.whatsapp, COMMS_CHANNEL.sms] as const;
export type MessageTemplateChannel = (typeof MESSAGE_TEMPLATE_CHANNELS)[number];

export const COMMS_MODE = {
  device: 'device',
  sent: 'sent',
} as const;

export type CommsMode = (typeof COMMS_MODE)[keyof typeof COMMS_MODE];

export const COMMS_STATUS = {
  launched: 'launched',
  sent: 'sent',
  failed: 'failed',
} as const;

export const SMS_BODY_MAX = 1000;
export const WHATSAPP_BODY_MAX = 4096;
export const CALL_NOTE_MAX = 1000;

export const DEFAULT_MESSAGE_TEMPLATES = [
  {
    channel: COMMS_CHANNEL.whatsapp,
    code: 'intro',
    name: 'Introduction',
    body: 'Hi {{customer_name}}, this is {{staff_name}} regarding {{lead_title}} ({{lead_number}}).',
    sortOrder: 10,
  },
  {
    channel: COMMS_CHANNEL.whatsapp,
    code: 'follow_up',
    name: 'Follow-up',
    body: 'Hi {{customer_name}}, following up on {{lead_title}}. When is a good time to connect?',
    sortOrder: 20,
  },
  {
    channel: COMMS_CHANNEL.sms,
    code: 'intro',
    name: 'Introduction',
    body: 'Hi {{customer_name}}, {{staff_name}} here about {{lead_title}} ({{lead_number}}).',
    sortOrder: 10,
  },
  {
    channel: COMMS_CHANNEL.sms,
    code: 'follow_up',
    name: 'Follow-up',
    body: 'Hi {{customer_name}}, following up on {{lead_title}}. Please reply with a suitable time.',
    sortOrder: 20,
  },
] as const;

export function e164Digits(e164: string): string {
  return e164.replace(/^\+/, '').replace(/\D/g, '');
}

export function telUri(e164: string): string {
  return `tel:${e164}`;
}

export function smsUri(e164: string, body?: string): string {
  if (!body) {
    return `sms:${e164}`;
  }
  return `sms:${e164}?body=${encodeURIComponent(body)}`;
}

export function whatsappUri(e164: string, body?: string): string {
  const base = `https://wa.me/${e164Digits(e164)}`;
  if (!body) {
    return base;
  }
  return `${base}?text=${encodeURIComponent(body)}`;
}

export function renderTemplate(body: string, vars: Record<string, string>): string {
  return body.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key: string) => vars[key] ?? '');
}

export function assertMessageBody(channel: CommsChannel, body?: string) {
  const text = body?.trim() ?? '';
  if (channel === COMMS_CHANNEL.call) {
    if (text.length > CALL_NOTE_MAX) {
      return { ok: false as const, message: `Call notes must be ${CALL_NOTE_MAX} characters or fewer.` };
    }
    return { ok: true as const, body: text === '' ? null : text };
  }
  if (channel === COMMS_CHANNEL.sms) {
    if (text.length < 1) {
      return { ok: false as const, message: 'SMS body is required.' };
    }
    if (text.length > SMS_BODY_MAX) {
      return { ok: false as const, message: `SMS body must be ${SMS_BODY_MAX} characters or fewer.` };
    }
    return { ok: true as const, body: text };
  }
  if (text.length > WHATSAPP_BODY_MAX) {
    return { ok: false as const, message: `WhatsApp text must be ${WHATSAPP_BODY_MAX} characters or fewer.` };
  }
  return { ok: true as const, body: text === '' ? null : text };
}
