/**
 * server/lib/export-manager.js
 *
 * Phase 3: Versioned Exports & Slide Metadata
 *
 * Manages versioned exports for HTML flow chains.
 * Each export captures a generation round's output as individual slide files
 * with metadata, providing a full history of exported versions.
 *
 * Directory structure per chain:
 *   server/chains/<chainId>/exports/
 *     export-1/
 *       export.json        — export metadata
 *       project.json       — slide index
 *       slide-1.html       — self-contained slide HTML
 *       slide-2.html
 *       ...
 *     export-2/
 *       ...
 */

import fs   from 'fs';
import path from 'path';
import { CHAINS_DIR, isInsideDir } from '../config.js';

// ── Security helpers ──────────────────────────────────────────────────────────

/**
 * Validate a chainId and return safe chain directory path, or null.
 */
function resolveChainDir(chainId) {
  if (!chainId || typeof chainId !== 'string') return null;
  if (!/^[\w-]{1,100}$/.test(chainId)) return null;
  const chainDir = path.join(CHAINS_DIR, chainId);
  const resolved = path.resolve(CHAINS_DIR);
  const resolvedChainDir = path.resolve(chainDir);
  if (!resolvedChainDir.startsWith(resolved + path.sep) && resolvedChainDir !== resolved) return null;
  return chainDir;
}

/**
 * Validate an exportId and return safe export directory path, or null.
 */
function resolveExportDir(chainId, exportId) {
  const chainDir = resolveChainDir(chainId);
  if (!chainDir) return null;
  if (!exportId || typeof exportId !== 'string') return null;
  if (!/^export-\d+$/.test(exportId)) return null;
  const exportDir = path.join(chainDir, 'exports', exportId);
  const resolvedChain = path.resolve(chainDir);
  if (!path.resolve(exportDir).startsWith(resolvedChain + path.sep)) return null;
  return exportDir;
}

// ── Chain I/O ─────────────────────────────────────────────────────────────────

function loadChain(chainId) {
  const chainDir = resolveChainDir(chainId);
  if (!chainDir) return null;
  const chainPath = path.join(chainDir, 'chain.json');
  if (!fs.existsSync(chainPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(chainPath, 'utf8'));
  } catch (err) {
    console.error(`[export-manager] Failed to load chain ${chainId}:`, err.message);
    return null;
  }
}

