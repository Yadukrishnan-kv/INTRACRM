import {
  assertMessageBody,
  COMMS_CHANNEL,
  e164Digits,
  renderTemplate,
  smsUri,
  telUri,
  whatsappUri,
} from './comms';

describe('comms URIs and templates', () => {
  it('builds tel, sms, and WhatsApp launch URIs', () => {
    expect(telUri('+919876543210')).toBe('tel:+919876543210');
    expect(e164Digits('+919876543210')).toBe('919876543210');
    expect(smsUri('+919876543210', 'Hello there')).toBe(
      'sms:+919876543210?body=Hello%20there',
    );
    expect(whatsappUri('+919876543210', 'Hi Asha')).toBe(
      'https://wa.me/919876543210?text=Hi%20Asha',
    );
  });

  it('renders template variables and validates bodies', () => {
    expect(
      renderTemplate('Hi {{customer_name}} ({{lead_number}})', {
        customer_name: 'Asha',
        lead_number: 'LD-1',
      }),
    ).toBe('Hi Asha (LD-1)');
    expect(assertMessageBody(COMMS_CHANNEL.sms, '').ok).toBe(false);
    expect(assertMessageBody(COMMS_CHANNEL.whatsapp, '').ok).toBe(true);
    expect(assertMessageBody(COMMS_CHANNEL.call, 'Notes').body).toBe('Notes');
  });
});
