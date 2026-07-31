import { useState, Children } from 'react'
import { Moon, Sun, Menu, X } from 'lucide-react'

function AppHeader({ logoSrc, tagline, onLogoClick, theme, onToggleTheme, children }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const hasMenuItems = Children.count(children) > 0

  return (
    <header className="app-header">
      <div className="app-header-brand">
        {onLogoClick ? (
          <button type="button" className="app-header-logo-btn" onClick={onLogoClick} title="Back to bookmarks">
            <img src={logoSrc} alt="Tagstash" className="app-header-logo" />
          </button>
        ) : (
          <a href="/" className="app-header-logo-btn" title="Back to Tagstash">
            <img src={logoSrc} alt="Tagstash" className="app-header-logo" />
          </a>
        )}
        <p className="app-header-tagline">{tagline}</p>
      </div>

      {hasMenuItems && (
        <button
          type="button"
          className="app-header-menu-toggle"
          onClick={() => setMenuOpen((prev) => !prev)}
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={menuOpen}
        >
          {menuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      )}

      <div
        className={`user-info ${menuOpen ? 'user-info-open' : ''}`}
        onClick={() => setMenuOpen(false)}
      >
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onToggleTheme() }}
          className="theme-toggle-btn"
          aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
          title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
        >
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </button>
        {children}
      </div>
    </header>
  )
}

export default AppHeader
