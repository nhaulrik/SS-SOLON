/**
 * server/routes/html-flow.js
 *
 * Visual Flow (HTML-based) API endpoints.
 *
 * Architecture change: zones are now derived from user *selections* on the
 * structural tree rather than from data-zone / data-block attributes in the
 * HTML. The upload endpoint returns a tree + pre-populated selections
 * (backward-compat: existing data-zone/data-block attrs seed the selections).
 * The create-project endpoint accepts selections, derives zones via
 * selectionsToZones(), and writes zones to chain.json — all downstream
 * consumers (recipe builder, patcher) are unchanged.
 */

import express        from 'express';
import fs             from 'fs';
import path           from 'path';
import { randomUUID } from 'crypto';
import { parse }      from 'node-html-parser';
import { CHAINS_DIR, RESOLVED_CHAINS_DIR, isInsideDir } from '../config.js';
import { buildHtmlRecipe, validateHtmlJson } from '../lib/html-recipe-builder.js';
import { applyHtmlContent }                  from '../lib/html-patcher.js';
import { buildSectionTree, flattenTree }      from '../lib/build-tree.js';
import { selectionsToZones, resolveConflicts } from '../lib/selections-to-zones.js';

const router = express.Router();

// In-memory store for pending template sessions (pre-project-creation).
// Keyed by templateId (uuid). Entries expire after 2 hours.
const pendingTemplates = new Map();

// ── Security helpers ──────────────────────────────────────────────────────────

