import 'package:flutter_test/flutter_test.dart';
import 'package:intra_leads/features/comms/domain/comms_models.dart';

void main() {
  group('leadPhoneE164', () {
    test('keeps numbers that already have a country code', () {
      expect(leadPhoneE164('+919876543210'), '+919876543210');
      expect(leadPhoneE164('+91 98765-43210'), '+919876543210');
      expect(leadPhoneE164('+971 50 123 4567'), '+971501234567');
      expect(leadPhoneE164('00971501234567'), '+971501234567');
    });

    test('defaults Indian numbers saved without a country code to +91', () {
      expect(leadPhoneE164('9876543210'), '+919876543210');
      expect(leadPhoneE164('98765 43210'), '+919876543210');
      expect(leadPhoneE164('09876543210'), '+919876543210');
      expect(leadPhoneE164('919876543210'), '+919876543210');
    });

    test('returns null for empty or implausible numbers', () {
      expect(leadPhoneE164(null), isNull);
      expect(leadPhoneE164('  '), isNull);
      expect(leadPhoneE164('12345'), isNull);
      expect(leadPhoneE164('+12'), isNull);
    });
  });

  group('leadDialerUri', () {
    test('prefills the normalised number', () {
      expect(leadDialerUri('98765 43210'), 'tel:+919876543210');
      expect(leadDialerUri('+919876543210'), 'tel:+919876543210');
    });

    test('falls back to the raw dialable digits', () {
      expect(leadDialerUri('2345 6789'), 'tel:23456789');
    });

    test('is null without a number', () {
      expect(leadDialerUri(null), isNull);
      expect(leadDialerUri(''), isNull);
    });
  });

  group('leadWhatsappChatUri', () {
    test('opens wa.me with digits only, including country code', () {
      expect(leadWhatsappChatUri('+91 98765 43210'), 'https://wa.me/919876543210');
      expect(leadWhatsappChatUri('9876543210'), 'https://wa.me/919876543210');
    });

    test('is null when the number cannot be made international', () {
      expect(leadWhatsappChatUri('12345'), isNull);
      expect(leadWhatsappChatUri(null), isNull);
    });
  });
}
