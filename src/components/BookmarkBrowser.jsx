import { useState, useEffect, useMemo, Fragment } from 'react'
import { Star, Search, X } from 'lucide-react'
import TagCloud from './TagCloud'
import { decodeHtmlEntities } from '../utils/decodeHtmlEntities'
import { getRegistrableDomain } from '../utils/domain'

function DefaultCard({ bookmark }) {
  const displayTitle = decodeHtmlEntities(bookmark.title || '')
  const displayDescription = decodeHtmlEntities(bookmark.description || '')

  return (
    <div className="bookmark-card">
      <div className="bookmark-header">
        {bookmark.favicon_url && (
          <img
            src={bookmark.favicon_url}
            alt="favicon"
            className="favicon"
            onError={(e) => { e.target.style.display = 'none' }}
          />
        )}
        <h3>{displayTitle}</h3>
      </div>
      <a href={bookmark.url} target="_blank" rel="noopener noreferrer">
        {bookmark.url}
      </a>
      {displayDescription && (
        <p className="bookmark-description">{displayDescription}</p>
      )}
      <div className="tags">
        {bookmark.tags && bookmark.tags.length > 0 && bookmark.tags.map((tag) => (
          <span key={tag.id ?? tag.name} className="tag">{tag.name}</span>
        ))}
      </div>
      <div className="bookmark-footer">
        <small>Added {new Date(bookmark.created_at).toLocaleDateString()}</small>
      </div>
    </div>
  )
}

