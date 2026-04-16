/**
 * server/__tests__/export-routes.test.js
 *
 * Integration tests for Phase 3: Versioned Export API endpoints.
 * Tests the export endpoints added to html-flow.js.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_CHAINS_DIR = path.join(__dirname, '../../test-chains-export-routes');

// Set test environment BEFORE importing app
process.env.CHAINS_DIR = TEST_CHAINS_DIR;

const { app } = await import('../index.js');

// ── Fixtures ──────────────────────────────────────────────────────────────────

const sampleHtmlTemplate = `<!DOCTYPE html>
<html>
<head>
  <title>Sample Template</title>
  <style>section { width: 1280px; height: 720px; }</style>
</head>
<body>
  <section>
    <h1 data-block="title">Registration Initiative</h1>
    <p data-block="description">Description text here.</p>
  </section>
  <section>
    <h1 data-block="title2">Budget Overview</h1>
    <p data-block="description2">Budget description.</p>
  </section>
</body>
</html>`;

const sampleJsonResponse = JSON.stringify({
  title: 'Registration Initiative',
  description: 'This is the initiative description.',
  title2: 'Budget Overview',
  description2: 'This is the budget description.',
});

function cleanupTestChains() {
  if (fs.existsSync(TEST_CHAINS_DIR)) {
    fs.rmSync(TEST_CHAINS_DIR, { recursive: true, force: true });
  }
}

/**
 * Helper: create a full project + apply content, returns { chainId, roundId, outputFile }
 */
