// Display helpers shared by the owner and public-profile bookmark cards.

// "https://www.example.com/docs/" -> "example.com/docs"
export function displayUrl(url) {
  if (!url) return ''
  return url
    .replace(/^[a-z][a-z0-9+.-]*:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/\/$/, '')
}

export function formatSavedDate(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}
