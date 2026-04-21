import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { authAPI } from '../api/api';
import './Auth.css';

function Auth() {
  const [isLogin, setIsLogin] = useState(true);
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [pendingEmail, setPendingEmail] = useState('');
  const [resendStatus, setResendStatus] = useState('');

  const { login, register } = useAuth();

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    let result;
    if (isLogin) {
      result = await login(formData.email, formData.password);
    } else {
      if (/\s/.test(formData.username.trim())) {
        setError('Username cannot contain spaces');
        setLoading(false);
        return;
      }

      if (formData.password.length < 6) {
        setError('Password must be at least 6 characters');
        setLoading(false);
        return;
      }
      result = await register(formData.username, formData.email, formData.password);
    }

    setLoading(false);

    if (!result.success) {
      setError(result.error);
    } else if (result.pendingVerification) {
      setPendingEmail(formData.email);
    }
  };

  const toggleMode = () => {
    setIsLogin(!isLogin);
    setError('');
    setFormData({ username: '', email: '', password: '' });
  };

  const handleResend = async () => {
    setResendStatus('');
    try {
      await authAPI.resendVerification(pendingEmail);
      setResendStatus('A new verification link has been sent.');
    } catch (err) {
      setResendStatus(err.response?.data?.error || 'Could not resend. Please try again.');
    }
  };

  if (pendingEmail) {
    return (
      <div className="auth-container">
        <div className="auth-card">
          <h1 className="auth-title">
            <picture>
              <source srcSet="/tagstash-logo-light.svg" media="(prefers-color-scheme: light)" />
              <img src="/tagstash-logo-dark.svg" alt="Tagstash" className="auth-title-logo" />
            </picture>
          </h1>
          <p className="auth-subtitle">Check your email</p>
          <p className="auth-description">
            We sent a verification link to <strong>{pendingEmail}</strong>. Click the link in the email to
            activate your account.
          </p>
          {resendStatus && <p className="auth-description">{resendStatus}</p>}
          <button className="auth-button auth-button--secondary" onClick={handleResend}>
            Resend verification email
          </button>
          <div className="auth-toggle">
            Wrong email?{' '}
            <button onClick={() => { setPendingEmail(''); setIsLogin(false); }} className="auth-toggle-button">
              Go back
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h1 className="auth-title">
          <picture>
            <source srcSet="/tagstash-logo-light.svg" media="(prefers-color-scheme: light)" />
            <img src="/tagstash-logo-dark.svg" alt="Tagstash" className="auth-title-logo" />
          </picture>
        </h1>
        <p className="auth-subtitle">
          {isLogin ? 'Welcome back!' : 'Create your account'}
        </p>

        <form onSubmit={handleSubmit} className="auth-form">
          {!isLogin && (
            <div className="form-field">
              <label htmlFor="username">Username</label>
              <input
                type="text"
                id="username"
                name="username"
                value={formData.username}
                onChange={handleChange}
                required
                placeholder="Enter your username"
                pattern="\S+"
                title="Username cannot contain spaces"
              />
            </div>
          )}

          <div className="form-field">
            <label htmlFor="email">Email</label>
            <input
              type="email"
              id="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              required
              placeholder="Enter your email"
            />
          </div>

          <div className="form-field">
            <label htmlFor="password">Password</label>
            <input
              type="password"
              id="password"
              name="password"
              value={formData.password}
              onChange={handleChange}
              required
              placeholder="Enter your password"
              minLength={6}
            />
          </div>

          {error && <div className="auth-error">{error}</div>}

          <button type="submit" className="auth-button" disabled={loading}>
            {loading ? 'Please wait...' : isLogin ? 'Log In' : 'Sign Up'}
          </button>
        </form>

        <div className="auth-toggle">
          {isLogin ? "Don't have an account? " : 'Already have an account? '}
          <button onClick={toggleMode} className="auth-toggle-button">
            {isLogin ? 'Sign Up' : 'Log In'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default Auth;
