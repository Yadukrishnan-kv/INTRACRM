import { useQuery } from '@tanstack/react-query';
import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { errorMessage } from '../../api/client';
import { logout } from '../../api/endpoints';
import { useAuth } from '../../auth/AuthContext';
import { FormActions, FormError, TextField } from '../../components/form';
import { ConfirmModal } from '../../components/Modal';
import { useToast } from '../../components/toast';
import { Badge, Brand, EmptyState, ErrorState, PageHeader, Spinner } from '../../components/ui';
import { formatDateTime, humanize } from '../../lib/format';
import { useApiMutation } from '../../lib/hooks';
import { adminApi, adminKeys, type AuthSessionRow } from './api';
import { EMAIL_PATTERN, MIN_PASSWORD_LENGTH, OTP_PATTERN, sessionLabel, sortSessions, validatePassword } from './logic';
import { BackLink } from './shared';

const PASSWORD_HINT = `At least ${MIN_PASSWORD_LENGTH} characters with a letter and a number.`;

/* ---------- Change password ---------- */

/** Mobile ChangePasswordPage. The API signs out every other device on success. */
export function ChangePasswordPage() {
  const { me, session } = useAuth();
  const navigate = useNavigate();
  const email = me?.email ?? session?.user.email ?? null;
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const change = useApiMutation(() => adminApi.changePassword(current, next), {
    success: 'Password changed. Other devices were signed out.',
    invalidate: [adminKeys.sessions],
    onSuccess: () => navigate('/settings'),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!current) errs.current = 'Current password is required.';
    const rule = validatePassword(next, email);
    if (rule) errs.next = rule;
    else if (next === current) errs.next = 'Choose a password different from the current one.';
    if (confirm !== next) errs.confirm = 'Passwords do not match.';
    setErrors(errs);
    if (Object.keys(errs).length === 0) change.mutate(undefined);
  }

  return (
    <>
      <BackLink to="/settings" label="Settings" />
      <PageHeader title="Change password" subtitle="Changing your password signs you out on every other device." />
      <form className="card stack admin-narrow" onSubmit={onSubmit} noValidate>
        <TextField
          label="Current password"
          type="password"
          autoComplete="current-password"
          required
          value={current}
          error={errors.current}
          onValue={setCurrent}
        />
        <TextField
          label="New password"
          type="password"
          autoComplete="new-password"
          required
          value={next}
          error={errors.next}
          hint={PASSWORD_HINT}
          onValue={setNext}
        />
        <TextField
          label="Confirm new password"
          type="password"
          autoComplete="new-password"
          required
          value={confirm}
          error={errors.confirm}
          onValue={setConfirm}
        />
        <FormError message={change.error ? errorMessage(change.error) : null} />
        <FormActions>
          <button type="submit" className="btn btn-primary" disabled={change.isPending}>
            {change.isPending ? 'Saving…' : 'Change password'}
          </button>
        </FormActions>
      </form>
    </>
  );
}

/* ---------- Sessions ---------- */