async function createProjectWithOutput() {
  // Upload template
  const uploadRes = await request(app)
    .post('/api/html-flow/upload-template')
    .send({ html: sampleHtmlTemplate });
  expect(uploadRes.status).toBe(200);
  const { templateId } = uploadRes.body;

  // Create project
  const projectRes = await request(app)
    .post('/api/html-flow/create-project')
    .send({ templateId, selections: [] });
  expect(projectRes.status).toBe(200);
  const { chainId } = projectRes.body;

  // Apply content
  const applyRes = await request(app)
    .post('/api/html-flow/apply-content')
    .send({ chainId, jsonString: sampleJsonResponse });
  expect(applyRes.status).toBe(200);
  const { roundId, outputFile } = applyRes.body;

  return { chainId, roundId, outputFile };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Export API Routes', () => {
  beforeEach(() => {
    cleanupTestChains();
    fs.mkdirSync(TEST_CHAINS_DIR, { recursive: true });
  });

  afterEach(() => {
    cleanupTestChains();
  });

  // ── POST /api/html-flow/:chainId/exports ───────────────────────────────────

  describe('POST /api/html-flow/:chainId/exports', () => {
    it('should create an export and return exportId', async () => {
      const { chainId, roundId, outputFile } = await createProjectWithOutput();

      const res = await request(app)
        .post(`/api/html-flow/${chainId}/exports`)
        .send({ roundId, outputFile });

      expect(res.status).toBe(201);
      expect(res.body.ok).toBe(true);
      expect(res.body.exportId).toBe('export-1');
      expect(res.body.exportNumber).toBe(1);
      expect(res.body.slideCount).toBe(2);
      expect(res.body.createdAt).toBeDefined();
    });

    it('should create export with slide metadata', async () => {
      const { chainId, roundId, outputFile } = await createProjectWithOutput();

      const slideMetadata = [
        { slideId: 'reg-initiative', name: 'Registration Initiative', type: 'title' },
        { slideId: 'budget-overview', name: 'Budget Overview', type: 'content' },
      ];

      const res = await request(app)
        .post(`/api/html-flow/${chainId}/exports`)
        .send({ roundId, outputFile, slideMetadata });

      expect(res.status).toBe(201);
      expect(res.body.ok).toBe(true);
      expect(res.body.exportId).toBe('export-1');
    });

    it('should increment exportNumber for subsequent exports', async () => {
      const { chainId, roundId, outputFile } = await createProjectWithOutput();

      const res1 = await request(app)
        .post(`/api/html-flow/${chainId}/exports`)
        .send({ roundId, outputFile });
      expect(res1.body.exportNumber).toBe(1);

      const res2 = await request(app)
        .post(`/api/html-flow/${chainId}/exports`)
        .send({ roundId, outputFile });
      expect(res2.body.exportNumber).toBe(2);
    });

    it('should return 400 when roundId is missing', async () => {
      const { chainId, outputFile } = await createProjectWithOutput();

      const res = await request(app)
        .post(`/api/html-flow/${chainId}/exports`)
        .send({ outputFile });

      expect(res.status).toBe(400);
      expect(res.body.ok).toBe(false);
    });

    it('should return 400 when outputFile is missing', async () => {
      const { chainId, roundId } = await createProjectWithOutput();

      const res = await request(app)
        .post(`/api/html-flow/${chainId}/exports`)
        .send({ roundId });

      expect(res.status).toBe(400);
      expect(res.body.ok).toBe(false);
    });

    it('should return 400 or 404 for invalid chainId', async () => {
      // Express normalises path traversal before routing, so '../bad-chain'
      // becomes 'bad-chain' — a valid-looking but non-existent chain → 404.
      // Either 400 or 404 is an acceptable rejection for security purposes.
      const res = await request(app)
        .post('/api/html-flow/../bad-chain/exports')
        .send({ roundId: 'r1', outputFile: 'output.html' });

      expect([400, 404]).toContain(res.status);
    });

    it('should return 400 when slideMetadata is not an array', async () => {
      const { chainId, roundId, outputFile } = await createProjectWithOutput();

      const res = await request(app)
        .post(`/api/html-flow/${chainId}/exports`)
        .send({ roundId, outputFile, slideMetadata: 'not-an-array' });

      expect(res.status).toBe(400);
      expect(res.body.ok).toBe(false);
    });

    it('should return 404 for non-existent chain', async () => {
      const res = await request(app)
        .post('/api/html-flow/chain-nonexistent/exports')
        .send({ roundId: 'r1', outputFile: 'output-r1.html' });

      expect(res.status).toBe(404);
    });
  });

  // ── GET /api/html-flow/:chainId/exports ───────────────────────────────────

  describe('GET /api/html-flow/:chainId/exports', () => {
    it('should return empty list when no exports exist', async () => {
      const { chainId } = await createProjectWithOutput();

      const res = await request(app).get(`/api/html-flow/${chainId}/exports`);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.exports).toEqual([]);
      expect(res.body.total).toBe(0);
    });

    it('should list exports after creation', async () => {
      const { chainId, roundId, outputFile } = await createProjectWithOutput();

      await request(app)
        .post(`/api/html-flow/${chainId}/exports`)
        .send({ roundId, outputFile });

      const res = await request(app).get(`/api/html-flow/${chainId}/exports`);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.exports).toHaveLength(1);
      expect(res.body.total).toBe(1);
      expect(res.body.exports[0].exportId).toBe('export-1');
    });

    it('should list multiple exports newest first', async () => {
      const { chainId, roundId, outputFile } = await createProjectWithOutput();

      await request(app).post(`/api/html-flow/${chainId}/exports`).send({ roundId, outputFile });
      await request(app).post(`/api/html-flow/${chainId}/exports`).send({ roundId, outputFile });
      await request(app).post(`/api/html-flow/${chainId}/exports`).send({ roundId, outputFile });

      const res = await request(app).get(`/api/html-flow/${chainId}/exports`);

      expect(res.body.exports).toHaveLength(3);
      expect(res.body.total).toBe(3);
      expect(res.body.exports[0].exportId).toBe('export-3');
      expect(res.body.exports[2].exportId).toBe('export-1');
    });

    it('should return 400 or 404 for invalid chainId', async () => {
      const res = await request(app).get('/api/html-flow/../bad/exports');
      expect([400, 404]).toContain(res.status);
    });
  });

  // ── GET /api/html-flow/:chainId/exports/:exportId ─────────────────────────

  describe('GET /api/html-flow/:chainId/exports/:exportId', () => {
    it('should return export details', async () => {
      const { chainId, roundId, outputFile } = await createProjectWithOutput();

      await request(app)
        .post(`/api/html-flow/${chainId}/exports`)
        .send({ roundId, outputFile });

      const res = await request(app).get(`/api/html-flow/${chainId}/exports/export-1`);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.export.exportId).toBe('export-1');
      expect(res.body.export.exportNumber).toBe(1);
      expect(res.body.export.source.roundId).toBe(roundId);
      expect(res.body.export.content.slideCount).toBe(2);
      expect(res.body.export.content.slides).toHaveLength(2);
    });

    it('should return 404 for non-existent export', async () => {
      const { chainId } = await createProjectWithOutput();

      const res = await request(app).get(`/api/html-flow/${chainId}/exports/export-99`);

      expect(res.status).toBe(404);
      expect(res.body.ok).toBe(false);
    });

    it('should return 400 or 404 for invalid chainId', async () => {
      const res = await request(app).get('/api/html-flow/../bad/exports/export-1');
      expect([400, 404]).toContain(res.status);
    });
  });

  // ── GET /api/html-flow/:chainId/exports/:exportId/project ─────────────────

  describe('GET /api/html-flow/:chainId/exports/:exportId/project', () => {
    it('should return project.json slide index', async () => {
      const { chainId, roundId, outputFile } = await createProjectWithOutput();

      await request(app)
        .post(`/api/html-flow/${chainId}/exports`)
        .send({ roundId, outputFile });

      const res = await request(app).get(`/api/html-flow/${chainId}/exports/export-1/project`);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.project.exportId).toBe('export-1');
      expect(res.body.project.slideCount).toBe(2);
      expect(res.body.project.slides).toHaveLength(2);
      expect(res.body.project.slides[0].file).toBe('slide-1.html');
    });

    it('should return 404 for non-existent export', async () => {
      const { chainId } = await createProjectWithOutput();

      const res = await request(app).get(`/api/html-flow/${chainId}/exports/export-99/project`);

      expect(res.status).toBe(404);
    });
  });

  // ── GET /api/html-flow/:chainId/exports/:exportId/slides/:slideFile ────────

  describe('GET /api/html-flow/:chainId/exports/:exportId/slides/:slideFile', () => {
    it('should download a slide HTML file', async () => {
      const { chainId, roundId, outputFile } = await createProjectWithOutput();

      await request(app)
        .post(`/api/html-flow/${chainId}/exports`)
        .send({ roundId, outputFile });

      const res = await request(app)
        .get(`/api/html-flow/${chainId}/exports/export-1/slides/slide-1.html`);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/html');
      expect(res.headers['content-disposition']).toContain('slide-1.html');
      expect(res.text).toContain('<!DOCTYPE html>');
      expect(res.text).toContain('<section>');
    });

    it('should return 404 for non-existent slide', async () => {
      const { chainId, roundId, outputFile } = await createProjectWithOutput();

      await request(app)
        .post(`/api/html-flow/${chainId}/exports`)
        .send({ roundId, outputFile });

      const res = await request(app)
        .get(`/api/html-flow/${chainId}/exports/export-1/slides/slide-99.html`);

      expect(res.status).toBe(404);
    });

    it('should reject path traversal attempts in slideFile', async () => {
      const { chainId, roundId, outputFile } = await createProjectWithOutput();

      await request(app)
        .post(`/api/html-flow/${chainId}/exports`)
        .send({ roundId, outputFile });

      const res = await request(app)
        .get(`/api/html-flow/${chainId}/exports/export-1/slides/..%2F..%2Fchain.json`);

      expect(res.status).toBe(404);
    });

    it('should reject invalid slide file names', async () => {
      const { chainId, roundId, outputFile } = await createProjectWithOutput();

      await request(app)
        .post(`/api/html-flow/${chainId}/exports`)
        .send({ roundId, outputFile });

      const res = await request(app)
        .get(`/api/html-flow/${chainId}/exports/export-1/slides/chain.json`);

      expect(res.status).toBe(404);
    });
  });

  // ── GET /api/html-flow/:chainId/exports/:exportId/download ────────────────

  describe('GET /api/html-flow/:chainId/exports/:exportId/download', () => {
    it('should download ZIP archive', async () => {
      const { chainId, roundId, outputFile } = await createProjectWithOutput();

      await request(app)
        .post(`/api/html-flow/${chainId}/exports`)
        .send({ roundId, outputFile });

      const res = await request(app)
        .get(`/api/html-flow/${chainId}/exports/export-1/download`)
        .buffer(true)
        .parse((res, callback) => {
          const chunks = [];
          res.on('data', chunk => chunks.push(chunk));
          res.on('end', () => callback(null, Buffer.concat(chunks)));
        });

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('application/zip');
      expect(res.headers['content-disposition']).toContain('.zip');
      // ZIP magic bytes: PK (0x50 0x4B)
      expect(res.body[0]).toBe(0x50);
      expect(res.body[1]).toBe(0x4B);
    });

    it('should return 404 for non-existent export', async () => {
      const { chainId } = await createProjectWithOutput();

      const res = await request(app)
        .get(`/api/html-flow/${chainId}/exports/export-99/download`);

      expect(res.status).toBe(404);
    });
  });

  // ── DELETE /api/html-flow/:chainId/exports/:exportId ──────────────────────

  describe('DELETE /api/html-flow/:chainId/exports/:exportId', () => {
    it('should delete an export', async () => {
      const { chainId, roundId, outputFile } = await createProjectWithOutput();

      await request(app)
        .post(`/api/html-flow/${chainId}/exports`)
        .send({ roundId, outputFile });

      const deleteRes = await request(app)
        .delete(`/api/html-flow/${chainId}/exports/export-1`);

      expect(deleteRes.status).toBe(200);
      expect(deleteRes.body.ok).toBe(true);

      // Verify it's gone
      const listRes = await request(app).get(`/api/html-flow/${chainId}/exports`);
      expect(listRes.body.exports).toHaveLength(0);
      expect(listRes.body.total).toBe(0);
    });

    it('should return 404 for non-existent export', async () => {
      const { chainId } = await createProjectWithOutput();

      const res = await request(app)
        .delete(`/api/html-flow/${chainId}/exports/export-99`);

      expect(res.status).toBe(404);
      expect(res.body.ok).toBe(false);
    });

    it('should return 400 or 404 for invalid chainId', async () => {
      const res = await request(app)
        .delete('/api/html-flow/../bad/exports/export-1');

      expect([400, 404]).toContain(res.status);
    });
  });

  // ── Full workflow test ─────────────────────────────────────────────────────

  describe('Full export workflow', () => {
    it('should support: create → list → get details → download → delete', async () => {
      const { chainId, roundId, outputFile } = await createProjectWithOutput();

      // 1. Create export
      const createRes = await request(app)
        .post(`/api/html-flow/${chainId}/exports`)
        .send({
          roundId,
          outputFile,
          slideMetadata: [
            { slideId: 'slide-reg', name: 'Registration Initiative', type: 'title' },
            { slideId: 'slide-budget', name: 'Budget Overview', type: 'content' },
          ],
        });
      expect(createRes.status).toBe(201);
      const { exportId } = createRes.body;

      // 2. List exports
      const listRes = await request(app).get(`/api/html-flow/${chainId}/exports`);
      expect(listRes.body.exports).toHaveLength(1);
      expect(listRes.body.total).toBe(1);

      // 3. Get details
      const detailRes = await request(app).get(`/api/html-flow/${chainId}/exports/${exportId}`);
      expect(detailRes.body.export.content.slides[0].slideId).toBe('slide-reg');
      expect(detailRes.body.export.content.slides[1].slideId).toBe('slide-budget');

      // 4. Get project index
      const projectRes = await request(app).get(`/api/html-flow/${chainId}/exports/${exportId}/project`);
      expect(projectRes.body.project.slides).toHaveLength(2);

      // 5. Download slide
      const slideRes = await request(app).get(`/api/html-flow/${chainId}/exports/${exportId}/slides/slide-1.html`);
      expect(slideRes.status).toBe(200);
      expect(slideRes.text).toContain('<section>');

      // 6. Download ZIP
      const zipRes = await request(app).get(`/api/html-flow/${chainId}/exports/${exportId}/download`);
      expect(zipRes.status).toBe(200);
      expect(zipRes.headers['content-type']).toContain('application/zip');

      // 7. Delete
      const deleteRes = await request(app).delete(`/api/html-flow/${chainId}/exports/${exportId}`);
      expect(deleteRes.status).toBe(200);

      // 8. Verify deleted
      const listAfterRes = await request(app).get(`/api/html-flow/${chainId}/exports`);
      expect(listAfterRes.body.total).toBe(0);
    });

    it('should support multiple exports from the same round', async () => {
      const { chainId, roundId, outputFile } = await createProjectWithOutput();

      // Create 3 exports from the same round
      const res1 = await request(app).post(`/api/html-flow/${chainId}/exports`).send({ roundId, outputFile });
      const res2 = await request(app).post(`/api/html-flow/${chainId}/exports`).send({ roundId, outputFile });
      const res3 = await request(app).post(`/api/html-flow/${chainId}/exports`).send({ roundId, outputFile });

      expect(res1.body.exportId).toBe('export-1');
      expect(res2.body.exportId).toBe('export-2');
      expect(res3.body.exportId).toBe('export-3');

      const listRes = await request(app).get(`/api/html-flow/${chainId}/exports`);
      expect(listRes.body.total).toBe(3);
    });
  });
});
