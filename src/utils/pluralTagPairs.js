// Detects tags that differ only by a plural suffix ("band" / "bands", "domain" / "domains"),
// so the tags page can report them and offer a merge in either direction.

// Returns the singular form of a plural-looking tag name, or null if it doesn't look plural.
// Deliberately conservative: only the regular English endings, no irregular-noun table.
export function singularizeTagName(name) {
  const lower = name.toLowerCase()

  // companies -> company (but not "series", "movies" is fine: vowel+ies is rare enough)
  if (/[^aeiou]ies$/.test(lower)) return lower.slice(0, -3) + 'y'
  // boxes -> box, classes -> class, dishes -> dish, watches -> watch
  if (/(?:s|x|z|ch|sh)es$/.test(lower)) return lower.slice(0, -2)
  // bands -> band, domains -> domain (but not "css", "address")
  if (/[^s]s$/.test(lower)) return lower.slice(0, -1)

  return null
}

// Given the tag list from GET /bookmarks/tags/all, returns the singular/plural pairs found in it,
// most-used first. Each pair is { singular, plural } where both values are the original tag objects.
export function findPluralTagPairs(tags) {
  const byName = new Map()
  for (const tag of tags) {
    byName.set(tag.name.toLowerCase(), tag)
  }

  const pairs = []
  for (const tag of tags) {
    const singular = singularizeTagName(tag.name)
    if (!singular) continue

    const match = byName.get(singular)
    if (!match || match.id === tag.id) continue

    pairs.push({ singular: match, plural: tag })
  }

  return pairs.sort((a, b) => b.singular.count + b.plural.count - (a.singular.count + a.plural.count))
}
