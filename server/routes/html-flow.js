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
import { buildHtmlRecipe, generateFullSlideRecipe, validateHtmlJson } from '../lib/html-recipe-builder.js';
import { applyHtmlContent }                  from '../lib/html-patcher.js';
import { buildSectionTree, flattenTree }      from '../lib/build-tree.js';
import { selectionsToZones, resolveConflicts } from '../lib/selections-to-zones.js';
import {
  recordRecipeGeneration,
  recordRound,
  recordFullSlideGeneration,
  getGenerationHistory,
  getGenerationCount,
  getGeneration,
  getSlideGenerations,
  deleteGeneration,
  getGenerationForReplay,
  recordReplay,
  getGenerationStats,
  exportGenerations,
} from '../lib/generation-manager.js';
import {
  createExport,
  listExports,
  getExport,
  getExportProjectIndex,
  resolveSlideFilePath,
  getExportCount,
  deleteExport,
  buildExportZip,
} from '../lib/export-manager.js';
import {
  createStructure,
  listStructures,
  getStructure,
  addNodeToStructure,
  moveNode,
  removeNodeFromStructure,
  deleteStructure,
  validateStructure,
  getOrphanedSlidesForStructure,
  getTreeVisualization,
} from '../lib/structure-manager.js';

const router = express.Router();

// In-memory store for pending template sessions (pre-project-creation).
// Keyed by templateId (uuid). Entries expire after 2 hours.
const pendingTemplates = new Map();

// ── Security helpers ──────────────────────────────────────────────────────────

