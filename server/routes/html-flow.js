/**
 * server/routes/html-flow.js
 *
 * Visual Flow (HTML-based) API endpoints.
 *
 * Architecture: zones are derived from user *selections* on the structural
 * tree rather than from data-zone / data-block attributes in the HTML.
 * The upload endpoint returns a tree + pre-populated selections (backward-compat:
 * existing data-zone/data-block attrs seed the selections). The create-project
 * endpoint accepts selections, derives zones via selectionsToZones(), and writes
 * zones to flow.json — all downstream consumers (recipe builder, patcher) are
 * unchanged.
 */

import express        from 'express';
import fs             from 'fs';
import path           from 'path';
import { randomUUID } from 'crypto';
import { parse }      from 'node-html-parser';
import { PROJECTS_DIR } from '../config.js';
import { buildHtmlRecipe, validateHtmlJson } from '../lib/html-recipe-builder.js';
import { applyHtmlContent }                  from '../lib/html-patcher.js';
import { buildSectionTree, flattenTree }      from '../lib/build-tree.js';
import { selectionsToZones, resolveConflicts } from '../lib/selections-to-zones.js';
import { getSummaryStatus } from '../lib/context-reader.js';
import { loadFlow, saveFlow } from '../lib/project-manager.js';
import {
  createExport,
  listExports,
  getExport,
  getExportProjectIndex,
  resolveSlideFilePath,
  getExportCount,
  deleteExport,
  deleteSlide,
  buildExportZip,
  forkExport,
  updateSlideTitle,
} from '../lib/export-manager.js';

const router = express.Router();

// In-memory store for pending template sessions (pre-project-creation).
// Keyed by templateId (uuid). Entries expire after 2 hours.
const pendingTemplates = new Map();

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Generate generic slide names for sections in HTML.
 * Returns an array of { index, name }.
 */
