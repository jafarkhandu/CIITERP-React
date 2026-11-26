import { useRef, useState, type FormEvent } from 'react';
import { studentPasswordApi } from '@/api/studentPasswordApi';
import { apiErrorMessage } from '@/core/http/errors';
import { useAutoDismissMessage } from '@/core/notifications/useAutoDismissMessage';
import { studentPasswordValidation } from './studentPasswordValidation';

export default function StudentChangePassword() {
  const [editing, setEditing] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [visible, setVisible] = useState({ current: false, next: false, confirm: false });
  const pending = useRef(false);
  const [error, setError] = useAutoDismissMessage();
  const [success, setSuccess] = useAutoDismissMessage();

  function clearFields() {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setVisible({ current: false, next: false, confirm: false });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    setError('');
    setSuccess('');
    const validation = studentPasswordValidation(newPassword, confirmPassword, currentPassword);
    if (validation) {
      setError(validation);
      return;
    }

    pending.current = true;
    setSaving(true);
    try {
      const message = await studentPasswordApi.changePassword({ currentPassword, newPassword, confirmPassword });
      clearFields();
      setEditing(false);
      setSuccess(message || 'Password changed successfully.');
    } catch (cause) {
      setError(apiErrorMessage(cause, 'Unable to change your password. Please try again.'));
    } finally {
      pending.current = false;
      setSaving(false);
    }
  }

  return (
    <section className="sp-panel">
      <h2>Change Password</h2>
      <p className="sp-muted">Update your student account password securely.</p>
      {editing ? (
        <form className="sp-profile-edit-form" onSubmit={submit} noValidate>
          <div className="sp-profile-edit-grid">
            <div className="sp-profile-edit-field">
              <label htmlFor="sp-password-current">Current Password</label>
              <div className="sp-password-input">
                <input id="sp-password-current" type={visible.current ? 'text' : 'password'}
                  autoComplete="current-password" value={currentPassword}
                  onChange={event => setCurrentPassword(event.target.value)} required disabled={saving} />
                <button type="button" className="sp-password-toggle"
                  aria-label={visible.current ? 'Hide current password' : 'Show current password'}
                  aria-pressed={visible.current} aria-controls="sp-password-current" disabled={saving}
                  onClick={() => setVisible(previous => ({ ...previous, current: !previous.current }))}>
                  <i className={visible.current ? 'bi bi-eye-slash' : 'bi bi-eye'} aria-hidden="true" />
                </button>
              </div>
            </div>
            <div className="sp-profile-edit-field">
              <label htmlFor="sp-password-next">New Password</label>
              <div className="sp-password-input">
                <input id="sp-password-next" type={visible.next ? 'text' : 'password'}
                  autoComplete="new-password" value={newPassword}
                  onChange={event => setNewPassword(event.target.value)} required disabled={saving} />
                <button type="button" className="sp-password-toggle"
                  aria-label={visible.next ? 'Hide new password' : 'Show new password'}
                  aria-pressed={visible.next} aria-controls="sp-password-next" disabled={saving}
                  onClick={() => setVisible(previous => ({ ...previous, next: !previous.next }))}>
                  <i className={visible.next ? 'bi bi-eye-slash' : 'bi bi-eye'} aria-hidden="true" />
                </button>
              </div>
            </div>
            <div className="sp-profile-edit-field">
              <label htmlFor="sp-password-confirm">Confirm New Password</label>
              <div className="sp-password-input">
                <input id="sp-password-confirm" type={visible.confirm ? 'text' : 'password'}
                  autoComplete="new-password" value={confirmPassword}
                  onChange={event => setConfirmPassword(event.target.value)} required disabled={saving} />
                <button type="button" className="sp-password-toggle"
                  aria-label={visible.confirm ? 'Hide confirm new password' : 'Show confirm new password'}
                  aria-pressed={visible.confirm} aria-controls="sp-password-confirm" disabled={saving}
                  onClick={() => setVisible(previous => ({ ...previous, confirm: !previous.confirm }))}>
                  <i className={visible.confirm ? 'bi bi-eye-slash' : 'bi bi-eye'} aria-hidden="true" />
                </button>
              </div>
            </div>
          </div>
          {error && <div className="alert alert-danger mb-0" role="alert">{error}</div>}
          <div className="sp-profile-edit-actions">
            <button type="submit" className="sp-profile-edit-button" disabled={saving}>
              {saving ? 'Updating…' : 'Update Password'}
            </button>
            <button type="button" className="sp-profile-cancel-button" disabled={saving}
              onClick={() => { clearFields(); setError(''); setEditing(false); }}>Cancel</button>
          </div>
        </form>
      ) : (
        <div className="sp-profile-edit-actions">
          <button type="button" className="sp-profile-edit-button"
            onClick={() => { setSuccess(''); setEditing(true); }}>Change Password</button>
        </div>
      )}
      {success && <div className="alert alert-success mt-3 mb-0" role="status">{success}</div>}
    </section>
  );
}