/** Validate a chainId and return the safe chain directory path, or null. */
function resolveChainDir(chainId) {
  if (!chainId || typeof chainId !== 'string') return null;
  // Only allow safe characters — UUIDs and our chain- prefix
  if (!/^[\w-]{1,100}$/.test(chainId)) return null;
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

// ── Auto-discovery helper ────────────────────────────────────────────────────

/**
 * Auto-discover zones for slides marked with fullSlideGeneration.
 * Walks the tree and creates selections for all elements with data-zone or data-block,
 * plus any elements that would be good candidates for generation.
 *
 * @param {Array} trees - array of tree nodes (one per slide)
 * @param {Array} fullSlideGeneration - array of slide indices to auto-discover
 * @param {Array} existingSelections - existing selections to merge with
 * @returns {Array} merged selections
 */
function autoDiscoverZonesForFullSlide(trees, fullSlideGeneration, existingSelections) {
  if (!Array.isArray(fullSlideGeneration) || fullSlideGeneration.length === 0) {
    return existingSelections;
  }

  const result = [...existingSelections];
  const existingNodeIds = new Set(existingSelections.map(s => s.nodeId));

  function flattenTree(nodes) {
    const flat = [];
    function visit(arr) {
      for (const n of arr) {
        flat.push(n);
        if (n.children?.length) visit(n.children);
      }
    }
    visit(nodes);
    return flat;
  }

  for (const slideIdx of fullSlideGeneration) {
    // slideIdx is 1-based, but trees array is 0-based
    const treeIdx = slideIdx - 1;
    if (treeIdx < 0 || treeIdx >= trees.length) continue;

    const tree = trees[treeIdx];
    const allNodes = flattenTree(tree);

    // Auto-discover zones: any node that is "interesting" (container-like)
    // or has data-zone/data-block attributes
    for (const node of allNodes) {
      // Skip if already has a selection
      if (existingNodeIds.has(node.id)) continue;

      // Skip leaf nodes (text-only)
      if (node.leaf) continue;

      // Create a selection for interesting nodes
      if (node.interesting || node.children?.length > 0) {
        const key = `auto_${node.id.replace(/[^a-z0-9]/gi, '_').toLowerCase()}`;
        const sel = {
          nodeId: node.id,
          slideIndex: slideIdx,
          zoneType: 'block',
          key: key,
          prompt: '',
          autoGenerate: true,
          type: 'block',
          ...(node.innerHTML ? { exampleHtml: node.innerHTML } : {}),
        };
        result.push(sel);
        existingNodeIds.add(node.id);
      }
    }
  }

  return result;
}

// ── POST /api/html-flow/create-project ───────────────────────────────────────

router.post('/html-flow/create-project', (req, res) => {
  let templateId;
  try {
    templateId = req.body.templateId;
    const { selections, projectName, fullSlideGeneration } = req.body;

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

    // Validate and normalise fullSlideGeneration
    const fullSlideGen = Array.isArray(fullSlideGeneration) ? fullSlideGeneration : [];

    // Resolve conflicts
    const rawSelections         = Array.isArray(selections) ? selections : (session.selections ?? []);
    
    // Auto-discover zones for slides marked with fullSlideGeneration
    const selectionsWithAutoDiscovered = autoDiscoverZonesForFullSlide(session.trees ?? [], fullSlideGen, rawSelections);
    const { resolved, removed } = resolveConflicts(selectionsWithAutoDiscovered);

    // Derive the zones array that all downstream consumers expect
    const zones = selectionsToZones(resolved, repeatableSlides);

    const chainId  = 'chain-' + randomUUID();
    const chainDir = path.join(CHAINS_DIR, chainId);
    fs.mkdirSync(chainDir, { recursive: true });

    const templatePath = path.join(chainDir, 'template.html');
    fs.writeFileSync(templatePath, session.html, 'utf8');

    const name = projectName?.trim() || session.fileName?.replace(/\.html?$/, '') || 'html-project';

    const chain = {
      id:                  chainId,
      flow:                'html',
      projectName:         name,
      templateFile:        session.fileName,
      templatePath,
      slideCount:          session.slideCount,
      createdAt:           new Date().toISOString(),
      updatedAt:           new Date().toISOString(),
      selections:          resolved,
      zones,
      repeatableSlides,
      fullSlideGeneration: fullSlideGen,
      trees:               session.trees ?? [],
      rounds:              [],
      exports:             [],   // Phase 3: versioned export history
    };

    fs.writeFileSync(path.join(chainDir, 'chain.json'), JSON.stringify(chain, null, 2), 'utf8');
    // Keep the session alive so the user can navigate back and iterate on project creation
    // (The session will auto-expire after 2 hours anyway)

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

    // Update globalPrompt if provided, before recording generation
    if (globalPrompt !== undefined) {
      chain.globalPrompt = globalPrompt;
      chain.updatedAt    = new Date().toISOString();
      fs.writeFileSync(chainPath, JSON.stringify(chain, null, 2), 'utf8');
    }

    // Record the generation in history
    const metadata = {
      slideCount: chain.slideCount || 0,
      zoneCount: zones.length,
      repeatableSlideCount: repSlides.length,
    };
    const generationId = recordRecipeGeneration(chainId, recipe, prompt, metadata);

    return res.json({ ok: true, recipe, generationId });
  } catch (err) {
    console.error('[html-flow] generate-recipe error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ── POST /api/html-flow/generate-full-slide ──────────────────────────────────

router.post('/html-flow/generate-full-slide', (req, res) => {
  try {
    const { chainId, slideIndex, globalPrompt } = req.body;

    if (!chainId || slideIndex === undefined) {
      return res.status(400).json({ ok: false, error: 'chainId and slideIndex are required.' });
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
    const prompt         = globalPrompt ?? chain.globalPrompt ?? '';

    // Get zones for this slide
    const slideZones = zones.filter(z => z.slideIndex === slideIndex);
    if (slideZones.length === 0) {
      return res.status(400).json({ ok: false, error: `No zones found on slide ${slideIndex}.` });
    }

    const recipe = generateFullSlideRecipe(zones, slideIndex, prompt, repSlides);

    // Record the generation in history
    const generationId = recordFullSlideGeneration(chainId, slideIndex, recipe, 'generated');

    return res.json({
      ok: true,
      recipe,
      slideIndex,
      zoneCount: slideZones.length,
      zones: slideZones.map(z => ({ key: z.key, prompt: z.prompt })),
      generationId,
    });
  } catch (err) {
    console.error('[html-flow] generate-full-slide error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ── POST /api/html-flow/validate-json ────────────────────────────────────────

router.post('/html-flow/validate-json', (req, res) => {
  try {
    const { chainId, jsonString, fullSlide = false, slideIndex = null } = req.body;

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
    const options        = fullSlide ? { fullSlide: true, slideIndex } : {};
    const result         = validateHtmlJson(jsonString, zones, repSlides, options);

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
     const zones          = (chain.zones || []).filter(z => z.key);
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

     // Record the generation in history with full JSON and validation result
     const validationResult = {
       valid: validation.valid,
       instanceCount: validation.instanceCount || 0,
       foundFields: validation.foundFields || 0,
       missingFields: validation.missingFields || [],
     };
     const generationId = recordRound(chainId, roundId, jsonString, outputFile, validationResult);

     // outputPath intentionally omitted from response — server-side path not for clients
     return res.json({ ok: true, roundId, outputFile, previewHtml, slideCount, generationId });
  } catch (err) {
    console.error('[html-flow] apply-content error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ── GET /api/html-flow/download/:chainId/:file ────────────────────────────────

router.get('/html-flow/download/:chainId/:file', (req, res) => {
  try {
    const { chainId, file } = req.params;

    if (!/^[\w-]+\.html$/.test(file)) {
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

// ── POST /api/html-flow/save-project ──────────────────────────────────

router.post('/html-flow/save-project', (req, res) => {
  try {
    const { chainId, projectName, metadata } = req.body;

    // Validation
    if (!chainId || !projectName) {
      return res.status(400).json({ 
        ok: false, 
        error: 'chainId and projectName are required.' 
      });
    }

    // Validate metadata if provided
    if (metadata && !Array.isArray(metadata)) {
      return res.status(400).json({
        ok: false,
        error: 'Metadata must be an array.'
      });
    }

    if (typeof projectName !== 'string' || projectName.trim().length === 0) {
      return res.status(400).json({ 
        ok: false, 
        error: 'Project name must be a non-empty string.' 
      });
    }

    if (projectName.length > 100) {
      return res.status(400).json({ 
        ok: false, 
        error: 'Project name must be 100 characters or less.' 
      });
    }

    // Sanitize project name (remove special chars, allow spaces/hyphens)
    const sanitizedName = projectName
      .trim()
      .replace(/[<>:"/\\|?*]/g, '')
      .substring(0, 100);

    const chainDir = resolveChainDir(chainId);
    if (!chainDir) return res.status(400).json({ ok: false, error: 'Invalid chainId.' });

    const chainPath = path.join(chainDir, 'chain.json');
    if (!fs.existsSync(chainPath)) {
      return res.status(404).json({ ok: false, error: 'Project not found.' });
    }

    const chain = JSON.parse(fs.readFileSync(chainPath, 'utf8'));
    const outputFile = chain.rounds[chain.rounds.length - 1]?.outputFile;
    if (!outputFile) {
      return res.status(400).json({ ok: false, error: 'No output found.' });
    }

    const outputPath = path.join(chainDir, outputFile);
    if (!fs.existsSync(outputPath)) {
      return res.status(404).json({ ok: false, error: 'Output file not found.' });
    }

    // Read the patched HTML
    const patchedHtml = fs.readFileSync(outputPath, 'utf8');

    // Create project folder
    const projectFolder = path.join(chainDir, sanitizedName);
    fs.mkdirSync(projectFolder, { recursive: true });

    // Extract head content (styles, fonts, etc.) from the patched HTML
    const headMatch = patchedHtml.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
    const headContent = headMatch ? headMatch[1] : '';

    // Extract sections (slides) from HTML
    const sections = patchedHtml.match(/<section[^>]*>[\s\S]*?<\/section>/g) || [];
    
    if (sections.length === 0) {
      return res.status(400).json({ 
        ok: false, 
        error: 'No slides found in output.' 
      });
    }

     // Write individual slide files
     const slideFiles = [];
     for (let i = 0; i < sections.length; i++) {
       const section = sections[i];
       const slideNumber = i + 1;
       const fileName = `slide-${slideNumber}.html`;
       
       // Create complete HTML document for each slide
       // Include the head content from the original HTML (styles, fonts, etc.)
       const slideHtml = `<!DOCTYPE html>
<html>
<head>
   <meta charset="UTF-8"/>
   <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
   <title>Slide ${slideNumber}</title>
${headContent}
</head>
<body>
${section}
</body>
</html>`;

       const slidePath = path.join(projectFolder, fileName);
       fs.writeFileSync(slidePath, slideHtml, 'utf8');
       slideFiles.push(fileName);
     }

     // Create project.json with metadata
     const projectJson = {
       name: sanitizedName,
       createdAt: new Date().toISOString(),
       slideCount: sections.length,
       slides: metadata && metadata.length === sections.length
         ? metadata.map((meta, idx) => ({
             index: idx,
             file: `slide-${idx + 1}.html`,
             ...meta,
           }))
         : sections.map((_, idx) => ({
             index: idx,
             file: `slide-${idx + 1}.html`,
             slideId: `slide-${idx + 1}`,
             name: `Slide ${idx + 1}`,
             type: 'content',
           })),
     };

      const projectJsonPath = path.join(projectFolder, 'project.json');
      fs.writeFileSync(projectJsonPath, JSON.stringify(projectJson, null, 2), 'utf8');

      // Save generation history if available
      if (chain.generationHistory && chain.generationHistory.length > 0) {
        const generationsPath = path.join(projectFolder, 'generations.json');
        fs.writeFileSync(generationsPath, JSON.stringify(chain.generationHistory, null, 2), 'utf8');
      }

      // Project folder with individual slide files and metadata is now saved
      return res.json({
        ok: true,
        projectName: sanitizedName,
        slideCount: sections.length,
        projectPath: projectFolder,
      });
   } catch (err) {
     console.error('[html-flow] save-project error:', err);
     return res.status(500).json({ ok: false, error: err.message });
   }
 });

// ── Generation History API Endpoints ─────────────────────────────────────────

/**
 * GET /api/html-flow/:chainId/generations
 * List all generations for a chain with optional filtering.
 * Query params: type (recipe|round|fullSlide), slideIndex, limit, offset
 */
router.get('/html-flow/:chainId/generations', (req, res) => {
  try {
    const { chainId } = req.params;
    const { type, slideIndex, limit = 50, offset = 0 } = req.query;

    const chainDir = resolveChainDir(chainId);
    if (!chainDir) return res.status(400).json({ ok: false, error: 'Invalid chainId.' });

    const options = {
      type: type || null,
      slideIndex: slideIndex !== undefined ? parseInt(slideIndex, 10) : undefined,
      limit: Math.min(parseInt(limit, 10) || 50, 100), // max 100
      offset: parseInt(offset, 10) || 0,
    };

    const generations = getGenerationHistory(chainId, options);
    const total = getGenerationCount(chainId, type || null);

    return res.json({
      ok: true,
      generations,
      total,
      limit: options.limit,
      offset: options.offset,
    });
  } catch (err) {
    console.error('[html-flow] get-generations error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * GET /api/html-flow/:chainId/generations/:generationId
 * Get detailed information about a specific generation.
 */
router.get('/html-flow/:chainId/generations/:generationId', (req, res) => {
  try {
    const { chainId, generationId } = req.params;

    const chainDir = resolveChainDir(chainId);
    if (!chainDir) return res.status(400).json({ ok: false, error: 'Invalid chainId.' });

    const generation = getGeneration(chainId, generationId);
    if (!generation) {
      return res.status(404).json({ ok: false, error: 'Generation not found.' });
    }

    return res.json({ ok: true, generation });
  } catch (err) {
    console.error('[html-flow] get-generation error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * DELETE /api/html-flow/:chainId/generations/:generationId
 * Delete a generation from the history.
 */
router.delete('/html-flow/:chainId/generations/:generationId', (req, res) => {
  try {
    const { chainId, generationId } = req.params;

    const chainDir = resolveChainDir(chainId);
    if (!chainDir) return res.status(400).json({ ok: false, error: 'Invalid chainId.' });

    const success = deleteGeneration(chainId, generationId);
    if (!success) {
      return res.status(404).json({ ok: false, error: 'Generation not found or failed to delete.' });
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error('[html-flow] delete-generation error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * GET /api/html-flow/:chainId/generations/stats
 * Get statistics about generations for a chain.
 */
router.get('/html-flow/:chainId/generations-stats', (req, res) => {
  try {
    const { chainId } = req.params;

    const chainDir = resolveChainDir(chainId);
    if (!chainDir) return res.status(400).json({ ok: false, error: 'Invalid chainId.' });

    const stats = getGenerationStats(chainId);

    return res.json({ ok: true, stats });
  } catch (err) {
    console.error('[html-flow] get-generation-stats error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * POST /api/html-flow/:chainId/generations/:generationId/replay
 * Replay a previous generation (re-apply its JSON output without re-running AI).
 */
router.post('/html-flow/:chainId/generations/:generationId/replay', (req, res) => {
  try {
    const { chainId, generationId } = req.params;

    const chainDir = resolveChainDir(chainId);
    if (!chainDir) return res.status(400).json({ ok: false, error: 'Invalid chainId.' });

    const chainPath = path.join(chainDir, 'chain.json');
    if (!fs.existsSync(chainPath)) {
      return res.status(404).json({ ok: false, error: 'Chain not found.' });
    }

    const replayData = getGenerationForReplay(chainId, generationId);
    if (!replayData) {
      return res.status(404).json({ ok: false, error: 'Generation not found or is not a round.' });
    }

    const chain = JSON.parse(fs.readFileSync(chainPath, 'utf8'));
    const zones = (chain.zones || []).filter(z => z.key);
    const repeatableSlides = chain.repeatableSlides || [];

    // Validate the stored JSON
    const validation = validateHtmlJson(replayData.jsonInput, zones, repeatableSlides);
    if (!validation.valid) {
      return res.status(422).json({ ok: false, error: 'Stored JSON is no longer valid', missingFields: validation.missingFields });
    }

    // Apply the content
    const data = JSON.parse(replayData.jsonInput);
    const templateHtml = fs.readFileSync(chain.templatePath, 'utf8');
    const patchedHtml = applyHtmlContent(templateHtml, data, zones, repeatableSlides);

    // Save new output file
    const newRoundId = randomUUID();
    const newOutputFile = `output-${newRoundId}.html`;
    const newOutputPath = path.join(chainDir, newOutputFile);
    fs.writeFileSync(newOutputPath, patchedHtml, 'utf8');

    // Build preview
    const previewHtml = buildOutputPreviewHtml(patchedHtml);
    const slideCount = (patchedHtml.match(/<section/g) || []).length;

    // Record the replay
    const replayResult = recordReplay(chainId, generationId, newRoundId, newOutputFile);
    if (!replayResult) {
      return res.status(500).json({ ok: false, error: 'Failed to record replay.' });
    }

    return res.json({
      ok: true,
      roundId: newRoundId,
      outputFile: newOutputFile,
      previewHtml,
      slideCount,
      generationId: replayResult.generationId,
      sourceGenerationId: generationId,
    });
  } catch (err) {
    console.error('[html-flow] replay-generation error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * GET /api/html-flow/:chainId/generations/export
 * Export all generations as JSON (for backup/audit).
 */
router.get('/html-flow/:chainId/generations-export', (req, res) => {
  try {
    const { chainId } = req.params;

    const chainDir = resolveChainDir(chainId);
    if (!chainDir) return res.status(400).json({ ok: false, error: 'Invalid chainId.' });

    const exportData = exportGenerations(chainId);
    if (!exportData) {
      return res.status(404).json({ ok: false, error: 'Chain not found.' });
    }

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="generations-${chainId}.json"`);
    return res.send(exportData);
  } catch (err) {
    console.error('[html-flow] export-generations error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ── Phase 3: Versioned Export API Endpoints ───────────────────────────────────

/**
 * POST /api/html-flow/:chainId/exports
 * Create a versioned export from a generation round.
 *
 * Body: {
 *   roundId: string,          — round ID from apply-content
 *   outputFile: string,       — output HTML file name
 *   slideMetadata?: Array<{   — optional per-slide metadata
 *     slideId: string,
 *     name: string,
 *     type: string
 *   }>
 * }
 */
router.post('/html-flow/:chainId/exports', (req, res) => {
  try {
    const { chainId } = req.params;
    const { roundId, outputFile, slideMetadata } = req.body;

    if (!roundId || !outputFile) {
      return res.status(400).json({ ok: false, error: 'roundId and outputFile are required.' });
    }

    const chainDir = resolveChainDir(chainId);
    if (!chainDir) return res.status(400).json({ ok: false, error: 'Invalid chainId.' });

    const chainPath = path.join(chainDir, 'chain.json');
    if (!fs.existsSync(chainPath)) {
      return res.status(404).json({ ok: false, error: 'Chain not found.' });
    }

    // Validate slideMetadata if provided
    if (slideMetadata !== undefined && !Array.isArray(slideMetadata)) {
      return res.status(400).json({ ok: false, error: 'slideMetadata must be an array.' });
    }

    const result = createExport(chainId, roundId, outputFile, slideMetadata || []);
    if (!result) {
      return res.status(500).json({ ok: false, error: 'Failed to create export.' });
    }

    return res.status(201).json({
      ok: true,
      exportId: result.exportId,
      exportNumber: result.exportNumber,
      slideCount: result.slideCount,
      createdAt: result.createdAt,
    });
  } catch (err) {
    console.error('[html-flow] create-export error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * GET /api/html-flow/:chainId/exports
 * List all exports for a chain (newest first).
 */
router.get('/html-flow/:chainId/exports', (req, res) => {
  try {
    const { chainId } = req.params;

    const chainDir = resolveChainDir(chainId);
    if (!chainDir) return res.status(400).json({ ok: false, error: 'Invalid chainId.' });

    const exports = listExports(chainId);
    const total = getExportCount(chainId);

    return res.json({ ok: true, exports, total });
  } catch (err) {
    console.error('[html-flow] list-exports error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * GET /api/html-flow/:chainId/exports/:exportId
 * Get detailed information about a specific export.
 */
router.get('/html-flow/:chainId/exports/:exportId', (req, res) => {
  try {
    const { chainId, exportId } = req.params;

    const chainDir = resolveChainDir(chainId);
    if (!chainDir) return res.status(400).json({ ok: false, error: 'Invalid chainId.' });

    const exportData = getExport(chainId, exportId);
    if (!exportData) {
      return res.status(404).json({ ok: false, error: 'Export not found.' });
    }

    return res.json({ ok: true, export: exportData });
  } catch (err) {
    console.error('[html-flow] get-export error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * GET /api/html-flow/:chainId/exports/:exportId/project
 * Get the project.json (slide index) for an export.
 */
router.get('/html-flow/:chainId/exports/:exportId/project', (req, res) => {
  try {
    const { chainId, exportId } = req.params;

    const chainDir = resolveChainDir(chainId);
    if (!chainDir) return res.status(400).json({ ok: false, error: 'Invalid chainId.' });

    const projectIndex = getExportProjectIndex(chainId, exportId);
    if (!projectIndex) {
      return res.status(404).json({ ok: false, error: 'Export project index not found.' });
    }

    return res.json({ ok: true, project: projectIndex });
  } catch (err) {
    console.error('[html-flow] get-export-project error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * GET /api/html-flow/:chainId/exports/:exportId/slides/:slideFile
 * Download a specific slide HTML file from an export.
 * slideFile must match pattern: slide-N.html
 */
router.get('/html-flow/:chainId/exports/:exportId/slides/:slideFile', (req, res) => {
  try {
    const { chainId, exportId, slideFile } = req.params;

    const chainDir = resolveChainDir(chainId);
    if (!chainDir) return res.status(400).json({ ok: false, error: 'Invalid chainId.' });

    const filePath = resolveSlideFilePath(chainId, exportId, slideFile);
    if (!filePath) {
      return res.status(404).json({ ok: false, error: 'Slide file not found.' });
    }

    res.setHeader('Content-Disposition', `attachment; filename="${slideFile}"`);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.sendFile(path.resolve(filePath));
  } catch (err) {
    console.error('[html-flow] download-slide error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * GET /api/html-flow/:chainId/exports/:exportId/download
 * Download the entire export as a ZIP archive.
 */
router.get('/html-flow/:chainId/exports/:exportId/download', (req, res) => {
  try {
    const { chainId, exportId } = req.params;

    const chainDir = resolveChainDir(chainId);
    if (!chainDir) return res.status(400).json({ ok: false, error: 'Invalid chainId.' });

    const zipResult = buildExportZip(chainId, exportId);
    if (!zipResult) {
      return res.status(404).json({ ok: false, error: 'Export not found or failed to build ZIP.' });
    }

    res.setHeader('Content-Disposition', `attachment; filename="${zipResult.filename}"`);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Length', zipResult.buffer.length);
    return res.send(zipResult.buffer);
  } catch (err) {
    console.error('[html-flow] download-export-zip error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * DELETE /api/html-flow/:chainId/exports/:exportId
 * Delete an export and all its files.
 */
router.delete('/html-flow/:chainId/exports/:exportId', (req, res) => {
  try {
    const { chainId, exportId } = req.params;

    const chainDir = resolveChainDir(chainId);
    if (!chainDir) return res.status(400).json({ ok: false, error: 'Invalid chainId.' });

    const success = deleteExport(chainId, exportId);
    if (!success) {
      return res.status(404).json({ ok: false, error: 'Export not found or failed to delete.' });
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error('[html-flow] delete-export error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ── Phase 4B: Structure Management (Relationship Builder) ──────────────────

/**
 * POST /api/html-flow/:chainId/structures
 * Create a new structure from selected exports.
 */
router.post('/html-flow/:chainId/structures', (req, res) => {
  try {
    const { chainId } = req.params;
    const { name, description, exportIds } = req.body;

    const chainDir = resolveChainDir(chainId);
    if (!chainDir) return res.status(400).json({ ok: false, error: 'Invalid chainId.' });

    if (!name || !Array.isArray(exportIds) || exportIds.length === 0) {
      return res.status(400).json({
        ok: false,
        error: 'name and at least one exportId are required.',
      });
    }

    const structureId = createStructure(chainId, name, description || '', exportIds);
    if (!structureId) {
      return res.status(400).json({ ok: false, error: 'Failed to create structure.' });
    }

    return res.json({ ok: true, structureId });
  } catch (err) {
    console.error('[html-flow] create-structure error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * GET /api/html-flow/:chainId/structures
 * List all structures for a chain.
 */
router.get('/html-flow/:chainId/structures', (req, res) => {
  try {
    const { chainId } = req.params;

    const chainDir = resolveChainDir(chainId);
    if (!chainDir) return res.status(400).json({ ok: false, error: 'Invalid chainId.' });

    const structures = listStructures(chainId);
    return res.json({ ok: true, structures });
  } catch (err) {
    console.error('[html-flow] list-structures error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * GET /api/html-flow/:chainId/structures/:structureId
 * Get structure details with full tree.
 */
router.get('/html-flow/:chainId/structures/:structureId', (req, res) => {
  try {
    const { chainId, structureId } = req.params;

    const chainDir = resolveChainDir(chainId);
    if (!chainDir) return res.status(400).json({ ok: false, error: 'Invalid chainId.' });

    const structure = getStructure(chainId, structureId);
    if (!structure) {
      return res.status(404).json({ ok: false, error: 'Structure not found.' });
    }

    return res.json({ ok: true, structure });
  } catch (err) {
    console.error('[html-flow] get-structure error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * PUT /api/html-flow/:chainId/structures/:structureId
 * Update structure (tree operations: add, move, remove nodes).
 */
router.put('/html-flow/:chainId/structures/:structureId', (req, res) => {
  try {
    const { chainId, structureId } = req.params;
    const { operation, nodeId, parentId, slideRef, title, newParentId } = req.body;

    const chainDir = resolveChainDir(chainId);
    if (!chainDir) return res.status(400).json({ ok: false, error: 'Invalid chainId.' });

    let structure = null;

    switch (operation) {
      case 'add_node':
        if (!slideRef || !title) {
          return res.status(400).json({ ok: false, error: 'slideRef and title are required.' });
        }
        structure = addNodeToStructure(chainId, structureId, parentId || null, slideRef, title);
        break;

      case 'move_node':
        if (!nodeId || newParentId === undefined) {
          return res.status(400).json({ ok: false, error: 'nodeId and newParentId are required.' });
        }
        structure = moveNode(chainId, structureId, nodeId, newParentId || null);
        break;

      case 'remove_node':
        if (!nodeId) {
          return res.status(400).json({ ok: false, error: 'nodeId is required.' });
        }
        structure = removeNodeFromStructure(chainId, structureId, nodeId);
        break;

      default:
        return res.status(400).json({ ok: false, error: 'Invalid operation.' });
    }

    if (!structure) {
      return res.status(400).json({ ok: false, error: `Failed to perform ${operation}.` });
    }

    return res.json({ ok: true, structure });
  } catch (err) {
    console.error('[html-flow] update-structure error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * DELETE /api/html-flow/:chainId/structures/:structureId
 * Delete a structure.
 */
router.delete('/html-flow/:chainId/structures/:structureId', (req, res) => {
  try {
    const { chainId, structureId } = req.params;

    const chainDir = resolveChainDir(chainId);
    if (!chainDir) return res.status(400).json({ ok: false, error: 'Invalid chainId.' });

    const success = deleteStructure(chainId, structureId);
    if (!success) {
      return res.status(404).json({ ok: false, error: 'Structure not found or failed to delete.' });
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error('[html-flow] delete-structure error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * GET /api/html-flow/:chainId/structures/:structureId/validate
 * Validate structure integrity.
 */
router.get('/html-flow/:chainId/structures/:structureId/validate', (req, res) => {
  try {
    const { chainId, structureId } = req.params;

    const chainDir = resolveChainDir(chainId);
    if (!chainDir) return res.status(400).json({ ok: false, error: 'Invalid chainId.' });

    const validation = validateStructure(chainId, structureId);
    return res.json({ ok: true, validation });
  } catch (err) {
    console.error('[html-flow] validate-structure error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * GET /api/html-flow/:chainId/structures/:structureId/tree
 * Get tree visualization data for frontend rendering.
 */
router.get('/html-flow/:chainId/structures/:structureId/tree', (req, res) => {
  try {
    const { chainId, structureId } = req.params;

    const chainDir = resolveChainDir(chainId);
    if (!chainDir) return res.status(400).json({ ok: false, error: 'Invalid chainId.' });

    const tree = getTreeVisualization(chainId, structureId);
    if (!tree) {
      return res.status(404).json({ ok: false, error: 'Structure not found.' });
    }

    return res.json({ ok: true, tree });
  } catch (err) {
    console.error('[html-flow] get-tree-visualization error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * GET /api/html-flow/:chainId/structures/:structureId/orphans
 * Get orphaned slides for a structure.
 */
router.get('/html-flow/:chainId/structures/:structureId/orphans', (req, res) => {
  try {
    const { chainId, structureId } = req.params;

    const chainDir = resolveChainDir(chainId);
    if (!chainDir) return res.status(400).json({ ok: false, error: 'Invalid chainId.' });

    const orphans = getOrphanedSlidesForStructure(chainId, structureId);
    return res.json({ ok: true, orphans });
  } catch (err) {
    console.error('[html-flow] get-orphaned-slides error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
