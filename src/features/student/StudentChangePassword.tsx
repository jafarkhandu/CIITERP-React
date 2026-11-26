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
  const pending = useRef(false);
  const [error, setError] = useAutoDismissMessage();
  const [success, setSuccess] = useAutoDismissMessage();

  function clearFields() {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
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
            <label className="sp-profile-edit-field">
              <span>Current Password</span>
              <input type="password" autoComplete="current-password" value={currentPassword}
                onChange={event => setCurrentPassword(event.target.value)} required disabled={saving} />
            </label>
            <label className="sp-profile-edit-field">
              <span>New Password</span>
              <input type="password" autoComplete="new-password" value={newPassword}
                onChange={event => setNewPassword(event.target.value)} required disabled={saving} />
            </label>
            <label className="sp-profile-edit-field">
              <span>Confirm New Password</span>
              <input type="password" autoComplete="new-password" value={confirmPassword}
                onChange={event => setConfirmPassword(event.target.value)} required disabled={saving} />
            </label>
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
