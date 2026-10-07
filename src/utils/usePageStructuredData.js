import { useEffect } from 'react'
import { serializeStructuredData } from '../content/marketingSchema'

// Replace server-injected page schema on navigation; site-wide WebSite schema
// stays in place. Home and Features use the same builders as their initial HTML.
export function usePageStructuredData(createData) {
  useEffect(() => {
    document.querySelectorAll('script[data-page-schema]').forEach(script => script.remove())
    const script = document.createElement('script')
    script.type = 'application/ld+json'
    script.dataset.pageSchema = 'true'
    script.textContent = serializeStructuredData(createData(window.location.origin))
    document.head.appendChild(script)
    return () => script.remove()
  }, [createData])
}
