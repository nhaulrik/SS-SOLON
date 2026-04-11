import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

// ─────────────────────────────────────────────
// Isolated temp directories per test run
// ─────────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_PPTX = path.resolve(__dirname, './fixtures/sample.pptx');

let testDir;
let app;

beforeAll(async () => {
  // Create a unique temp directory for this test run so tests never
  // touch the real server/temp, server/output, etc. directories.
  testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'solon-test-'));
  const tempDir    = path.join(testDir, 'temp');
  const outputDir  = path.join(testDir, 'output');
  const patchesDir = path.join(testDir, 'patches');
  const chainsDir  = path.join(testDir, 'chains');

  for (const d of [tempDir, outputDir, patchesDir, chainsDir]) {
    fs.mkdirSync(d, { recursive: true });
  }

  // Point the server at our isolated directories before importing it
  process.env.NODE_ENV = 'test';
  process.env.TEMP_DIR    = tempDir;
  process.env.OUTPUT_DIR  = outputDir;
  process.env.PATCHES_DIR = patchesDir;
  process.env.CHAINS_DIR  = chainsDir;

  // Dynamic import so env vars are read at module init time
  const mod = await import('../index.js');
  app = mod.app;
});

afterAll(() => {
  fs.rmSync(testDir, { recursive: true, force: true });
});

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function pptxBase64() {
  return fs.readFileSync(FIXTURE_PPTX).toString('base64');
}

// Upload the fixture PPTX and return the server-side filePath
async function uploadFixture() {
  const res = await request(app)
    .post('/api/upload-pptx')
    .send({ file: pptxBase64(), fileName: 'sample.pptx' });
  expect(res.status).toBe(200);
  return res.body.filePath;
}

// ─────────────────────────────────────────────
// POST /api/upload-pptx
// ─────────────────────────────────────────────

describe('POST /api/upload-pptx', () => {
  it('parses a real PPTX and returns slides', async () => {
    const res = await request(app)
      .post('/api/upload-pptx')
      .send({ file: pptxBase64(), fileName: 'sample.pptx' });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.filePath).toBeTruthy();
    expect(Array.isArray(res.body.slides)).toBe(true);
    expect(res.body.slides.length).toBeGreaterThan(0);
  });

  it('returns 400 when no file is provided', async () => {
    const res = await request(app)
      .post('/api/upload-pptx')
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBeTruthy();
  });

  it('returns 400 for corrupt base64', async () => {
    const res = await request(app)
      .post('/api/upload-pptx')
      .send({ file: 'not-valid-base64!!!', fileName: 'bad.pptx' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBeTruthy();
  });

  it('each slide has an index and elements array', async () => {
    const res = await request(app)
      .post('/api/upload-pptx')
      .send({ file: pptxBase64(), fileName: 'sample.pptx' });

    res.body.slides.forEach(slide => {
      expect(typeof slide.index).toBe('number');
      expect(Array.isArray(slide.elements)).toBe(true);
    });
  });
});

// ─────────────────────────────────────────────
// POST /api/generate-recipe
// ─────────────────────────────────────────────

describe('POST /api/generate-recipe', () => {
  const baseTag = (key, slideIndex = 1, autoGenerate = true) => ({
    key, slideIndex, autoGenerate, hint: `hint for ${key}`, maxChars: null
  });

  it('returns a recipe containing STATIC FIELDS', async () => {
    const res = await request(app)
      .post('/api/generate-recipe')
      .send({ tags: [baseTag('title')], repeatableSlides: [], globalPrompt: null });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.recipe).toContain('STATIC FIELDS');
    expect(res.body.recipe).toContain('"title"');
  });

  it('includes CONTEXTUAL FIELDS for shared keys', async () => {
    const tags = [
      baseTag('desc', 1),
      baseTag('desc', 2),
    ];
    const res = await request(app)
      .post('/api/generate-recipe')
      .send({ tags, repeatableSlides: [], globalPrompt: null });

    expect(res.status).toBe(200);
    expect(res.body.recipe).toContain('CONTEXTUAL FIELDS');
  });

  it('includes REPEATABLE SLIDES section', async () => {
    const tags = [baseTag('name', 2)];
    const repeatableSlides = [{ slideIndex: 2, structureType: 'item', customPrompt: 'per item' }];
    const res = await request(app)
      .post('/api/generate-recipe')
      .send({ tags, repeatableSlides, globalPrompt: null });

    expect(res.status).toBe(200);
    expect(res.body.recipe).toContain('REPEATABLE SLIDES');
    expect(res.body.recipe).toContain('"item"');
  });

  it('prepends global prompt when provided', async () => {
    const res = await request(app)
      .post('/api/generate-recipe')
      .send({ tags: [baseTag('x')], repeatableSlides: [], globalPrompt: 'Be concise' });

    expect(res.body.recipe).toContain('GLOBAL GUIDANCE:');
    expect(res.body.recipe).toContain('Be concise');
  });
});

// ─────────────────────────────────────────────
// POST /api/validate-json
// ─────────────────────────────────────────────

