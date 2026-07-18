import { useState, useEffect, useMemo, lazy, Suspense } from 'react'
import { Routes, Route, Navigate, Link, useNavigate } from 'react-router-dom'
import { version } from '../package.json'
import './App.css'
import { useAuth } from './context/AuthContext'
import Home from './components/Home'
import BookmarkBrowser from './components/BookmarkBrowser'
import AppHeader from './components/AppHeader'
import AppFooter from './components/AppFooter'
import { bookmarksAPI, billingAPI } from './api/api'

const Settings = lazy(() => import('./components/Settings'))
const PolicyPage = lazy(() => import('./components/PolicyPage'))
const SupportPage = lazy(() => import('./components/SupportPage'))
const VerifyEmail = lazy(() => import('./components/VerifyEmail'))
const ResetPassword = lazy(() => import('./components/ResetPassword'))
const PublicProfile = lazy(() => import('./components/PublicProfile'))
import { decodeHtmlEntities } from './utils/decodeHtmlEntities'
import { Settings as SettingsIcon, Plus, Pencil, Trash2, Star, X, RefreshCw, Globe, Scissors, FileText, Info, Eye, EyeOff } from 'lucide-react'

const FREE_BOOKMARK_LIMIT = 50
const THEME_STORAGE_KEY = 'tagstash-theme'

