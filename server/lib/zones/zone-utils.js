/**
 * server/lib/zone-utils.js
 *
 * Shared zone-level utilities used by html-patcher.js and html-recipe-builder.js.
 */

/**
 * Returns true if the zone is directly ignored, or if any ancestor zone is ignored.
 * Used to skip zones whose parent container has been marked to preserve original content.
 *
 * @param {object}   zone     - The zone to check
 * @param {object[]} allZones - Full zone list for ancestor lookup
 */
export function isIgnoredOrDescendantOfIgnored(zone, allZones) {
  if (zone.ignored) return true

  let current = zone
  while (current.nodeId) {
    const parent = allZones.find(z =>
      z.nodeId !== current.nodeId &&
      current.nodeId.startsWith(z.nodeId + '>')
    )
    if (!parent) break
    if (parent.ignored) return true
    current = parent
  }

  return false
}
