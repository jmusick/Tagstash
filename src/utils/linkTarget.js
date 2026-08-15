// Where a bookmark link opens when clicked. Persisted to the account
// (`users.link_target`) like the theme, with localStorage as the local default
// for anonymous visitors and for first paint before `/auth/me` answers. The
// browser extension deliberately keeps its own separate, extension-local
// setting rather than reading this one.
export const LINK_TARGET_STORAGE_KEY = 'tagstash-link-target'
export const LINK_TARGET_ORDER = ['new', 'same']
export const LINK_TARGET_LABELS = {
  new: 'A new tab',
  same: 'The same tab',
}
export const DEFAULT_LINK_TARGET = 'new'

export const isValidLinkTarget = (value) => LINK_TARGET_ORDER.includes(value)

export const getInitialLinkTarget = () => {
  if (typeof window === 'undefined') {
    return DEFAULT_LINK_TARGET
  }

  const stored = window.localStorage.getItem(LINK_TARGET_STORAGE_KEY)
  return isValidLinkTarget(stored) ? stored : DEFAULT_LINK_TARGET
}

// Spread onto an <a> that points at a bookmark's URL so it honors the preference.
export const linkTargetProps = (linkTarget) => (
  linkTarget === 'same' ? {} : { target: '_blank', rel: 'noopener noreferrer' }
)
