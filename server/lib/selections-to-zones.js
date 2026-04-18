/**
 * server/lib/selections-to-zones.js
 *
 * Derives the flat zones array (consumed by buildHtmlRecipe and html-patcher)
 * from the user's selections on the tree.
 *
 * A selection is:
 *   {
 *     nodeId:       string,   // tree node fingerprint
 *     slideIndex:   number,   // 1-based
 *     zoneType:     'block',  // all zones are now block zones
 *     key:          string,   // snake_case zone key
 *     hint:         string,   // description or prompt
 *     prompt:       string,   // custom AI prompt
 *     autoGenerate: boolean,
 *     type:         string,   // 'block'
 *   }
 *
 * Group selections (multiple nodeIds mapped to one key) are represented as
 * separate selection objects sharing the same key — each gets its own zone
 * entry so the patcher can target each node independently.
 *
 * Exports:
 *   selectionsToZones(selections) → Zone[]
 */

/**
 * Convert a selections array into the zones array format expected by
 * buildHtmlRecipe, validateHtmlJson, and applyHtmlContent.
 *
 * Rules:
 *   - Each selection becomes one zone
 *   - elementOrder is the selection's position in the array (stable)
 *   - All zones have autoGenerate:true and type:'block'
  *   - isRepeatable is set to true for zones whose slideIndex matches a
  *     repeatableSlides entry; unique is propagated from the selection
  *     (default true) for repeatable zones, undefined for non-repeatable zones
 *
 * @param {Object[]} selections
 * @param {Object[]} repeatableSlides - [{ slideIndex, key, prompt }]
 * @returns {Object[]} zones
 */
export function selectionsToZones(selections, repeatableSlides = []) {
  // Build a fast lookup: slideIndex → repeatableSlide entry
  const repBySlide = new Map()
  repeatableSlides.forEach(rs => repBySlide.set(rs.slideIndex, rs))

   return selections.map((sel, idx) => {
      const isRepeatable = repBySlide.has(sel.slideIndex)

      return {
        // Discriminant
        zoneType:     'block',

        // Identity
        key:          sel.key,
        nodeId:       sel.nodeId,
        slideIndex:   sel.slideIndex,

        // Type metadata
        type:         'block',
        hint:         sel.hint || '',
        autoGenerate: true,

        // Block-specific
        prompt:       sel.prompt || '',
        exampleHtml:  sel.exampleHtml || undefined,

        // Repeatable — derived from repeatableSlides argument
        isRepeatable,
        repeatableKey: null,

        // Uniqueness — only meaningful for zones on repeatable slides
        // defaults to true (unique per instance) when not explicitly set
        unique: isRepeatable ? (sel.unique !== false) : undefined,

        // Ignored — zones marked as ignored are excluded from recipe generation
        // and skipped during HTML patching
        ignored: sel.ignored || false,

        // Ordering
        elementOrder: idx,
        originalText: '',
      }
    })
}

/**
 * Resolve conflicts: if a parent zone supersedes child zones,
 * remove the children from the selections array.
 *
 * A child selection is superseded when its nodeId starts with a parent
 * zone's nodeId (i.e. it is a descendant in the CSS-path tree).
 *
 * Returns a new array with conflicting children removed.
 *
 * @param {Object[]} selections
 * @returns {{ resolved: Object[], removed: Object[] }}
 */
export function resolveConflicts(selections) {
  const parentIds = selections.map(s => s.nodeId)

  const removed  = []
  const resolved = selections.filter(sel => {
    // Remove zones whose nodeId is a descendant of any parent zone
    // BUT: preserve ignored child zones even if parent is non-ignored
    // (ignored zones should be kept as-is in the recipe)
    const superseded = parentIds.some(parentId => {
      if (sel.nodeId === parentId) return false
      if (!sel.nodeId.startsWith(parentId + '>')) return false

      // Never supersede a zone the user explicitly assigned (only auto-discovered zones
      // are removed when a parent zone also exists)
      if (!sel.autoDiscovered) return false

      // If this child is ignored, don't supersede it
      if (sel.ignored) return false

      return true
    })
    if (superseded) removed.push(sel)
    return !superseded
  })

  return { resolved, removed }
}
