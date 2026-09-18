export const AUTH_POLICY = {
  maxFailedAttempts: 5,
  lockMinutes: 15,
  otpTtlMinutes: 10,
  otpMaxAttempts: 5,
  minPasswordLength: 10,
  loginRateLimit: 10,
  forgotRateLimit: 5,
  rateWindowSeconds: 900,
  lastSeenTouchSeconds: 60,
} as const;

export const PASSWORD_RULE =
  /^(?=.*[A-Za-z])(?=.*\d).+$/;

export function assertPasswordPolicy(password: string, email?: string): string | null {
  if (password.length < AUTH_POLICY.minPasswordLength) {
    return `Password must be at least ${AUTH_POLICY.minPasswordLength} characters.`;
  }
  if (!PASSWORD_RULE.test(password)) {
    return 'Password must include at least one letter and one number.';
  }
  if (email && password.toLowerCase().includes(email.toLowerCase().split('@')[0] ?? '')) {
    return 'Password must not contain your email name.';
  }
  return null;
}