function BookmarkBrowser({
  bookmarks,
  loading = false,
  tags,
  tagsRefreshKey = 0,
  onTagFavoriteToggle,
  showFavoritesFilter = true,
  toolbarExtra,
  renderCard,
  emptyStateMessage = 'No bookmarks yet. Add your first one to get started!',
  initialSelectedTags,
  onSelectedTagsChange,
  focusBookmarkId,
  onClearFocus,
  children,
}) {
  const [searchTerm, setSearchTerm] = useState('')
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false)
  const [selectedTags, setSelectedTags] = useState(() => initialSelectedTags || [])
  const [sortBy, setSortBy] = useState('date')
  const [sortDirection, setSortDirection] = useState('desc')
  const [itemsPerPage, setItemsPerPage] = useState(20)
  const [currentPage, setCurrentPage] = useState(1)
  const [domainFilter, setDomainFilter] = useState(null)

  useEffect(() => {
    onSelectedTagsChange?.(selectedTags)
    // Only fire when the selection itself changes, not on every parent re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTags])

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
    if (focusBookmarkId) {
      return sortedBookmarks.filter((bookmark) => bookmark.id === focusBookmarkId)
    }

    if (domainFilter) {
      return sortedBookmarks.filter((bookmark) => getRegistrableDomain(bookmark.url) === domainFilter)
    }

    const query = searchTerm.trim().toLowerCase()
    return sortedBookmarks.filter((bookmark) => {
      const tagsText = Array.isArray(bookmark.tags)
        ? bookmark.tags.map((tag) => tag.name).join(' ')
        : ''

      const searchable = [
        decodeHtmlEntities(bookmark.title || ''),
        bookmark.url || '',
        decodeHtmlEntities(bookmark.description || ''),
        tagsText,
      ]
        .join(' ')
        .toLowerCase()

      const matchesSearch = !query || searchable.includes(query)

      const bookmarkTagNames = Array.isArray(bookmark.tags)
        ? bookmark.tags.map((tag) => tag.name?.toLowerCase()).filter(Boolean)
        : []

      const matchesTag = selectedTags.length === 0 ||
        selectedTags.every((selectedTag) => bookmarkTagNames.includes(selectedTag.toLowerCase()))

      const matchesFavorite = !showFavoritesOnly || Boolean(bookmark.is_favorite)

      return matchesSearch && matchesTag && matchesFavorite
    })
  }, [sortedBookmarks, searchTerm, selectedTags, showFavoritesOnly, focusBookmarkId, domainFilter])

  useEffect(() => {
    setCurrentPage(1)
  }, [searchTerm, selectedTags, sortBy, sortDirection, itemsPerPage, domainFilter])

  const totalPages = Math.max(1, Math.ceil(filteredBookmarks.length / itemsPerPage))

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages)
    }
  }, [currentPage, totalPages])

  const paginatedBookmarks = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage
    return filteredBookmarks.slice(start, start + itemsPerPage)
  }, [filteredBookmarks, currentPage, itemsPerPage])

  // Clear the underlying search/tag/favorites controls so they don't reappear
  // stale once a focused bookmark (e.g. from the Random button) is cleared.
  useEffect(() => {
    if (!focusBookmarkId) return
    setSearchTerm('')
    setSelectedTags([])
    setShowFavoritesOnly(false)
    setDomainFilter(null)
    setCurrentPage(1)
  }, [focusBookmarkId])

  // Clicking "Related" replaces whatever filter was active with a same-domain view.
  const handleShowRelated = (url) => {
    const domain = getRegistrableDomain(url)
    if (!domain) return
    setSearchTerm('')
    setSelectedTags([])
    setShowFavoritesOnly(false)
    setDomainFilter(domain)
  }

  const handleClearDomainFilter = () => setDomainFilter(null)

  // Scroll the focused bookmark into view once it's rendered as the sole card.
  useEffect(() => {
    if (!focusBookmarkId) return
    if (!paginatedBookmarks.some((bookmark) => bookmark.id === focusBookmarkId)) return
    const el = document.getElementById(`bookmark-${focusBookmarkId}`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [focusBookmarkId, paginatedBookmarks])

  const handleTagSelect = (tagName) => {
    const normalized = tagName?.trim().toLowerCase()
    if (!normalized) return

    setDomainFilter(null)
    if (focusBookmarkId) onClearFocus?.()
    setSelectedTags([normalized])
  }

  const handleTagAdd = (tagName) => {
    const normalized = tagName?.trim().toLowerCase()
    if (!normalized) return

    setDomainFilter(null)
    if (focusBookmarkId) onClearFocus?.()
    setSelectedTags((prev) => (prev.includes(normalized) ? prev : [...prev, normalized]))
  }

  const handleTagRemove = (tagName) => {
    const normalized = tagName?.trim().toLowerCase()
    if (!normalized) return
    setSelectedTags((prev) => prev.filter((tag) => tag !== normalized))
  }

  const hasActiveFilters = Boolean(
    searchTerm.trim() || selectedTags.length > 0 || showFavoritesOnly || domainFilter || focusBookmarkId
  )

  const activeFilterChipLabel = focusBookmarkId
    ? 'Random'
    : domainFilter
      ? `Related: ${domainFilter}`
      : null

  const handleClearAllFilters = () => {
    setSearchTerm('')
    setSelectedTags([])
    setShowFavoritesOnly(false)
    setDomainFilter(null)
    if (focusBookmarkId) onClearFocus?.()
  }

  return (
    <>
      <div className="main-content">
        <div className="toolbar">
          <div className="toolbar-row toolbar-row-actions">
            <div className="search-control">
              <Search size={16} className="search-icon" />
              {activeFilterChipLabel && (
                <span className="search-filter-chip">{activeFilterChipLabel}</span>
              )}
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => {
                  setDomainFilter(null)
                  if (focusBookmarkId) onClearFocus?.()
                  setSearchTerm(e.target.value)
                }}
                placeholder={activeFilterChipLabel ? '' : 'Search bookmarks'}
                aria-label="Search bookmarks"
              />
              {showFavoritesFilter && (
                <button
                  type="button"
                  className={`favorites-filter-btn ${showFavoritesOnly ? 'active' : ''}`}
                  onClick={() => {
                    setDomainFilter(null)
                    if (focusBookmarkId) onClearFocus?.()
                    setShowFavoritesOnly((prev) => !prev)
                  }}
                  aria-label={showFavoritesOnly ? 'Show all bookmarks' : 'Show favorite bookmarks only'}
                  title={showFavoritesOnly ? 'Showing favorites only' : 'Show favorite bookmarks only'}
                  aria-pressed={showFavoritesOnly}
                >
                  <Star size={16} fill={showFavoritesOnly ? 'currentColor' : 'none'} />
                </button>
              )}
              {hasActiveFilters && (
                <button
                  type="button"
                  className="clear-filters-btn"
                  onClick={handleClearAllFilters}
                  aria-label="Clear all filters"
                  title="Clear search, tags, favorites, and related filters"
                >
                  <X size={16} />
                </button>
              )}
            </div>
            {toolbarExtra}
          </div>
        </div>

        {children}

        <div className="bookmarks-section">
          {filteredBookmarks.length > 0 && (
            <div className="pagination-toolbar">
              <div className="pagination-toolbar-group">
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
                <div className="pagination-page-size">
                  <label htmlFor="itemsPerPage">Show</label>
                  <select
                    id="itemsPerPage"
                    value={itemsPerPage}
                    onChange={(e) => setItemsPerPage(Number(e.target.value))}
                  >
                    <option value={10}>10</option>
                    <option value={20}>20</option>
                    <option value={40}>40</option>
                    <option value={80}>80</option>
                  </select>
                </div>
              </div>
              <div className="pagination-controls">
                <button
                  type="button"
                  className="pagination-btn"
                  onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                >
                  Previous
                </button>
                <span className="pagination-status">Page {currentPage} of {totalPages}</span>
                <button
                  type="button"
                  className="pagination-btn"
                  onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages}
                >
                  Next
                </button>
              </div>
            </div>
          )}
          {loading ? (
            <div className="loading-message">Loading bookmarks...</div>
          ) : filteredBookmarks.length === 0 ? (
            <div className="empty-state">
              <p>
                {searchTerm.trim() || selectedTags.length > 0 || showFavoritesOnly || focusBookmarkId || domainFilter
                  ? 'No bookmarks match your search.'
                  : emptyStateMessage}
              </p>
            </div>
          ) : (
            <>
              <div className="bookmarks-grid">
                {paginatedBookmarks.map((bookmark) => (
                  <Fragment key={bookmark.id}>
                    {renderCard ? renderCard(bookmark, { onShowRelated: handleShowRelated }) : <DefaultCard bookmark={bookmark} />}
                  </Fragment>
                ))}
              </div>
              <div className="pagination-toolbar pagination-toolbar-bottom">
                <div className="pagination-controls">
                  <button
                    type="button"
                    className="pagination-btn"
                    onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                    disabled={currentPage === 1}
                  >
                    Previous
                  </button>
                  <span className="pagination-status">Page {currentPage} of {totalPages}</span>
                  <button
                    type="button"
                    className="pagination-btn"
                    onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                    disabled={currentPage === totalPages}
                  >
                    Next
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <aside className="sidebar">
        {domainFilter && (
          <div className="active-tag-filter sidebar-tag-filter">
            <div className="active-tag-filter-head">
              <span>Related: {domainFilter}</span>
              <button type="button" onClick={handleClearDomainFilter} aria-label="Clear related bookmarks filter">
                <X size={14} />
              </button>
            </div>
          </div>
        )}
        {selectedTags.length > 0 && (
          <div className="active-tag-filter sidebar-tag-filter">
            <div className="active-tag-filter-head">
              <span>Tag Query</span>
              <button type="button" onClick={() => setSelectedTags([])} aria-label="Clear all tag filters">
                <X size={14} />
              </button>
            </div>
            <div className="active-tag-filter-list">
              {selectedTags.map((tag) => (
                <span key={tag} className="active-tag-filter-item">
                  <span>{tag}</span>
                  <button type="button" onClick={() => handleTagRemove(tag)} aria-label={`Remove ${tag} from tag query`}>
                    <X size={14} />
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}
        <TagCloud
          tags={tags}
          selectedTags={selectedTags}
          onTagSelect={handleTagSelect}
          onTagAdd={handleTagAdd}
          onTagFavoriteToggle={onTagFavoriteToggle}
          refreshKey={tagsRefreshKey}
        />
      </aside>
    </>
  )
}

export default BookmarkBrowser
