/**
 * server/lib/build-tree.js
 *
 * Walks a parsed HTML section and produces a structural node tree.
 * Each node carries a stable fingerprint (id), display metadata, and
 * heuristic flags that drive the tree UI.
 *
 * Also extracts any pre-existing data-zone / data-block assignments
 * from the HTML as an initial `selections` array (backward compatibility).
 *
 * Exports:
 *   buildSectionTree(sectionNode, slideIndex) → { tree, selections }
 *   flattenTree(tree) → Node[]
 *   findNodeById(tree, id) → Node | null
 *   descendantIds(node) → string[]
 *   extractSlideNamesFromHtml(html) → { index, name }[]
 */

import { parse } from 'node-html-parser'

// ── Constants ─────────────────────────────────────────────────────────────────

// Tags that are always treated as interesting containers regardless of children
const ALWAYS_INTERESTING_TAGS = new Set(['table', 'tbody', 'thead', 'ul', 'ol', 'dl', 'form', 'nav'])

// Tags that are purely structural chrome — shown collapsed and non-selectable
const CHROME_CLASSES = new Set([
  'top-bar', 'footer', 'header-divider', 'logo',
])

// Tags whose content is never user-editable (SVG internals, script, style)
const SKIP_TAGS = new Set(['script', 'style', 'svg', 'defs', 'symbol', 'clippath',
                           'lineargradient', 'radialgradient', 'filter', 'mask'])

// ── Node ID generation ────────────────────────────────────────────────────────

/**
 * Build a stable CSS-path fingerprint for a node within its section.
 * Format: "tag.class1.class2[N]" where N is the 0-based index among
 * siblings with the same tag+class signature (omitted when N=0).
 *
 * @param {string} parentId  - fingerprint of the parent node ('' for root)
 * @param {string} tag       - lowercase tag name
 * @param {string[]} classes - sorted class list
 * @param {number} siblingIdx - 0-based index among same-signature siblings
 */
function makeNodeId(parentId, tag, classes, siblingIdx) {
  const classPart = classes.length ? '.' + classes.join('.') : ''
  const idxPart   = siblingIdx > 0 ? `[${siblingIdx}]` : ''
  const segment   = `${tag}${classPart}${idxPart}`
  return parentId ? `${parentId}>${segment}` : segment
}

// ── Interesting heuristic ─────────────────────────────────────────────────────

/**
 * A node is "interesting" if it is a natural container for AI-generated content:
 *   - Always-interesting tags (table, ul, ol, …)
 *   - Any element with 2+ element children that each have non-trivial text
 *   - Any element that has a data-zone or data-block attribute already
 */
function isInteresting(node) {
  const tag = node.tagName?.toLowerCase() ?? ''
  if (ALWAYS_INTERESTING_TAGS.has(tag)) return true
  if (node.getAttribute?.('data-zone') || node.getAttribute?.('data-block')) return true

  // Count element children that have meaningful text
  const elementChildren = (node.childNodes ?? []).filter(
    c => c.nodeType === 1 && !SKIP_TAGS.has(c.tagName?.toLowerCase())
  )
  if (elementChildren.length < 2) return false

  const withText = elementChildren.filter(c => (c.text ?? c.textContent ?? '').trim().length > 3)
  return withText.length >= 2
}

// ── Chrome detection ──────────────────────────────────────────────────────────

function isChrome(node) {
  const classes = (node.getAttribute?.('class') ?? '').split(/\s+/).filter(Boolean)
  return classes.some(c => CHROME_CLASSES.has(c))
}

// ── Text preview ──────────────────────────────────────────────────────────────

/**
 * Extract a short text preview from a node's direct text nodes only
 * (not descendants). Useful for distinguishing sibling nodes with the
 * same tag+class.
 */
function directTextPreview(node, maxLen = 60) {
  const parts = []
  for (const child of (node.childNodes ?? [])) {
    if (child.nodeType === 3) { // TEXT_NODE
      const t = (child.rawText ?? child.text ?? '').trim()
      if (t) parts.push(t)
    }
  }
  const joined = parts.join(' ').replace(/\s+/g, ' ').trim()
  return joined.length > maxLen ? joined.slice(0, maxLen) + '…' : joined
}

/**
 * Full text preview (all descendants), for leaf nodes.
 */
function fullTextPreview(node, maxLen = 80) {
  const t = (node.text ?? node.textContent ?? '').replace(/\s+/g, ' ').trim()
  return t.length > maxLen ? t.slice(0, maxLen) + '…' : t
}

// ── Walk ──────────────────────────────────────────────────────────────────────

/**
 * Recursively walk a DOM node and build the tree structure.
 *
 * @param {Node}   node       - node-html-parser element
 * @param {string} parentId   - fingerprint of the parent
 * @param {number} depth      - current depth (0 = section children)
 * @param {Object} siblingMap - mutable map of "tag.classes" → count (for dedup)
 * @param {number} slideIndex - 1-based slide number
 * @param {Array}  selections - accumulator for pre-existing zone assignments
 * @returns {Object|null}     - tree node or null if skipped
 */
