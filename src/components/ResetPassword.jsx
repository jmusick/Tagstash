import { useState } from 'react';
import { authAPI } from '../api/api';
import { useAuth } from '../context/AuthContext';
import './Auth.css';

function ResetPassword({ logoSrc }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [status, setStatus] = useState('form'); // form | loading | success | error
  const [message, setMessage] = useState('');
  const { refreshCurrentUser } = useAuth();

  const token = new URLSearchParams(window.location.search).get('token');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (password.length < 6) {
      setMessage('Password must be at least 6 characters.');
      setStatus('error');
      return;
    }
    if (password !== confirm) {
      setMessage('Passwords do not match.');
      setStatus('error');
      return;
    }

    setStatus('loading');
    setMessage('');

    try {
      const response = await authAPI.resetPassword(token, password);
      localStorage.setItem('token', response.data.token);
      await refreshCurrentUser();
      setStatus('success');
      setTimeout(() => window.location.assign('/'), 800);
    } catch (err) {
      setStatus('error');
      setMessage(err.response?.data?.error || 'Password reset failed. The link may be invalid or expired.');
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h1 className="auth-title">
          <picture>
            <source srcSet="/tagstash-logo-light.svg" media="(prefers-color-scheme: light)" />
            <img src={logoSrc} alt="Tagstash" className="auth-title-logo" />
          </picture>
        </h1>

        {!token ? (
          <>
            <p className="auth-subtitle">Invalid link</p>
            <p className="auth-description">No reset token was found in the link.</p>
            <a href="/" className="auth-button" style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }}>
              Back to sign in
            </a>
          </>
        ) : status === 'success' ? (
          <>
            <p className="auth-subtitle">Password updated!</p>
            <p className="auth-description">You are now signed in. Redirecting…</p>
          </>
        ) : (
          <>
            <p className="auth-subtitle">Choose a new password</p>

            <form onSubmit={handleSubmit} className="auth-form">
              <div className="form-field">
                <label htmlFor="rp-password">New password</label>
                <input
                  id="rp-password"
                  type="password"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setStatus('form'); }}
                  required
                  minLength={6}
                  placeholder="At least 6 characters"
                  autoFocus
                />
              </div>
              <div className="form-field">
                <label htmlFor="rp-confirm">Confirm new password</label>
                <input
                  id="rp-confirm"
                  type="password"
                  value={confirm}
                  onChange={(e) => { setConfirm(e.target.value); setStatus('form'); }}
                  required
                  minLength={6}
                  placeholder="Repeat your password"
                />
              </div>

              {status === 'error' && <div className="auth-error">{message}</div>}

              <button type="submit" className="auth-button" disabled={status === 'loading'}>
                {status === 'loading' ? 'Resetting…' : 'Reset password'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

export default ResetPassword;
