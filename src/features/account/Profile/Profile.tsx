import { Link } from 'react-router-dom';
import { useSession } from '@/core/auth/hooks';
import './Profile.css';

export default function Profile() {
  const s = useSession();
  const employeeName = s.employeeName;
  const role = s.roleName;
  const roles = s.roles;

  return (
    <div className="ciit-host cmp-profile">
      <div className="profile-page">
        <div className="profile-header">
          <div>
            <h2>My Profile</h2>
            <p>View your personal and account information</p>
          </div>
        </div>

        <div className="profile-card">
          <div className="profile-top">
            <div className="profile-avatar">{employeeName.charAt(0).toUpperCase() || 'U'}</div>
            <div className="profile-heading">
              <h3>{employeeName || 'User'}</h3>
              <span>{role || 'Employee'}</span>
            </div>
          </div>

          <div className="profile-divider"></div>

          <div className="profile-section">
            <h4>Personal Information</h4>
            <div className="profile-grid">
              <Field label="Employee Name" value={employeeName} />
              <Field label="Employee Code" value={s.employeeCode} />
              <Field label="Username" value={s.username} />
              <Field label="Email Address" value={s.email} />
              <Field label="Mobile Number" value={s.mobile} />
              <Field label="Branch" value={s.branch} />
            </div>
          </div>

          <div className="profile-divider"></div>

          <div className="profile-section">
            <div className="section-header">
              <div>
                <h4>Access Information</h4>
                <p>Your assigned application access</p>
              </div>
            </div>

            <div className="profile-grid">
              <Field label="Primary Role" value={role} />

              <div className="profile-field">
                <label>Assigned Roles</label>
                <div className="role-list">
                  {roles.length > 0 ? (
                    roles.map((r) => (
                      <span key={r} className="role-badge">{r}</span>
                    ))
                  ) : (
                    <span className="profile-value-text">Not available</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="profile-divider"></div>

          <div className="security-section">
            <div className="security-header">
              <div>
                <h4>Security &amp; Privacy</h4>
                <p>Manage your account password and security settings</p>
              </div>
              <div className="security-icon">🔒</div>
            </div>

            <div className="security-row">
              <div className="security-info">
                <label>Password</label>
                <div className="password-display">
                  <span>••••••••••••</span>
                </div>
                <small>Your password is securely protected and cannot be displayed.</small>
              </div>

              <Link className="change-password-btn" to="/main/change-password">
                Change Password
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="profile-field">
      <label>{label}</label>
      <div className="profile-value">{value || 'Not available'}</div>
    </div>
  );
}
