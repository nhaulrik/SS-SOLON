/**
 * server/__tests__/export-manager.test.js
 *
 * Unit tests for Phase 3: Versioned Exports & Slide Metadata
 * Tests the export-manager.js module.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_CHAINS_DIR = path.join(__dirname, '../../test-chains-export');

// Set test environment BEFORE importing export-manager
process.env.CHAINS_DIR = TEST_CHAINS_DIR;

const {
  createExport,
  listExports,
  getExport,
  getExportProjectIndex,
  resolveSlideFilePath,
  getExportCount,
  deleteExport,
  buildExportZip,
} = await import('../lib/export-manager.js');

// ── Test fixtures ─────────────────────────────────────────────────────────────

const samplePatchedHtml = `<!DOCTYPE html>
<html>
<head>
  <title>Test Template</title>
  <style>body { margin: 0; } section { width: 1280px; height: 720px; }</style>
</head>
<body>
  <section>
    <h1>Registration Initiative</h1>
    <p>This is slide one content.</p>
  </section>
  <section>
    <h2>Budget Overview</h2>
    <p>This is slide two content.</p>
  </section>
</body>
</html>`;

const singleSlideHtml = `<!DOCTYPE html>
<html>
<head>
  <title>Single Slide</title>
  <style>section { width: 1280px; height: 720px; }</style>
</head>
<body>
  <section>
    <h1>Only Slide</h1>
    <p>Just one slide here.</p>
  </section>
</body>
</html>`;

/**
 * Create a test chain with an output file.
 */
function createTestChain(chainId, patchedHtml = samplePatchedHtml) {
  const chainDir = path.join(TEST_CHAINS_DIR, chainId);
  fs.mkdirSync(chainDir, { recursive: true });

  const templatePath = path.join(chainDir, 'template.html');
  fs.writeFileSync(templatePath, patchedHtml, 'utf8');

  const roundId = 'test-round-uuid';
  const outputFile = `output-${roundId}.html`;
  fs.writeFileSync(path.join(chainDir, outputFile), patchedHtml, 'utf8');

  const chainJson = {
    id: chainId,
    flow: 'html',
    projectName: 'test-project',
    templateFile: 'template.html',
    templatePath,
    slideCount: 2,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    zones: [],
    rounds: [{ id: roundId, appliedAt: new Date().toISOString(), outputFile }],
    exports: [],
  };

  fs.writeFileSync(
    path.join(chainDir, 'chain.json'),
    JSON.stringify(chainJson, null, 2),
    'utf8'
  );

  return { chainDir, roundId, outputFile };
}

