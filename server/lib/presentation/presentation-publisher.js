/**
 * server/lib/presentation-publisher.js
 *
 * Presentation publishing module.
 * Handles bundling slides from project tree structures into published presentations.
 */

import fs   from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { resolveProjectDir } from '../project/project-manager.js'

const TEMPLATES_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../templates/publish');

/**
 * Resolve all slide nodes from a tree structure.
 * Returns a lean tree (no HTML content) and a flat map of slide files.
 *
 * @param {Array} tree - Array of tree nodes: { slideRefId, label?, children[] }
 * @param {Array} slidesRegistry - Array of slide entries: { id, flowId, exportId, slideIndex, title }
 * @param {string} projectDir - Absolute path to the project directory
 * @returns {{ resolvedTree: Array, slideFiles: Object }} Lean tree and slide content map
 */
function resolveSlideNodes(tree, slidesRegistry, projectDir) {
  if (!Array.isArray(tree)) return { resolvedTree: [], slideFiles: {} };
  if (!Array.isArray(slidesRegistry)) return { resolvedTree: [], slideFiles: {} };

  // Build lookup map: slideRefId -> slide entry
  const slideMap = {};
  for (const slide of slidesRegistry) {
    if (slide.id) {
      slideMap[slide.id] = slide;
    }
  }

  const slideFiles = {};

  // Recursively resolve tree nodes
  function resolveNode(node) {
    const slideRefId = node.slideRefId;
    const slideEntry = slideMap[slideRefId];

    // Determine label: use slide.title from registry, fallback to node.label, then slideRefId
    let label = slideRefId;
    if (slideEntry && slideEntry.title) {
      label = slideEntry.title;
    } else if (node.label) {
      label = node.label;
    }

    const resolved = {
      id: slideRefId,
      label: label,
      hasSlide: false,
      children: [],
    };

    // Try to resolve the slide content
    if (slideEntry && slideEntry.flowId && slideEntry.exportId && slideEntry.slideIndex) {
      const exportDir = path.join(
        projectDir,
        'flows',
        slideEntry.flowId,
        'exports',
        slideEntry.exportId
      );

      try {
        // Read project.json to find the actual slide filename
        const projectJsonPath = path.join(exportDir, 'project.json');
        if (fs.existsSync(projectJsonPath)) {
          const projectJson = JSON.parse(fs.readFileSync(projectJsonPath, 'utf8'));
          const slideInfo = projectJson.slides?.find(s => s.index === slideEntry.slideIndex);
          if (slideInfo && slideInfo.file) {
            const slideFilePath = path.join(exportDir, slideInfo.file);
            if (fs.existsSync(slideFilePath)) {
              const htmlContent = fs.readFileSync(slideFilePath, 'utf8');
              slideFiles[slideRefId] = htmlContent;
              resolved.hasSlide = true;
            }
          }
        }
      } catch (err) {
        console.warn(`[presentation-publisher] Failed to read slide file for ${slideEntry.slideIndex}:`, err.message);
      }
    }

    // Recursively resolve children
    if (Array.isArray(node.children)) {
      for (const child of node.children) {
        resolved.children.push(resolveNode(child));
      }
    }

    return resolved;
  }

  const resolvedTree = tree.map(node => resolveNode(node));
  return { resolvedTree, slideFiles };
}

/**
 * Publish a presentation by bundling slides from the project's tree structure.
 *
 * @param {string} projectName - The project name (e.g. "my-project")
 * @param {string} presentationName - The presentation name (e.g. "my-presentation")
 * @param {string} structureId - The structure ID to publish (e.g. "ps-99c47e0e-...")
 * @returns {{ ok: true, outputPath, slideCount, publishedAt } | { ok: false, error: string }}
 */
