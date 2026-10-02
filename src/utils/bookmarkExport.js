const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character]))

// Spreadsheet programs execute formula-like fields even when CSV quotes them.
const csvField = (value) => {
  let text = String(value ?? '')
  if (/^[\s]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text)) text = "'" + text
  return `"${text.replaceAll('"', '""')}"`
}

const tagNames = (bookmark) => (bookmark.tags || []).map((tag) => typeof tag === 'string' ? tag : tag.name)
const timestamp = (date) => {
  const milliseconds = Date.parse(date)
  return Number.isFinite(milliseconds) ? Math.floor(milliseconds / 1000) : 0
}

export function serializeBookmarks(bookmarks, format) {
  const records = bookmarks.map((bookmark) => ({
    title: bookmark.title,
    url: bookmark.url,
    description: bookmark.description || '',
    tags: tagNames(bookmark),
    created_at: bookmark.created_at,
    updated_at: bookmark.updated_at,
    is_favorite: Boolean(Number(bookmark.is_favorite)),
    is_private: Boolean(Number(bookmark.is_private)),
  }))
  if (format === 'json') return { content: JSON.stringify({ version: 1, bookmarks: records }, null, 2), type: 'application/json', extension: 'json' }
  if (format === 'csv') {
    // title/url/note/tags are compatible with the existing CSV importer.
    const fields = ['title', 'url', 'note', 'tags', 'created_at', 'updated_at', 'is_favorite', 'is_private']
    const rows = records.map((record) => [record.title, record.url, record.description, record.tags.join(', '), record.created_at, record.updated_at, record.is_favorite ? '1' : '0', record.is_private ? '1' : '0'].map(csvField).join(','))
    return { content: '\uFEFF' + [fields.join(','), ...rows].join('\r\n'), type: 'text/csv;charset=utf-8', extension: 'csv' }
  }
  if (format === 'html') {
    const links = records.map((record) => {
      // Only active web links belong in a file users will open in their browser.
      if (!/^https?:\/\//i.test(record.url)) return ''
      return `    <DT><A HREF="${escapeHtml(record.url)}" ADD_DATE="${timestamp(record.created_at)}" TAGS="${escapeHtml(record.tags.join(','))}">${escapeHtml(record.title)}</A>${record.description ? `\n    <DD>${escapeHtml(record.description)}` : ''}`
    }).filter(Boolean)
    return { content: ['<!DOCTYPE NETSCAPE-Bookmark-file-1>', '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">', '<TITLE>Tagstash Bookmarks</TITLE>', '<H1>Tagstash Bookmarks</H1>', '<DL><p>', ...links, '</DL><p>'].join('\n'), type: 'text/html;charset=utf-8', extension: 'html' }
  }
  throw new Error('Unsupported export format')
}