/** Validate a chainId and return the safe chain directory path, or null. */
function resolveChainDir(chainId) {
  if (!chainId || typeof chainId !== 'string') return null;
  // Only allow safe characters — UUIDs and our chain- prefix
  if (!/^[\w\-]{1,100}$/.test(chainId)) return null;
  const chainDir = path.join(CHAINS_DIR, chainId);
  if (!isInsideDir(chainDir, RESOLVED_CHAINS_DIR)) return null;
  return chainDir;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Build a preview HTML document for the full patched output (all sections).
 *
 * Wraps all <section> elements in a #solon-slide-shell div so the client can
 * scale the 1280×720 slide to fit its container using transform: scale().
 * The shell CSS is injected so the client only needs to set the scale value.
 */
function buildOutputPreviewHtml(html) {
  try {
    const root     = parse(html);
    const head     = root.querySelector('head');
    const sections = root.querySelectorAll('section');
    if (sections.length === 0) return html; // fallback: return as-is

    const headContent  = head ? head.innerHTML : '';
    const slideCount   = sections.length;
    const shellHeight  = 720 * slideCount;
    const slidesHtml   = sections.map(s => s.outerHTML).join('\n');

    // For multi-slide output the shell becomes a scroll-snap container:
    //   - height = 720px × N so all slides fit without clipping
    //   - overflow-y: scroll + scroll-snap-type: y mandatory
    //   - each <section> gets scroll-snap-align: start via the injected style
    // The client injects transform: scale(N) on top of this via ResizeObserver,
    // so the scaled shell still shows one slide at a time in the iframe viewport.
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
function buildPreviewHtml(html, tree) {
  try {
    const root     = parse(html);
    const head     = root.querySelector('head');
    const sections = root.querySelectorAll('section');
    if (sections.length === 0) return '';

    const headContent = head ? head.innerHTML : '';

    // Inject data-solon-id onto each element in the first section
    if (tree?.length) {
      const flatNodes = flattenTree(tree);
      for (const node of flatNodes) {
        // Re-query by the node's CSS path — walk by tag+class+position
        // The simplest reliable approach: annotate by matching the node's id
        // segments against the live DOM. We use a positional walk that mirrors
        // the buildTree walk so indices stay in sync.
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
    width: 1280px; height: 720px;
    overflow: hidden;
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
 *
 * The id format is "tag.class1.class2[N]>tag.class1[M]>..." where each
 * segment identifies a child by its tag+sorted-classes+sibling-index.
 */
const SKIP_TAGS_SET = new Set(['script','style','svg','defs','symbol','clippath',
                                'lineargradient','radialgradient','filter','mask'])

function injectSolonId(sectionNode, nodeId) {
  const segments = nodeId.split('>')
  let current    = sectionNode
  const siblingCounters = {}

  for (const segment of segments) {
    // Parse segment: "tag.class1.class2[N]"
    const idxMatch = segment.match(/\[(\d+)\]$/)
    const base     = idxMatch ? segment.slice(0, -idxMatch[0].length) : segment
    const parts    = base.split('.')
    const tag      = parts[0]
    const classes  = parts.slice(1).sort()
    const wantedIdx = idxMatch ? parseInt(idxMatch[1]) : 0

    const sigKey = `${tag}.${classes.join('.')}`
    if (!siblingCounters[sigKey]) siblingCounters[sigKey] = {}

    // Find the Nth child matching tag+classes
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

    if (!found) return // path not found in live DOM — skip
    current = found
  }

  // Inject the attribute onto the matched element
  if (current && current !== sectionNode) {
    current.setAttribute('data-solon-id', nodeId)
  }
}

/**
 * Parse the HTML template and return the structural tree + pre-existing
 * selections (from data-zone / data-block attrs) for each slide.
 *
 * Returns:
 *   { slideCount, trees, selections, violations }
 *
 *   trees      — array of per-slide tree node arrays (index = slideIndex - 1)
 *   selections — flat array of pre-existing selection objects across all slides
 *   violations — structural problems (no sections, duplicate keys, etc.)
 */
function parseTemplate(html) {
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

    // Check for duplicate keys within this slide
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

// ── POST /api/html-flow/upload-template ──────────────────────────────────────

router.post('/html-flow/upload-template', (req, res) => {
  try {
    const { html, fileName } = req.body;

    if (!html || typeof html !== 'string') {
      return res.status(400).json({ ok: false, error: 'Missing html field in request body.' });
    }

    if (html.length > 5 * 1024 * 1024) {
      return res.status(400).json({
        ok: false,
        error: 'VALIDATION_FAILED',
        violations: [{ rule: 'FILE_TOO_LARGE', message: 'File is too large. Maximum size is 5MB.' }],
      });
    }

    const { slideCount, trees, selections, violations } = parseTemplate(html);

    if (violations.some(v => v.rule === 'NO_SECTIONS')) {
      return res.status(422).json({ ok: false, error: 'VALIDATION_FAILED', violations });
    }

    // Non-fatal violations (NO_ZONES, DUPLICATE_ZONE_KEY) are returned
    // alongside the tree so the client can show warnings without blocking.

    const templateId = randomUUID();
    pendingTemplates.set(templateId, {
      html,
      fileName:   fileName || 'template.html',
      slideCount,
      trees,
      selections,
    });
    setTimeout(() => pendingTemplates.delete(templateId), 2 * 60 * 60 * 1000);

    const previewHtml = buildPreviewHtml(html, trees[0]);

    return res.json({
      ok: true,
      templateId,
      slideCount,
      trees,
      selections,
      violations: violations.length ? violations : undefined,
      previewHtml,
    });
  } catch (err) {
    console.error('[html-flow] upload-template error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ── PATCH /api/html-flow/update-selections ────────────────────────────────────
// Replaces update-zones. Persists the user's current selections to the
// in-memory session so they survive a page refresh before project creation.

router.patch('/html-flow/update-selections', (req, res) => {
  try {
    const { templateId, selections } = req.body;

    if (!templateId || !pendingTemplates.has(templateId)) {
      return res.status(404).json({ ok: false, error: 'Template session not found. Please re-upload.' });
    }

    if (!Array.isArray(selections)) {
      return res.status(400).json({ ok: false, error: 'selections must be an array.' });
    }

    const session      = pendingTemplates.get(templateId);
    session.selections = selections;
    pendingTemplates.set(templateId, session);

    return res.json({ ok: true, selections });
  } catch (err) {
    console.error('[html-flow] update-selections error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ── POST /api/html-flow/create-project ───────────────────────────────────────

router.post('/html-flow/create-project', (req, res) => {
  let templateId;
  try {
    templateId = req.body.templateId;
    const { selections, projectName } = req.body;

    if (!templateId || !pendingTemplates.has(templateId)) {
      return res.status(404).json({ ok: false, error: 'Template session not found. Please re-upload.' });
    }

    const session = pendingTemplates.get(templateId);

    // Validate and normalise repeatableSlides
    const rawRepSlides = Array.isArray(req.body.repeatableSlides) ? req.body.repeatableSlides : [];
    const repeatableSlides = rawRepSlides.filter(rs =>
      Number.isInteger(rs.slideIndex) &&
      typeof rs.key === 'string' && /^[a-z][a-z0-9_]*$/.test(rs.key) &&
      typeof rs.prompt === 'string'
    );

    // Resolve conflicts: block zones supersede descendant leaf zones
    const rawSelections         = Array.isArray(selections) ? selections : (session.selections ?? []);
    const { resolved, removed } = resolveConflicts(rawSelections);

    // Derive the zones array that all downstream consumers expect
    const zones = selectionsToZones(resolved, repeatableSlides);

    const chainId  = 'chain-' + randomUUID();
    const chainDir = path.join(CHAINS_DIR, chainId);
    fs.mkdirSync(chainDir, { recursive: true });

    const templatePath = path.join(chainDir, 'template.html');
    fs.writeFileSync(templatePath, session.html, 'utf8');

    const name = projectName?.trim() || session.fileName?.replace(/\.html?$/, '') || 'html-project';

    const chain = {
      id:              chainId,
      flow:            'html',
      projectName:     name,
      templateFile:    session.fileName,
      templatePath,
      slideCount:      session.slideCount,
      createdAt:       new Date().toISOString(),
      updatedAt:       new Date().toISOString(),
      selections:      resolved,
      zones,
      repeatableSlides,
      trees:           session.trees ?? [],
      rounds:          [],
    };

    fs.writeFileSync(path.join(chainDir, 'chain.json'), JSON.stringify(chain, null, 2), 'utf8');
    // Only delete the session after both writes succeed
    pendingTemplates.delete(templateId);

    return res.json({
      ok: true,
      chainId,
      projectName: name,
      selections:  resolved,
      removedSelections: removed,
      zones,
      // templatePath intentionally omitted — server-side path not for clients
    });
  } catch (err) {
    console.error('[html-flow] create-project error:', err);
    // Do not delete session on failure — allow client to retry
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ── POST /api/html-flow/generate-recipe ──────────────────────────────────────

router.post('/html-flow/generate-recipe', (req, res) => {
  try {
    const { chainId, globalPrompt } = req.body;

    if (!chainId) return res.status(400).json({ ok: false, error: 'chainId is required.' });

    const chainDir = resolveChainDir(chainId);
    if (!chainDir) return res.status(400).json({ ok: false, error: 'Invalid chainId.' });

    const chainPath = path.join(chainDir, 'chain.json');
    if (!fs.existsSync(chainPath)) {
      return res.status(404).json({ ok: false, error: 'Project not found.' });
    }

    const chain          = JSON.parse(fs.readFileSync(chainPath, 'utf8'));
    const zones          = chain.zones || [];
    const repSlides      = chain.repeatableSlides || [];
    const prompt         = globalPrompt ?? chain.globalPrompt ?? '';

    const recipe = buildHtmlRecipe(zones, prompt, repSlides);

    if (globalPrompt !== undefined) {
      chain.globalPrompt = globalPrompt;
      chain.updatedAt    = new Date().toISOString();
      fs.writeFileSync(chainPath, JSON.stringify(chain, null, 2), 'utf8');
    }

    return res.json({ ok: true, recipe });
  } catch (err) {
    console.error('[html-flow] generate-recipe error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ── POST /api/html-flow/validate-json ────────────────────────────────────────

router.post('/html-flow/validate-json', (req, res) => {
  try {
    const { chainId, jsonString } = req.body;

    if (!chainId || !jsonString) {
      return res.status(400).json({ ok: false, error: 'chainId and jsonString are required.' });
    }

    const chainDir = resolveChainDir(chainId);
    if (!chainDir) return res.status(400).json({ ok: false, error: 'Invalid chainId.' });

    const chainPath = path.join(chainDir, 'chain.json');
    if (!fs.existsSync(chainPath)) {
      return res.status(404).json({ ok: false, error: 'Project not found.' });
    }

    const chain          = JSON.parse(fs.readFileSync(chainPath, 'utf8'));
    const zones          = chain.zones || [];
    const repSlides      = chain.repeatableSlides || [];
    const result         = validateHtmlJson(jsonString, zones, repSlides);

    return res.json({ ok: true, ...result });
  } catch (err) {
    console.error('[html-flow] validate-json error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ── POST /api/html-flow/apply-content ────────────────────────────────────────

router.post('/html-flow/apply-content', (req, res) => {
  try {
    const { chainId, jsonString } = req.body;

    if (!chainId || !jsonString) {
      return res.status(400).json({ ok: false, error: 'chainId and jsonString are required.' });
    }
    if (typeof jsonString === 'string' && jsonString.length > 2 * 1024 * 1024) {
      return res.status(400).json({ ok: false, error: 'JSON response too large (max 2MB).' });
    }

    const chainDir = resolveChainDir(chainId);
    if (!chainDir) return res.status(400).json({ ok: false, error: 'Invalid chainId.' });

    const chainPath = path.join(chainDir, 'chain.json');
    if (!fs.existsSync(chainPath)) {
      return res.status(404).json({ ok: false, error: 'Project not found.' });
    }

    const chain          = JSON.parse(fs.readFileSync(chainPath, 'utf8'));
    const zones          = chain.zones || [];
    const repeatableSlides = chain.repeatableSlides || [];

    const validation = validateHtmlJson(jsonString, zones, repeatableSlides);
    if (!validation.valid) {
      return res.status(422).json({ ok: false, error: 'JSON validation failed', missingFields: validation.missingFields });
    }

    const data         = JSON.parse(jsonString);
    const templateHtml = fs.readFileSync(chain.templatePath, 'utf8');
    const patchedHtml  = applyHtmlContent(templateHtml, data, zones, repeatableSlides);

    const roundId    = randomUUID();
    const outputFile = `output-${roundId}.html`;
    const outputPath = path.join(chainDir, outputFile);
    fs.writeFileSync(outputPath, patchedHtml, 'utf8');

    // Wrap all sections in #solon-slide-shell so the client can scale them
    // to fit the preview container via transform: scale().
    const previewHtml = buildOutputPreviewHtml(patchedHtml);

    // Count sections in the patched output so the client can render nav controls
    const slideCount = (patchedHtml.match(/<section/g) || []).length;

    const round = {
      id:         roundId,
      appliedAt:  new Date().toISOString(),
      outputFile,
      // outputPath intentionally not stored — can be derived from chainDir + outputFile
      jsonInput:  jsonString.slice(0, 2000),
    };
    chain.rounds    = [...(chain.rounds || []), round];
    chain.updatedAt = new Date().toISOString();
    fs.writeFileSync(chainPath, JSON.stringify(chain, null, 2), 'utf8');

    // outputPath intentionally omitted from response — server-side path not for clients
    return res.json({ ok: true, roundId, outputFile, previewHtml, slideCount });
  } catch (err) {
    console.error('[html-flow] apply-content error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ── GET /api/html-flow/download/:chainId/:file ────────────────────────────────

router.get('/html-flow/download/:chainId/:file', (req, res) => {
  try {
    const { chainId, file } = req.params;

    if (!/^[\w\-]+\.html$/.test(file)) {
      return res.status(400).json({ ok: false, error: 'Invalid filename.' });
    }

    const chainDir = resolveChainDir(chainId);
    if (!chainDir) return res.status(400).json({ ok: false, error: 'Invalid chainId.' });

    const filePath = path.join(chainDir, file);
    if (!isInsideDir(filePath, chainDir)) {
      return res.status(400).json({ ok: false, error: 'Invalid path.' });
    }
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ ok: false, error: 'File not found.' });
    }

    res.setHeader('Content-Disposition', `attachment; filename="${file}"`);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.sendFile(path.resolve(filePath));
  } catch (err) {
    console.error('[html-flow] download error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