export function publishPresentation(projectName, presentationName, structureId) {
  try {
    // Validate inputs
    if (!projectName || typeof projectName !== 'string') {
      throw new Error('projectName is required');
    }
    if (!presentationName || typeof presentationName !== 'string') {
      throw new Error('presentationName is required');
    }
    if (!structureId || typeof structureId !== 'string') {
      throw new Error('structureId is required');
    }

    const projectDir = resolveProjectDir(projectName);
    if (!projectDir || !fs.existsSync(projectDir)) {
      throw new Error(`Project "${projectName}" not found`);
    }

    // Read presentation-structures.json
    const structuresPath = path.join(projectDir, 'presentation-structures.json');
    if (!fs.existsSync(structuresPath)) {
      throw new Error('No presentation structures found in project');
    }

    let structures;
    try {
      structures = JSON.parse(fs.readFileSync(structuresPath, 'utf8'));
    } catch (err) {
      throw new Error(`Failed to parse presentation-structures.json: ${err.message}`);
    }

    // Find structure by ID
    const structure = (structures.structures || []).find(s => s.id === structureId);
    if (!structure) {
      throw new Error(`Structure not found: ${structureId}`);
    }

    if (!structure.tree) {
      throw new Error('Presentation structure has no tree');
    }

    // Resolve all slide nodes from the tree
    const { resolvedTree, slideFiles } = resolveSlideNodes(structure.tree, structure.slides || [], projectDir);

    // Check that at least one slide was found
    if (Object.keys(slideFiles).length === 0) {
      throw new Error('No slides found in presentation tree');
    }

    const publishedAt = new Date().toISOString();

    // Create presentations directory structure
    const presentationsDir = path.join(projectDir, 'presentations');
    const presentationDir = path.join(presentationsDir, presentationName);
    const slidesDir = path.join(presentationDir, 'slides');
    fs.mkdirSync(slidesDir, { recursive: true });

    // Write individual slide files
    for (const [slideRefId, htmlContent] of Object.entries(slideFiles)) {
      const slidePath = path.join(slidesDir, `${slideRefId}.html`);
      fs.writeFileSync(slidePath, htmlContent, 'utf8');
    }

    // Build and write index.html
    const indexHtml = buildPresentationHtml(resolvedTree, presentationName, publishedAt);
    const indexPath = path.join(presentationDir, 'index.html');
    fs.writeFileSync(indexPath, indexHtml, 'utf8');

    // Write meta.json
    const metaJson = {
      name: presentationName,
      publishedAt,
      slideCount: Object.keys(slideFiles).length,
      structureId,
      structureName: structure.name,
    };
    const metaPath = path.join(presentationDir, 'meta.json');
    fs.writeFileSync(metaPath, JSON.stringify(metaJson, null, 2), 'utf8');

    return {
      ok: true,
      outputPath: indexPath,
      slideCount: Object.keys(slideFiles).length,
      publishedAt,
    };
  } catch (err) {
    console.error('[presentation-publisher] publishPresentation error:', err.message);
    return { ok: false, error: err.message };
  }
}

/**
 * Build the presentation HTML document.
 * Produces a complete, self-contained two-panel layout with sidebar navigation and iframe scaling.
 *
 * @param {Array} resolvedTree - Resolved tree nodes: { id, label, hasSlide, children[] }
 * @param {string} presentationName - The presentation name
 * @param {string} publishedAt - ISO timestamp
 * @returns {string} Complete HTML document
 */
function buildPresentationHtml(resolvedTree, presentationName, publishedAt) {
  const presentationData = {
    tree: resolvedTree,
    meta: { name: presentationName, publishedAt },
  };

  const templatePath = path.join(TEMPLATES_DIR, 'presentation.html');
  if (!fs.existsSync(templatePath)) {
    throw Object.assign(new Error('Presentation template not found'), { statusCode: 500 });
  }
  return fs.readFileSync(templatePath, 'utf8')
    .replaceAll('{{PRESENTATION_NAME}}',    escapeHtml(presentationName))
    .replaceAll('{{PRESENTATION_DATA_JSON}}', JSON.stringify(presentationData));
}

/**
 * Escape HTML special characters.
 */
function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