function saveChain(chainId, chain) {
  const chainDir = resolveChainDir(chainId);
  if (!chainDir) return false;
  const chainPath = path.join(chainDir, 'chain.json');
  try {
    fs.writeFileSync(chainPath, JSON.stringify(chain, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error(`[export-manager] Failed to save chain ${chainId}:`, err.message);
    return false;
  }
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
 * @param {string} chainId       - The chain identifier
 * @param {string} roundId       - The round ID from apply-content
 * @param {string} outputFile    - The output HTML file name (e.g. "output-<uuid>.html")
 * @param {Array}  slideMetadata - Optional array of { slideId, name, type } per slide
 * @returns {{ exportId, exportNumber, slideCount, exportDir } | null}
 */
export function createExport(chainId, roundId, outputFile, slideMetadata = []) {
  try {
    if (!chainId || !roundId || !outputFile) {
      throw new Error('chainId, roundId, and outputFile are required');
    }

    const chain = loadChain(chainId);
    if (!chain) {
      throw new Error(`Chain ${chainId} not found`);
    }

    // Validate outputFile
    if (!/^[\w-]+\.html$/.test(outputFile)) {
      throw new Error('Invalid outputFile name');
    }

    const chainDir = resolveChainDir(chainId);
    const outputPath = path.join(chainDir, outputFile);
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
    const existingExports = chain.exports || [];
    const exportNumber = existingExports.length + 1;
    const exportId = `export-${exportNumber}`;

    // Create exports directory
    const exportsBaseDir = path.join(chainDir, 'exports');
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
        projectName: chain.projectName || '',
        chainId,
        templateFile: chain.templateFile || '',
      },
    };
    fs.writeFileSync(
      path.join(exportDir, 'export.json'),
      JSON.stringify(exportJson, null, 2),
      'utf8'
    );

     // Write project.json (slide index)
     const projectJson = {
       name: chain.projectName || '',
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

     // Write slides-manifest.json (Phase 4: Hierarchical Relationships)
     const slidesManifest = {
       exportId,
       flowId: chainId,
       exportedAt: createdAt,
       slideCount: sections.length,
       slides: slideFiles.map(s => ({
         index: s.index,
         file: s.file,
         slideId: s.slideId,
         title: s.title,
         type: s.type,
         metadata: {},
         relationships: [],
       })),
       relationshipTypes: [
         {
           id: 'child_of',
           label: 'is a model of',
           inverse: 'has_models',
           cardinality: 'many_to_one',
         },
       ],
     };
     fs.writeFileSync(
       path.join(exportDir, 'slides-manifest.json'),
       JSON.stringify(slidesManifest, null, 2),
       'utf8'
     );

     // Update chain.json with export entry
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
         manifest: `exports/${exportId}/slides-manifest.json`,
       },
     };

    if (!chain.exports) {
      chain.exports = [];
    }
    chain.exports.push(exportEntry);
    chain.lastExport = {
      exportId,
      createdAt,
      roundId,
      slideCount: sections.length,
    };
    chain.updatedAt = new Date().toISOString();

    if (!saveChain(chainId, chain)) {
      throw new Error('Failed to update chain.json with export entry');
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
 * List all exports for a chain.
 *
 * @param {string} chainId
 * @returns {Array} Array of export summary objects, or empty array on failure.
 */
export function listExports(chainId) {
  try {
    const chain = loadChain(chainId);
    if (!chain) return [];
    return (chain.exports || []).slice().reverse(); // newest first
  } catch (err) {
    console.error('[export-manager] listExports error:', err.message);
    return [];
  }
}

/**
 * Get detailed information about a specific export.
 *
 * @param {string} chainId
 * @param {string} exportId  e.g. "export-1"
 * @returns {object | null}  Full export.json contents, or null if not found.
 */
export function getExport(chainId, exportId) {
  try {
    const exportDir = resolveExportDir(chainId, exportId);
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
 * @param {string} chainId
 * @param {string} exportId
 * @returns {object | null}
 */
export function getExportProjectIndex(chainId, exportId) {
  try {
    const exportDir = resolveExportDir(chainId, exportId);
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
 * @param {string} chainId
 * @param {string} exportId
 * @param {string} slideFile  e.g. "slide-1.html"
 * @returns {string | null}
 */
export function resolveSlideFilePath(chainId, exportId, slideFile) {
  try {
    if (!slideFile || !/^slide-\d+\.html$/.test(slideFile)) return null;

    const exportDir = resolveExportDir(chainId, exportId);
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
 * Get the count of exports for a chain.
 *
 * @param {string} chainId
 * @returns {number}
 */
export function getExportCount(chainId) {
  try {
    const chain = loadChain(chainId);
    if (!chain) return 0;
    return (chain.exports || []).length;
  } catch (err) {
    console.error('[export-manager] getExportCount error:', err.message);
    return 0;
  }
}

/**
 * Delete an export and its files from disk.
 * Also removes the entry from chain.json.
 *
 * @param {string} chainId
 * @param {string} exportId
 * @returns {boolean}
 */
export function deleteExport(chainId, exportId) {
  try {
    const exportDir = resolveExportDir(chainId, exportId);
    if (!exportDir) return false;

    const chain = loadChain(chainId);
    if (!chain) return false;

    const exports = chain.exports || [];
    const index = exports.findIndex(e => e.exportId === exportId);
    if (index === -1) return false;

    // Remove from chain.json first
    exports.splice(index, 1);
    chain.exports = exports;

    // Update lastExport if needed
    if (chain.lastExport?.exportId === exportId) {
      const remaining = exports;
      chain.lastExport = remaining.length > 0
        ? { exportId: remaining[remaining.length - 1].exportId, createdAt: remaining[remaining.length - 1].createdAt, roundId: remaining[remaining.length - 1].roundId, slideCount: remaining[remaining.length - 1].slideCount }
        : null;
    }

    chain.updatedAt = new Date().toISOString();
    if (!saveChain(chainId, chain)) return false;

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
 * @param {string} chainId
 * @param {string} exportId
 * @returns {{ buffer: Buffer, filename: string } | null}
 */
export function buildExportZip(chainId, exportId) {
  try {
    const exportDir = resolveExportDir(chainId, exportId);
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
    const chain = loadChain(chainId);
    const projectName = (chain?.projectName || 'export').replace(/[^a-z0-9_-]/gi, '_');
    const filename = `${projectName}-${exportId}.zip`;

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