describe('POST /api/validate-json', () => {
  const tag = (key, slideIndex = 1, autoGenerate = true) => ({ key, slideIndex, autoGenerate });

  it('returns valid:true for a correct static JSON', async () => {
    const json = JSON.stringify({ static: { title: 'Hello' } });
    const res = await request(app)
      .post('/api/validate-json')
      .send({ jsonString: json, tags: [tag('title')], repeatableSlides: [] });

    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(true);
    expect(res.body.missingFields).toHaveLength(0);
  });

  it('returns valid:false for missing static field', async () => {
    const json = JSON.stringify({ static: {} });
    const res = await request(app)
      .post('/api/validate-json')
      .send({ jsonString: json, tags: [tag('title')], repeatableSlides: [] });

    expect(res.body.valid).toBe(false);
    expect(res.body.missingFields).toContain('title');
  });

  it('returns valid:false with error for invalid JSON', async () => {
    const res = await request(app)
      .post('/api/validate-json')
      .send({ jsonString: '{ bad }', tags: [tag('x')], repeatableSlides: [] });

    expect(res.body.valid).toBe(false);
    expect(res.body.error).toBe('Invalid JSON syntax');
  });

  it('validates repeatable slides correctly', async () => {
    const json = JSON.stringify({
      slides: {
        item: [{ structure_type: 'item', name: 'Widget' }]
      }
    });
    const res = await request(app)
      .post('/api/validate-json')
      .send({
        jsonString: json,
        tags: [tag('name', 2)],
        repeatableSlides: [{ slideIndex: 2, structureType: 'item' }]
      });

    expect(res.body.valid).toBe(true);
    expect(res.body.instanceCount).toBe(1);
  });
});

// ─────────────────────────────────────────────
// POST /api/generate-pptx
// ─────────────────────────────────────────────

describe('POST /api/generate-pptx', () => {
  it('generates a PPTX and returns a download URL', async () => {
    const templatePath = await uploadFixture();

    const res = await request(app)
      .post('/api/generate-pptx')
      .send({
        templatePath,
        tags: [],
        jsonData: {},
        repeatableSlides: []
      });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.downloadUrl).toMatch(/^\/api\/download\//);
    expect(Array.isArray(res.body.previewData)).toBe(true);
    expect(res.body.previewData.length).toBeGreaterThan(0);
  });

  it('returns 400 when templatePath is missing', async () => {
    const res = await request(app)
      .post('/api/generate-pptx')
      .send({ tags: [], jsonData: {}, repeatableSlides: [] });

    expect(res.status).toBe(400);
  });

  it('returns 400 when templatePath does not exist', async () => {
    const res = await request(app)
      .post('/api/generate-pptx')
      .send({ templatePath: '/nonexistent/file.pptx', tags: [], jsonData: {}, repeatableSlides: [] });

    expect(res.status).toBe(400);
  });

  it('previewData slideNumber is sequential starting from 1', async () => {
    const templatePath = await uploadFixture();
    const res = await request(app)
      .post('/api/generate-pptx')
      .send({ templatePath, tags: [], jsonData: {}, repeatableSlides: [] });

    res.body.previewData.forEach((slide, idx) => {
      expect(slide.slideNumber).toBe(idx + 1);
    });
  });
});

// ─────────────────────────────────────────────
// GET /api/download/:filename
// ─────────────────────────────────────────────