/** Mobile SessionsPage: active devices (revoke one or all others) and login history. */
export function SessionsPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [pending, setPending] = useState<AuthSessionRow | 'others' | null>(null);
  const sessions = useQuery({ queryKey: adminKeys.sessions, queryFn: adminApi.sessions });
  const history = useQuery({ queryKey: adminKeys.loginHistory, queryFn: adminApi.loginHistory });

  const revoke = useApiMutation((row: AuthSessionRow) => adminApi.revokeSession(row.id), {
    invalidate: [adminKeys.sessions],
    onSuccess: async (_r, row) => {
      setPending(null);
      if (row.isCurrent) {
        await logout().catch(() => undefined);
        navigate('/login', { replace: true });
      } else toast.success('Device signed out');
    },
  });
  const revokeOthers = useApiMutation(() => adminApi.revokeOtherSessions(), {
    success: 'Other devices signed out',
    invalidate: [adminKeys.sessions],
    onSuccess: () => setPending(null),
  });

  const rows = sortSessions(sessions.data ?? []);
  const others = rows.filter((r) => !r.isCurrent && r.status === 'active').length;

  return (
    <>
      <BackLink to="/settings" label="Settings" />
      <PageHeader
        title="Devices & sessions"
        subtitle="Where you are signed in, and recent sign-in attempts."
        actions={
          <button type="button" className="btn btn-ghost" disabled={others === 0} onClick={() => setPending('others')}>
            Sign out other devices
          </button>
        }
      />
      <div className="stack">
        <section className="card">
          <p className="admin-group-title">Active sessions</p>
          {sessions.isLoading ? (
            <Spinner />
          ) : sessions.isError ? (
            <ErrorState error={sessions.error} onRetry={() => sessions.refetch()} />
          ) : rows.length === 0 ? (
            <EmptyState>No active sessions.</EmptyState>
          ) : (
            <ul className="list">
              {rows.map((s) => (
                <li key={s.id}>
                  <div className="list-row">
                    <strong>
                      {sessionLabel(s)} {s.isCurrent ? <Badge value="this device" tone="info" /> : null}
                    </strong>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPending(s)}>
                      Sign out
                    </button>
                  </div>
                  <span className="muted small">
                    {[humanize(s.status), s.ipAddress, `Last seen ${formatDateTime(s.lastSeenAt)}`, `Signed in ${formatDateTime(s.createdAt)}`]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                  {s.userAgent ? <span className="muted small admin-clamp">{s.userAgent}</span> : null}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card">
          <p className="admin-group-title">Login history</p>
          {history.isLoading ? (
            <Spinner />
          ) : history.isError ? (
            <ErrorState error={history.error} onRetry={() => history.refetch()} />
          ) : history.data!.length === 0 ? (
            <EmptyState>No sign-ins recorded yet.</EmptyState>
          ) : (
            <div className="table-wrap card-flush">
              <table className="table">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Result</th>
                    <th>Device</th>
                    <th>IP address</th>
                  </tr>
                </thead>
                <tbody>
                  {history.data!.map((h) => (
                    <tr key={h.id}>
                      <td>{formatDateTime(h.createdAt)}</td>
                      <td>
                        <Badge value={h.result} tone={h.result === 'success' ? 'success' : 'danger'} />
                        {h.failureReason ? <div className="muted small">{humanize(h.failureReason)}</div> : null}
                      </td>
                      <td>{h.deviceName ?? '—'}</td>
                      <td>{h.ipAddress ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <ConfirmModal
        open={pending !== null}
        title={pending === 'others' ? 'Sign out other devices?' : 'Sign out this session?'}
        message={
          pending === 'others'
            ? 'Every device except this one will need to sign in again.'
            : pending?.isCurrent
              ? 'This is the device you are using now. You will be signed out here.'
              : `${pending ? sessionLabel(pending) : ''} will need to sign in again.`
        }
        confirmLabel="Sign out"
        danger
        busy={revoke.isPending || revokeOthers.isPending}
        onConfirm={() => (pending === 'others' ? revokeOthers.mutate(undefined) : pending && revoke.mutate(pending))}
        onClose={() => setPending(null)}
      />
    </>
  );
}

/* ---------- Public: forgot / reset ---------- */

function PublicCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="login">
      <div className="card login-card">
        <Brand caption={title} large />
        {children}
      </div>
    </div>
  );
}

/** Mobile ForgotPasswordPage: request a 6-digit reset code, then continue to reset. */
export function ForgotPasswordPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const value = email.trim().toLowerCase();
    if (!EMAIL_PATTERN.test(value)) {
      setError('Enter a valid email.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await adminApi.forgotPassword(value);
      toast.success('If an account exists, a reset code was sent.');
      const qs = new URLSearchParams({ email: value });
      // Non-production APIs return the code for testing; pass it along so it can be shown.
      if (result.debugOtp) qs.set('debugOtp', result.debugOtp);
      navigate(`/reset-password?${qs.toString()}`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <PublicCard title="Forgot password">
      <form className="stack" onSubmit={onSubmit} noValidate>
        <p className="muted" style={{ margin: 0 }}>
          Enter your work email. We’ll send a 6-digit code to reset your password.
        </p>
        <TextField
          label="Email"
          type="email"
          autoComplete="username"
          autoFocus
          required
          value={email}
          onValue={setEmail}
        />
        <FormError message={error} />
        <button type="submit" className="btn btn-primary" disabled={busy || !email.trim()}>
          {busy ? 'Sending…' : 'Send reset code'}
        </button>
        <div className="btn-row admin-public-links">
          <Link to="/reset-password" className="small">
            I already have a code
          </Link>
          <Link to="/login" className="small">
            Back to sign in
          </Link>
        </div>
      </form>
    </PublicCard>
  );
}

/** Mobile ResetPasswordPage: email + 6-digit code + new password, then back to sign in. */
export function ResetPasswordPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [params] = useSearchParams();
  const debugOtp = params.get('debugOtp');
  const [email, setEmail] = useState(params.get('email') ?? '');
  const [otp, setOtp] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const value = email.trim().toLowerCase();
    const errs: Record<string, string> = {};
    if (!EMAIL_PATTERN.test(value)) errs.email = 'Enter a valid email.';
    if (!OTP_PATTERN.test(otp.trim())) errs.otp = 'Enter the 6-digit code.';
    const rule = validatePassword(password, value);
    if (rule) errs.password = rule;
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    setError(null);
    try {
      await adminApi.resetPassword({ email: value, otp: otp.trim(), newPassword: password });
      toast.success('Password updated. Sign in with your new password.');
      navigate('/login', { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <PublicCard title="Reset password">
      <form className="stack" onSubmit={onSubmit} noValidate>
        {debugOtp ? <p className="admin-inline-note">Test code: {debugOtp}</p> : null}
        <TextField
          label="Email"
          type="email"
          autoComplete="username"
          required
          value={email}
          error={errors.email}
          onValue={setEmail}
        />
        <TextField
          label="Reset code"
          className="admin-otp"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          autoFocus={!!email}
          required
          value={otp}
          error={errors.otp}
          onValue={(v) => setOtp(v.replace(/\D/g, ''))}
        />
        <TextField
          label="New password"
          type="password"
          autoComplete="new-password"
          required
          value={password}
          error={errors.password}
          hint={PASSWORD_HINT}
          onValue={setPassword}
        />
        <FormError message={error} />
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'Resetting…' : 'Reset password'}
        </button>
        <div className="btn-row admin-public-links">
          <Link to="/forgot-password" className="small">
            Send a new code
          </Link>
          <Link to="/login" className="small">
            Back to sign in
          </Link>
        </div>
      </form>
    </PublicCard>
  );
}
