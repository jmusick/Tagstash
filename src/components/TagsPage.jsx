import { useState, useEffect, useCallback } from 'react'
import { GitMerge, X, AlertTriangle } from 'lucide-react'
import { bookmarksAPI } from '../api/api'
import TagCloud from './TagCloud'

function TagsPage() {
  const [tags, setTags] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [sourceTagId, setSourceTagId] = useState(null)
  const [targetTagId, setTargetTagId] = useState(null)
  const [merging, setMerging] = useState(false)

  const fetchTags = useCallback(async () => {
    try {
      setLoading(true)
      const response = await bookmarksAPI.getAllTags()
      setTags(response.data.tags)
    } catch {
      setError('Failed to load tags')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchTags()
  }, [fetchTags])

  const sourceTag = tags.find((tag) => tag.id === sourceTagId) || null
  const targetTag = tags.find((tag) => tag.id === targetTagId) || null

  const clearSelection = () => {
    setSourceTagId(null)
    setTargetTagId(null)
  }

  const handleTagSelect = (tagName) => {
    const tag = tags.find((t) => t.name === tagName)
    if (!tag) return

    setSuccess('')

    if (sourceTagId === tag.id) {
      setSourceTagId(null)
      return
    }
    if (targetTagId === tag.id) {
      setTargetTagId(null)
      return
    }
    if (!sourceTagId) {
      setSourceTagId(tag.id)
      return
    }
    if (!targetTagId) {
      setTargetTagId(tag.id)
      return
    }
    // Both slots already filled — start a new selection with this tag as the source.
    setSourceTagId(tag.id)
    setTargetTagId(null)
  }

  const handleMerge = async () => {
    if (!sourceTag || !targetTag) return

    const confirmed = window.confirm(
      `Merge "${sourceTag.name}" into "${targetTag.name}"?\n\n` +
        `All ${sourceTag.count} bookmark${sourceTag.count === 1 ? '' : 's'} tagged "${sourceTag.name}" will be re-tagged as "${targetTag.name}", and the "${sourceTag.name}" tag will be deleted.\n\n` +
        `This cannot be undone.`
    )
    if (!confirmed) return

    try {
      setMerging(true)
      setError('')
      await bookmarksAPI.mergeTags(sourceTag.id, targetTag.id)
      setSuccess(`Merged "${sourceTag.name}" into "${targetTag.name}".`)
      clearSelection()
      await fetchTags()
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to merge tags')
    } finally {
      setMerging(false)
    }
  }

  const selectedTagNames = [sourceTag?.name, targetTag?.name].filter(Boolean)

  return (
    <div className="tags-page">
      <section className="tags-page-section">
        <h2>Merge Tags</h2>
        <p className="tags-page-description">
          Combine two tags into one. Click a tag below to select it as the tag to remove, then click a
          second tag to select it as the tag to keep. Every bookmark using the first tag will be
          re-tagged with the second, and the first tag will be deleted.
        </p>

        <div className="tag-merge-picker">
          <div className="tag-merge-slot">
            <span className="tag-merge-slot-label">1. Merge this tag&hellip;</span>
            {sourceTag ? (
              <span className="tag-merge-chip tag-merge-chip-source">
                {sourceTag.name}
                <button type="button" onClick={() => setSourceTagId(null)} aria-label="Clear source tag selection">
                  <X size={13} />
                </button>
              </span>
            ) : (
              <span className="tag-merge-slot-empty">Select a tag below</span>
            )}
          </div>

          <GitMerge size={20} className="tag-merge-arrow" aria-hidden="true" />

          <div className="tag-merge-slot">
            <span className="tag-merge-slot-label">2. &hellip;into this tag</span>
            {targetTag ? (
              <span className="tag-merge-chip tag-merge-chip-target">
                {targetTag.name}
                <button type="button" onClick={() => setTargetTagId(null)} aria-label="Clear target tag selection">
                  <X size={13} />
                </button>
              </span>
            ) : (
              <span className="tag-merge-slot-empty">
                {sourceTag ? 'Select a different tag below' : 'Select a tag below first'}
              </span>
            )}
          </div>
        </div>

        {sourceTag && targetTag && (
          <div className="tag-merge-preview">
            <AlertTriangle size={16} aria-hidden="true" />
            <span>
              {sourceTag.count} bookmark{sourceTag.count === 1 ? '' : 's'} will move from{' '}
              <strong>{sourceTag.name}</strong> to <strong>{targetTag.name}</strong>, and{' '}
              <strong>{sourceTag.name}</strong> will be deleted. This cannot be undone.
            </span>
          </div>
        )}

        <div className="tag-merge-actions">
          <button
            type="button"
            className="btn-primary"
            onClick={handleMerge}
            disabled={!sourceTag || !targetTag || merging}
          >
            {merging ? 'Merging...' : 'Merge Tags'}
          </button>
          {(sourceTag || targetTag) && (
            <button type="button" className="btn-secondary" onClick={clearSelection} disabled={merging}>
              Clear Selection
            </button>
          )}
        </div>

        {error && (
          <div className="error-message">
            {error}
            <button onClick={() => setError('')} className="error-close" aria-label="Dismiss error">
              <X size={16} />
            </button>
          </div>
        )}
        {success && <div className="tags-page-success">{success}</div>}

        {loading ? (
          <div className="loading-message">Loading tags...</div>
        ) : (
          <TagCloud
            tags={tags}
            selectedTags={selectedTagNames}
            onTagSelect={handleTagSelect}
            showActions={false}
          />
        )}
      </section>
    </div>
  )
}

export default TagsPage
