import { useState, type FormEvent } from 'react';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import { accountApi } from '@/api/accountApi';
import { apiErrorMessage } from '@/core/http/errors';
import './ResetPassword.css';

export default function ResetPassword() {
  const [params] = useSearchParams();
  const email = params.get('email') || '';
  const navigate = useNavigate();
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setSuccess('');
    if (!email) { setError('Reset email is missing. Request a new password reset link.'); return; }
    if (!otp.trim()) { setError('Enter the OTP from your email.'); return; }
    if (newPassword.length < 8) { setError('Password must contain at least 8 characters.'); return; }
    if (newPassword !== confirmPassword) { setError('Passwords do not match.'); return; }
    setSaving(true);
    try {
      await accountApi.resetPassword({ email, otp: otp.trim(), newPassword, confirmPassword });
      setSuccess('Password reset successfully. You can now sign in.');
      setTimeout(() => navigate('/login'), 1400);
    } catch (requestError) {
      setError(apiErrorMessage(requestError, 'Unable to reset password. Verify the OTP and try again.'));
    } finally { setSaving(false); }
  }

  return (
    <div className="ciit-host cmp-reset-password">
      <div className="rp-page"><div className="rp-card">
        <h1>Reset Password</h1><p className="rp-sub">Create a new password for your account.</p>
        <form onSubmit={submit} noValidate>
          <div className="form-group"><label htmlFor="reset-email">Email Address</label><input id="reset-email" type="email" value={email} readOnly /></div>
          <div className="form-group"><label htmlFor="reset-otp">Email OTP</label><input id="reset-otp" type="text" inputMode="numeric" autoComplete="one-time-code" required value={otp} onChange={(e) => setOtp(e.target.value)} placeholder="Enter OTP from email" /></div>
          <div className="form-group"><label htmlFor="newPassword">New Password</label><input id="newPassword" type="password" autoComplete="new-password" required minLength={8} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Enter new password" /></div>
          <div className="form-group"><label htmlFor="confirmPassword">Confirm Password</label><input id="confirmPassword" type="password" autoComplete="new-password" required minLength={8} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Confirm new password" /></div>
          {error && <div className="error-message" role="alert">{error}</div>}{success && <div className="success-message" role="status">{success}</div>}
          <button type="submit" className="rp-btn" disabled={saving}>{saving ? 'Resetting…' : 'Reset Password'}</button>
        </form><Link to="/login" className="fp-back">← Back to Login</Link>
      </div></div>
    </div>
  );
}