const normalizeBookmarkUrl = (value) => {
  const raw = (value || '').trim()
  if (!raw) return ''
  if (/^https?:\/\//i.test(raw)) return raw

  const cleaned = raw
    .replace(/^https?:/i, '')
    .replace(/^\/\//, '')
    .trim()

  return cleaned ? `https://${cleaned}` : ''
}

const ActionInfo = ({ text }) => (
  <span className="action-info-inline" aria-hidden="true">
    <Info size={11} />
    <span className="action-info-tooltip" role="tooltip">{text}</span>
  </span>
)

const getInitialTheme = () => {
  if (typeof window === 'undefined') {
    return 'dark'
  }

  const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY)
  if (storedTheme === 'light' || storedTheme === 'dark') {
    return storedTheme
  }

  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

function App() {
  const { user, loading: authLoading, logout } = useAuth()
  const [theme, setTheme] = useState(getInitialTheme)
  const [bookmarks, setBookmarks] = useState([])
  const [showAddForm, setShowAddForm] = useState(false)
  const [browserResetKey, setBrowserResetKey] = useState(0)
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [fetchingDescription, setFetchingDescription] = useState(false)
  const [lastFetchedDescriptionUrl, setLastFetchedDescriptionUrl] = useState('')
  const [editingBookmarkId, setEditingBookmarkId] = useState(null)
  const [editFormData, setEditFormData] = useState({
    title: '',
    url: '',
    description: '',
    tags: '',
  })
  const [fetchingEditDescription, setFetchingEditDescription] = useState(false)
  const [fetchingEditTitle, setFetchingEditTitle] = useState(false)
  const [savingEdit, setSavingEdit] = useState(false)
  const [formData, setFormData] = useState({
    title: '',
    url: '',
    tags: '',
    description: ''
  })
  const [tagDraft, setTagDraft] = useState('')
  const [editTagDraft, setEditTagDraft] = useState('')
  const [tagsRefreshKey, setTagsRefreshKey] = useState(0)
  const [usageUpgradePlan, setUsageUpgradePlan] = useState('monthly')
  const [startingUpgrade, setStartingUpgrade] = useState(false)
  const [billingMessage, setBillingMessage] = useState(() => {
    const params = new URLSearchParams(window.location.search)
    return params.get('billing') || ''
  })

  // Clear billing query param from URL without reload
  useEffect(() => {
    if (billingMessage) {
      const url = new URL(window.location.href)
      url.searchParams.delete('billing')
      window.history.replaceState({}, '', url.toString())
    }
  }, [billingMessage])

  const membershipTier = user?.membership_tier || 'free'
  const isPaidMember = membershipTier === 'paid'
  const bookmarkUsageCount = bookmarks.length
  const freeUsagePercent = Math.min(100, Math.round((bookmarkUsageCount / FREE_BOOKMARK_LIMIT) * 100))
  const isFreeLimitReached = !isPaidMember && bookmarks.length >= FREE_BOOKMARK_LIMIT
  const logoSrc = theme === 'dark' ? '/logo-dark.png' : '/logo-light.png'

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.documentElement.style.colorScheme = theme
    window.localStorage.setItem(THEME_STORAGE_KEY, theme)
  }, [theme])

  useEffect(() => {
    if (user) {
      fetchBookmarks()
    }
  }, [user])

  const toggleTheme = () => {
    setTheme((currentTheme) => (currentTheme === 'dark' ? 'light' : 'dark'))
  }

  const handleLogoClick = () => {
    navigate('/')
    setShowAddForm(false)
    setEditingBookmarkId(null)
    setBrowserResetKey((prev) => prev + 1)
  }

  const fetchBookmarks = async () => {
    try {
      setLoading(true)
      const response = await bookmarksAPI.getAll()
      setBookmarks(response.data.bookmarks)
    } catch (err) {
      setError('Failed to fetch bookmarks')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const handleUpgradeFromUsageCard = async () => {
    try {
      setStartingUpgrade(true)
      const response = await billingAPI.createCheckoutSession(usageUpgradePlan)
      const checkoutUrl = response?.data?.url

      if (!checkoutUrl) {
        throw new Error('Missing checkout URL')
      }

      window.location.assign(checkoutUrl)
    } catch (err) {
      setError(err?.response?.data?.error || 'Failed to start checkout. Please try again.')
      setStartingUpgrade(false)
    }
  }

  const availableTagNames = useMemo(() => {
    const tagNames = bookmarks.flatMap((bookmark) => (
      Array.isArray(bookmark.tags)
        ? bookmark.tags.map((tag) => tag.name?.trim().toLowerCase()).filter(Boolean)
        : []
    ))

    return Array.from(new Set(tagNames)).sort((left, right) => left.localeCompare(right))
  }, [bookmarks])

  const handleTagFavoriteToggle = async (tag) => {
    if (!tag?.id) return

    try {
      await bookmarksAPI.toggleTagFavorite(tag.id)
      setTagsRefreshKey((prev) => prev + 1)
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update favorite tag')
    }
  }

  const parseTags = (raw) => (
    (raw || '')
      .split(',')
      .map((tag) => tag.trim().toLowerCase())
      .filter((tag) => tag.length > 0)
  )

  const joinTags = (tags) => tags.join(', ')

  const buildTagList = (rawTags, rawDraft) => {
    const allTags = [...parseTags(rawTags), ...parseTags(rawDraft)]
    const invalidTag = allTags.find((tag) => tag.includes(' '))
    if (invalidTag) {
      return { tags: [], invalidTag }
    }
    return { tags: Array.from(new Set(allTags)), invalidTag: null }
  }

  const lockAddDraftTags = (draft = tagDraft) => {
    const { tags, invalidTag } = buildTagList(formData.tags, draft)
    if (invalidTag) {
      setError(`Tag "${invalidTag}" must be a single word with no spaces`)
      return false
    }
    setFormData((prev) => ({ ...prev, tags: joinTags(tags) }))
    setTagDraft('')
    return true
  }

  const lockEditDraftTags = (draft = editTagDraft) => {
    const { tags, invalidTag } = buildTagList(editFormData.tags, draft)
    if (invalidTag) {
      setError(`Tag "${invalidTag}" must be a single word with no spaces`)
      return false
    }
    setEditFormData((prev) => ({ ...prev, tags: joinTags(tags) }))
    setEditTagDraft('')
    return true
  }

  const removeAddTag = (tagToRemove) => {
    const nextTags = parseTags(formData.tags).filter((tag) => tag !== tagToRemove)
    setFormData((prev) => ({ ...prev, tags: joinTags(nextTags) }))
  }

  const removeEditTag = (tagToRemove) => {
    const nextTags = parseTags(editFormData.tags).filter((tag) => tag !== tagToRemove)
    setEditFormData((prev) => ({ ...prev, tags: joinTags(nextTags) }))
  }

  const getSuggestedTag = (draft, lockedTags) => {
    const normalizedDraft = draft.trim().toLowerCase()
    if (!normalizedDraft) return null

    const lockedTagSet = new Set(lockedTags)

    const exactMatch = availableTagNames.find((tag) => (
      tag === normalizedDraft && !lockedTagSet.has(tag)
    ))

    if (exactMatch) {
      return exactMatch
    }

    return availableTagNames.find((tag) => (
      tag.startsWith(normalizedDraft) && !lockedTagSet.has(tag)
    )) || null
  }

  const addTagSuggestion = getSuggestedTag(tagDraft, parseTags(formData.tags))
  const editTagSuggestion = getSuggestedTag(editTagDraft, parseTags(editFormData.tags))

  const handleAddTagDraftKeyDown = (e) => {
    if (e.key === 'Tab') {
      if (!addTagSuggestion) return

      e.preventDefault()
      setError('')
      lockAddDraftTags(addTagSuggestion)
      return
    }

    const isDelimiter = e.key === ',' || e.key === ' ' || e.key === 'Spacebar'
    if (!isDelimiter || !tagDraft.trim()) return

    e.preventDefault()

    setError('')
    lockAddDraftTags()
  }

  const handleEditTagDraftKeyDown = (e) => {
    if (e.key === 'Tab') {
      if (!editTagSuggestion) return

      e.preventDefault()
      setError('')
      lockEditDraftTags(editTagSuggestion)
      return
    }

    if (e.key === 'Enter') {
      e.preventDefault()
      handleSaveEdit(editingBookmarkId)
      return
    }

    const isDelimiter = e.key === ',' || e.key === ' ' || e.key === 'Spacebar'
    if (!isDelimiter || !editTagDraft.trim()) return

    e.preventDefault()

    setError('')
    lockEditDraftTags()
  }

  const handleInputChange = (e) => {
    if (e.target.name === 'url') {
      setLastFetchedDescriptionUrl('')
    }

    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    })
  }

  const handleBaseUrl = () => {
    try {
      const u = new URL(normalizeBookmarkUrl(formData.url))
      setFormData(prev => ({ ...prev, url: u.origin + '/' }))
    } catch {}
  }

  const handleTrimUrl = () => {
    try {
      const u = new URL(normalizeBookmarkUrl(formData.url))
      setFormData(prev => ({ ...prev, url: u.origin + u.pathname }))
    } catch {}
  }

  const handleEditBaseUrl = () => {
    try {
      const u = new URL(normalizeBookmarkUrl(editFormData.url))
      setEditFormData(prev => ({ ...prev, url: u.origin + '/' }))
    } catch {}
  }

  const handleEditTrimUrl = () => {
    try {
      const u = new URL(normalizeBookmarkUrl(editFormData.url))
      setEditFormData(prev => ({ ...prev, url: u.origin + u.pathname }))
    } catch {}
  }

  const handleFetchDescription = async (force = false) => {
    const rawUrl = formData.url.trim()
    if (!rawUrl) {
      if (force) {
        setError('Enter a URL first to fetch description')
      }
      return
    }

    const normalizedUrl = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`
    if (!force && normalizedUrl === lastFetchedDescriptionUrl) {
      return
    }

    try {
      setError('')
      setFetchingDescription(true)
      const response = await bookmarksAPI.fetchDescription(rawUrl)
      const fetchedDescription = response.data?.description || ''

      setFormData((prev) => ({
        ...prev,
        description: fetchedDescription,
      }))
      setLastFetchedDescriptionUrl(normalizedUrl)
    } catch (err) {
      if (force) {
        setError(err.response?.data?.error || 'Failed to fetch description')
      }
    } finally {
      setFetchingDescription(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (isFreeLimitReached) {
      setError(`Free users can save up to ${FREE_BOOKMARK_LIMIT} bookmarks. Upgrade to paid for unlimited bookmarks.`)
      return
    }

    try {
      const { tags, invalidTag } = buildTagList(formData.tags, tagDraft)
      if (invalidTag) {
        setError(`Tag "${invalidTag}" must be a single word with no spaces`)
        return
      }

      const normalizedUrl = normalizeBookmarkUrl(formData.url)
      if (!normalizedUrl) {
        setError('Title and URL are required')
        return
      }

      const bookmarkData = {
        title: formData.title,
        url: normalizedUrl,
        description: formData.description || null,
        tags
      }

      await bookmarksAPI.create(bookmarkData)
      
      // Reset form and refresh bookmarks
      setFormData({ title: '', url: '', tags: '', description: '' })
      setTagDraft('')
      setLastFetchedDescriptionUrl('')
      setShowAddForm(false)
      fetchBookmarks()
      // Refresh tag cloud to include new tags
      setTagsRefreshKey(prev => prev + 1)
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create bookmark')
    }
  }

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to delete this bookmark?')) {
      return
    }

    try {
      await bookmarksAPI.delete(id)
      fetchBookmarks()
      // Refresh tag cloud to update counts
      setTagsRefreshKey(prev => prev + 1)
    } catch (err) {
      setError('Failed to delete bookmark')
    }
  }

  const handleBookmarkToggle = async (apiCall, id, fallbackErrorMessage) => {
    try {
      await apiCall(id)
      fetchBookmarks()
    } catch (err) {
      setError(err.response?.data?.error || fallbackErrorMessage)
    }
  }

  const handleBookmarkFavoriteToggle = (id) =>
    handleBookmarkToggle(bookmarksAPI.toggleFavorite, id, 'Failed to update bookmark favorite')

  const handleBookmarkPrivateToggle = (id) =>
    handleBookmarkToggle(bookmarksAPI.togglePrivate, id, 'Failed to update bookmark privacy')

  const handleStartEdit = (bookmark) => {
    setError('')
    setEditingBookmarkId(bookmark.id)
    const tagsString = bookmark.tags && bookmark.tags.length > 0
      ? bookmark.tags.map(tag => tag.name).join(', ')
      : ''
    setEditFormData({
      title: decodeHtmlEntities(bookmark.title || ''),
      url: bookmark.url || '',
      description: decodeHtmlEntities(bookmark.description || ''),
      tags: tagsString,
    })
    setEditTagDraft('')
  }

  const handleCancelEdit = () => {
    setEditingBookmarkId(null)
    setEditFormData({ title: '', url: '', description: '', tags: '' })
    setEditTagDraft('')
  }

  const handleEditInputChange = (e) => {
    setEditFormData((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }))
  }

  const getFaviconPreviewUrl = (url) => {
    const rawUrl = (url || '').trim()
    if (!rawUrl) {
      return null
    }

    const normalizedUrl = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`

    try {
      const parsedUrl = new URL(normalizedUrl)
      return `https://www.google.com/s2/favicons?sz=64&domain=${parsedUrl.hostname}`
    } catch {
      return null
    }
  }

  const handleSaveEdit = async (bookmarkId) => {
    if (!editFormData.title.trim() || !editFormData.url.trim()) {
      setError('Title and URL are required')
      return
    }

    try {
      const { tags, invalidTag } = buildTagList(editFormData.tags, editTagDraft)
      if (invalidTag) {
        setError(`Tag "${invalidTag}" must be a single word with no spaces`)
        return
      }

      setSavingEdit(true)
      setError('')
      const normalizedUrl = normalizeBookmarkUrl(editFormData.url)
      if (!normalizedUrl) {
        setError('Title and URL are required')
        setSavingEdit(false)
        return
      }

      await bookmarksAPI.update(bookmarkId, {
        title: editFormData.title.trim(),
        url: normalizedUrl,
        description: editFormData.description.trim() || null,
        tags,
      })
      handleCancelEdit()
      fetchBookmarks()
      // Refresh tag cloud to include any new tags
      setTagsRefreshKey(prev => prev + 1)
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update bookmark')
    } finally {
      setSavingEdit(false)
    }
  }

  const handleFetchEditDescription = async () => {
    if (!editFormData.url.trim()) {
      setError('Enter a URL first to fetch description')
      return
    }

    try {
      setError('')
      setFetchingEditDescription(true)
      const response = await bookmarksAPI.fetchDescription(editFormData.url)
      const fetchedDescription = response.data?.description || ''

      setEditFormData((prev) => ({
        ...prev,
        description: fetchedDescription,
      }))
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to fetch description')
    } finally {
      setFetchingEditDescription(false)
    }
  }

  const handleFetchEditTitle = async () => {
    if (!editFormData.url.trim()) {
      setError('Enter a URL first to fetch title')
      return
    }

    try {
      setError('')
      setFetchingEditTitle(true)
      const response = await bookmarksAPI.fetchMetadata(editFormData.url)
      const fetchedTitle = response.data?.title?.trim()

      if (!fetchedTitle) {
        setError('No page title found for this URL')
        return
      }

      setEditFormData((prev) => ({
        ...prev,
        title: fetchedTitle,
      }))
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to fetch title')
    } finally {
      setFetchingEditTitle(false)
    }
  }

  const renderOwnerCard = (bookmark) => {
    const isEditing = editingBookmarkId === bookmark.id
    const isFavorite = Boolean(bookmark.is_favorite)
    const isPrivate = Boolean(bookmark.is_private)
    const faviconSrc = isEditing
      ? (getFaviconPreviewUrl(editFormData.url) || bookmark.favicon_url)
      : bookmark.favicon_url
    const displayTitle = decodeHtmlEntities(bookmark.title || '')
    const displayDescription = decodeHtmlEntities(bookmark.description || '')

    return (
      <div className="bookmark-card">
        <div className="bookmark-header">
          {faviconSrc && (
            <img
              src={faviconSrc}
              alt="favicon"
              className="favicon"
              onError={(e) => e.target.style.display = 'none'}
            />
          )}
          <h3>{displayTitle}</h3>
          <div className="bookmark-actions">
            <button
              type="button"
              onClick={() => handleStartEdit(bookmark)}
              className="edit-btn"
              title="Edit bookmark"
            >
              <Pencil size={14} />
              <span>Edit</span>
            </button>
            <button
              type="button"
              onClick={() => handleBookmarkFavoriteToggle(bookmark.id)}
              className={`favorite-btn ${isFavorite ? 'active' : ''}`}
              title={isFavorite ? 'Remove favorite bookmark' : 'Mark bookmark as favorite'}
              aria-label={isFavorite ? 'Remove favorite bookmark' : 'Mark bookmark as favorite'}
            >
              <Star size={15} fill={isFavorite ? 'currentColor' : 'none'} />
            </button>
            <button
              type="button"
              onClick={() => handleBookmarkPrivateToggle(bookmark.id)}
              className={`private-btn ${isPrivate ? 'active' : ''}`}
              title={isPrivate ? 'Make bookmark public' : 'Mark bookmark private'}
              aria-label={isPrivate ? 'Make bookmark public' : 'Mark bookmark private'}
            >
              {isPrivate ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
            <button
              onClick={() => handleDelete(bookmark.id)}
              className="delete-btn"
              title="Delete bookmark"
              aria-label="Delete bookmark"
            >
              <Trash2 size={16} />
            </button>
          </div>
        </div>
        {isEditing ? (
          <div className="bookmark-edit-form">
            <div className="form-group">
              <div className="field-header">
                <label htmlFor={`edit-title-${bookmark.id}`}>Title</label>
                <button
                  type="button"
                  className="btn-field-action"
                  onClick={handleFetchEditTitle}
                  disabled={!editFormData.url.trim() || fetchingEditTitle}
                >
                  <RefreshCw size={13} />
                  <span>{fetchingEditTitle ? 'Fetching...' : 'Fetch Title'}</span>
                  <ActionInfo text="Attempts to read page metadata and replace the title field with the page title." />
                </button>
              </div>
              <input
                id={`edit-title-${bookmark.id}`}
                type="text"
                name="title"
                value={editFormData.title}
                onChange={handleEditInputChange}
                required
              />
            </div>
            <div className="form-group">
              <div className="field-header">
                <label htmlFor={`edit-url-${bookmark.id}`}>URL</label>
                {editFormData.url && (
                  <div className="field-actions">
                    <button type="button" className="btn-field-action" onClick={handleEditBaseUrl}>
                      <Globe size={13} /><span>Base URL</span>
                      <ActionInfo text="Keeps only the site root (protocol + domain), removing all path and query parts. Example: https://example.com/docs/page?ref=nav becomes https://example.com." />
                    </button>
                    <button type="button" className="btn-field-action" onClick={handleEditTrimUrl}>
                      <Scissors size={13} /><span>Trim URL</span>
                      <ActionInfo text="Keeps protocol + domain + path, and removes query string and hash fragments. Example: https://example.com/docs/page?ref=nav#intro becomes https://example.com/docs/page." />
                    </button>
                  </div>
                )}
              </div>
              <input
                id={`edit-url-${bookmark.id}`}
                type="url"
                name="url"
                value={editFormData.url}
                onChange={handleEditInputChange}
                required
              />
            </div>
            <div className="form-group">
              <div className="field-header">
                <label htmlFor={`edit-description-${bookmark.id}`}>Description</label>
                <button
                  type="button"
                  className="btn-field-action"
                  onClick={handleFetchEditDescription}
                  disabled={!editFormData.url.trim() || fetchingEditDescription}
                >
                  <FileText size={13} /><span>{fetchingEditDescription ? 'Fetching...' : 'Fetch From Site'}</span>
                  <ActionInfo text="Attempts to read the page metadata and fill the description field. If a site blocks scraping, this may fail." />
                </button>
              </div>
              <textarea
                id={`edit-description-${bookmark.id}`}
                name="description"
                value={editFormData.description}
                onChange={handleEditInputChange}
                rows="3"
              />
            </div>
            <div className="form-group">
              <label htmlFor={`edit-tags-${bookmark.id}`}>Tags</label>
              <div className="tag-input-shell">
                {parseTags(editFormData.tags).map((tag) => (
                  <span key={tag} className="tag-input-pill">
                    <span>{tag}</span>
                    <button
                      type="button"
                      className="tag-pill-remove"
                      aria-label={`Remove tag ${tag}`}
                      onClick={() => removeEditTag(tag)}
                    >
                      x
                    </button>
                  </span>
                ))}
                <input
                  id={`edit-tags-${bookmark.id}`}
                  type="text"
                  value={editTagDraft}
                  onChange={(e) => setEditTagDraft(e.target.value)}
                  onKeyDown={handleEditTagDraftKeyDown}
                  placeholder="Type tag, press comma"
                />
              </div>
              {editTagSuggestion && (
                <div className="tag-input-suggestion" aria-live="polite">
                  Press Tab to use <strong>{editTagSuggestion}</strong>
                </div>
              )}
              <small>Press Comma or Space to lock in a new tag &middot; Enter to save</small>
            </div>
            <div className="bookmark-edit-actions">
              <button
                type="button"
                className="btn-primary"
                onClick={() => handleSaveEdit(bookmark.id)}
                disabled={savingEdit}
              >
                {savingEdit ? 'Saving...' : 'Save'}
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={handleCancelEdit}
                disabled={savingEdit}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            <a href={bookmark.url} target="_blank" rel="noopener noreferrer">
              {bookmark.url}
            </a>
            {displayDescription && (
              <p className="bookmark-description">{displayDescription}</p>
            )}
            <div className="tags">
              {bookmark.tags && bookmark.tags.length > 0 && bookmark.tags.map((tag) => (
                <span key={tag.id} className="tag">{tag.name}</span>
              ))}
            </div>
          </>
        )}
        <div className="bookmark-footer">
          <small>Added {new Date(bookmark.created_at).toLocaleDateString()}</small>
        </div>
      </div>
    )
  }

  if (authLoading) {
    return (
      <div className="loading-container">
        <p>Loading...</p>
      </div>
    )
  }

  const homeElement = (
    <Home logoSrc={logoSrc} theme={theme} onToggleTheme={toggleTheme} onNavigate={(page) => navigate('/' + page)} />
  )

  return (
    <Suspense fallback={<div className="loading-container"><p>Loading...</p></div>}>
      <Routes>
        <Route path="/verify-email" element={<VerifyEmail logoSrc={logoSrc} />} />
        <Route path="/reset-password" element={<ResetPassword logoSrc={logoSrc} />} />
        <Route path="/u/:username" element={<PublicProfile logoSrc={logoSrc} theme={theme} onToggleTheme={toggleTheme} />} />
        <Route path="/privacy" element={<PolicyPage logoSrc={logoSrc} onBack={() => navigate('/')} />} />
        <Route
          path="/support"
          element={<SupportPage logoSrc={logoSrc} prefillEmail={user?.email || ''} onBack={() => navigate('/')} />}
        />
        <Route
          path="/settings"
          element={
            user ? (
              <div className="app">
                <AppHeader
                  logoSrc={logoSrc}
                  tagline="Your tag-based bookmarking companion"
                  onLogoClick={handleLogoClick}
                  theme={theme}
                  onToggleTheme={toggleTheme}
                >
                  <span>Welcome, {user.username}!</span>
                  <button
                    onClick={() => { navigate('/'); fetchBookmarks(); }}
                    className="btn-secondary"
                    title="Back to bookmarks"
                  >
                    <SettingsIcon size={16} className="btn-icon" />
                    <span>Bookmarks</span>
                  </button>
                  <button onClick={logout} className="btn-secondary">
                    Logout
                  </button>
                </AppHeader>

                <main className="app-main settings-page-main">
                  <div className="main-content settings-page-content">
                    <Settings pageMode onImportComplete={fetchBookmarks} />
                  </div>
                </main>
                <AppFooter>
                  <Link className="footer-privacy-link" to="/privacy">Privacy Policy</Link>
                  <Link className="footer-privacy-link" to="/support">Support</Link>
                  <span className="version">v{version}</span>
                </AppFooter>
              </div>
            ) : homeElement
          }
        />
        <Route
          path="/"
          element={
            user ? (
              <div className="app">
                <AppHeader
                  logoSrc={logoSrc}
                  tagline="Your tag-based bookmarking companion"
                  onLogoClick={handleLogoClick}
                  theme={theme}
                  onToggleTheme={toggleTheme}
                >
                  <span>Welcome, {user.username}!</span>
                  <button
                    onClick={() => navigate('/settings')}
                    className="btn-secondary"
                    title="Open settings"
                  >
                    <SettingsIcon size={16} className="btn-icon" />
                    <span>Settings</span>
                  </button>
                  <button onClick={logout} className="btn-secondary">
                    Logout
                  </button>
                </AppHeader>

                <main className="app-main">
                  <BookmarkBrowser
                    key={browserResetKey}
                    bookmarks={bookmarks}
                    loading={loading}
                    tagsRefreshKey={tagsRefreshKey}
                    onTagFavoriteToggle={handleTagFavoriteToggle}
                    renderCard={renderOwnerCard}
                    toolbarExtra={(
            <button
              className="btn-primary"
              onClick={() => setShowAddForm(!showAddForm)}
              disabled={isFreeLimitReached && !showAddForm}
            >
              {!showAddForm && <Plus size={16} className="btn-icon" />}
              <span>{showAddForm ? 'Cancel' : 'Add Bookmark'}</span>
            </button>
          )}
        >
          {billingMessage === 'success' && (
            <div className="billing-banner billing-banner--success">
              <span>Your subscription is now active ΓÇö welcome to Pro!</span>
              <button type="button" onClick={() => setBillingMessage('')} aria-label="Dismiss">
                <X size={14} />
              </button>
            </div>
          )}
          {billingMessage === 'cancelled' && (
            <div className="billing-banner billing-banner--info">
              <span>Checkout cancelled. You can upgrade anytime from Settings.</span>
              <button type="button" onClick={() => setBillingMessage('')} aria-label="Dismiss">
                <X size={14} />
              </button>
            </div>
          )}

          {error && (
            <div className="error-message">
              {error}
              <button onClick={() => setError('')} className="error-close" aria-label="Dismiss error">
                <X size={16} />
              </button>
            </div>
          )}

          {showAddForm && (
            <div className="add-bookmark-form">
              <h2>Add New Bookmark</h2>
              {isFreeLimitReached && (
                <p className="usage-limit-warning">
                  Free plan limit reached ({FREE_BOOKMARK_LIMIT} bookmarks). Upgrade to paid to continue adding bookmarks.
                </p>
              )}
              <form onSubmit={handleSubmit}>
                <div className="form-group">
                  <div className="field-header">
                    <label htmlFor="url">URL *</label>
                    {formData.url && (
                      <div className="field-actions">
                        <button type="button" className="btn-field-action" onClick={handleBaseUrl}>
                          <Globe size={13} /><span>Base URL</span>
                          <ActionInfo text="Keeps only the site root (protocol + domain), removing all path and query parts. Example: https://example.com/docs/page?ref=nav becomes https://example.com." />
                        </button>
                        <button type="button" className="btn-field-action" onClick={handleTrimUrl}>
                          <Scissors size={13} /><span>Trim URL</span>
                          <ActionInfo text="Keeps protocol + domain + path, and removes query string and hash fragments. Example: https://example.com/docs/page?ref=nav#intro becomes https://example.com/docs/page." />
                        </button>
                      </div>
                    )}
                  </div>
                  <input
                    type="url"
                    id="url"
                    name="url"
                    value={formData.url}
                    onChange={handleInputChange}
                    onBlur={() => handleFetchDescription(false)}
                    placeholder="https://example.com"
                    required
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="title">Title *</label>
                  <input
                    type="text"
                    id="title"
                    name="title"
                    value={formData.title}
                    onChange={handleInputChange}
                    placeholder="My Awesome Bookmark"
                    required
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="tags">Tags</label>
                  <div className="tag-input-shell">
                    {parseTags(formData.tags).map((tag) => (
                      <span key={tag} className="tag-input-pill">
                        <span>{tag}</span>
                        <button
                          type="button"
                          className="tag-pill-remove"
                          aria-label={`Remove tag ${tag}`}
                          onClick={() => removeAddTag(tag)}
                        >
                          x
                        </button>
                      </span>
                    ))}
                    <input
                      type="text"
                      id="tags"
                      value={tagDraft}
                      onChange={(e) => setTagDraft(e.target.value)}
                      onKeyDown={handleAddTagDraftKeyDown}
                      placeholder="Type tag, press comma"
                    />
                  </div>
                  {addTagSuggestion && (
                    <div className="tag-input-suggestion" aria-live="polite">
                      Press Tab to use <strong>{addTagSuggestion}</strong>
                    </div>
                  )}
                  <small>Press Comma or Space to lock in a new tag &middot; Enter to save</small>
                </div>
                <div className="form-group">
                  <div className="field-header">
                    <label htmlFor="description">Description (optional)</label>
                    <button
                      type="button"
                      className="btn-field-action"
                      onClick={() => handleFetchDescription(true)}
                      disabled={!formData.url.trim() || fetchingDescription}
                    >
                      <FileText size={13} /><span>{fetchingDescription ? 'Fetching...' : 'Fetch From Site'}</span>
                      <ActionInfo text="Attempts to read the page metadata and fill the description field. If a site blocks scraping, this may fail." />
                    </button>
                  </div>
                  <textarea
                    id="description"
                    name="description"
                    value={formData.description}
                    onChange={handleInputChange}
                    rows="3"
                    placeholder="Brief description of this bookmark"
                  ></textarea>
                </div>
                <div className="form-actions">
                  <button type="submit" className="btn-primary">Save Bookmark</button>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => {
                      setShowAddForm(false)
                      setFormData({ title: '', url: '', tags: '', description: '' })
                      setTagDraft('')
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          )}

          {!isPaidMember && (
            <section className="membership-summary membership-summary-free">
              <div className="membership-summary-head">
                <strong>Free Plan</strong>
                <span>{bookmarkUsageCount} / {FREE_BOOKMARK_LIMIT} bookmarks used</span>
              </div>
              <div className="usage-meter" aria-hidden="true">
                <div className="usage-meter-bar" style={{ width: `${freeUsagePercent}%` }} />
              </div>
              <div className="membership-summary-actions">
                <div className="upgrade-plan-toggle" role="group" aria-label="Choose billing plan">
                  <button
                    type="button"
                    className={`upgrade-plan-btn ${usageUpgradePlan === 'monthly' ? 'active' : ''}`}
                    onClick={() => setUsageUpgradePlan('monthly')}
                    disabled={startingUpgrade}
                  >
                    Monthly
                  </button>
                  <button
                    type="button"
                    className={`upgrade-plan-btn ${usageUpgradePlan === 'annual' ? 'active' : ''}`}
                    onClick={() => setUsageUpgradePlan('annual')}
                    disabled={startingUpgrade}
                  >
                    Annual
                  </button>
                </div>
                <button
                  type="button"
                  className="upgrade-placeholder-link"
                  onClick={handleUpgradeFromUsageCard}
                  disabled={startingUpgrade}
                >
                  {startingUpgrade ? 'Opening checkout...' : `Upgrade (${usageUpgradePlan === 'monthly' ? 'Monthly' : 'Annual'})`}
                </button>
              </div>
              {isFreeLimitReached && (
                <p className="usage-limit-warning">You reached the free limit. Upgrade to paid to keep adding bookmarks.</p>
              )}
            </section>
          )}
                  </BookmarkBrowser>
                </main>
                <AppFooter>
                  <Link className="footer-privacy-link" to="/privacy">Privacy Policy</Link>
                  <Link className="footer-privacy-link" to="/support">Support</Link>
                  <span className="version">v{version}</span>
                </AppFooter>
              </div>
            ) : homeElement
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}

export default App
