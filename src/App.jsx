import { useState, useEffect, useMemo } from 'react'
import { version } from '../package.json'
import './App.css'
import { useAuth } from './context/AuthContext'
import Home from './components/Home'
import Settings from './components/Settings'
import TagCloud from './components/TagCloud'
import { bookmarksAPI } from './api/api'
import { Settings as SettingsIcon, Plus, Pencil, Trash2, X, RefreshCw, Search, Globe, Scissors, FileText } from 'lucide-react'

const FREE_BOOKMARK_LIMIT = 50

function App() {
  const { user, loading: authLoading, logout } = useAuth()
  const [bookmarks, setBookmarks] = useState([])
  const [showAddForm, setShowAddForm] = useState(false)
  const [activePage, setActivePage] = useState('bookmarks')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedTag, setSelectedTag] = useState('')
  const [sortBy, setSortBy] = useState('date')
  const [sortDirection, setSortDirection] = useState('desc')
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
  const [tagsRefreshKey, setTagsRefreshKey] = useState(0)

  const membershipTier = user?.membership_tier || 'free'
  const isPaidMember = membershipTier === 'paid'
  const bookmarkUsageCount = bookmarks.length
  const freeUsagePercent = Math.min(100, Math.round((bookmarkUsageCount / FREE_BOOKMARK_LIMIT) * 100))
  const isFreeLimitReached = !isPaidMember && bookmarks.length >= FREE_BOOKMARK_LIMIT

  useEffect(() => {
    if (user) {
      fetchBookmarks()
    }
  }, [user])

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

  const sortedBookmarks = useMemo(() => {
    const items = [...bookmarks]

    switch (sortBy) {
      case 'lastUpdated':
        items.sort((a, b) => {
          const aDate = new Date(a.updated_at || a.created_at || 0)
          const bDate = new Date(b.updated_at || b.created_at || 0)
          return bDate - aDate
        })
        break
      case 'alpha':
        items.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }))
        break
      case 'url':
        items.sort((a, b) => a.url.localeCompare(b.url, undefined, { sensitivity: 'base' }))
        break
      case 'date':
      default:
        items.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        break
    }

    if (sortDirection === 'asc') {
      items.reverse()
    }

    return items
  }, [bookmarks, sortBy, sortDirection])

  const filteredBookmarks = useMemo(() => {
    const query = searchTerm.trim().toLowerCase()
    return sortedBookmarks.filter((bookmark) => {
      const tagsText = Array.isArray(bookmark.tags)
        ? bookmark.tags.map((tag) => tag.name).join(' ')
        : ''

      const searchable = [
        bookmark.title || '',
        bookmark.url || '',
        bookmark.description || '',
        tagsText,
      ]
        .join(' ')
        .toLowerCase()

      const matchesSearch = !query || searchable.includes(query)

      const matchesTag = !selectedTag || (
        Array.isArray(bookmark.tags) &&
        bookmark.tags.some((tag) => tag.name?.toLowerCase() === selectedTag.toLowerCase())
      )

      return matchesSearch && matchesTag
    })
  }, [sortedBookmarks, searchTerm, selectedTag])

  const handleTagSelect = (tagName) => {
    setSelectedTag((prev) => (prev.toLowerCase() === tagName.toLowerCase() ? '' : tagName))
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
      const u = new URL(formData.url)
      setFormData(prev => ({ ...prev, url: u.origin + '/' }))
    } catch {}
  }

  const handleTrimUrl = () => {
    try {
      const u = new URL(formData.url)
      setFormData(prev => ({ ...prev, url: u.origin + u.pathname }))
    } catch {}
  }

  const handleEditBaseUrl = () => {
    try {
      const u = new URL(editFormData.url)
      setEditFormData(prev => ({ ...prev, url: u.origin + '/' }))
    } catch {}
  }

  const handleEditTrimUrl = () => {
    try {
      const u = new URL(editFormData.url)
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
      const tags = formData.tags
        .split(',')
        .map(tag => tag.trim().toLowerCase())
        .filter(tag => tag.length > 0)

      // Validate tags are single words (no spaces)
      const invalidTag = tags.find(tag => tag.includes(' '))
      if (invalidTag) {
        setError(`Tag "${invalidTag}" must be a single word with no spaces`)
        return
      }

      const bookmarkData = {
        title: formData.title,
        url: formData.url,
        description: formData.description || null,
        tags
      }

      await bookmarksAPI.create(bookmarkData)
      
      // Reset form and refresh bookmarks
      setFormData({ title: '', url: '', tags: '', description: '' })
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

  const handleStartEdit = (bookmark) => {
    setError('')
    setEditingBookmarkId(bookmark.id)
    const tagsString = bookmark.tags && bookmark.tags.length > 0
      ? bookmark.tags.map(tag => tag.name).join(', ')
      : ''
    setEditFormData({
      title: bookmark.title || '',
      url: bookmark.url || '',
      description: bookmark.description || '',
      tags: tagsString,
    })
  }

  const handleCancelEdit = () => {
    setEditingBookmarkId(null)
    setEditFormData({ title: '', url: '', description: '', tags: '' })
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
      const tags = editFormData.tags
        .split(',')
        .map(tag => tag.trim().toLowerCase())
        .filter(tag => tag.length > 0)

      // Validate tags are single words (no spaces)
      const invalidTag = tags.find(tag => tag.includes(' '))
      if (invalidTag) {
        setError(`Tag "${invalidTag}" must be a single word with no spaces`)
        return
      }

      setSavingEdit(true)
      setError('')
      await bookmarksAPI.update(bookmarkId, {
        title: editFormData.title.trim(),
        url: editFormData.url.trim(),
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

  if (authLoading) {
    return (
      <div className="loading-container">
        <p>Loading...</p>
      </div>
    )
  }

  if (!user) {
    return <Home />
  }

  if (activePage === 'settings') {
    return (
      <div className="app">
        <header className="app-header">
          <div>
            <h1>📚 Tagstash</h1>
            <p>Your tag-based bookmarking companion</p>
          </div>
          <div className="user-info">
            <span>Welcome, {user.username}!</span>
            <button
              onClick={() => { setActivePage('bookmarks'); fetchBookmarks(); }}
              className="btn-secondary"
              title="Back to bookmarks"
            >
              <SettingsIcon size={16} className="btn-icon" />
              <span>Bookmarks</span>
            </button>
            <button onClick={logout} className="btn-secondary">
              Logout
            </button>
          </div>
        </header>

        <main className="app-main settings-page-main">
          <div className="main-content settings-page-content">
            <Settings pageMode onImportComplete={fetchBookmarks} />
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <h1>📚 Tagstash</h1>
          <p>Your tag-based bookmarking companion</p>
        </div>
        <div className="user-info">
          <span>Welcome, {user.username}!</span>
          <button 
            onClick={() => setActivePage('settings')} 
            className="btn-secondary"
            title="Open settings"
          >
            <SettingsIcon size={16} className="btn-icon" />
            <span>Settings</span>
          </button>
          <button onClick={logout} className="btn-secondary">
            Logout
          </button>
        </div>
      </header>

      <main className="app-main">
        <div className="main-content">
          <div className="toolbar">
            <div className="sort-control">
              <label htmlFor="sortBy">Sort by</label>
              <select
                id="sortBy"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
              >
                <option value="date">Date saved (newest)</option>
                <option value="lastUpdated">Last updated</option>
                <option value="alpha">Alphabetical (A-Z)</option>
                <option value="url">URL (A-Z)</option>
              </select>
              <select
                id="sortDirection"
                aria-label="Sort direction"
                value={sortDirection}
                onChange={(e) => setSortDirection(e.target.value)}
              >
                <option value="asc">Ascending</option>
                <option value="desc">Descending</option>
              </select>
            </div>
            <div className="search-control">
              <Search size={16} className="search-icon" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search bookmarks"
                aria-label="Search bookmarks"
              />
            </div>
            <button 
              className="btn-primary"
              onClick={() => setShowAddForm(!showAddForm)}
              disabled={isFreeLimitReached && !showAddForm}
            >
              {!showAddForm && <Plus size={16} className="btn-icon" />}
              <span>{showAddForm ? 'Cancel' : 'Add Bookmark'}</span>
            </button>
          </div>

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
                      </button>
                      <button type="button" className="btn-field-action" onClick={handleTrimUrl}>
                        <Scissors size={13} /><span>Trim URL</span>
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
                <input 
                  type="text" 
                  id="tags"
                  name="tags"
                  value={formData.tags}
                  onChange={handleInputChange}
                  placeholder="javascript, react, tutorial"
                />
                <small>Separate tags with commas</small>
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
              <button type="button" className="upgrade-placeholder-link" aria-disabled="true">
                Upgrade
              </button>
            </div>
            {isFreeLimitReached && (
              <p className="usage-limit-warning">You reached the free limit. Upgrade to paid to keep adding bookmarks.</p>
            )}
          </section>
        )}

        <div className="bookmarks-section">
          {loading ? (
            <div className="loading-message">Loading bookmarks...</div>
          ) : filteredBookmarks.length === 0 ? (
            <div className="empty-state">
              <p>
                {searchTerm.trim() || selectedTag
                  ? 'No bookmarks match your search.'
                  : 'No bookmarks yet. Add your first one to get started!'}
              </p>
            </div>
          ) : (
            <div className="bookmarks-grid">
              {filteredBookmarks.map((bookmark) => {
                const isEditing = editingBookmarkId === bookmark.id
                const faviconSrc = isEditing
                  ? (getFaviconPreviewUrl(editFormData.url) || bookmark.favicon_url)
                  : bookmark.favicon_url

                return (
                <div key={bookmark.id} className="bookmark-card">
                  <div className="bookmark-header">
                    {faviconSrc && (
                      <img 
                        src={faviconSrc}
                        alt="favicon" 
                        className="favicon"
                        onError={(e) => e.target.style.display = 'none'}
                      />
                    )}
                    <h3>{bookmark.title}</h3>
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
                              </button>
                              <button type="button" className="btn-field-action" onClick={handleEditTrimUrl}>
                                <Scissors size={13} /><span>Trim URL</span>
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
                        <input
                          id={`edit-tags-${bookmark.id}`}
                          type="text"
                          name="tags"
                          value={editFormData.tags}
                          onChange={handleEditInputChange}
                          placeholder="javascript, react, tutorial"
                        />
                        <small>Separate tags with commas</small>
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
                      {bookmark.description && (
                        <p className="bookmark-description">{bookmark.description}</p>
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
              })}
            </div>
          )}
        </div>
        </div>

        <aside className="sidebar">
          {selectedTag && (
            <div className="active-tag-filter sidebar-tag-filter">
              <span>Tag: {selectedTag}</span>
              <button type="button" onClick={() => setSelectedTag('')} aria-label="Clear tag filter">
                <X size={14} />
              </button>
            </div>
          )}
          <TagCloud selectedTag={selectedTag} onTagSelect={handleTagSelect} refreshKey={tagsRefreshKey} />
        </aside>
      </main>
      <footer className="app-footer">
        <span className="version">v{version}</span>
      </footer>

    </div>
  )
}

export default App