function walkNode(node, parentId, depth, siblingMap, slideIndex, selections) {
  if (node.nodeType !== 1) return null // skip text/comment nodes

  const tag = node.tagName?.toLowerCase() ?? ''
  if (!tag || SKIP_TAGS.has(tag)) return null

  const classes    = (node.getAttribute?.('class') ?? '').split(/\s+/).filter(Boolean).sort()
  const sigKey     = `${tag}.${classes.join('.')}`
  const siblingIdx = siblingMap[sigKey] ?? 0
  siblingMap[sigKey] = siblingIdx + 1

  const id = makeNodeId(parentId, tag, classes, siblingIdx)

  // Detect pre-existing zone assignments
  // Support both data-zone (legacy) and data-block (current) — treat both as block zones
  const existingZone  = node.getAttribute?.('data-zone')?.trim()
  const existingBlock = node.getAttribute?.('data-block')?.trim()
  const existingHint  = node.getAttribute?.('data-hint')?.trim() ?? ''
  const existingPrompt = node.getAttribute?.('data-prompt')?.trim() ?? ''
  const existingAuto  = node.getAttribute?.('data-auto')

  const zoneKey = existingBlock || existingZone
  if (zoneKey) {
    // Fall back to element text content if no explicit prompt provided
    const textContent = node.textContent?.trim() || ''
    const prompt = existingPrompt || textContent
    
    selections.push({
      nodeId:       id,
      slideIndex,
      zoneType:     'block',
      key:          zoneKey,
      hint:         existingHint || existingPrompt || `Generate content for ${tag}`,
      prompt:       prompt,
      autoGenerate: existingAuto === 'false' ? false : true,
      type:         'block',
      exampleHtml:  node.innerHTML?.trim() || undefined,
    })
  }

  // Recurse into element children
  const childSiblingMap = {}
  const children = []
  for (const child of (node.childNodes ?? [])) {
    const childNode = walkNode(child, id, depth + 1, childSiblingMap, slideIndex, selections)
    if (childNode) children.push(childNode)
  }

  const elementChildren = (node.childNodes ?? []).filter(
    c => c.nodeType === 1 && !SKIP_TAGS.has(c.tagName?.toLowerCase())
  )
  const isLeaf        = elementChildren.length === 0
  const interesting   = isInteresting(node)
  const chrome        = isChrome(node)
  const textPreview   = isLeaf ? fullTextPreview(node) : directTextPreview(node)

  // Human-readable label: "div.value-col" or "ul.value-bullets"
  const classSuffix = classes.length ? '.' + classes.join('.') : ''
  const label       = `${tag}${classSuffix}`

  return {
    id,
    tag,
    classes,
    label,
    textPreview,
    innerHTML: node.innerHTML?.trim() ?? '',
    children,
    isLeaf,
    interesting,
    chrome,
    depth,
    slideIndex,
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Build the tree and extract pre-existing selections from a single <section> node.
 *
 * @param {Node}   sectionNode - node-html-parser <section> element
 * @param {number} slideIndex  - 1-based
 * @returns {{ tree: Object[], selections: Object[] }}
 *   tree       — array of top-level child nodes (section itself is implicit root)
 *   selections — pre-existing zone assignments from data-zone / data-block attrs
 */
export function buildSectionTree(sectionNode, slideIndex) {
  const selections   = []
  const siblingMap   = {}
  const tree         = []

  for (const child of (sectionNode.childNodes ?? [])) {
    const node = walkNode(child, '', 0, siblingMap, slideIndex, selections)
    if (node) tree.push(node)
  }

  return { tree, selections }
}

/**
 * Flatten a tree into a depth-first ordered array of all nodes.
 * Useful for lookups and iteration.
 *
 * @param {Object[]} tree
 * @returns {Object[]}
 */
export function flattenTree(tree) {
  const result = []
  function visit(nodes) {
    for (const node of nodes) {
      result.push(node)
      if (node.children?.length) visit(node.children)
    }
  }
  visit(tree)
  return result
}

/**
 * Find a node by its id in a tree.
 */
export function findNodeById(tree, id) {
  for (const node of flattenTree(tree)) {
    if (node.id === id) return node
  }
  return null
}

/**
 * Collect all descendant node ids of a given node (inclusive).
 */
export function descendantIds(node) {
  const ids = [node.id]
  function collect(children) {
    for (const c of (children ?? [])) {
      ids.push(c.id)
      collect(c.children)
    }
  }
  collect(node.children)
  return ids
}

/**
 * Generate generic slide names for sections in HTML.
 * Returns an array of { index, name }.
 */
export function extractSlideNamesFromHtml(html) {
  try {
    const root = parse(html);
    const sections = root.querySelectorAll('section');

    return sections.map((_, idx) => ({ index: idx + 1, name: `Slide ${idx + 1}` }));
  } catch {
    return [];
  }
}
