import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { authAPI } from '../api/api';
import { Tag, Zap, Shield, Share2, Cloud, Smartphone, Moon, Sun } from 'lucide-react';
import { version } from '../../package.json';
import './Home.css';

function Home({ logoSrc, theme, onToggleTheme, onNavigate }) {
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

  const features = [
    {
      icon: Tag,
      title: 'Tag-Based Organization',
      description: 'Save links with flexible tags, then find them again with search, sorting, and tag queries.'
    },
    {
      icon: Zap,
      title: 'Free And Pro Tiers',
      description: 'Start free with up to 50 bookmarks, then upgrade to Pro for unlimited saving.'
    },
    {
      icon: Shield,
      title: 'Privacy Focused',
      description: 'Run your own instance or use the hosted version. Your library stays centered on your own workflow.'
    },
    {
      icon: Cloud,
      title: 'Hosted Or Self-Hosted',
      description: 'Use the live service at tagsta.sh or run Tagstash yourself for non-commercial use.'
    },
    {
      icon: Smartphone,
      title: 'Browser Extension',
      description: 'Pair it with the companion extension to save the current tab without breaking your flow.'
    },
    {
      icon: Share2,
      title: 'Account And Billing',
      description: 'Email verification, admin controls, Stripe billing, and billing portal support are built in.',
    }
  ];

  const tech = ['React', 'Cloudflare Pages Functions', 'D1 (SQLite)', 'JWT Auth', 'Stripe', 'Resend'];

  if (pendingEmail) {
    return (
      <div className="home-container home-container--centered">
        <div className="home-topbar">
          <button
            type="button"
            onClick={onToggleTheme}
            className="theme-toggle-btn home-theme-toggle"
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
          >
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        </div>
        <div className="home-centered-content">
          <div className="auth-card">
            <h2 className="auth-card-title">Check your email</h2>
            <p className="auth-description">
              We sent a verification link to <strong>{pendingEmail}</strong>. Click the link to activate
              your account.
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
      </div>
    );
  }

  return (
    <div className="home-container">
      <div className="home-topbar">
        <button
          type="button"
          onClick={onToggleTheme}
          className="theme-toggle-btn home-theme-toggle"
          aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
          title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
        >
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        </button>
      </div>
      {/* Hero Section */}
      <section className="hero-section">
        <div className="hero-content">
          <h1 className="hero-title">
            <img src={logoSrc} alt="Tagstash" className="hero-logo" />
          </h1>
          <p className="hero-subtitle">Tag-first bookmarking for people who outgrow folders fast</p>
          <div className="hero-meta">
            <span className="hero-meta-badge">Free up to 50 bookmarks</span>
            <span className="hero-meta-badge">Pro for unlimited saving</span>
            <span className="hero-meta-badge">Hosted at tagsta.sh</span>
          </div>
          
          <div className="hero-description">
            <p>
              <strong>Tagstash</strong> is a modern bookmarking app built for people who want fast capture,
              clean organization, and retrieval by tags instead of rigid folder trees.
            </p>
            <p>
              Create an account, verify your email, save bookmarks with tags and descriptions, then search,
              filter, and manage your library from anywhere. If you prefer to run your own stack, you can
              self-host it for free under the included non-commercial license.
            </p>
            <p className="tagline">Use the hosted app or run your own instance. Same tag-first philosophy.</p>
          </div>
        </div>

        <div className="auth-card">
          <h2 className="auth-card-title">
            {isLogin ? 'Welcome back!' : 'Get Started'}
          </h2>
          <p className="auth-card-intro">
            {isLogin
              ? 'Sign in to access your bookmarks, billing, tags, and saved searches.'
              : 'Create your account to start with the free plan and upgrade later if you need more space.'}
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

          <a
            href="https://addons.mozilla.org/en-US/firefox/addon/tagstash/"
            target="_blank"
            rel="noreferrer"
            className="extension-link-card"
          >
            <span className="extension-link-kicker">Firefox Extension</span>
            <span className="extension-link-title">Install Tagstash for Firefox</span>
            <span className="extension-link-copy">Save the current tab directly into your Tagstash library.</span>
          </a>
        </div>
      </section>

      {/* Features Section */}
      <section className="features-section">
        <div className="section-header">
          <h2>Why Tagstash?</h2>
          <p>Thoughtfully designed for bookmark power users</p>
        </div>

        <div className="features-grid">
          {features.filter(f => !f.hidden).map((feature, index) => {
            const IconComponent = feature.icon;
            return (
              <div key={index} className="feature-card">
                <div className="feature-icon">
                  <IconComponent size={24} />
                </div>
                <h3>{feature.title}</h3>
                <p>{feature.description}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Tech Stack Section */}
      <section className="tech-section">
        <div className="section-header">
          <h2>Built With</h2>
          <p>Modern, open-source technologies</p>
        </div>

        <div className="tech-stack">
          {tech.map((name, index) => (
            <div key={index} className="tech-badge">
              {name}
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="home-footer">
        <p>&copy; {new Date().getFullYear()} Tagstash &nbsp;&middot;&nbsp;
          <button className="home-footer-privacy-link" onClick={() => onNavigate('privacy')}>Privacy Policy</button>
          &nbsp;&middot;&nbsp;<span className="version">v{version}</span>
        </p>
      </footer>
    </div>
  );
}

export default Home;
