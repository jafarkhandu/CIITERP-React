import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { authApi } from '@/api/authApi';
import { findCurrentUser, getAllUsers, getCachedUsers } from '@/api/userApi';
import { authService } from '@/core/auth/authService';
import { userSession } from '@/core/auth/session';
import { apiErrorMessage, httpStatus } from '@/core/http/errors';
import './Login.css';

const REMEMBERED_USERNAME_KEY = 'rememberedUsername';

export default function Login() {
  const navigate = useNavigate();

  const [username, setUsername] = useState(() => localStorage.getItem(REMEMBERED_USERNAME_KEY) ?? '');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(() => localStorage.getItem(REMEMBERED_USERNAME_KEY) !== null);
  const [showPassword, setShowPassword] = useState(false);
  const [touched, setTouched] = useState({ username: false, password: false });
  const [errormessage, setErrormessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const usernameInvalid = !username && touched.username;
  const passwordInvalid = !password && touched.password;

  async function loadUserAndNavigate(loginUsername: string) {
    try {
      // cached list is used instantly (same as the Angular startWith(cache) behaviour);
      // MainLayout refreshes it in the background.
      const users = getCachedUsers() ?? (await getAllUsers());
      const currentUser = findCurrentUser(users, loginUsername);
      if (currentUser) userSession.setUser(currentUser);
    } catch (error) {
      // A user-details failure is NOT a login failure.
      console.error('User information API error:', error);
    }
    navigate('/main/dashboard');
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (isLoading) return;

    setErrormessage('');

    if (!username || !password) {
      setTouched({ username: true, password: true });
      return;
    }

    if (rememberMe) localStorage.setItem(REMEMBERED_USERNAME_KEY, username);
    else localStorage.removeItem(REMEMBERED_USERNAME_KEY);

    setIsLoading(true);

    let response;
    try {
      response = await authApi.login({ username, password });
    } catch (error) {
      console.error('Login API failed:', error);
      const status = httpStatus(error);
      if (status === 401) setErrormessage('Invalid username or password. Please check your credentials.');
      else if (status === 0) setErrormessage('Unable to connect to the server. Please try again.');
      else setErrormessage(apiErrorMessage(error, 'Login failed. Please try again.'));
      setIsLoading(false);
      return;
    }

    try {
      authService.saveLoginData(response.token, response.refreshToken);
      localStorage.setItem('username', username);
      await loadUserAndNavigate(username);
    } catch (error) {
      console.error('Login processing error:', error);
      setErrormessage('Login could not be completed. Please try again.');
      setIsLoading(false);
    }
  }

  return (
    <div className="ciit-host cmp-login">
      <div className="login-page">
        <main className="login-shell" aria-labelledby="login-title">
          {/* CIIT branding panel */}
          <section className="brand-panel" aria-label="CIIT Stack Lab">
            <div className="brand-lockup">
              <div className="brand-logo" aria-hidden="true">CIIT</div>
              <div className="brand-name">
                <strong>CIIT Training Institute</strong>
                <span>INSTITUTE</span>
              </div>
            </div>

            <div className="brand-message">
              <span className="eyebrow">LEARN · BUILD · GROW</span>
              <h2>Build your future<br />with confidence.</h2>
              <p>
                Learn today. Build your career tomorrow. Get practical IT
                training and the skills to turn your goals into real opportunities.
              </p>

              <div className="feature-list">
                <div className="feature-item">
                  <span className="feature-check" aria-hidden="true">✓</span>
                  <div>
                    <strong>Industry-ready skills</strong>
                    <span>Learn the latest IT technologies.</span>
                  </div>
                </div>
                <div className="feature-item">
                  <span className="feature-check" aria-hidden="true">✓</span>
                  <div>
                    <strong>Practical training</strong>
                    <span>Build skills through real projects.</span>
                  </div>
                </div>
                <div className="feature-item">
                  <span className="feature-check" aria-hidden="true">✓</span>
                  <div>
                    <strong>Career support</strong>
                    <span>Prepare for interviews and opportunities.</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="brand-footer">© 2026 CIIT Training Institute. All rights reserved.</div>
          </section>

          {/* Login panel */}
          <section className="form-panel" aria-label="Sign in">
            <div className="login-card">
              <div className="mobile-brand-lockup">
                <div className="brand-logo" aria-hidden="true">CIIT</div>
                <div className="brand-name">
                  <strong>CIIT Training Institute</strong>
                  <span>INSTITUTE</span>
                </div>
              </div>

              <div className="login-heading">
                <div className="welcome-mark" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none">
                    <path d="M12 3.5 19 6v5.2c0 4.5-3 7.7-7 9.3-4-1.6-7-4.8-7-9.3V6l7-2.5Z"
                      stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
                    <path d="m8.7 12 2.1 2.1 4.6-4.7"
                      stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <h1 id="login-title">Welcome back</h1>
                <p>Sign in to continue to your account.</p>
              </div>

              <form onSubmit={submit} noValidate>
                {/* Username */}
                <div className="form-group">
                  <label htmlFor="username">Username</label>
                  <div className={`input-wrapper${usernameInvalid ? ' input-invalid' : ''}`}>
                    <svg className="field-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <circle cx="12" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.7" />
                      <path d="M5 20c.5-3.5 3.2-5.5 7-5.5s6.5 2 7 5.5"
                        stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                    </svg>
                    <input
                      id="username"
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      onBlur={() => setTouched((t) => ({ ...t, username: true }))}
                      placeholder="Enter your username"
                      autoComplete="username"
                      aria-invalid={usernameInvalid}
                      aria-describedby="username-error"
                    />
                  </div>
                  {usernameInvalid && (
                    <small id="username-error" className="field-error">Please enter your username.</small>
                  )}
                </div>

                {/* Password */}
                <div className="form-group">
                  <div className="label-row">
                    <label htmlFor="password">Password</label>
                    <Link to="/forgot-password">Forgot password?</Link>
                  </div>
                  <div className={`input-wrapper${passwordInvalid ? ' input-invalid' : ''}`}>
                    <svg className="field-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <rect x="5" y="10" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.7" />
                      <path d="M8 10V7a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                      <circle cx="12" cy="15" r="1" fill="currentColor" />
                    </svg>
                    <input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      onBlur={() => setTouched((t) => ({ ...t, password: true }))}
                      placeholder="Enter your password"
                      autoComplete="current-password"
                      aria-invalid={passwordInvalid}
                      aria-describedby="password-error"
                    />
                    <button
                      type="button"
                      className="password-toggle"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      aria-pressed={showPassword}
                    >
                      {!showPassword ? (
                        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                          <path d="M2.5 12s3.3-6 9.5-6 9.5 6 9.5 6-3.3 6-9.5 6-9.5-6-9.5-6Z"
                            stroke="currentColor" strokeWidth="1.7" />
                          <circle cx="12" cy="12" r="2.7" stroke="currentColor" strokeWidth="1.7" />
                        </svg>
                      ) : (
                        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                          <path d="m3 3 18 18M10.6 6.2A10.5 10.5 0 0 1 12 6c6.2 0 9.5 6 9.5 6a15 15 0 0 1-3 3.5M6.2 6.8C3.8 8.4 2.5 12 2.5 12s3.3 6 9.5 6c1.2 0 2.3-.2 3.3-.6"
                            stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </button>
                  </div>
                  {passwordInvalid && (
                    <small id="password-error" className="field-error">Please enter your password.</small>
                  )}
                </div>

                {/* Remember username */}
                <div className="form-options">
                  <label className="remember-option">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                    />
                    <span className="custom-checkbox" aria-hidden="true"></span>
                    <span>Remember username</span>
                  </label>
                </div>

                {/* API error */}
                {errormessage && (
                  <div className="error-message" role="alert" aria-live="polite">
                    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
                      <path d="M12 7v5m0 3h.01" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                    </svg>
                    <span>{errormessage}</span>
                  </div>
                )}

                {/* Submit */}
                <button type="submit" className="login-btn" disabled={isLoading}>
                  {isLoading && <span className="button-spinner" aria-hidden="true"></span>}
                  <span>{isLoading ? 'Signing in...' : 'Sign in'}</span>
                  {!isLoading && (
                    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path d="M5 12h14m-6-6 6 6-6 6"
                        stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </button>
              </form>

              {/* Security note */}
              <div className="secure-note">
                <span className="secure-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none">
                    <rect x="5" y="10" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.7" />
                    <path d="M8 10V7a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                    <path d="m9.5 15 1.7 1.7 3.5-3.6"
                      stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                <span>
                  <strong>Secure login</strong>
                  <small>Your credentials are protected by a secure connection.</small>
                </span>
              </div>

              <p className="card-footer">Need help accessing your account? Contact your administrator.</p>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