function extractSlideNamesFromHtml(html) {
  try {
    const root = parse(html);
    const sections = root.querySelectorAll('section');

    return sections.map((_, idx) => ({ index: idx + 1, name: `Slide ${idx + 1}` }));
  } catch {
    return [];
  }
}

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
function buildPreviewHtml(html, tree) {
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

function injectSolonId(sectionNode, nodeId) {
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

// ── GET /api/html-flow/load-flow ────────────────────────────────────────────
// Load an existing flow's template, tree, and metadata.
// Used when opening a flow from the dashboard.

router.get('/html-flow/load-flow', (req, res) => {
  try {
    const { projectName, flowId } = req.query;

    if (!projectName || !flowId) {
      return res.status(400).json({ ok: false, error: 'projectName and flowId are required.' });
    }

    if (!/^[\w-]{1,100}$/.test(projectName) || !/^[\w-]{1,100}$/.test(flowId)) {
      return res.status(400).json({ ok: false, error: 'Invalid projectName or flowId.' });
    }

    const flowDir  = path.join(PROJECTS_DIR, projectName, 'flows', flowId);
    const flowPath = path.join(flowDir, 'flow.json');

    if (!fs.existsSync(flowPath)) {
      return res.status(404).json({ ok: false, error: 'Flow not found.' });
    }

    const flow         = JSON.parse(fs.readFileSync(flowPath, 'utf8'));
    const templatePath = path.join(flowDir, 'template.html');

    if (!fs.existsSync(templatePath)) {
      return res.status(404).json({ ok: false, error: 'Template not found for this flow. The flow may have been created with an older version of Solon and needs to be recreated.' });
    }

    const html     = fs.readFileSync(templatePath, 'utf8');
    const metadata = flow._metadata || {};

    // Parse the template to get a fresh DOM tree.
    const { slideCount, trees, selections: parsedSelections, violations: parsedViolations } = parseTemplate(html);

    // Prefer saved selections from metadata over re-parsed ones.
    // Templates where zones were assigned via the tree UI have no data-zone attrs,
    // so parseTemplate returns empty selections — but real assignments live in
    // _metadata.selections.
    const savedSelections = metadata.selections;
    const selections = (Array.isArray(savedSelections) && savedSelections.length > 0)
      ? savedSelections
      : parsedSelections;

    // NO_ZONES is a false positive when we have saved selections — the zones just
    // aren't embedded as HTML attributes.
    const violations = selections.length > 0
      ? parsedViolations.filter(v => v.rule !== 'NO_ZONES')
      : parsedViolations;

     const previewHtml = buildPreviewHtml(html, trees[0]);
     const latestGeneration = (flow.generations || []).slice(-1)[0];

     return res.json({
       ok: true,
       projectName,
       flowId,
       fileName: flow.templateFilename || 'template.html',
       slideCount,
       trees,
       selections,
       repeatableSlides:    metadata.repeatableSlides    || [],
       fullSlideGeneration: metadata.fullSlideGeneration || [],
       summaryPrompt:       flow.summaryPrompt           || '',
       contentPrompt:       flow.contentPrompt           || '',
       agenticCustomInput:  flow.agenticCustomInput      || '',
       agenticJsonResponse: flow.agenticJsonResponse     || null,
       previewHtml,
       slideNames:          latestGeneration?.slideNames || [],
       violations: violations.length ? violations : undefined,
       isExistingFlow: true,
     });
  } catch (err) {
    console.error('[html-flow] load-flow error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ── GET /api/html-flow/context-files ──────────────────────────────────────────
// List context files available in a project's AI Context/ folder.

router.get('/html-flow/context-files', async (req, res) => {
  try {
    const { projectName } = req.query;

    if (!projectName || !/^[\w-]{1,100}$/.test(projectName)) {
      return res.status(400).json({ ok: false, error: 'projectName is required and must be valid.' });
    }

    const projectDir = path.join(PROJECTS_DIR, projectName);
    const contextDir = path.join(projectDir, 'AI Context');

    // If the AI Context folder doesn't exist, return empty list
    if (!fs.existsSync(contextDir)) {
      return res.json({ ok: true, files: [] });
    }

    // Get summary status for all files
    const summaryStatus = await getSummaryStatus(projectDir);

    // Read the directory and filter supported files
    let filenames;
    try {
      filenames = fs.readdirSync(contextDir);
    } catch {
      return res.json({ ok: true, files: [] });
    }

    const SUPPORTED_EXT = new Set(['.txt', '.md', '.html', '.pdf', '.docx', '.xlsx', '.xls', '.csv']);
    const SUMMARY_SUFFIX = '.summary.md';

    const files = filenames
      .filter(f =>
        SUPPORTED_EXT.has(path.extname(f).toLowerCase()) &&
        !f.startsWith('~$') &&
        !f.startsWith('.') &&
        !f.endsWith(SUMMARY_SUFFIX)
      )
      .map(name => ({
        name,
        ext: path.extname(name),
        hasSummary: summaryStatus.get(name) ?? false,
      }));

    return res.json({ ok: true, files });
  } catch (err) {
    console.error('[html-flow] context-files error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ── PATCH /api/html-flow/update-selections ────────────────────────────────────

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
    const treeIdx = slideIdx - 1;
    if (treeIdx < 0 || treeIdx >= trees.length) continue;

    const allNodes = flattenTree(trees[treeIdx]);

    for (const node of allNodes) {
      if (existingNodeIds.has(node.id)) continue;
      if (node.leaf) continue;

      if (node.interesting || node.children?.length > 0) {
        const key = `auto_${node.id.replace(/[^a-z0-9]/gi, '_').toLowerCase()}`;
        result.push({
          nodeId:        node.id,
          slideIndex:    slideIdx,
          zoneType:      'block',
          key,
          prompt:        '',
          autoGenerate:  true,
          autoDiscovered: true,
          type:          'block',
          ...(node.innerHTML ? { exampleHtml: node.innerHTML } : {}),
        });
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
    const { selections, projectName, existingProjectName, fullSlideGeneration, flowName } = req.body;

    if (!templateId || !pendingTemplates.has(templateId)) {
      return res.status(404).json({ ok: false, error: 'Template session not found. Please re-upload.' });
    }

    const session = pendingTemplates.get(templateId);

    const rawRepSlides = Array.isArray(req.body.repeatableSlides) ? req.body.repeatableSlides : [];
    const repeatableSlides = rawRepSlides.filter(rs =>
      Number.isInteger(rs.slideIndex) &&
      typeof rs.key === 'string' && /^[a-z][a-z0-9_]*$/.test(rs.key) &&
      typeof rs.prompt === 'string'
    );

    const fullSlideGen  = Array.isArray(fullSlideGeneration) ? fullSlideGeneration : [];
    const rawSelections = Array.isArray(selections) ? selections : (session.selections ?? []);

    const selectionsWithAutoDiscovered = autoDiscoverZonesForFullSlide(session.trees ?? [], fullSlideGen, rawSelections);
    const { resolved, removed } = resolveConflicts(selectionsWithAutoDiscovered);
    const zones = selectionsToZones(resolved, repeatableSlides);

    let name;
    if (existingProjectName?.trim()) {
      if (!/^[\w-]{1,100}$/.test(existingProjectName.trim())) {
        return res.status(400).json({ ok: false, error: 'Invalid existingProjectName format.' });
      }
      name = existingProjectName.trim();
      const projectDir = path.join(PROJECTS_DIR, name);
      if (!fs.existsSync(projectDir)) {
        return res.status(404).json({ ok: false, error: `Project "${name}" not found.` });
      }
    } else {
      name = projectName?.trim() || session.fileName?.replace(/\.html?$/, '') || 'html-project';
    }

    const projectDir  = path.join(PROJECTS_DIR, name);
    const baseSlug    = flowName?.trim()
      ? flowName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)
      : name.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    const flowsDir    = path.join(projectDir, 'flows');

    // Find a unique flowId: try base slug first, then append -2, -3, …
    let flowId, flowDir;
    let attempt = 0;
    do {
      const suffix = attempt === 0 ? '' : `-${attempt + 1}`;
      flowId  = 'flow-' + baseSlug + suffix;
      flowDir = path.join(flowsDir, flowId);
      attempt++;
    } while (fs.existsSync(flowDir) && attempt < 100);

    fs.mkdirSync(flowDir, { recursive: true });

    fs.writeFileSync(path.join(flowDir, 'template.html'), session.html, 'utf8');

    const flow = {
      flowId,
      name:             flowName?.trim() || null,
      projectId:        randomUUID(),
      templateId,
      templateFilename: session.fileName,
      createdAt:        new Date().toISOString(),
      updatedAt:        new Date().toISOString(),
      status:           'active',
      globalPrompt:     '',
      summaryPrompt:    '',
      contentPrompt:    '',
      generations:      [],
      exports:          [],
      _metadata: {
        selections:          resolved,
        zones,
        repeatableSlides,
        fullSlideGeneration: fullSlideGen,
        trees:               session.trees ?? [],
        slideCount:          session.slideCount,
      }
    };

    fs.writeFileSync(path.join(flowDir, 'flow.json'), JSON.stringify(flow, null, 2), 'utf8');

    return res.json({
      ok: true,
      projectName:       name,
      flowId,
      selections:        resolved,
      removedSelections: removed,
      zones,
    });
  } catch (err) {
    console.error('[html-flow] create-project error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ── POST /api/html-flow/generate-recipe ──────────────────────────────────────

router.post('/html-flow/generate-recipe', (req, res) => {
  try {
    const { projectName, flowId, globalPrompt, repeatableSlides: clientRepSlides } = req.body;

    if (!projectName || !/^[\w-]{1,100}$/.test(projectName) || !flowId || !/^[\w-]{1,100}$/.test(flowId)) {
      return res.status(400).json({ ok: false, error: 'projectName and flowId are required.' });
    }

    const flowDir  = path.join(PROJECTS_DIR, projectName, 'flows', flowId);
    const flowPath = path.join(flowDir, 'flow.json');
    if (!fs.existsSync(flowPath)) {
      return res.status(404).json({ ok: false, error: 'Flow not found.' });
    }

    const flow      = JSON.parse(fs.readFileSync(flowPath, 'utf8'));
    const zones     = flow._metadata?.zones || [];
    const prompt    = globalPrompt ?? flow.globalPrompt ?? '';

    // Accept client-provided repeatableSlides (may include user-edited prompts)
    // and persist them back to flow.json so subsequent operations are consistent.
    const repSlides = Array.isArray(clientRepSlides) ? clientRepSlides : (flow._metadata?.repeatableSlides || []);

    const dirty = globalPrompt !== undefined || Array.isArray(clientRepSlides);
    if (dirty) {
      if (globalPrompt !== undefined) flow.globalPrompt = globalPrompt;
      if (Array.isArray(clientRepSlides)) flow._metadata.repeatableSlides = repSlides;
      flow.updatedAt = new Date().toISOString();
      fs.writeFileSync(flowPath, JSON.stringify(flow, null, 2), 'utf8');
    }

     const recipe = buildHtmlRecipe(zones, prompt, repSlides);

      return res.json({ ok: true, recipe, generationId: randomUUID() });
  } catch (err) {
    console.error('[html-flow] generate-recipe error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ── POST /api/html-flow/validate-json ────────────────────────────────────────

router.post('/html-flow/validate-json', (req, res) => {
  try {
    const { projectName, flowId, jsonString, fullSlide = false, slideIndex = null } = req.body;

    if (!jsonString) {
      return res.status(400).json({ ok: false, error: 'jsonString is required.' });
    }

    if (!projectName || !/^[\w-]{1,100}$/.test(projectName) || !flowId || !/^[\w-]{1,100}$/.test(flowId)) {
      return res.status(400).json({ ok: false, error: 'projectName and flowId are required.' });
    }

    const flowDir  = path.join(PROJECTS_DIR, projectName, 'flows', flowId);
    const flowPath = path.join(flowDir, 'flow.json');
    if (!fs.existsSync(flowPath)) {
      return res.status(404).json({ ok: false, error: 'Flow not found.' });
    }

    const flow      = JSON.parse(fs.readFileSync(flowPath, 'utf8'));
    const zones     = flow._metadata?.zones || [];
    const repSlides = flow._metadata?.repeatableSlides || [];

    const options = fullSlide ? { fullSlide: true, slideIndex } : {};
    const result  = validateHtmlJson(jsonString, zones, repSlides, options);

    return res.json({ ok: true, ...result });
  } catch (err) {
    console.error('[html-flow] validate-json error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ── POST /api/html-flow/apply-content ────────────────────────────────────────

router.post('/html-flow/apply-content', (req, res) => {
  try {
    const { projectName, flowId, jsonString, instanceNames } = req.body;

    if (!jsonString) {
      return res.status(400).json({ ok: false, error: 'jsonString is required.' });
    }
    if (typeof jsonString === 'string' && jsonString.length > 2 * 1024 * 1024) {
      return res.status(400).json({ ok: false, error: 'JSON response too large (max 2MB).' });
    }

    if (!projectName || !/^[\w-]{1,100}$/.test(projectName) || !flowId || !/^[\w-]{1,100}$/.test(flowId)) {
      return res.status(400).json({ ok: false, error: 'projectName and flowId are required.' });
    }

    const flowDir  = path.join(PROJECTS_DIR, projectName, 'flows', flowId);
    const flowPath = path.join(flowDir, 'flow.json');
    if (!fs.existsSync(flowPath)) {
      return res.status(404).json({ ok: false, error: 'Flow not found.' });
    }

    const flow           = JSON.parse(fs.readFileSync(flowPath, 'utf8'));
    const zones          = (flow._metadata?.zones || []).filter(z => z.key);
    const repeatableSlides = flow._metadata?.repeatableSlides || [];
    const templatePath   = path.join(flowDir, 'template.html');

    const validation = validateHtmlJson(jsonString, zones, repeatableSlides);
    if (!validation.valid) {
      return res.status(422).json({ ok: false, error: 'JSON validation failed', missingFields: validation.missingFields });
    }

     const data         = JSON.parse(jsonString);
     const templateHtml = fs.readFileSync(templatePath, 'utf8');
     const patchedHtml  = applyHtmlContent(templateHtml, data, zones, repeatableSlides);

     let slideNames;
     if (Array.isArray(instanceNames) && instanceNames.length > 0) {
       slideNames = instanceNames.map((name, i) => ({ index: i + 1, name, keyMissing: false }));
     } else {
       slideNames = extractSlideNamesFromHtml(patchedHtml);
     }

     const roundId    = randomUUID();
     const outputFile = `output-${roundId}.html`;
     const outputPath = path.join(flowDir, outputFile);
     fs.writeFileSync(outputPath, patchedHtml, 'utf8');

     flow.generations = [...(flow.generations || []), {
       id:         roundId,
       appliedAt:  new Date().toISOString(),
       outputFile,
       jsonInput:  jsonString.slice(0, 2000),
       slideNames,
     }];
     flow.updatedAt = new Date().toISOString();
     fs.writeFileSync(flowPath, JSON.stringify(flow, null, 2), 'utf8');

     const previewHtml = buildOutputPreviewHtml(patchedHtml);
     const slideCount  = (patchedHtml.match(/<section/g) || []).length;

     return res.json({ ok: true, roundId, outputFile, previewHtml, slideCount, slideNames });
  } catch (err) {
    console.error('[html-flow] apply-content error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ── PATCH /api/html-flow/update-preview-html ─────────────────────────────────
// Save edited text back to the output file after inline editing in preview.
// Accepts a CSS selector and plain text, finds the element, updates its text content.

router.patch('/html-flow/update-preview-html', (req, res) => {
  try {
    const { projectName, flowId, roundId, selector, newText } = req.body;

    if (!projectName || !/^[\w-]{1,100}$/.test(projectName)) {
      return res.status(400).json({ ok: false, error: 'Invalid projectName.' });
    }
    if (!flowId || !/^[\w-]{1,100}$/.test(flowId)) {
      return res.status(400).json({ ok: false, error: 'Invalid flowId.' });
    }
    if (!roundId || typeof roundId !== 'string') {
      return res.status(400).json({ ok: false, error: 'Invalid roundId.' });
    }
    if (!selector || typeof selector !== 'string') {
      return res.status(400).json({ ok: false, error: 'selector is required.' });
    }
    if (newText === undefined || typeof newText !== 'string') {
      return res.status(400).json({ ok: false, error: 'newText is required.' });
    }

    const flowDir  = path.join(PROJECTS_DIR, projectName, 'flows', flowId);
    const flowPath = path.join(flowDir, 'flow.json');

    if (!fs.existsSync(flowPath)) {
      return res.status(404).json({ ok: false, error: 'Flow not found.' });
    }

    const flow = JSON.parse(fs.readFileSync(flowPath, 'utf8'));
    const generation = (flow.generations || []).find(g => g.id === roundId);

    if (!generation) {
      return res.status(404).json({ ok: false, error: 'Generation not found.' });
    }

    const outputPath = path.join(flowDir, generation.outputFile);
    const html = fs.readFileSync(outputPath, 'utf8');

    // Parse HTML and find element by selector
    const root = parse(html);
    const element = root.querySelector(selector);

    if (!element) {
      return res.status(404).json({ ok: false, error: 'Element not found in HTML.' });
    }

    // Update the element's text content (not innerHTML)
    element.set_content(newText);

    // Write updated HTML back to disk
    const updatedHtml = root.toString();
    fs.writeFileSync(outputPath, updatedHtml, 'utf8');

    const previewHtml = buildOutputPreviewHtml(updatedHtml);
    return res.json({ ok: true, previewHtml });
  } catch (err) {
    console.error('[html-flow] update-preview-html error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ── Versioned Export API Endpoints ────────────────────────────────────────────

router.post('/projects/:projectName/flows/:flowId/exports', (req, res) => {
  try {
    const { projectName, flowId } = req.params;
    const { roundId, outputFile, slideMetadata, exportName } = req.body;

    if (!roundId || !outputFile) {
      return res.status(400).json({ ok: false, error: 'roundId and outputFile are required.' });
    }

    if (slideMetadata !== undefined && !Array.isArray(slideMetadata)) {
      return res.status(400).json({ ok: false, error: 'slideMetadata must be an array.' });
    }

    const result = createExport(projectName, flowId, roundId, outputFile, slideMetadata || [], exportName);
    if (!result) {
      return res.status(500).json({ ok: false, error: 'Failed to create export.' });
    }

    return res.status(201).json({
      ok: true,
      exportId:     result.exportId,
      exportNumber: result.exportNumber,
      slideCount:   result.slideCount,
      createdAt:    result.createdAt,
    });
  } catch (err) {
    console.error('[html-flow] create-export error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/projects/:projectName/flows/:flowId/exports', (req, res) => {
  try {
    const { projectName, flowId } = req.params;
    const exports = listExports(projectName, flowId);
    const total   = getExportCount(projectName, flowId);
    const augmented = exports.map(exp => {
      const full = getExport(projectName, flowId, exp.exportId);
      return { ...exp, slides: full?.content?.slides || [] };
    });
    return res.json({ ok: true, exports: augmented, total });
  } catch (err) {
    console.error('[html-flow] list-exports error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/projects/:projectName/flows/:flowId/exports/:exportId', (req, res) => {
  try {
    const { projectName, flowId, exportId } = req.params;
    const exportData = getExport(projectName, flowId, exportId);
    if (!exportData) {
      return res.status(404).json({ ok: false, error: 'Export not found.' });
    }
    return res.json({ ok: true, export: exportData });
  } catch (err) {
    console.error('[html-flow] get-export error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/projects/:projectName/flows/:flowId/exports/:exportId/project', (req, res) => {
  try {
    const { projectName, flowId, exportId } = req.params;
    const projectIndex = getExportProjectIndex(projectName, flowId, exportId);
    if (!projectIndex) {
      return res.status(404).json({ ok: false, error: 'Export project index not found.' });
    }
    return res.json({ ok: true, project: projectIndex });
  } catch (err) {
    console.error('[html-flow] get-export-project error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/projects/:projectName/flows/:flowId/exports/:exportId/slides/:slideFile', (req, res) => {
  try {
    const { projectName, flowId, exportId, slideFile } = req.params;
    const filePath = resolveSlideFilePath(projectName, flowId, exportId, slideFile);
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

router.patch('/projects/:projectName/flows/:flowId/exports/:exportId/slides/:slideFile/title', (req, res) => {
  try {
    const { projectName, flowId, exportId, slideFile } = req.params;
    const { title } = req.body;

    if (!title || typeof title !== 'string' || !title.trim()) {
      return res.status(400).json({ ok: false, error: 'title is required and must be a non-empty string' });
    }

    const result = updateSlideTitle(projectName, flowId, exportId, slideFile, title);
    return res.json({ ok: result.ok, title: result.title });
  } catch (err) {
    console.error('[html-flow] update-slide-title error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

router.patch('/projects/:projectName/flows/:flowId/exports/:exportId/slides/:slideFile', (req, res) => {
  try {
    const { projectName, flowId, exportId, slideFile } = req.params;
    const { html } = req.body;

    if (!html || typeof html !== 'string') {
      return res.status(400).json({ ok: false, error: 'html is required and must be a string' });
    }

    const filePath = resolveSlideFilePath(projectName, flowId, exportId, slideFile);
    if (!filePath) {
      return res.status(404).json({ ok: false, error: 'Slide file not found.' });
    }

    fs.writeFileSync(filePath, html, 'utf8');
    return res.json({ ok: true });
  } catch (err) {
    console.error('[html-flow] patch-slide error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

router.delete('/projects/:projectName/flows/:flowId/exports/:exportId/slides/:slideFile', (req, res) => {
  try {
    const { projectName, flowId, exportId, slideFile } = req.params;

    const result = deleteSlide(projectName, flowId, exportId, slideFile);
    if (!result.ok) {
      return res.status(404).json({ ok: false, error: result.error });
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error('[html-flow] delete-slide error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/projects/:projectName/flows/:flowId/exports/:exportId/download', (req, res) => {
  try {
    const { projectName, flowId, exportId } = req.params;
    const zipResult = buildExportZip(projectName, flowId, exportId);
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

router.delete('/projects/:projectName/flows/:flowId/exports/:exportId', (req, res) => {
  try {
    const { projectName, flowId, exportId } = req.params;
    const success = deleteExport(projectName, flowId, exportId);
    if (!success) {
      return res.status(404).json({ ok: false, error: 'Export not found or failed to delete.' });
    }
    return res.json({ ok: true });
  } catch (err) {
    console.error('[html-flow] delete-export error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/projects/:projectName/flows/:flowId/exports/:exportId/fork', (req, res) => {
  try {
    const { projectName, flowId, exportId } = req.params;
    const { slides, overrides } = req.body;

    if (!Array.isArray(slides) || slides.length === 0) {
      return res.status(400).json({ ok: false, error: 'slides must be a non-empty array' });
    }

    // Validate slide file names
    for (const slideFile of slides) {
      if (!/^slide-\d+\.html$/.test(slideFile)) {
        return res.status(400).json({ ok: false, error: `Invalid slide file name: ${slideFile}` });
      }
    }

    const result = forkExport(projectName, flowId, exportId, slides, overrides || {});
    if (!result) {
      return res.status(500).json({ ok: false, error: 'Failed to create forked export' });
    }

    return res.json({ ok: true, ...result });
  } catch (err) {
    console.error('[html-flow] fork-export error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ── PATCH /api/projects/:projectName/flows/:flowId/agentic ────────────────────
// Save agentic fields: agenticCustomInput and agenticJsonResponse

router.patch('/projects/:projectName/flows/:flowId/agentic', (req, res) => {
  try {
    const { projectName, flowId } = req.params;
    const { agenticCustomInput, agenticJsonResponse } = req.body;

    if (!projectName || !/^[\w-]{1,100}$/.test(projectName)) {
      return res.status(400).json({ ok: false, error: 'Invalid projectName.' });
    }
    if (!flowId || !/^[\w-]{1,100}$/.test(flowId)) {
      return res.status(400).json({ ok: false, error: 'Invalid flowId.' });
    }

    const flow = loadFlow(projectName, flowId);
    if (!flow) {
      return res.status(404).json({ ok: false, error: 'Flow not found.' });
    }

    if (agenticCustomInput !== undefined) {
      flow.agenticCustomInput = agenticCustomInput;
    }
    if (agenticJsonResponse !== undefined) {
      flow.agenticJsonResponse = agenticJsonResponse;
    }
    flow.updatedAt = new Date().toISOString();

    const saved = saveFlow(projectName, flowId, flow);
    if (!saved) {
      return res.status(500).json({ ok: false, error: 'Failed to save flow.' });
    }

    return res.json({
      ok: true,
      agenticCustomInput: flow.agenticCustomInput || '',
      agenticJsonResponse: flow.agenticJsonResponse || null,
    });
  } catch (err) {
    console.error('[html-flow] patch-agentic error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
