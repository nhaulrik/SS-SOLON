/**
 * server/lib/html-preview.js
 *
 * HTML preview generation functions for the visual flow editor.
 * Handles building preview HTML with slide shells and injecting node IDs.
 */

import { parse } from 'node-html-parser'
import { buildSectionTree, flattenTree } from './build-tree.js'

/**
 * Build a preview HTML document for the full patched output (all sections).
 *
 * Wraps all <section> elements in a #solon-slide-shell div so the client can
 * scale the 1280×720 slide to fit its container using transform: scale().
 * The shell CSS is injected so the client only needs to set the scale value.
 */
export function buildOutputPreviewHtml(html) {
  try {
    const root     = parse(html);
    // Strip scripts so presentation frameworks don't clear the preview DOM
    root.querySelectorAll('script').forEach(s => s.remove());
    const head     = root.querySelector('head');
    const sections = root.querySelectorAll('section');
    if (sections.length === 0) return html; // fallback: return as-is

    const headContent  = head ? head.innerHTML : '';
    const slideCount   = sections.length;
    const shellHeight  = 720 * slideCount;
    const slidesHtml   = sections.map(s => s.outerHTML).join('\n');

    const multiSlideStyle = slideCount > 1 ? `
  #solon-slide-shell {
    overflow-y: scroll;
    scroll-snap-type: y mandatory;
    scroll-behavior: smooth;
  }
  #solon-slide-shell section {
    scroll-snap-align: start;
    flex-shrink: 0;
  }` : '';

    return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8"/>
${headContent}
<style>
  /* Solon preview shell — controls the viewport, not the slide content */
  html, body {
    margin: 0; padding: 0;
    width: 100%; height: 100%;
    overflow: hidden;
    background: #000;
    display: block;
  }
  #solon-slide-shell {
    position: absolute;
    top: 0; left: 0;
    width: 1280px; height: ${shellHeight}px;
    overflow: hidden;
    transform-origin: top left;
    display: flex;
    flex-direction: column;
  }${multiSlideStyle}
</style>
</head>
<body>
  <div id="solon-slide-shell">${slidesHtml}</div>
</body>
</html>`;
  } catch {
    return html;
  }
}

/**
 * Build a preview HTML document for a single slide (first section).
 *
 * Injects data-solon-id attributes onto every element matching a tree node
 * fingerprint so the client can highlight nodes by id via CSS.
 */
export function buildPreviewHtml(html, tree) {
  try {
    const root     = parse(html);
    const head     = root.querySelector('head');
    const sections = root.querySelectorAll('section');
    if (sections.length === 0) return '';

    const headContent = head ? head.innerHTML : '';

    if (tree?.length) {
      const flatNodes = flattenTree(tree);
      for (const node of flatNodes) {
        injectSolonId(sections[0], node.id);
      }
    }

    const slideHtml = sections[0].outerHTML;

    return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8"/>
${headContent}
<style>
  html, body { margin: 0; padding: 0; background: #000; display: block; }
  #solon-slide-shell {
    position: absolute;
    top: 0; left: 0;
    width: 1280px;
    transform-origin: top left;
  }
</style>
</head>
<body>
  <div id="solon-slide-shell">${slideHtml}</div>
</body>
</html>`;
  } catch {
    return '';
  }
}

/**
 * Walk a node-html-parser DOM subtree and inject data-solon-id="<nodeId>"
 * onto the element that matches the given CSS-path id.
 */
const SKIP_TAGS_SET = new Set(['script','style','svg','defs','symbol','clippath',
                                'lineargradient','radialgradient','filter','mask'])

export function injectSolonId(sectionNode, nodeId) {
  const segments = nodeId.split('>')
  let current    = sectionNode
  const siblingCounters = {}

  for (const segment of segments) {
    const idxMatch = segment.match(/\[(\d+)\]$/)
    const base     = idxMatch ? segment.slice(0, -idxMatch[0].length) : segment
    const parts    = base.split('.')
    const tag      = parts[0]
    const classes  = parts.slice(1).sort()
    const wantedIdx = idxMatch ? parseInt(idxMatch[1]) : 0

    const sigKey = `${tag}.${classes.join('.')}`
    if (!siblingCounters[sigKey]) siblingCounters[sigKey] = {}

    let found    = null
    let matchIdx = 0
    for (const child of (current.childNodes ?? [])) {
      if (child.nodeType !== 1) continue
      const childTag = child.tagName?.toLowerCase() ?? ''
      if (SKIP_TAGS_SET.has(childTag)) continue
      const childClasses = (child.getAttribute?.('class') ?? '').split(/\s+/).filter(Boolean).sort()
      if (childTag === tag && JSON.stringify(childClasses) === JSON.stringify(classes)) {
        if (matchIdx === wantedIdx) { found = child; break }
        matchIdx++
      }
    }

    if (!found) return
    current = found
  }

  if (current && current !== sectionNode) {
    current.setAttribute('data-solon-id', nodeId)
  }
}

/**
 * Parse the HTML template and return the structural tree + pre-existing
 * selections (from data-zone / data-block attrs) for each slide.
 */
export function parseTemplate(html) {
  const root       = parse(html, { comment: false });
  const sections   = root.querySelectorAll('section');
  const violations = [];

  if (sections.length === 0) {
    violations.push({
      rule:    'NO_SECTIONS',
      message: 'No slides found. Wrap each slide in a <section> element.',
    });
    return { slideCount: 0, trees: [], selections: [], violations };
  }

  const trees      = [];
  const selections = [];

  sections.forEach((section, sectionIdx) => {
    const slideIndex = sectionIdx + 1;
    const { tree, selections: slideSelections } = buildSectionTree(section, slideIndex);
    trees.push(tree);

    const keysThisSlide = new Set();
    for (const sel of slideSelections) {
      if (keysThisSlide.has(sel.key)) {
        violations.push({
          rule:    'DUPLICATE_ZONE_KEY',
          message: `Duplicate zone key "${sel.key}" found in slide ${slideIndex}. Zone keys must be unique within a slide.`,
        });
      } else {
        keysThisSlide.add(sel.key);
        selections.push(sel);
      }
    }
  });

  if (selections.length === 0) {
    violations.push({
      rule:    'NO_ZONES',
      message: 'No content zones found. Use the tree to assign zones, or add data-zone / data-block attributes to your HTML.',
    });
  }

  return { slideCount: sections.length, trees, selections, violations };
}
