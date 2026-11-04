import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { accountApi } from '@/api/accountApi';
import { apiErrorMessage } from '@/core/http/errors';
import './ChangePassword.css';

const Rule = ({ ok, text }: { ok: boolean; text: string }) => (
  <div className={ok ? 'valid-rule' : undefined}>
    <span>{ok ? '✓' : '○'}</span>
    {text}
  </div>
);

const EyeButton = ({ shown, toggle }: { shown: boolean; toggle: () => void }) => (
  <button
    type="button"
    className="eye-button"
    onClick={toggle}
    aria-label={shown ? 'Hide password' : 'Show password'}
  >
    {shown ? '🙈' : '👁'}
  </button>
);

export default function ChangePassword() {
  const navigate = useNavigate();
  const timer = useRef<number>();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [touched, setTouched] = useState({ current: false, confirm: false });

  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [errormessage, setErrormessage] = useState('');
  const [successmessage, setSuccessmessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const lengthValid = newPassword.length >= 8;
  const capitalValid = /[A-Z]/.test(newPassword);
  const smallValid = /[a-z]/.test(newPassword);
  const numberValid = /\d/.test(newPassword);
  const symbolValid = /[^A-Za-z0-9]/.test(newPassword);
  const strong = lengthValid && capitalValid && smallValid && numberValid && symbolValid;
  const match = newPassword === confirmPassword;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErrormessage('');
    setSuccessmessage('');

    if (!currentPassword || !newPassword || !confirmPassword) {
      setTouched({ current: true, confirm: true });
      return;
    }
    if (!strong) return setErrormessage('Password does not meet the required security rules.');
    if (!match) return setErrormessage('New Password and Confirm Password do not match.');
    if (currentPassword === newPassword) {
      return setErrormessage('New Password must be different from Current Password.');
    }

    setSubmitting(true);
    try {
      await accountApi.changePassword({ currentPassword, newPassword });
      setSubmitting(false);
      setSuccessmessage('Password changed successfully.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTouched({ current: false, confirm: false });
      timer.current = window.setTimeout(() => navigate('/main/profile'), 1000);
    } catch (error) {
      console.error('Change password error:', error);
      setSubmitting(false);
      setErrormessage(
        apiErrorMessage(error, 'Password change failed. Please check your current password and try again.'),
      );
    }
  }

  return (
    <div className="ciit-host cmp-change-password">
      <div className="change-password-page">
        <div className="change-password-card">
          <div className="card-header-section">
            <div className="password-icon">🔐</div>
            <div>
              <h4>Change Password</h4>
              <p>Update your account password securely.</p>
            </div>
          </div>

          <form onSubmit={submit} noValidate>
            <div className="form-group">
              <label>Current Password</label>
              <div className="password-input-wrapper">
                <input
                  type={showCurrent ? 'text' : 'password'}
                  className="form-control"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  onBlur={() => setTouched((t) => ({ ...t, current: true }))}
                  placeholder="Enter current password"
                />
                <EyeButton shown={showCurrent} toggle={() => setShowCurrent((v) => !v)} />
              </div>
              {!currentPassword && touched.current && (
                <small className="field-error">Current password is required.</small>
              )}
            </div>

            <div className="form-group">
              <label>New Password</label>
              <div className="password-input-wrapper">
                <input
                  type={showNew ? 'text' : 'password'}
                  className="form-control"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter new password"
                />
                <EyeButton shown={showNew} toggle={() => setShowNew((v) => !v)} />
              </div>

              {newPassword.length > 0 && (
                <>
                  <div className="password-rules">
                    <Rule ok={lengthValid} text="Minimum 8 characters" />
                    <Rule ok={capitalValid} text="At least 1 capital letter" />
                    <Rule ok={smallValid} text="At least 1 small letter" />
                    <Rule ok={numberValid} text="At least 1 number" />
                    <Rule ok={symbolValid} text="At least 1 symbol" />
                  </div>

                  <div className="password-strength">
                    <span>Password strength:</span>
                    <strong className={strong ? 'strong-password' : undefined}>
                      {strong ? 'Strong' : 'Weak'}
                    </strong>
                  </div>
                </>
              )}
            </div>

            <div className="form-group">
              <label>Confirm New Password</label>
              <div className="password-input-wrapper">
                <input
                  type={showConfirm ? 'text' : 'password'}
                  className="form-control"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  onBlur={() => setTouched((t) => ({ ...t, confirm: true }))}
                  placeholder="Confirm new password"
                />
                <EyeButton shown={showConfirm} toggle={() => setShowConfirm((v) => !v)} />
              </div>

              {touched.confirm && !match && <small className="field-error">Passwords do not match.</small>}
              {touched.confirm && match && confirmPassword && (
                <small className="match-success">✓ Passwords match</small>
              )}
            </div>

            {errormessage && <div className="alert alert-danger">{errormessage}</div>}
            {successmessage && <div className="alert alert-success">{successmessage}</div>}

            <button type="submit" className="update-button" disabled={submitting}>
              {submitting ? <span>Updating...</span> : <span>Update Password</span>}
            </button>
          </form>

          <div className="security-note">🔒 Your password is never displayed or stored in plain text.</div>
        </div>
      </div>
    </div>
  );
}
