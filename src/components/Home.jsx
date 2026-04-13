import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Tag, Zap, Shield, Share2, Cloud, Smartphone, Github } from 'lucide-react';
import { version } from '../../package.json';
import './Home.css';

function Home() {
  const [isLogin, setIsLogin] = useState(true);
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

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
    }
  };

  const toggleMode = () => {
    setIsLogin(!isLogin);
    setError('');
    setFormData({ username: '', email: '', password: '' });
  };

  const features = [
    {
      icon: Tag,
      title: 'Tag-Based Organization',
      description: 'Organize your bookmarks with flexible, searchable tags instead of rigid folders.'
    },
    {
      icon: Zap,
      title: 'Lightning Fast',
      description: 'Instant search and filtering across all your bookmarks with real-time tag cloud.'
    },
    {
      icon: Shield,
      title: 'Privacy Focused',
      description: 'Your bookmarks are yours. No tracking, no ads, no selling your data.'
    },
    {
      icon: Cloud,
      title: 'Always Accessible',
      description: 'Access your bookmarks from anywhere with automatic session persistence.'
    },
    {
      icon: Smartphone,
      title: 'Clean Interface',
      description: 'Minimal, distraction-free design focused on what matters.'
    },
    {
      icon: Share2,
      title: 'Api Keys',
      description: 'Integrate with your own tools and services via API.'
    }
  ];

  const tech = ['React', 'Cloudflare Pages Functions', 'D1 (SQLite)', 'JWT Auth'];

  return (
    <div className="home-container">
      {/* Hero Section */}
      <section className="hero-section">
        <div className="hero-content">
          <h1 className="hero-title">
            <span className="hero-emoji">📚</span> Tagstash
          </h1>
          <p className="hero-subtitle">A better way to bookmark the web</p>
          
          <div className="hero-description">
            <p>
              There are other tag-based bookmarking sites, but they either have features you don't want, 
              or are missing features you do. So I created <strong>Tagstash</strong> to fill the hole for my own 
              personal, nit-picky preferences.
            </p>
            <p className="tagline">Maybe you'll like it too.</p>
          </div>
        </div>

        <div className="auth-card">
          <h2 className="auth-card-title">
            {isLogin ? 'Welcome back!' : 'Get Started'}
          </h2>

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
      </section>

      {/* Features Section */}
      <section className="features-section">
        <div className="section-header">
          <h2>Why Tagstash?</h2>
          <p>Thoughtfully designed for bookmark power users</p>
        </div>

        <div className="features-grid">
          {features.map((feature, index) => {
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
        <p>&copy; 2024 Tagstash. Made with care. &nbsp;<span className="version">v{version}</span></p>
      </footer>
    </div>
  );
}

export default Home;
