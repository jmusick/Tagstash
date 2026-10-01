import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { authAPI } from '../api/api';
import ThemeSelector from './ThemeSelector';
import HomeTagDemo from './HomeTagDemo';
import { version } from '../../package.json';
import { useDocumentMeta } from '../utils/useDocumentMeta';
import './Home.css';

function Home({ logoSrc, theme, onSelectTheme, onNavigate }) {
  useDocumentMeta({
    title: 'Tagstash - Tag-Based Bookmarking',
    description: 'Tag-first bookmarking for people who outgrow folders fast. Save, organize, and share your bookmarks with Tagstash.',
    path: '/',
  });

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
  const [forgotMode, setForgotMode] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotStatus, setForgotStatus] = useState('idle'); // idle | loading | sent | error
  const [forgotError, setForgotError] = useState('');

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

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    setForgotStatus('loading');
    setForgotError('');
    try {
      await authAPI.forgotPassword(forgotEmail);
      setForgotStatus('sent');
    } catch (err) {
      if (err.response?.status === 429) {
        setForgotError(err.response?.data?.error || 'Please wait before requesting another reset link.');
        setForgotStatus('error');
      } else {
        // For security, don't reveal if email wasn't found
        setForgotStatus('sent');
      }
    }
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

  // Mirrored in functions/index.js (SSR snapshot for crawlers). Keep in sync.
  const features = [
    {
      title: 'Tags instead of folders',
      description: 'One link can carry as many tags as it needs. Combine tags to narrow a search instead of digging through nested folders.',
    },
    {
      title: 'Find anything fast',
      description: 'Search titles, links, notes and tags at once, then sort by date saved, title or URL.',
    },
    {
      title: 'Save from your browser',
      description: 'The Chrome and Firefox extensions save the tab you are on without leaving the page.',
    },
    {
      title: 'Private by default',
      description: 'Nothing is shared until you choose to share it. Any bookmark can be marked private.',
    },
    {
      title: 'A public page, if you want one',
      description: 'Turn on a public profile to share a read-only, tag-filterable page of your bookmarks.',
    },
    {
      title: 'Bring your bookmarks',
      description: 'Import an HTML export from any major browser, or a Raindrop.io CSV.',
    },
  ];

  const faqs = [
    {
      question: 'What is Tagstash?',
      answer: 'Tagstash is a tag-based bookmark manager. Instead of filing links into a single folder tree, you attach one or more tags to each bookmark and find it again by searching, sorting, or filtering by tag.',
    },
    {
      question: 'How is Tagstash different from folders or browser bookmarks?',
      answer: 'Folder-based bookmarking forces every link into one location, which breaks down once you have hundreds of saved pages. Tagstash lets a single bookmark carry multiple tags, so the same link can show up under every topic it relates to, and you can combine tags to narrow results instead of hunting through nested folders.',
    },
    {
      question: 'How much does Tagstash cost?',
      answer: 'Tagstash is free for up to 50 bookmarks with no time limit. The Pro plan removes that limit for unlimited bookmarks at $3/month, or $36/year billed annually (same $3/month rate, paid once a year).',
    },
    {
      question: 'Does Tagstash have a browser extension?',
      answer: 'Yes. Tagstash has extensions for Chrome and Firefox that save the current tab into your library without leaving the page you are on.',
    },
    {
      question: 'Can I share my bookmarks publicly?',
      answer: 'Yes, opt-in. Enabling a public profile gives you a read-only, tag-filterable page of your bookmarks that others can browse. Individual bookmarks can be marked private to keep them out of that public view even when the profile itself is public.',
    },
    {
      question: 'Is my data private by default?',
      answer: 'Yes. Bookmarks are private by default. Sharing anything publicly, whether an individual bookmark or your whole profile, requires an explicit opt-in from account settings.',
    },
  ];

  if (forgotMode) {
    return (
      <div className="home-container home-container--centered">
        <div className="home-topbar">
          <img src={logoSrc} alt="Tagstash" className="home-logo" />
          <ThemeSelector theme={theme} onSelectTheme={onSelectTheme} className="home-theme-toggle" size={18} />
        </div>
        <div className="home-centered-content">
          <div className="auth-card">
            {forgotStatus === 'sent' ? (
              <>
                <h2 className="auth-card-title">Check your email</h2>
                <p className="auth-description">
                  If <strong>{forgotEmail}</strong> is registered, a password reset link has been sent.
                </p>
                <button
                  className="auth-button auth-button--secondary"
                  onClick={() => { setForgotMode(false); setForgotStatus('idle'); setForgotError(''); }}
                >
                  Back to sign in
                </button>
              </>
            ) : (
              <>
                <h2 className="auth-card-title">Reset your password</h2>
                <p className="auth-description">
                  Enter your email address and we&rsquo;ll send you a link to choose a new password.
                </p>
                <form onSubmit={handleForgotPassword} className="auth-form">
                  <div className="form-field">
                    <label htmlFor="forgot-email">Email</label>
                    <input
                      id="forgot-email"
                      type="email"
                      value={forgotEmail}
                      onChange={(e) => { setForgotEmail(e.target.value); setForgotError(''); }}
                      required
                      placeholder="Enter your email"
                      autoFocus
                    />
                  </div>
                  {forgotError && <div className="auth-error">{forgotError}</div>}
                  <button type="submit" className="auth-button" disabled={forgotStatus === 'loading'}>
                    {forgotStatus === 'loading' ? 'Sending…' : 'Send reset link'}
                  </button>
                </form>
                <div className="auth-toggle">
                  Remember your password?{' '}
                  <button
                    onClick={() => { setForgotMode(false); setForgotStatus('idle'); setForgotError(''); }}
                    className="auth-toggle-button"
                  >
                    Back to sign in
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (pendingEmail) {
    return (
      <div className="home-container home-container--centered">
        <div className="home-topbar">
          <img src={logoSrc} alt="Tagstash" className="home-logo" />
          <ThemeSelector theme={theme} onSelectTheme={onSelectTheme} className="home-theme-toggle" size={18} />
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
        <img src={logoSrc} alt="Tagstash" className="home-logo" />
        <ThemeSelector theme={theme} onSelectTheme={onSelectTheme} className="home-theme-toggle" size={18} />
      </div>

      <section className="hero-section">
        <div className="hero-content">
          <h1 className="sr-only">Tagstash - Tag-Based Bookmarking</h1>
          <p className="hero-headline">Tag-first bookmarking for people who outgrow folders fast.</p>
          <p className="hero-lede">
            Save a link once, give it every tag that fits, and find it again from any of them.
            Free for your first 50 bookmarks.
          </p>
        </div>

        <div className="auth-card">
          <h2 className="auth-card-title">
            {isLogin ? 'Log in' : 'Create your account'}
          </h2>
          <p className="auth-card-intro">
            {isLogin
              ? 'Welcome back. Your bookmarks are where you left them.'
              : 'Start on the free plan. Upgrade any time if you need more than 50 bookmarks.'}
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
                  placeholder="No spaces"
                  autoComplete="username"
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
                autoComplete="email"
                placeholder="you@example.com"
              />
            </div>

            <div className="form-field">
              <div className="form-field-head">
                <label htmlFor="password">Password</label>
                {isLogin && (
                  <button
                    type="button"
                    className="auth-toggle-button"
                    onClick={() => { setForgotEmail(formData.email); setForgotMode(true); setForgotStatus('idle'); setForgotError(''); }}
                  >
                    Forgot password?
                  </button>
                )}
              </div>
              <input
                type="password"
                id="password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                required
                autoComplete={isLogin ? 'current-password' : 'new-password'}
                placeholder={isLogin ? '' : 'At least 6 characters'}
                minLength={6}
              />
            </div>

            {error && <div className="auth-error">{error}</div>}

            <button type="submit" className="auth-button" disabled={loading}>
              {loading ? 'Please wait…' : isLogin ? 'Log in' : 'Create account'}
            </button>
          </form>

          <div className="auth-toggle">
            {isLogin ? 'New to Tagstash? ' : 'Already have an account? '}
            <button onClick={toggleMode} className="auth-toggle-button">
              {isLogin ? 'Create an account' : 'Log in'}
            </button>
          </div>

          <div className="extension-links">
            <p className="extension-links-label">Save tabs straight from your browser</p>
            <div className="extension-links-row">
              <a
                href="https://addons.mozilla.org/en-US/firefox/addon/tagstash/"
                target="_blank"
                rel="noreferrer"
                className="extension-link-card"
              >
                <img src="/firefox.svg" alt="" className="extension-link-browser-icon" />
                <span>Add to Firefox</span>
              </a>
              <a
                href="https://chromewebstore.google.com/detail/tagstash/ijoaejbpaibpodnohjmlbeanfhjdgoab"
                target="_blank"
                rel="noreferrer"
                className="extension-link-card"
              >
                <img src="/chrome.svg" alt="" className="extension-link-browser-icon" />
                <span>Add to Chrome</span>
              </a>
            </div>
          </div>
        </div>

        <div className="hero-demo">
          <HomeTagDemo />
        </div>
      </section>

      <section className="features-section">
        <h2 className="home-section-title">What you get</h2>
        <dl className="features-list">
          {features.map((feature) => (
            <div key={feature.title} className="feature-item">
              <dt>{feature.title}</dt>
              <dd>{feature.description}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="pricing-section">
        <h2 className="home-section-title">Pricing</h2>
        <div className="pricing-grid">
          <div className="pricing-plan">
            <h3 className="pricing-plan-name">Free</h3>
            <p className="pricing-amount">$0</p>
            <p className="pricing-description">Up to 50 bookmarks, with no time limit.</p>
          </div>
          <div className="pricing-plan pricing-plan--pro">
            <h3 className="pricing-plan-name">Pro</h3>
            <p className="pricing-amount">$3<span className="pricing-period">/month</span></p>
            <p className="pricing-description">
              Unlimited bookmarks. Pay monthly and cancel any time, or pay $36 once a year. Same rate either way.
            </p>
          </div>
        </div>
        <p className="pricing-note">Upgrade from Settings whenever you need more room.</p>
      </section>

      <section className="faq-section">
        <h2 className="home-section-title">Questions</h2>
        <dl className="faq-list">
          {faqs.map((faq) => (
            <div key={faq.question} className="faq-item">
              <dt>{faq.question}</dt>
              <dd>{faq.answer}</dd>
            </div>
          ))}
        </dl>
      </section>

      <footer className="home-footer">
        <span className="home-footer-copyright">
          &copy; {new Date().getFullYear()}{' '}
          <a href="https://stonedragonmedia.com/" target="_blank" rel="noopener noreferrer">
            Stone Dragon Media LLC
          </a>
        </span>
        <button className="home-footer-privacy-link" onClick={() => onNavigate('privacy')}>Privacy Policy</button>
        <button className="home-footer-privacy-link" onClick={() => onNavigate('support')}>Support</button>
        <button className="home-footer-privacy-link" data-cookie-preferences>Cookie Choices</button>
        <span className="version">v{version}</span>
      </footer>
    </div>
  );
}

export default Home;
