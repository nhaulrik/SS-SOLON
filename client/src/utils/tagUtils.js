/**
 * Convert raw element text into a safe placeholder key.
 * e.g. "Total Revenue 2024" → "total_revenue_2024"
 */
export function keyGen(text) {
  return text.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '') || 'field'
}

/** Return the highest elementOrder value in a tag array, or -1 if empty. */
export function maxElementOrder(tags) {
  return tags.reduce((max, t) => Math.max(max, t.elementOrder ?? 0), -1)
}

/**
 * Merge an existing set of tags (from a saved patch) with elements from
 * freshly-uploaded slides. Elements that already have a tag are kept as-is;
 * new elements receive an auto-generated tag with autoGenerate: false.
 *
 * @param {Array} existingTags   - Tags from the saved patch
 * @param {Array} slides         - Slides returned by the server
 * @returns {Array}              - Merged tag array
 */
export function mergeTagsWithSlides(existingTags, slides) {
  const existingIds = new Set(existingTags.map(t => t.elementId))
  const newTags = []

  let globalElementOrder = maxElementOrder(existingTags) + 1
  slides.forEach(slide => {
    slide.elements.forEach((elem, _idx) => {
      if (elem.text && elem.text.trim() && !existingIds.has(elem.id)) {
        newTags.push({
          elementId: elem.id,
          key: keyGen(elem.text),
          hint: elem.text.trim(),
          slideIndex: slide.index,
          originalText: elem.text,
          shapeName:    elem.shapeName ?? null,
          maxChars:     elem.maxChars,
          autoGenerate: false,
          elementOrder: globalElementOrder++
        })
      }
    })
  })

  return [...existingTags, ...newTags]
}

/**
 * Trigger a programmatic file download without navigating the SPA away.
 */
export function triggerDownload(url) {
  const a = document.createElement('a')
  a.href = url
  a.download = ''   // force download, prevent browser navigation
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}