describe('GET /api/download/:filename', () => {
  it('returns 404 for a nonexistent file', async () => {
    const res = await request(app).get('/api/download/nonexistent.pptx');
    expect(res.status).toBe(404);
  });

  it('serves an existing generated file', async () => {
    const templatePath = await uploadFixture();
    const genRes = await request(app)
      .post('/api/generate-pptx')
      .send({ templatePath, tags: [], jsonData: {}, repeatableSlides: [] });

    const filename = path.basename(genRes.body.downloadUrl);
    const res = await request(app)
      .get(`/api/download/${filename}`)
      .buffer(true)
      .parse((res, cb) => {
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    expect(res.status).toBe(200);
    // A PPTX is a ZIP — starts with PK magic bytes
    expect(res.body.slice(0, 2).toString()).toBe('PK');
  });
});

// ─────────────────────────────────────────────
// GET/POST/DELETE /api/patches
// ─────────────────────────────────────────────

describe('Patch persistence endpoints', () => {
  it('GET /api/patches returns empty array when no patches exist', async () => {
    const res = await request(app).get('/api/patches');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('POST /api/patches saves a patch and GET returns it', async () => {
    const patch = { id: 1, name: 'My Patch', tags: [], repeatableSlides: [] };
    const postRes = await request(app)
      .post('/api/patches')
      .send({ patch });
    expect(postRes.status).toBe(200);
    expect(postRes.body.ok).toBe(true);

    const getRes = await request(app).get('/api/patches');
    expect(getRes.body).toHaveLength(1);
    expect(getRes.body[0].name).toBe('My Patch');
  });

  it('POST /api/patches returns 400 when patch name is missing', async () => {
    const res = await request(app)
      .post('/api/patches')
      .send({ patch: { id: 2 } });
    expect(res.status).toBe(400);
    expect(res.body.error).toBeTruthy();
  });

  it('DELETE /api/patches/:id removes the patch', async () => {
    const patch = { id: 99, name: 'To Delete', tags: [], repeatableSlides: [] };
    await request(app).post('/api/patches').send({ patch });

    const delRes = await request(app).delete('/api/patches/99');
    expect(delRes.status).toBe(200);
    expect(delRes.body.ok).toBe(true);

    const getRes = await request(app).get('/api/patches');
    expect(getRes.body.find(p => p.id === 99)).toBeUndefined();
  });

  it('DELETE /api/patches/:id returns ok:true even when the patch does not exist', async () => {
    const res = await request(app).delete('/api/patches/9999');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});

// ─────────────────────────────────────────────
// Patch Chain endpoints
// ─────────────────────────────────────────────

describe('Patch chain endpoints', () => {
  it('POST /api/patch-chains creates a chain and returns chainId', async () => {
    const templatePath = await uploadFixture();
    const res = await request(app)
      .post('/api/patch-chains')
      .send({ templatePath, pptxFileName: 'sample.pptx' });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(typeof res.body.chainId).toBe('string');
  });

  it('POST /api/patch-chains returns 400 when templatePath is missing', async () => {
    const res = await request(app)
      .post('/api/patch-chains')
      .send({ pptxFileName: 'sample.pptx' });
    expect(res.status).toBe(400);
  });

  it('POST /api/patch-chains/:chainId/apply creates a checkpoint file', async () => {
    const templatePath = await uploadFixture();
    const chainRes = await request(app)
      .post('/api/patch-chains')
      .send({ templatePath, pptxFileName: 'sample.pptx' });
    const { chainId } = chainRes.body;

    const applyRes = await request(app)
      .post(`/api/patch-chains/${chainId}/apply`)
      .send({ tags: [], jsonData: {}, repeatableSlides: [], roundName: 'Round 1' });

    expect(applyRes.status).toBe(200);
    expect(applyRes.body.ok).toBe(true);
    expect(applyRes.body.outputFile).toContain('patch-1');
    expect(applyRes.body.downloadUrl).toContain(chainId);
    expect(Array.isArray(applyRes.body.previewData)).toBe(true);
  });

  it('second apply round produces patch-2', async () => {
    const templatePath = await uploadFixture();
    const chainRes = await request(app)
      .post('/api/patch-chains')
      .send({ templatePath, pptxFileName: 'sample.pptx' });
    const { chainId } = chainRes.body;

    await request(app)
      .post(`/api/patch-chains/${chainId}/apply`)
      .send({ tags: [], jsonData: {}, repeatableSlides: [] });

    // For round 2 we use the intermediate file path from round 1 as new base
    const apply2 = await request(app)
      .post(`/api/patch-chains/${chainId}/apply`)
      .send({ tags: [], jsonData: {}, repeatableSlides: [] });

    expect(apply2.body.outputFile).toContain('patch-2');
  });

  it('POST /api/patch-chains/:chainId/apply returns 404 for unknown chainId', async () => {
    const res = await request(app)
      .post('/api/patch-chains/nonexistent-chain/apply')
      .send({ tags: [], jsonData: {}, repeatableSlides: [] });
    expect(res.status).toBe(404);
  });

  it('GET /api/patch-chains/:chainId/download/:filename returns 404 for missing file', async () => {
    const templatePath = await uploadFixture();
    const chainRes = await request(app)
      .post('/api/patch-chains')
      .send({ templatePath, pptxFileName: 'sample.pptx' });
    const { chainId } = chainRes.body;

    const res = await request(app)
      .get(`/api/patch-chains/${chainId}/download/nonexistent.pptx`);
    expect(res.status).toBe(404);
  });
});

// ─────────────────────────────────────────────
// POST /api/parse-pptx-from-path
// ─────────────────────────────────────────────

describe('POST /api/parse-pptx-from-path', () => {
  it('parses a PPTX inside the chains directory', async () => {
    const templatePath = await uploadFixture();
    const chainRes = await request(app)
      .post('/api/patch-chains')
      .send({ templatePath, pptxFileName: 'sample.pptx' });
    const { chainId } = chainRes.body;

    // The original.pptx is inside the chains dir — valid path
    const chainsDir = process.env.CHAINS_DIR;
    const pptxPath = path.join(chainsDir, chainId, 'original.pptx');

    const res = await request(app)
      .post('/api/parse-pptx-from-path')
      .send({ filePath: pptxPath });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(Array.isArray(res.body.slides)).toBe(true);
  });

  it('returns 403 for a path outside the chains directory', async () => {
    const res = await request(app)
      .post('/api/parse-pptx-from-path')
      .send({ filePath: FIXTURE_PPTX });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Invalid path');
  });

  it('returns 404 for a nonexistent path inside chains directory', async () => {
    const chainsDir = process.env.CHAINS_DIR;
    const res = await request(app)
      .post('/api/parse-pptx-from-path')
      .send({ filePath: path.join(chainsDir, 'does-not-exist', 'original.pptx') });

    expect(res.status).toBe(404);
  });
});
