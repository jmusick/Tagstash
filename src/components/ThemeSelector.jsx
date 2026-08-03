import { useRef, useState } from 'react'
import { THEME_ORDER, THEME_LABELS, THEME_ICONS } from '../utils/theme'

function ThemeSelector({ theme, onSelectTheme, className = '', size = 16 }) {
  const [expanded, setExpanded] = useState(false)
  const containerRef = useRef(null)

  const collapse = () => setExpanded(false)
  const expand = () => setExpanded(true)

  const handleBlur = (e) => {
    if (!containerRef.current?.contains(e.relatedTarget)) {
      collapse()
    }
  }

  return (
    <div
      ref={containerRef}
      className={`theme-selector ${expanded ? 'theme-selector--expanded' : ''} ${className}`}
      onMouseEnter={expand}
      onMouseLeave={collapse}
      onFocus={expand}
      onBlur={handleBlur}
    >
      {THEME_ORDER.map((t) => {
        const Icon = THEME_ICONS[t]
        const isActive = t === theme
        return (
          <button
            key={t}
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              if (!expanded) {
                expand()
                return
              }
              onSelectTheme(t)
              collapse()
            }}
            className={`theme-selector-btn ${isActive ? 'theme-selector-btn--active' : ''} ${!expanded && !isActive ? 'theme-selector-btn--hidden' : ''}`}
            aria-label={isActive ? `Current theme: ${THEME_LABELS[t]}` : `Switch to ${THEME_LABELS[t]} theme`}
            aria-pressed={isActive}
          >
            <Icon size={size} />
            <span className="theme-selector-label">{THEME_LABELS[t]}</span>
          </button>
        )
      })}
    </div>
  )
}

export default ThemeSelector
