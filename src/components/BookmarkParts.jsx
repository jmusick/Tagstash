// Tag list shared by the owner's bookmark card (App.jsx) and the read-only card
// BookmarkBrowser renders on public profiles, so the two stay identical.

export function BookmarkTagList({ tags, selectedTags = [], onTagSelect }) {
  if (!Array.isArray(tags) || tags.length === 0) return null

  return (
    <div className="tags">
      {tags.map((tag) => {
        const name = tag.name
        const isActive = selectedTags.includes(name?.toLowerCase())
        const className = `tag-stock ${isActive ? 'tag-stock--active' : ''}`

        return onTagSelect ? (
          <button
            key={tag.id ?? name}
            type="button"
            className={className}
            onClick={() => onTagSelect(name)}
            title={`Show bookmarks tagged ${name}`}
            aria-pressed={isActive}
          >
            {name}
          </button>
        ) : (
          <span key={tag.id ?? name} className={className}>{name}</span>
        )
      })}
    </div>
  )
}