function cleanupTestChains() {
  if (fs.existsSync(TEST_CHAINS_DIR)) {
    fs.rmSync(TEST_CHAINS_DIR, { recursive: true, force: true });
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('export-manager', () => {
  beforeEach(() => {
    cleanupTestChains();
    fs.mkdirSync(TEST_CHAINS_DIR, { recursive: true });
  });

  afterEach(() => {
    cleanupTestChains();
  });

  // ── createExport ───────────────────────────────────────────────────────────

  describe('createExport', () => {
    it('should create an export with individual slide files', () => {
      const chainId = 'chain-test-create';
      const { roundId, outputFile } = createTestChain(chainId);

      const result = createExport(chainId, roundId, outputFile);

      expect(result).not.toBeNull();
      expect(result.exportId).toBe('export-1');
      expect(result.exportNumber).toBe(1);
      expect(result.slideCount).toBe(2);
      expect(result.createdAt).toBeDefined();
    });

    it('should create export directory with correct files', () => {
      const chainId = 'chain-test-files';
      const { roundId, outputFile } = createTestChain(chainId);

      const result = createExport(chainId, roundId, outputFile);

      const exportDir = path.join(TEST_CHAINS_DIR, chainId, 'exports', 'export-1');
      expect(fs.existsSync(exportDir)).toBe(true);
      expect(fs.existsSync(path.join(exportDir, 'export.json'))).toBe(true);
      expect(fs.existsSync(path.join(exportDir, 'project.json'))).toBe(true);
      expect(fs.existsSync(path.join(exportDir, 'slide-1.html'))).toBe(true);
      expect(fs.existsSync(path.join(exportDir, 'slide-2.html'))).toBe(true);
    });

    it('should write valid export.json', () => {
      const chainId = 'chain-test-exportjson';
      const { roundId, outputFile } = createTestChain(chainId);

      createExport(chainId, roundId, outputFile);

      const exportJsonPath = path.join(TEST_CHAINS_DIR, chainId, 'exports', 'export-1', 'export.json');
      const exportData = JSON.parse(fs.readFileSync(exportJsonPath, 'utf8'));

      expect(exportData.exportId).toBe('export-1');
      expect(exportData.exportNumber).toBe(1);
      expect(exportData.source.roundId).toBe(roundId);
      expect(exportData.source.outputFile).toBe(outputFile);
      expect(exportData.content.slideCount).toBe(2);
      expect(exportData.content.slides).toHaveLength(2);
      expect(exportData.metadata.chainId).toBe(chainId);
    });

    it('should write valid project.json slide index', () => {
      const chainId = 'chain-test-projectjson';
      const { roundId, outputFile } = createTestChain(chainId);

      createExport(chainId, roundId, outputFile);

      const projectJsonPath = path.join(TEST_CHAINS_DIR, chainId, 'exports', 'export-1', 'project.json');
      const projectData = JSON.parse(fs.readFileSync(projectJsonPath, 'utf8'));

      expect(projectData.exportId).toBe('export-1');
      expect(projectData.slideCount).toBe(2);
      expect(projectData.slides).toHaveLength(2);
      expect(projectData.slides[0].file).toBe('slide-1.html');
      expect(projectData.slides[1].file).toBe('slide-2.html');
      expect(projectData.slides[0].index).toBe(1);
      expect(projectData.slides[1].index).toBe(2);
    });

    it('should create self-contained slide HTML with head content', () => {
      const chainId = 'chain-test-slidehtml';
      const { roundId, outputFile } = createTestChain(chainId);

      createExport(chainId, roundId, outputFile);

      const slide1Path = path.join(TEST_CHAINS_DIR, chainId, 'exports', 'export-1', 'slide-1.html');
      const slideHtml = fs.readFileSync(slide1Path, 'utf8');

      // Should be a complete HTML document
      expect(slideHtml).toContain('<!DOCTYPE html>');
      expect(slideHtml).toContain('<html>');
      expect(slideHtml).toContain('</html>');
      // Should include head content (styles)
      expect(slideHtml).toContain('<style>');
      // Should include the section content
      expect(slideHtml).toContain('<section>');
      expect(slideHtml).toContain('Registration Initiative');
    });

    it('should extract slide title from h1 heading', () => {
      const chainId = 'chain-test-title';
      const { roundId, outputFile } = createTestChain(chainId);

      createExport(chainId, roundId, outputFile);

      const exportJsonPath = path.join(TEST_CHAINS_DIR, chainId, 'exports', 'export-1', 'export.json');
      const exportData = JSON.parse(fs.readFileSync(exportJsonPath, 'utf8'));

      expect(exportData.content.slides[0].title).toBe('Registration Initiative');
    });

    it('should use provided slide metadata when given', () => {
      const chainId = 'chain-test-metadata';
      const { roundId, outputFile } = createTestChain(chainId);

      const slideMetadata = [
        { slideId: 'reg-initiative', name: 'Registration Initiative', type: 'title' },
        { slideId: 'budget-overview', name: 'Budget Overview', type: 'content' },
      ];

      createExport(chainId, roundId, outputFile, slideMetadata);

      const exportJsonPath = path.join(TEST_CHAINS_DIR, chainId, 'exports', 'export-1', 'export.json');
      const exportData = JSON.parse(fs.readFileSync(exportJsonPath, 'utf8'));

      expect(exportData.content.slides[0].slideId).toBe('reg-initiative');
      expect(exportData.content.slides[0].title).toBe('Registration Initiative');
      expect(exportData.content.slides[0].type).toBe('title');
      expect(exportData.content.slides[1].slideId).toBe('budget-overview');
    });

    it('should update chain.json with export entry', () => {
      const chainId = 'chain-test-chainupdate';
      const { roundId, outputFile } = createTestChain(chainId);

      createExport(chainId, roundId, outputFile);

      const chainPath = path.join(TEST_CHAINS_DIR, chainId, 'chain.json');
      const chain = JSON.parse(fs.readFileSync(chainPath, 'utf8'));

      expect(chain.exports).toHaveLength(1);
      expect(chain.exports[0].exportId).toBe('export-1');
      expect(chain.exports[0].roundId).toBe(roundId);
      expect(chain.lastExport).toBeDefined();
      expect(chain.lastExport.exportId).toBe('export-1');
    });

    it('should increment export number for subsequent exports', () => {
      const chainId = 'chain-test-increment';
      const { roundId, outputFile } = createTestChain(chainId);

      const result1 = createExport(chainId, roundId, outputFile);
      const result2 = createExport(chainId, roundId, outputFile);

      expect(result1.exportId).toBe('export-1');
      expect(result1.exportNumber).toBe(1);
      expect(result2.exportId).toBe('export-2');
      expect(result2.exportNumber).toBe(2);

      const chainPath = path.join(TEST_CHAINS_DIR, chainId, 'chain.json');
      const chain = JSON.parse(fs.readFileSync(chainPath, 'utf8'));
      expect(chain.exports).toHaveLength(2);
    });

    it('should return null for missing chainId', () => {
      const result = createExport(null, 'round-1', 'output.html');
      expect(result).toBeNull();
    });

    it('should return null for missing roundId', () => {
      const chainId = 'chain-test-missing-round';
      createTestChain(chainId);
      const result = createExport(chainId, null, 'output.html');
      expect(result).toBeNull();
    });

    it('should return null for non-existent output file', () => {
      const chainId = 'chain-test-missing-output';
      const { roundId } = createTestChain(chainId);
      const result = createExport(chainId, roundId, 'output-nonexistent.html');
      expect(result).toBeNull();
    });

    it('should return null for invalid outputFile name', () => {
      const chainId = 'chain-test-invalid-output';
      const { roundId } = createTestChain(chainId);
      const result = createExport(chainId, roundId, '../../../etc/passwd');
      expect(result).toBeNull();
    });

    it('should handle single-slide HTML', () => {
      const chainId = 'chain-test-single';
      const chainDir = path.join(TEST_CHAINS_DIR, chainId);
      fs.mkdirSync(chainDir, { recursive: true });

      const roundId = 'single-round';
      const outputFile = `output-${roundId}.html`;
      fs.writeFileSync(path.join(chainDir, outputFile), singleSlideHtml, 'utf8');
      fs.writeFileSync(path.join(chainDir, 'template.html'), singleSlideHtml, 'utf8');

      const chainJson = {
        id: chainId,
        flow: 'html',
        projectName: 'single-slide-project',
        templateFile: 'template.html',
        templatePath: path.join(chainDir, 'template.html'),
        slideCount: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        zones: [],
        rounds: [{ id: roundId, appliedAt: new Date().toISOString(), outputFile }],
        exports: [],
      };
      fs.writeFileSync(path.join(chainDir, 'chain.json'), JSON.stringify(chainJson, null, 2), 'utf8');

      const result = createExport(chainId, roundId, outputFile);

      expect(result).not.toBeNull();
      expect(result.slideCount).toBe(1);

      const exportDir = path.join(chainDir, 'exports', 'export-1');
      expect(fs.existsSync(path.join(exportDir, 'slide-1.html'))).toBe(true);
      expect(fs.existsSync(path.join(exportDir, 'slide-2.html'))).toBe(false);
    });
  });

  // ── listExports ────────────────────────────────────────────────────────────

  describe('listExports', () => {
    it('should return empty array for chain with no exports', () => {
      const chainId = 'chain-test-list-empty';
      createTestChain(chainId);

      const exports = listExports(chainId);
      expect(exports).toEqual([]);
    });

    it('should list exports newest first', () => {
      const chainId = 'chain-test-list-order';
      const { roundId, outputFile } = createTestChain(chainId);

      createExport(chainId, roundId, outputFile);
      createExport(chainId, roundId, outputFile);
      createExport(chainId, roundId, outputFile);

      const exports = listExports(chainId);
      expect(exports).toHaveLength(3);
      // Newest first: export-3, export-2, export-1
      expect(exports[0].exportId).toBe('export-3');
      expect(exports[1].exportId).toBe('export-2');
      expect(exports[2].exportId).toBe('export-1');
    });

    it('should return empty array for non-existent chain', () => {
      const exports = listExports('chain-nonexistent');
      expect(exports).toEqual([]);
    });

    it('should return empty array for invalid chainId', () => {
      const exports = listExports(null);
      expect(exports).toEqual([]);
    });
  });

  // ── getExport ──────────────────────────────────────────────────────────────

  describe('getExport', () => {
    it('should return export.json data for valid export', () => {
      const chainId = 'chain-test-get';
      const { roundId, outputFile } = createTestChain(chainId);
      createExport(chainId, roundId, outputFile);

      const exportData = getExport(chainId, 'export-1');

      expect(exportData).not.toBeNull();
      expect(exportData.exportId).toBe('export-1');
      expect(exportData.exportNumber).toBe(1);
      expect(exportData.source.roundId).toBe(roundId);
    });

    it('should return null for non-existent export', () => {
      const chainId = 'chain-test-get-missing';
      createTestChain(chainId);

      const exportData = getExport(chainId, 'export-99');
      expect(exportData).toBeNull();
    });

    it('should return null for invalid exportId', () => {
      const chainId = 'chain-test-get-invalid';
      createTestChain(chainId);

      const exportData = getExport(chainId, '../../../etc/passwd');
      expect(exportData).toBeNull();
    });

    it('should return null for invalid chainId', () => {
      const exportData = getExport(null, 'export-1');
      expect(exportData).toBeNull();
    });
  });

  // ── getExportProjectIndex ──────────────────────────────────────────────────

  describe('getExportProjectIndex', () => {
    it('should return project.json data for valid export', () => {
      const chainId = 'chain-test-project-index';
      const { roundId, outputFile } = createTestChain(chainId);
      createExport(chainId, roundId, outputFile);

      const projectIndex = getExportProjectIndex(chainId, 'export-1');

      expect(projectIndex).not.toBeNull();
      expect(projectIndex.exportId).toBe('export-1');
      expect(projectIndex.slideCount).toBe(2);
      expect(projectIndex.slides).toHaveLength(2);
    });

    it('should return null for non-existent export', () => {
      const chainId = 'chain-test-project-missing';
      createTestChain(chainId);

      const projectIndex = getExportProjectIndex(chainId, 'export-99');
      expect(projectIndex).toBeNull();
    });
  });

  // ── resolveSlideFilePath ───────────────────────────────────────────────────

  describe('resolveSlideFilePath', () => {
    it('should return valid path for existing slide file', () => {
      const chainId = 'chain-test-slide-path';
      const { roundId, outputFile } = createTestChain(chainId);
      createExport(chainId, roundId, outputFile);

      const filePath = resolveSlideFilePath(chainId, 'export-1', 'slide-1.html');
      expect(filePath).not.toBeNull();
      expect(fs.existsSync(filePath)).toBe(true);
    });

    it('should return null for non-existent slide file', () => {
      const chainId = 'chain-test-slide-missing';
      const { roundId, outputFile } = createTestChain(chainId);
      createExport(chainId, roundId, outputFile);

      const filePath = resolveSlideFilePath(chainId, 'export-1', 'slide-99.html');
      expect(filePath).toBeNull();
    });

    it('should return null for invalid slide file name (path traversal)', () => {
      const chainId = 'chain-test-slide-traversal';
      createTestChain(chainId);

      const filePath = resolveSlideFilePath(chainId, 'export-1', '../../../etc/passwd');
      expect(filePath).toBeNull();
    });

    it('should return null for invalid slide file pattern', () => {
      const chainId = 'chain-test-slide-pattern';
      createTestChain(chainId);

      const filePath = resolveSlideFilePath(chainId, 'export-1', 'not-a-slide.html');
      expect(filePath).toBeNull();
    });

    it('should return null for invalid exportId', () => {
      const chainId = 'chain-test-slide-invalid-export';
      createTestChain(chainId);

      const filePath = resolveSlideFilePath(chainId, '../bad-export', 'slide-1.html');
      expect(filePath).toBeNull();
    });
  });

  // ── getExportCount ─────────────────────────────────────────────────────────

  describe('getExportCount', () => {
    it('should return 0 for chain with no exports', () => {
      const chainId = 'chain-test-count-zero';
      createTestChain(chainId);

      expect(getExportCount(chainId)).toBe(0);
    });

    it('should return correct count after creating exports', () => {
      const chainId = 'chain-test-count';
      const { roundId, outputFile } = createTestChain(chainId);

      createExport(chainId, roundId, outputFile);
      expect(getExportCount(chainId)).toBe(1);

      createExport(chainId, roundId, outputFile);
      expect(getExportCount(chainId)).toBe(2);
    });

    it('should return 0 for non-existent chain', () => {
      expect(getExportCount('chain-nonexistent')).toBe(0);
    });
  });

  // ── deleteExport ───────────────────────────────────────────────────────────

  describe('deleteExport', () => {
    it('should delete export directory and update chain.json', () => {
      const chainId = 'chain-test-delete';
      const { roundId, outputFile } = createTestChain(chainId);
      createExport(chainId, roundId, outputFile);

      const exportDir = path.join(TEST_CHAINS_DIR, chainId, 'exports', 'export-1');
      expect(fs.existsSync(exportDir)).toBe(true);

      const success = deleteExport(chainId, 'export-1');
      expect(success).toBe(true);
      expect(fs.existsSync(exportDir)).toBe(false);

      const chainPath = path.join(TEST_CHAINS_DIR, chainId, 'chain.json');
      const chain = JSON.parse(fs.readFileSync(chainPath, 'utf8'));
      expect(chain.exports).toHaveLength(0);
      expect(chain.lastExport).toBeNull();
    });

    it('should update lastExport to previous when deleting latest', () => {
      const chainId = 'chain-test-delete-last';
      const { roundId, outputFile } = createTestChain(chainId);
      createExport(chainId, roundId, outputFile);
      createExport(chainId, roundId, outputFile);

      deleteExport(chainId, 'export-2');

      const chainPath = path.join(TEST_CHAINS_DIR, chainId, 'chain.json');
      const chain = JSON.parse(fs.readFileSync(chainPath, 'utf8'));
      expect(chain.exports).toHaveLength(1);
      expect(chain.lastExport.exportId).toBe('export-1');
    });

    it('should return false for non-existent export', () => {
      const chainId = 'chain-test-delete-missing';
      createTestChain(chainId);

      const success = deleteExport(chainId, 'export-99');
      expect(success).toBe(false);
    });

    it('should return false for invalid exportId', () => {
      const chainId = 'chain-test-delete-invalid';
      createTestChain(chainId);

      const success = deleteExport(chainId, '../bad-export');
      expect(success).toBe(false);
    });
  });

  // ── buildExportZip ─────────────────────────────────────────────────────────

  describe('buildExportZip', () => {
    it('should build a valid ZIP buffer', () => {
      const chainId = 'chain-test-zip';
      const { roundId, outputFile } = createTestChain(chainId);
      createExport(chainId, roundId, outputFile);

      const result = buildExportZip(chainId, 'export-1');

      expect(result).not.toBeNull();
      expect(result.buffer).toBeInstanceOf(Buffer);
      expect(result.buffer.length).toBeGreaterThan(0);
      expect(result.filename).toMatch(/\.zip$/);
    });

    it('should produce a buffer with ZIP magic bytes (PK signature)', () => {
      const chainId = 'chain-test-zip-magic';
      const { roundId, outputFile } = createTestChain(chainId);
      createExport(chainId, roundId, outputFile);

      const result = buildExportZip(chainId, 'export-1');

      // ZIP files start with PK (0x50 0x4B)
      expect(result.buffer[0]).toBe(0x50);
      expect(result.buffer[1]).toBe(0x4B);
    });

    it('should include project name in zip filename', () => {
      const chainId = 'chain-test-zip-name';
      const { roundId, outputFile } = createTestChain(chainId);
      createExport(chainId, roundId, outputFile);

      const result = buildExportZip(chainId, 'export-1');

      expect(result.filename).toContain('test-project');
      expect(result.filename).toContain('export-1');
    });

    it('should return null for non-existent export', () => {
      const chainId = 'chain-test-zip-missing';
      createTestChain(chainId);

      const result = buildExportZip(chainId, 'export-99');
      expect(result).toBeNull();
    });

    it('should return null for invalid chainId', () => {
      const result = buildExportZip(null, 'export-1');
      expect(result).toBeNull();
    });
  });
});
