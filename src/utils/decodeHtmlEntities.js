export const decodeHtmlEntities = (value) => {
  if (typeof value !== 'string' || !value) {
    return value || ''
  }

  if (typeof document === 'undefined') {
    return value
  }

  const textarea = document.createElement('textarea')
  textarea.innerHTML = value
  return textarea.value
}
