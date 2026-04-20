/**
 * server/lib/export-manager.js
 *
 * Phase 3 & 4A: Versioned Exports & Simplified Slide Metadata
 * Phase 4E: Architecture Fix - Exports moved from chains to projects
 *
 * Manages versioned exports for HTML flows.
 * Each export captures a generation round's output as individual slide files
 * with metadata, providing a full history of exported versions.
 *
 * Phase 4E: Exports now stored in projects directory (not chains)
 * - Exports are part of the project workflow
 * - Chains are now only used for structures and packages (Phase 4B/4C)
 * - Exports remain non-destructive and reusable across multiple structures
 *
 * Directory structure per project:
 *   server/projects/<projectName>/flows/<flowId>/exports/
 *     export-1/
 *       export.json        — export metadata (no relationships)
 *       project.json       — slide index
 *       slide-1.html       — self-contained slide HTML
 *       slide-2.html
 *       ...
 *     export-2/
 *       ...
 */

import fs   from 'fs';
import path from 'path';
import { resolveFlowDir, loadFlow, saveFlow } from './project-manager.js';
import { EXPORT_ID_RE }                       from './validation.js';

// ── Path helpers ──────────────────────────────────────────────────────────────

/**
 * Validate an exportId and return the safe export directory path, or null.
 */
function resolveExportDir(projectName, flowId, exportId) {
  const flowDir = resolveFlowDir(projectName, flowId);
  if (!flowDir) return null;
  if (!exportId || typeof exportId !== 'string') return null;
  if (!EXPORT_ID_RE.test(exportId)) return null;
  const exportDir = path.join(flowDir, 'exports', exportId);
  if (!path.resolve(exportDir).startsWith(path.resolve(flowDir) + path.sep)) return null;
  return exportDir;
}

// ── HTML extraction helpers ───────────────────────────────────────────────────

/**
 * Extract the <head> content from an HTML string.
 * Returns the inner content of the <head> element, or empty string.
 */
function extractHeadContent(html) {
  const match = html.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
  return match ? match[1] : '';
}

/**
 * Extract all <section> elements from an HTML string.
 * Returns an array of outerHTML strings for each section.
 */
function extractSections(html) {
  const matches = html.match(/<section[^>]*>[\s\S]*?<\/section>/g);
  return matches || [];
}

/**
 * Build a self-contained HTML document for a single slide.
 * Embeds the head content (styles, fonts) from the original template.
 */
