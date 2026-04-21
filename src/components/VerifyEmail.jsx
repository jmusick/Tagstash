import { useState, useEffect } from 'react';
import { authAPI } from '../api/api';
import { useAuth } from '../context/AuthContext';
import './Auth.css';

function VerifyEmail({ logoSrc }) {
  const [status, setStatus] = useState('verifying'); // verifying | success | error
  const [message, setMessage] = useState('');
  const { refreshCurrentUser } = useAuth();

  useEffect(() => {
    let redirectTimer;
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');

    if (!token) {
      setStatus('error');
      setMessage('No verification token found in the link.');
      return;
    }

    authAPI
      .verifyEmail(token)
      .then((response) => {
        localStorage.setItem('token', response.data.token);
        return refreshCurrentUser();
      })
      .then(() => {
        setStatus('success');
        // Switch out of verify mode after auth state is ready.
        redirectTimer = window.setTimeout(() => {
          window.location.assign('/');
        }, 800);
      })
      .catch((err) => {
        setStatus('error');
        setMessage(err.response?.data?.error || 'Verification failed. The link may be invalid or expired.');
      });

    return () => {
      if (redirectTimer) {
        window.clearTimeout(redirectTimer);
      }
    };
  }, []);

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h1 className="auth-title">
          <picture>
            <source srcSet="/tagstash-logo-light.svg" media="(prefers-color-scheme: light)" />
            <img src={logoSrc} alt="Tagstash" className="auth-title-logo" />
          </picture>
        </h1>

        {status === 'verifying' && (
          <p className="auth-subtitle">Verifying your email address…</p>
        )}

        {status === 'success' && (
          <>
            <p className="auth-subtitle">Email verified!</p>
            <p className="auth-description">Your account is active. You are now signed in.</p>
          </>
        )}

        {status === 'error' && (
          <>
            <p className="auth-subtitle">Verification failed</p>
            <p className="auth-description">{message}</p>
            <a href="/" className="auth-button" style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }}>
              Back to sign in
            </a>
          </>
        )}
      </div>
    </div>
  );
}

export default VerifyEmail;
