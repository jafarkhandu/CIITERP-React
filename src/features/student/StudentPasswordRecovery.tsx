import { useRef, useState, type FormEvent } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { studentPasswordApi } from '@/api/studentPasswordApi';
import { apiErrorMessage } from '@/core/http/errors';
import { useAutoDismissMessage } from '@/core/notifications/useAutoDismissMessage';
import { studentPasswordValidation } from './studentPasswordValidation';
import '@/features/account/ForgotPassword/ForgotPassword.css';
import '@/features/account/ResetPassword/ResetPassword.css';

const EMAIL_RE = /^[^\s@]+@[^\s@]+$/;
const loginState = { from: '/student-portal' };

export function StudentForgotPassword() {
  const [emailAddress, setEmailAddress] = useState('');
  const [saving, setSaving] = useState(false);
  const pending = useRef(false);
  const [sentEmail, setSentEmail] = useState('');
  const [error, setError] = useAutoDismissMessage();
  const [success, setSuccess] = useAutoDismissMessage();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    setError('');
    setSuccess('');
    setSentEmail('');
    const email = emailAddress.trim();
    if (!EMAIL_RE.test(email)) {
      setError('Please enter a valid registered email address.');
      return;
    }
    pending.current = true;
    setSaving(true);
    try {
      const message = await studentPasswordApi.forgotPassword({ emailAddress: email });
      setSentEmail(email);
      setSuccess(message || 'Password reset requested. Check your registered email.');
    } catch (cause) {
      setError(apiErrorMessage(cause, 'Unable to request a password reset. Please try again.'));
    } finally {
      pending.current = false;
      setSaving(false);
    }
  }

  return (
    <div className="ciit-host cmp-forgot-password">
      <div className="fp-page"><div className="fp-card">
        <h1>Student Forgot Password</h1>
        <p className="fp-sub">Enter your registered student email to request a password reset.</p>
        <form onSubmit={submit} noValidate>
          <div className="form-group">
            <label htmlFor="student-recovery-email">Email Address</label>
            <input id="student-recovery-email" type="email" autoComplete="email" value={emailAddress}
              onChange={event => { setEmailAddress(event.target.value); setSentEmail(''); setSuccess(''); setError(''); }} required disabled={saving} />
          </div>
          {error && <div className="error-message" role="alert">{error}</div>}
          {success && <div className="success-message" role="status">{success}</div>}
          <button type="submit" className="fp-btn" disabled={saving}>{saving ? 'Sending…' : 'Request Reset'}</button>
        </form>
        <Link to="/student-reset-password" state={{ emailAddress: sentEmail || emailAddress.trim() }} className="fp-back">
          Already have a reset token?
        </Link>
        <Link to="/login" state={loginState} className="fp-back">← Back to Student Login</Link>
      </div></div>
    </div>
  );
}

export function StudentResetPassword() {
  const [params] = useSearchParams();
  const location = useLocation();
  const initialEmail = (location.state as { emailAddress?: unknown } | null)?.emailAddress;
  const [emailAddress, setEmailAddress] = useState(
    () => params.get('emailAddress') || params.get('email') || (typeof initialEmail === 'string' ? initialEmail : ''),
  );
  const [token, setToken] = useState(() => params.get('token') || '');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [completed, setCompleted] = useState(false);
  const pending = useRef(false);
  const [error, setError] = useAutoDismissMessage();
  const [success, setSuccess] = useAutoDismissMessage();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current || completed) return;
    setError('');
    setSuccess('');
    const email = emailAddress.trim();
    if (!EMAIL_RE.test(email)) { setError('Enter your registered student email.'); return; }
    if (!token.trim()) { setError('Enter the reset token from your email.'); return; }
    const validation = studentPasswordValidation(newPassword, confirmPassword);
    if (validation) { setError(validation); return; }

    pending.current = true;
    setSaving(true);
    try {
      const message = await studentPasswordApi.resetPassword({
        emailAddress: email, token: token.trim(), newPassword, confirmPassword,
      });
      setNewPassword('');
      setConfirmPassword('');
      setToken('');
      setCompleted(true);
      setSuccess(message || 'Password reset successfully. You can now sign in.');
    } catch (cause) {
      setError(apiErrorMessage(cause, 'Unable to reset your password. Verify the token and try again.'));
    } finally {
      pending.current = false;
      setSaving(false);
    }
  }

  return (
    <div className="ciit-host cmp-reset-password cmp-forgot-password">
      <div className="rp-page"><div className="rp-card">
        <h1>Student Reset Password</h1>
        <p className="rp-sub">{completed ? 'Sign in using your new password.' : 'Enter the reset token and choose a new password.'}</p>
        {success && <div className="success-message" role="status">{success}</div>}
        {!completed && (
          <form onSubmit={submit} noValidate>
            <div className="form-group">
              <label htmlFor="student-reset-email">Email Address</label>
              <input id="student-reset-email" type="email" autoComplete="email" value={emailAddress}
                onChange={event => setEmailAddress(event.target.value)} required disabled={saving} />
            </div>
            <div className="form-group">
              <label htmlFor="student-reset-token">Reset Token</label>
              <input id="student-reset-token" type="password" autoComplete="off" value={token}
                onChange={event => setToken(event.target.value)} required disabled={saving} />
            </div>
            <div className="form-group">
              <label htmlFor="student-reset-password">New Password</label>
              <input id="student-reset-password" type="password" autoComplete="new-password" value={newPassword}
                onChange={event => setNewPassword(event.target.value)} required disabled={saving} />
            </div>
            <div className="form-group">
              <label htmlFor="student-reset-confirm">Confirm Password</label>
              <input id="student-reset-confirm" type="password" autoComplete="new-password" value={confirmPassword}
                onChange={event => setConfirmPassword(event.target.value)} required disabled={saving} />
            </div>
            {error && <div className="error-message" role="alert">{error}</div>}
            <button type="submit" className="rp-btn" disabled={saving}>{saving ? 'Resetting…' : 'Reset Password'}</button>
          </form>
        )}
        {!completed && <Link to="/student-forgot-password" className="fp-back">Request a new reset token</Link>}
        <Link to="/login" state={loginState} className="fp-back">← Back to Student Login</Link>
      </div></div>
    </div>
  );
}
