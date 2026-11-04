import { useSearchParams } from 'react-router-dom';
import './ResetPassword.css';

// NOTE: the Angular version of this screen was UI-only (the button did nothing and
// there is no OTP field). It is ported 1:1. The API is already available as
// accountApi.resetPassword({ email, otp, newPassword, confirmPassword }) if you want to wire it up.
export default function ResetPassword() {
  const [params] = useSearchParams();
  const email = params.get('email') || '';

  return (
    <div className="ciit-host cmp-reset-password">
      <div className="rp-page">
        <div className="rp-card">
          <h1>Reset Password</h1>
          <p className="rp-sub">Create a new password for your account.</p>

          <div className="form-group">
            <label>Email Address</label>
            <input type="email" value={email} readOnly />
          </div>

          <div className="form-group">
            <label htmlFor="newPassword">New Password</label>
            <input id="newPassword" type="password" placeholder="Enter new password" />
          </div>

          <div className="form-group">
            <label htmlFor="confirmPassword">Confirm Password</label>
            <input id="confirmPassword" type="password" placeholder="Confirm new password" />
          </div>

          <button type="button" className="rp-btn">Reset Password</button>
        </div>
      </div>
    </div>
  );
}
