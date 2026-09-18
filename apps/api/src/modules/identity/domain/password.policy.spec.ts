import { assertPasswordPolicy } from './password.policy';

describe('assertPasswordPolicy', () => {
  it('rejects short passwords', () => {
    expect(assertPasswordPolicy('Ab1cDefg')).toContain('at least');
  });

  it('rejects passwords without a number', () => {
    expect(assertPasswordPolicy('abcdefghijk')).toContain('letter and one number');
  });

  it('rejects passwords that contain the email local part', () => {
    expect(assertPasswordPolicy('adminuser12', 'admin@intraleads.local')).not.toBeNull();
  });

  it('accepts a policy-compliant password', () => {
    expect(assertPasswordPolicy('CorrectHorse1')).toBeNull();
  });
});
