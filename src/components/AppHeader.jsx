import { useState, Children } from 'react'
import { Menu, X } from 'lucide-react'
import ThemeSelector from './ThemeSelector'

function AppHeader({ logoSrc, tagline, onLogoClick, theme, onSelectTheme, children }) {
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
        <ThemeSelector theme={theme} onSelectTheme={onSelectTheme} />
        {children}
      </div>
    </header>
  )
}

export default AppHeader
