import { useEffect } from 'react'

export const DEFAULT_TITLE = 'Tagstash - Tag-Based Bookmarking'
export const DEFAULT_DESCRIPTION = 'Tag-first bookmarking for people who outgrow folders fast. Save, organize, and share your bookmarks with Tagstash.'

function upsertMeta(attr, key, content) {
  let el = document.head.querySelector(`meta[${attr}="${key}"]`)
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attr, key)
    document.head.appendChild(el)
  }
  el.setAttribute('content', content)
}

function upsertLink(rel, href) {
  let el = document.head.querySelector(`link[rel="${rel}"]`)
  if (!el) {
    el = document.createElement('link')
    el.setAttribute('rel', rel)
    document.head.appendChild(el)
  }
  el.setAttribute('href', href)
}

function removeMeta(attr, key) {
  document.head.querySelector(`meta[${attr}="${key}"]`)?.remove()
}

// Updates document.title, description/OG/Twitter meta, and canonical link for
// client-side route changes. Complements the server-rendered meta that
// functions/u/[username].js injects for /u/:username on first load/crawlers —
// this hook keeps things correct on subsequent client-side (react-router) navigation.
export function useDocumentMeta({ title, description, path, noindex = false, enabled = true } = {}) {
  useEffect(() => {
    if (!enabled) return

    const resolvedTitle = title || DEFAULT_TITLE
    const resolvedDescription = description || DEFAULT_DESCRIPTION
    const canonicalHref = `${window.location.origin}${path ?? window.location.pathname}`

    document.title = resolvedTitle
    upsertMeta('name', 'description', resolvedDescription)
    upsertMeta('property', 'og:title', resolvedTitle)
    upsertMeta('property', 'og:description', resolvedDescription)
    upsertMeta('property', 'og:url', canonicalHref)
    upsertMeta('name', 'twitter:title', resolvedTitle)
    upsertMeta('name', 'twitter:description', resolvedDescription)
    upsertLink('canonical', canonicalHref)

    if (noindex) {
      upsertMeta('name', 'robots', 'noindex')
    } else {
      removeMeta('name', 'robots')
    }
  }, [title, description, path, noindex, enabled])
}
