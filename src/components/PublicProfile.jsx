import { useState, useEffect, useCallback } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { profileAPI } from '../api/api'
import AppHeader from './AppHeader'
import AppFooter from './AppFooter'
import BookmarkBrowser from './BookmarkBrowser'
import './PublicProfile.css'

function PublicProfile({ logoSrc, theme, onSelectTheme, linkTarget }) {
  const { username } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const [profile, setProfile] = useState(null)
  const [bookmarks, setBookmarks] = useState([])
  const [tags, setTags] = useState([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [error, setError] = useState('')
  const [initialSelectedTags] = useState(() => (
    [...new Set(searchParams.getAll('tag').map((tag) => tag.trim().toLowerCase()).filter(Boolean))]
  ))

  const fetchProfile = useCallback(async () => {
    try {
      setLoading(true)
      setError('')
      const response = await profileAPI.getPublicProfile(username)
      setProfile(response.data.profile)
      setBookmarks(response.data.bookmarks || [])
      setTags(response.data.tags || [])
      setNotFound(false)
    } catch (err) {
      if (err.response?.status === 404) {
        setNotFound(true)
      } else {
        setError('Failed to load this profile. Please try again.')
      }
    } finally {
      setLoading(false)
    }
  }, [username])

  useEffect(() => {
    if (username) {
      fetchProfile()
    }
  }, [username, fetchProfile])

  const handleSelectedTagsChange = (selectedTags) => {
    const next = new URLSearchParams()
    selectedTags.forEach((tag) => next.append('tag', tag))
    setSearchParams(next, { replace: true })
  }

  if (loading || notFound || error) {
    return (
      <div className="app">
        <AppHeader logoSrc={logoSrc} tagline="Public bookmarks" theme={theme} onSelectTheme={onSelectTheme} />
        <main className="app-main">
          <div className="main-content">
            {loading ? (
              <div className="loading-message">Loading profile...</div>
            ) : notFound ? (
              <div className="empty-state">
                <p>This profile doesn&apos;t exist or isn&apos;t public.</p>
              </div>
            ) : (
              <div className="empty-state">
                <p>{error}</p>
              </div>
            )}
          </div>
        </main>
        <AppFooter>
          <a className="footer-privacy-link" href="/">Create your own Tagstash</a>
        </AppFooter>
      </div>
    )
  }

  return (
    <div className="app">
      <AppHeader logoSrc={logoSrc} tagline="Public bookmarks" theme={theme} onSelectTheme={onSelectTheme} />
      <main className="app-main">
        <BookmarkBrowser
          bookmarks={bookmarks}
          loading={false}
          linkTarget={linkTarget}
          tags={tags}
          showFavoritesFilter={false}
          emptyStateMessage="This user hasn't shared any bookmarks yet."
          initialSelectedTags={initialSelectedTags}
          onSelectedTagsChange={handleSelectedTagsChange}
        >
          <div className="public-profile-header">
            <h2>@{profile?.username}&apos;s bookmarks</h2>
          </div>
        </BookmarkBrowser>
      </main>
      <AppFooter>
        <a className="footer-privacy-link" href="/">Create your own Tagstash</a>
      </AppFooter>
    </div>
  )
}

export default PublicProfile
