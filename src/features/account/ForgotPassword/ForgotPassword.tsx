import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { accountApi } from '@/api/accountApi';
import { apiErrorMessage } from '@/core/http/errors';
import './ForgotPassword.css';

const EMAIL_RE = /^[^\s@]+@[^\s@]+$/;

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [errormessage, setErrormessage] = useState('');
  const [successmessage, setSuccessmessage] = useState('');

  async function sendResetLink(e: FormEvent) {
    e.preventDefault();
    setErrormessage('');
    setSuccessmessage('');

    if (!EMAIL_RE.test(email)) {
      setErrormessage('Please enter a valid email address.');
      return;
    }

    try {
      await accountApi.forgotPassword({ emailAddress: email });
      setSuccessmessage('Password reset link has been sent to your email address.');
    } catch (error) {
      console.error('Forgot Password API error:', error);
      setErrormessage(apiErrorMessage(error, 'Unable to send password reset link. Please try again.'));
    }
  }

  return (
    <div className="ciit-host cmp-forgot-password">
      <div className="fp-page">
        <div className="fp-card">
          <h1>Forgot Password</h1>

          <form onSubmit={sendResetLink} noValidate>
            <p className="fp-sub">
              Enter your registered email address. We will send you a password reset link.
            </p>

            <div className="form-group">
              <label htmlFor="email">Email Address</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your email"
              />
            </div>

            {errormessage && <div className="error-message">{errormessage}</div>}
            {successmessage && <div className="success-message">{successmessage}</div>}

            <button type="submit" className="fp-btn">Submit</button>
          </form>

          <Link to="/login" className="fp-back">← Back to Login</Link>
        </div>
      </div>
    </div>
  );
}