function buildSlideHtml(slideNumber, sectionHtml, headContent) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Slide ${slideNumber}</title>
${headContent}
</head>
<body>
${sectionHtml}
</body>
</html>`;
}

/**
 * Attempt to extract a title from a slide's HTML.
 * Looks for the first h1, h2, or h3 element's text content.
 * Falls back to "Slide N" if none found.
 */
function extractSlideTitle(sectionHtml, slideNumber) {
  const headingMatch = sectionHtml.match(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/i);
  if (headingMatch) {
    // Strip inner tags and trim
    const text = headingMatch[1].replace(/<[^>]+>/g, '').trim();
    if (text && text.length > 0 && text.length <= 200) {
      return text;
    }
  }
  return `Slide ${slideNumber}`;
}

// ── Core Export Functions ─────────────────────────────────────────────────────

/**
 * Create a versioned export from a generation round.
 *
 * @param {string} projectName   - The project name
 * @param {string} flowId        - The flow identifier
 * @param {string} roundId       - The round ID from apply-content
 * @param {string} outputFile    - The output HTML file name (e.g. "output-<uuid>.html")
 * @param {Array}  slideMetadata - Optional array of { slideId, name, type } per slide
 * @returns {{ exportId, exportNumber, slideCount, exportDir } | null}
 */
export function createExport(projectName, flowId, roundId, outputFile, slideMetadata = []) {
  try {
    if (!projectName || !flowId || !roundId || !outputFile) {
      throw new Error('projectName, flowId, roundId, and outputFile are required');
    }

    const flow = loadFlow(projectName, flowId);
    if (!flow) {
      throw new Error(`Flow ${projectName}/${flowId} not found`);
    }

    // Validate outputFile
    if (!/^[\w-]+\.html$/.test(outputFile)) {
      throw new Error('Invalid outputFile name');
    }

    const flowDir = resolveFlowDir(projectName, flowId);
    const outputPath = path.join(flowDir, outputFile);
    if (!fs.existsSync(outputPath)) {
      throw new Error(`Output file not found: ${outputFile}`);
    }

    // Read patched HTML
    const patchedHtml = fs.readFileSync(outputPath, 'utf8');
    const headContent = extractHeadContent(patchedHtml);
    const sections = extractSections(patchedHtml);

    if (sections.length === 0) {
      throw new Error('No slides found in output HTML');
    }

    // Determine export number
    const existingExports = flow.exports || [];
    const exportNumber = existingExports.length + 1;
    const exportId = `export-${exportNumber}`;

    // Create exports directory
    const exportsBaseDir = path.join(flowDir, 'exports');
    const exportDir = path.join(exportsBaseDir, exportId);
    fs.mkdirSync(exportDir, { recursive: true });

    // Write individual slide files
    const slideFiles = [];
    for (let i = 0; i < sections.length; i++) {
      const slideNumber = i + 1;
      const fileName = `slide-${slideNumber}.html`;
      const slideHtml = buildSlideHtml(slideNumber, sections[i], headContent);
      const slidePath = path.join(exportDir, fileName);
      fs.writeFileSync(slidePath, slideHtml, 'utf8');

      const userMeta = slideMetadata[i] || {};
      slideFiles.push({
        index: slideNumber,
        file: fileName,
        size: Buffer.byteLength(slideHtml, 'utf8'),
        title: userMeta.name || extractSlideTitle(sections[i], slideNumber),
        slideId: userMeta.slideId || `slide-${slideNumber}`,
        type: userMeta.type || 'content',
      });
    }

    const createdAt = new Date().toISOString();
    const totalSize = slideFiles.reduce((sum, s) => sum + s.size, 0);

    // Write export.json
    const exportJson = {
      exportId,
      exportNumber,
      createdAt,
      source: {
        roundId,
        outputFile,
      },
      content: {
        slideCount: sections.length,
        totalSize,
        slides: slideFiles,
      },
      metadata: {
        projectName,
        flowId,
        templateFile: flow.templateFile || '',
      },
    };
    fs.writeFileSync(
      path.join(exportDir, 'export.json'),
      JSON.stringify(exportJson, null, 2),
      'utf8'
    );

     // Write project.json (slide index)
     const projectJson = {
       name: projectName,
       exportId,
       exportNumber,
       exportedAt: createdAt,
       slideCount: sections.length,
       slides: slideFiles.map(s => ({
         index: s.index,
         file: s.file,
         slideId: s.slideId,
         title: s.title,
         type: s.type,
       })),
      };
      fs.writeFileSync(
        path.join(exportDir, 'project.json'),
        JSON.stringify(projectJson, null, 2),
        'utf8'
      );

      // Update flow.json with export entry
      const exportEntry = {
        exportId,
        exportNumber,
        createdAt,
        roundId,
        outputFile,
        slideCount: sections.length,
        totalSize,
        path: `exports/${exportId}/`,
        files: {
          metadata: `exports/${exportId}/export.json`,
          projectIndex: `exports/${exportId}/project.json`,
        },
      };

    if (!flow.exports) {
      flow.exports = [];
    }
    flow.exports.push(exportEntry);
    flow.lastExport = {
      exportId,
      createdAt,
      roundId,
      slideCount: sections.length,
    };
    flow.updatedAt = new Date().toISOString();

    if (!saveFlow(projectName, flowId, flow)) {
      throw new Error('Failed to update flow.json with export entry');
    }

    return {
      exportId,
      exportNumber,
      slideCount: sections.length,
      exportDir,
      createdAt,
    };
  } catch (err) {
    console.error('[export-manager] createExport error:', err.message);
    return null;
  }
}

/**
 * List all exports for a flow.
 *
 * @param {string} projectName
 * @param {string} flowId
 * @returns {Array} Array of export summary objects, or empty array on failure.
 */
export function listExports(projectName, flowId) {
  try {
    const flow = loadFlow(projectName, flowId);
    if (!flow) return [];
    return (flow.exports || []).slice().reverse(); // newest first
  } catch (err) {
    console.error('[export-manager] listExports error:', err.message);
    return [];
  }
}

/**
 * Get detailed information about a specific export.
 *
 * @param {string} projectName
 * @param {string} flowId
 * @param {string} exportId  e.g. "export-1"
 * @returns {object | null}  Full export.json contents, or null if not found.
 */
export function getExport(projectName, flowId, exportId) {
  try {
    const exportDir = resolveExportDir(projectName, flowId, exportId);
    if (!exportDir) return null;

    const exportJsonPath = path.join(exportDir, 'export.json');
    if (!fs.existsSync(exportJsonPath)) return null;

    return JSON.parse(fs.readFileSync(exportJsonPath, 'utf8'));
  } catch (err) {
    console.error('[export-manager] getExport error:', err.message);
    return null;
  }
}

/**
 * Get the project.json (slide index) for an export.
 *
 * @param {string} projectName
 * @param {string} flowId
 * @param {string} exportId
 * @returns {object | null}
 */
export function getExportProjectIndex(projectName, flowId, exportId) {
  try {
    const exportDir = resolveExportDir(projectName, flowId, exportId);
    if (!exportDir) return null;

    const projectJsonPath = path.join(exportDir, 'project.json');
    if (!fs.existsSync(projectJsonPath)) return null;

    return JSON.parse(fs.readFileSync(projectJsonPath, 'utf8'));
  } catch (err) {
    console.error('[export-manager] getExportProjectIndex error:', err.message);
    return null;
  }
}

/**
 * Get the path to a specific slide file within an export.
 * Returns the absolute file path if valid and exists, or null.
 *
 * @param {string} projectName
 * @param {string} flowId
 * @param {string} exportId
 * @param {string} slideFile  e.g. "slide-1.html"
 * @returns {string | null}
 */
export function resolveSlideFilePath(projectName, flowId, exportId, slideFile) {
  try {
    if (!slideFile || !/^slide-\d+\.html$/.test(slideFile)) return null;

    const exportDir = resolveExportDir(projectName, flowId, exportId);
    if (!exportDir) return null;

    const filePath = path.join(exportDir, slideFile);
    const resolvedExportDir = path.resolve(exportDir);
    if (!path.resolve(filePath).startsWith(resolvedExportDir + path.sep)) return null;

    if (!fs.existsSync(filePath)) return null;
    return filePath;
  } catch (err) {
    console.error('[export-manager] resolveSlideFilePath error:', err.message);
    return null;
  }
}

/**
 * Get the count of exports for a flow.
 *
 * @param {string} projectName
 * @param {string} flowId
 * @returns {number}
 */
export function getExportCount(projectName, flowId) {
  try {
    const flow = loadFlow(projectName, flowId);
    if (!flow) return 0;
    return (flow.exports || []).length;
  } catch (err) {
    console.error('[export-manager] getExportCount error:', err.message);
    return 0;
  }
}

/**
 * Update a slide's title in an export's export.json.
 *
 * @param {string} projectName
 * @param {string} flowId
 * @param {string} exportId
 * @param {string} slideFile - e.g. "slide-1.html"
 * @param {string} title - The new title (trimmed, max 200 chars)
 * @returns {{ ok: true, title } | throws error}
 */
export function updateSlideTitle(projectName, flowId, exportId, slideFile, title) {
  try {
    const exportDir = resolveExportDir(projectName, flowId, exportId);
    if (!exportDir) {
      throw new Error('Export not found');
    }

    const exportJsonPath = path.join(exportDir, 'export.json');
    if (!fs.existsSync(exportJsonPath)) {
      throw new Error('export.json not found');
    }

    const exportJson = JSON.parse(fs.readFileSync(exportJsonPath, 'utf8'));
    const slides = exportJson.content?.slides || [];

    const slideIndex = slides.findIndex(s => s.file === slideFile);
    if (slideIndex === -1) {
      throw new Error(`Slide ${slideFile} not found in export`);
    }

    const trimmedTitle = String(title).trim().slice(0, 200);
    if (!trimmedTitle) {
      throw new Error('Title cannot be empty');
    }

    slides[slideIndex].title = trimmedTitle;
    exportJson.content.slides = slides;

    fs.writeFileSync(exportJsonPath, JSON.stringify(exportJson, null, 2), 'utf8');

    return { ok: true, title: trimmedTitle };
  } catch (err) {
    console.error('[export-manager] updateSlideTitle error:', err.message);
    throw err;
  }
}

/**
 * Fork an export: create a new export by copying selected slides from an existing export.
 * Optionally apply overrides (edited HTML) to specific slides.
 *
 * @param {string} projectName
 * @param {string} flowId
 * @param {string} sourceExportId
 * @param {Array<string>} slideFiles - e.g. ['slide-1.html', 'slide-2.html']
 * @param {Object} overrides - e.g. { 'slide-1.html': '<html>...</html>' }
 * @returns {{ exportId: string, exportNumber: number, slideCount: number } | null}
 */
export function forkExport(projectName, flowId, sourceExportId, slideFiles, overrides = {}) {
  try {
    const sourceExportDir = resolveExportDir(projectName, flowId, sourceExportId);
    if (!sourceExportDir || !fs.existsSync(sourceExportDir)) return null;

    const flow = loadFlow(projectName, flowId);
    if (!flow) return null;

    // Get the source export metadata
    const sourceExport = getExport(projectName, flowId, sourceExportId);
    if (!sourceExport) return null;

    // Generate new export ID and number
    const exportNumber = (flow.exports || []).length + 1;
    const exportId = `export-${exportNumber}`;
    const exportDir = path.join(path.dirname(sourceExportDir), exportId);

    if (fs.existsSync(exportDir)) {
      throw new Error(`Export directory already exists: ${exportId}`);
    }

    fs.mkdirSync(exportDir, { recursive: true });

    // Copy and optionally override selected slides
    const copiedSlides = [];
    let totalSize = 0;

    for (const slideFile of slideFiles) {
      const sourceSlideFile = path.join(sourceExportDir, slideFile);
      if (!fs.existsSync(sourceSlideFile)) continue;

      let slideContent;
      if (overrides[slideFile]) {
        // Use override (edited HTML)
        slideContent = overrides[slideFile];
      } else {
        // Copy from source
        slideContent = fs.readFileSync(sourceSlideFile, 'utf8');
      }

      const destSlideFile = path.join(exportDir, slideFile);
      fs.writeFileSync(destSlideFile, slideContent, 'utf8');

      const size = Buffer.byteLength(slideContent, 'utf8');
      totalSize += size;

      // Extract slide metadata from source
      const sourceSlideMetadata = sourceExport.content?.slides?.find(s => s.file === slideFile);
      copiedSlides.push({
        file: slideFile,
        index: sourceSlideMetadata?.index || copiedSlides.length + 1,
        slideId: sourceSlideMetadata?.slideId || `slide-${copiedSlides.length + 1}`,
        title: sourceSlideMetadata?.title || `Slide ${copiedSlides.length + 1}`,
        type: sourceSlideMetadata?.type || 'content',
        size,
      });
    }

    const createdAt = new Date().toISOString();

    // Write export.json
    const exportJson = {
      exportId,
      exportNumber,
      createdAt,
      source: {
        roundId: sourceExport.source?.roundId,
        outputFile: sourceExport.source?.outputFile,
      },
      content: {
        slideCount: copiedSlides.length,
        totalSize,
        slides: copiedSlides,
      },
      metadata: {
        projectName,
        flowId,
        templateFile: sourceExport.metadata?.templateFile || '',
      },
    };

    fs.writeFileSync(
      path.join(exportDir, 'export.json'),
      JSON.stringify(exportJson, null, 2),
      'utf8'
    );

    // Write project.json
    const projectJson = {
      name: projectName,
      exportId,
      exportNumber,
      exportedAt: createdAt,
      slideCount: copiedSlides.length,
      slides: copiedSlides.map(s => ({
        index: s.index,
        file: s.file,
        slideId: s.slideId,
        title: s.title,
        type: s.type,
      })),
    };

    fs.writeFileSync(
      path.join(exportDir, 'project.json'),
      JSON.stringify(projectJson, null, 2),
      'utf8'
    );

    // Update flow.json
    const exportEntry = {
      exportId,
      exportNumber,
      createdAt,
      roundId: sourceExport.source?.roundId,
      outputFile: sourceExport.source?.outputFile,
      slideCount: copiedSlides.length,
      totalSize,
      path: `exports/${exportId}/`,
      files: {
        metadata: `exports/${exportId}/export.json`,
        projectIndex: `exports/${exportId}/project.json`,
      },
    };

    if (!flow.exports) {
      flow.exports = [];
    }
    flow.exports.push(exportEntry);
    flow.lastExport = {
      exportId,
      createdAt,
      roundId: sourceExport.source?.roundId,
      slideCount: copiedSlides.length,
    };
    flow.updatedAt = createdAt;

    if (!saveFlow(projectName, flowId, flow)) {
      throw new Error('Failed to update flow.json with fork export entry');
    }

    return {
      exportId,
      exportNumber,
      slideCount: copiedSlides.length,
    };
  } catch (err) {
    console.error('[export-manager] forkExport error:', err.message);
    return null;
  }
}

/**
 * Delete a single slide from an export.
 * Removes the slide file from disk and updates project.json.
 *
 * @param {string} projectName
 * @param {string} flowId
 * @param {string} exportId
 * @param {string} slideFile - e.g. "slide-1.html"
 * @returns {{ ok: true } | { ok: false, error: string }}
 */
export function deleteSlide(projectName, flowId, exportId, slideFile) {
  try {
    // Validate slideFile parameter
    if (!slideFile || !/^slide-\d+\.html$/.test(slideFile)) {
      return { ok: false, error: 'Invalid slideFile parameter. Must match pattern: slide-N.html' };
    }

    const exportDir = resolveExportDir(projectName, flowId, exportId);
    if (!exportDir) {
      return { ok: false, error: 'Export not found' };
    }

    const slidePath = path.join(exportDir, slideFile);
    const resolvedExportDir = path.resolve(exportDir);
    if (!path.resolve(slidePath).startsWith(resolvedExportDir + path.sep)) {
      return { ok: false, error: 'Invalid slide file path' };
    }

    // Check if slide file exists
    if (!fs.existsSync(slidePath)) {
      return { ok: false, error: `Slide file not found: ${slideFile}` };
    }

    // Load project.json
    const projectJsonPath = path.join(exportDir, 'project.json');
    if (!fs.existsSync(projectJsonPath)) {
      return { ok: false, error: 'project.json not found' };
    }

    const projectJson = JSON.parse(fs.readFileSync(projectJsonPath, 'utf8'));

    // Find and remove the slide from the slides array
    const slideIndex = projectJson.slides.findIndex(s => s.file === slideFile);
    if (slideIndex === -1) {
      return { ok: false, error: `Slide ${slideFile} not found in project index` };
    }

    projectJson.slides.splice(slideIndex, 1);
    projectJson.slideCount = projectJson.slides.length;

    // Delete the slide file from disk
    try {
      fs.unlinkSync(slidePath);
    } catch (err) {
      return { ok: false, error: `Failed to delete slide file: ${err.message}` };
    }

    // Save updated project.json
    try {
      fs.writeFileSync(projectJsonPath, JSON.stringify(projectJson, null, 2), 'utf8');
    } catch (err) {
      return { ok: false, error: `Failed to update project.json: ${err.message}` };
    }

    // Update export.json if it exists
    const exportJsonPath = path.join(exportDir, 'export.json');
    if (fs.existsSync(exportJsonPath)) {
      try {
        const exportJson = JSON.parse(fs.readFileSync(exportJsonPath, 'utf8'));
        if (exportJson.content?.slides) {
          const exportSlideIndex = exportJson.content.slides.findIndex(s => s.file === slideFile);
          if (exportSlideIndex !== -1) {
            exportJson.content.slides.splice(exportSlideIndex, 1);
            exportJson.content.slideCount = exportJson.content.slides.length;
            fs.writeFileSync(exportJsonPath, JSON.stringify(exportJson, null, 2), 'utf8');
          }
        }
      } catch (err) {
        console.warn('[export-manager] Failed to update export.json:', err.message);
        // Don't fail the operation if export.json update fails
      }
    }

    return { ok: true };
  } catch (err) {
    console.error('[export-manager] deleteSlide error:', err.message);
    return { ok: false, error: err.message };
  }
}

/**
 * Delete an export and its files from disk.
 * Also removes the entry from flow.json.
 *
 * @param {string} projectName
 * @param {string} flowId
 * @param {string} exportId
 * @returns {boolean}
 */
export function deleteExport(projectName, flowId, exportId) {
  try {
    const exportDir = resolveExportDir(projectName, flowId, exportId);
    if (!exportDir) return false;

    const flow = loadFlow(projectName, flowId);
    if (!flow) return false;

    const exports = flow.exports || [];
    const index = exports.findIndex(e => e.exportId === exportId);
    if (index === -1) return false;

    // Remove from flow.json first
    exports.splice(index, 1);
    flow.exports = exports;

    // Update lastExport if needed
    if (flow.lastExport?.exportId === exportId) {
      const remaining = exports;
      flow.lastExport = remaining.length > 0
        ? { exportId: remaining[remaining.length - 1].exportId, createdAt: remaining[remaining.length - 1].createdAt, roundId: remaining[remaining.length - 1].roundId, slideCount: remaining[remaining.length - 1].slideCount }
        : null;
    }

    flow.updatedAt = new Date().toISOString();
    if (!saveFlow(projectName, flowId, flow)) return false;

    // Remove directory from disk
    if (fs.existsSync(exportDir)) {
      fs.rmSync(exportDir, { recursive: true, force: true });
    }

    return true;
  } catch (err) {
    console.error('[export-manager] deleteExport error:', err.message);
    return false;
  }
}

/**
 * Build a ZIP archive of an export as a Buffer.
 * Uses a simple tar-like approach: concatenates files with headers.
 * For simplicity this produces a zip-compatible archive using the
 * built-in zlib + manual zip format, or falls back to a plain JSON manifest
 * if zip construction fails.
 *
 * @param {string} projectName
 * @param {string} flowId
 * @param {string} exportId
 * @returns {{ buffer: Buffer, filename: string } | null}
 */
export function buildExportZip(projectName, flowId, exportId) {
  try {
    const exportDir = resolveExportDir(projectName, flowId, exportId);
    if (!exportDir) return null;

    if (!fs.existsSync(exportDir)) return null;

    // Collect all files in the export directory
    const files = fs.readdirSync(exportDir).filter(f => {
      const fullPath = path.join(exportDir, f);
      return fs.statSync(fullPath).isFile();
    });

    if (files.length === 0) return null;

    // Build a minimal ZIP archive manually
    // ZIP format: local file headers + data + central directory + end of central directory
    const fileEntries = [];

    for (const fileName of files) {
      const filePath = path.join(exportDir, fileName);
      const fileData = fs.readFileSync(filePath);
      fileEntries.push({ name: fileName, data: fileData });
    }

    const zipBuffer = buildZipBuffer(fileEntries);
    const safeName = (projectName || 'export').replace(/[^a-z0-9_-]/gi, '_');
    const filename = `${safeName}-${exportId}.zip`;

    return { buffer: zipBuffer, filename };
  } catch (err) {
    console.error('[export-manager] buildExportZip error:', err.message);
    return null;
  }
}

// ── Minimal ZIP builder ───────────────────────────────────────────────────────

/**
 * Build a minimal ZIP archive buffer from an array of { name, data: Buffer } entries.
 * Implements ZIP format (PKZIP spec) without compression (stored method).
 */
function buildZipBuffer(entries) {
  const localHeaders = [];
  const centralHeaders = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuffer = Buffer.from(entry.name, 'utf8');
    const crc = crc32(entry.data);
    const size = entry.data.length;

    // Local file header
    const localHeader = Buffer.alloc(30 + nameBuffer.length);
    localHeader.writeUInt32LE(0x04034b50, 0);  // signature
    localHeader.writeUInt16LE(20, 4);           // version needed
    localHeader.writeUInt16LE(0, 6);            // flags
    localHeader.writeUInt16LE(0, 8);            // compression: stored
    localHeader.writeUInt16LE(0, 10);           // mod time
    localHeader.writeUInt16LE(0, 12);           // mod date
    localHeader.writeUInt32LE(crc, 14);         // CRC-32
    localHeader.writeUInt32LE(size, 18);        // compressed size
    localHeader.writeUInt32LE(size, 22);        // uncompressed size
    localHeader.writeUInt16LE(nameBuffer.length, 26); // file name length
    localHeader.writeUInt16LE(0, 28);           // extra field length
    nameBuffer.copy(localHeader, 30);

    // Central directory header
    const centralHeader = Buffer.alloc(46 + nameBuffer.length);
    centralHeader.writeUInt32LE(0x02014b50, 0);  // signature
    centralHeader.writeUInt16LE(20, 4);           // version made by
    centralHeader.writeUInt16LE(20, 6);           // version needed
    centralHeader.writeUInt16LE(0, 8);            // flags
    centralHeader.writeUInt16LE(0, 10);           // compression: stored
    centralHeader.writeUInt16LE(0, 12);           // mod time
    centralHeader.writeUInt16LE(0, 14);           // mod date
    centralHeader.writeUInt32LE(crc, 16);         // CRC-32
    centralHeader.writeUInt32LE(size, 20);        // compressed size
    centralHeader.writeUInt32LE(size, 24);        // uncompressed size
    centralHeader.writeUInt16LE(nameBuffer.length, 28); // file name length
    centralHeader.writeUInt16LE(0, 30);           // extra field length
    centralHeader.writeUInt16LE(0, 32);           // comment length
    centralHeader.writeUInt16LE(0, 34);           // disk number start
    centralHeader.writeUInt16LE(0, 36);           // internal attrs
    centralHeader.writeUInt32LE(0, 38);           // external attrs
    centralHeader.writeUInt32LE(offset, 42);      // relative offset of local header
    nameBuffer.copy(centralHeader, 46);

    localHeaders.push(localHeader, entry.data);
    centralHeaders.push(centralHeader);
    offset += localHeader.length + size;
  }

  const centralDirOffset = offset;
  const centralDirBuffer = Buffer.concat(centralHeaders);
  const centralDirSize = centralDirBuffer.length;

  // End of central directory record
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);            // signature
  eocd.writeUInt16LE(0, 4);                      // disk number
  eocd.writeUInt16LE(0, 6);                      // disk with central dir
  eocd.writeUInt16LE(entries.length, 8);         // entries on this disk
  eocd.writeUInt16LE(entries.length, 10);        // total entries
  eocd.writeUInt32LE(centralDirSize, 12);        // central dir size
  eocd.writeUInt32LE(centralDirOffset, 16);      // central dir offset
  eocd.writeUInt16LE(0, 20);                     // comment length

  return Buffer.concat([...localHeaders, centralDirBuffer, eocd]);
}

/**
 * Compute CRC-32 checksum of a Buffer.
 */
function crc32(buf) {
  const table = getCrc32Table();
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xFF];
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

let _crc32Table = null;
function getCrc32Table() {
  if (_crc32Table) return _crc32Table;
  _crc32Table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    _crc32Table[i] = c;
  }
  return _crc32Table;
}
