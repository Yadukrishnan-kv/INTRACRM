import {
  addMonthsYmd,
  allowedNextWarrantyStatuses,
  canTransitionWarranty,
  defaultWarrantyEndOn,
  effectiveWarrantyStatus,
  escapeHtml,
  warrantyVerifyUrl,
  parseWarrantyVerifyInput,
} from './warranty-types';

describe('warranty coverage dates', () => {
  it('adds months without overflowing the day', () => {
    expect(addMonthsYmd('2026-01-31', 1)).toBe('2026-02-28');
    expect(defaultWarrantyEndOn('2026-08-16', 12)).toBe('2027-08-16');
    expect(defaultWarrantyEndOn('2026-08-16', null)).toBe('2027-08-16');
  });
});

describe('warranty status', () => {
  it('expires live when the end date has passed', () => {
    expect(
      effectiveWarrantyStatus({
        status: 'active',
        warrantyEndOn: '2026-08-01',
        todayYmd: '2026-08-16',
      }),
    ).toBe('expired');
    expect(
      effectiveWarrantyStatus({
        status: 'claimed',
        warrantyEndOn: '2026-08-01',
        todayYmd: '2026-08-16',
      }),
    ).toBe('claimed');
  });

  it('allows claim and void from an active or expired card', () => {
    expect(allowedNextWarrantyStatuses('active')).toEqual(['claimed', 'void']);
    expect(canTransitionWarranty('claimed', 'void')).toBe(true);
    expect(canTransitionWarranty('void', 'active')).toBe(false);
  });
});

describe('warranty verification', () => {
  it('builds a public view URL and escapes HTML', () => {
    expect(warrantyVerifyUrl('http://localhost:3000/', 'api/v1', 'abc')).toBe(
      'http://localhost:3000/api/v1/public/warranty/abc/view',
    );
    expect(escapeHtml('<script>"x"')).toBe('&lt;script&gt;&quot;x&quot;');
  });

  it('parses a token from a pasted portal URL', () => {
    const token = 'a'.repeat(48);
    expect(parseWarrantyVerifyInput(token)).toBe(token);
    expect(
      parseWarrantyVerifyInput(`http://localhost:3000/api/v1/public/warranty/${token}/view`),
    ).toBe(token);
    expect(parseWarrantyVerifyInput('not-a-token')).toBeNull();
  });
});
