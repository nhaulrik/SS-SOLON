import express from 'express';
import cors from 'cors';
import admZip from 'adm-zip';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';
import fs from 'fs';
import {
  parseSlides,
  buildPptxZip,
  buildRecipe,
  validateJsonData
} from './pptx-utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3001;
const PROJECT_ROOT = path.join(__dirname);
export const TEMP_DIR    = process.env.TEMP_DIR    || path.join(PROJECT_ROOT, 'temp');
export const OUTPUT_DIR  = process.env.OUTPUT_DIR  || path.join(PROJECT_ROOT, 'output');
export const PATCHES_DIR = process.env.PATCHES_DIR || path.join(PROJECT_ROOT, 'patches');
export const CHAINS_DIR  = process.env.CHAINS_DIR  || path.join(PROJECT_ROOT, 'patch-chains');

// Ensure directories exist
for (const dir of [TEMP_DIR, OUTPUT_DIR, PATCHES_DIR, CHAINS_DIR]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// Resolve the canonical base paths once — used by traversal guards below.
const RESOLVED_OUTPUT_DIR = path.resolve(OUTPUT_DIR);
const RESOLVED_CHAINS_DIR = path.resolve(CHAINS_DIR);
const RESOLVED_PATCHES_DIR = path.resolve(PATCHES_DIR);

/** Returns true only when `filePath` is strictly inside `baseDir`. */
function isInsideDir(filePath, resolvedBase) {
  const resolved = path.resolve(filePath);
  return resolved.startsWith(resolvedBase + path.sep) || resolved === resolvedBase;
}

export const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// ========================
// PPTX Upload
// ========================

app.post('/api/upload-pptx', (req, res) => {
  try {
    const { file, fileName } = req.body;
    if (!file) return res.status(400).json({ error: 'No file provided' });

    const buffer = Buffer.from(file, 'base64');
    const tempPath = path.join(TEMP_DIR, `${Date.now()}-${fileName || 'template.pptx'}`);
    fs.writeFileSync(tempPath, buffer);

    const zip = new admZip(buffer);
    const slides = parseSlides(zip);

    res.json({ ok: true, filePath: tempPath, slides, fileName: fileName || 'template.pptx' });
  } catch (err) {
    res.status(400).json({ error: 'Failed to parse PPTX: ' + err.message });
  }
});

// ========================
// Recipe Generation
// ========================

app.post('/api/generate-recipe', (req, res) => {
  try {
    const { tags, repeatableSlides, globalPrompt } = req.body;
    const recipe = buildRecipe(tags, repeatableSlides, globalPrompt);
    res.json({ ok: true, recipe });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========================
// JSON Validation
// ========================

app.post('/api/validate-json', (req, res) => {
  try {
    const { jsonString, tags, repeatableSlides } = req.body;
    const result = validateJsonData(jsonString, tags, repeatableSlides);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========================
// PPTX Generation
// ========================

app.post('/api/generate-pptx', (req, res) => {
  try {
    const { templatePath, tags, jsonData, repeatableSlides } = req.body;

    if (!templatePath || !fs.existsSync(templatePath)) {
      return res.status(400).json({ error: 'Template file not found' });
    }

    const { zip, previewData } = buildPptxZip(templatePath, tags, jsonData, repeatableSlides);
    const outputPath = path.join(OUTPUT_DIR, `generated-${Date.now()}.pptx`);
    zip.writeZip(outputPath);

    res.json({
      ok: true,
      previewData,
      downloadUrl: `/api/download/${path.basename(outputPath)}`
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate: ' + err.message });
  }
});

// ========================
// File Downloads
// ========================

app.get('/api/download/:filename', (req, res) => {
  const candidate = path.resolve(OUTPUT_DIR, req.params.filename);
  if (!isInsideDir(candidate, RESOLVED_OUTPUT_DIR)) {
    return res.status(403).json({ error: 'Invalid path' });
  }
  if (!fs.existsSync(candidate)) {
    return res.status(404).json({ error: 'File not found' });
  }
  res.download(candidate);
});

// ========================
// Patch Persistence
// ========================

app.get('/api/patches', (_req, res) => {
  try {
    const files = fs.readdirSync(PATCHES_DIR);
    const patches = files
      .filter(f => f.endsWith('.json'))
      .map(f => JSON.parse(fs.readFileSync(path.join(PATCHES_DIR, f), 'utf8')));
    res.json(patches);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/patches', (req, res) => {
  try {
    const { patch } = req.body;
    if (!patch || !patch.name) {
      return res.status(400).json({ error: 'Patch name required' });
    }
    // Strip everything except alphanumerics and hyphens to prevent path injection.
    const slug = patch.name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    const filename = `${patch.id}-${slug || 'patch'}.json`;
    const filePath = path.join(PATCHES_DIR, filename);

    if (!isInsideDir(filePath, RESOLVED_PATCHES_DIR)) {
      return res.status(400).json({ error: 'Invalid patch name' });
    }

    fs.writeFileSync(filePath, JSON.stringify(patch, null, 2));
    res.json({ ok: true, filename });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/patches/:id', (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'Invalid patch id' });
    }
    const files = fs.readdirSync(PATCHES_DIR).filter(f => f.endsWith('.json'));
    const file = files.find(f => f.startsWith(`${id}-`));
    if (file) {
      fs.unlinkSync(path.join(PATCHES_DIR, file));
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========================
// Patch Chains
// ========================

app.post('/api/patch-chains', (req, res) => {
  try {
    const { templatePath, pptxFileName } = req.body;
    if (!templatePath || !fs.existsSync(templatePath)) {
      return res.status(400).json({ error: 'Template file not found' });
    }

    const chainId = `chain-${randomUUID()}`;
    const chainDir = path.join(CHAINS_DIR, chainId);
    fs.mkdirSync(chainDir, { recursive: true });
    fs.copyFileSync(templatePath, path.join(chainDir, 'original.pptx'));

    const chain = {
      id: chainId,
      pptxFileName: pptxFileName || 'template.pptx',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      rounds: []
    };
    fs.writeFileSync(path.join(chainDir, 'chain.json'), JSON.stringify(chain, null, 2));
    res.json({ ok: true, chainId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/patch-chains/:chainId/apply', (req, res) => {
  try {
    const { chainId } = req.params;
    const { tags, jsonData, repeatableSlides, roundName, focus } = req.body;

    const chainDir = path.join(CHAINS_DIR, chainId);
    if (!isInsideDir(chainDir, RESOLVED_CHAINS_DIR)) {
      return res.status(403).json({ error: 'Invalid chain id' });
    }

    const chainPath = path.join(chainDir, 'chain.json');
    if (!fs.existsSync(chainPath)) {
      return res.status(404).json({ error: 'Chain not found' });
    }

    const chain = JSON.parse(fs.readFileSync(chainPath, 'utf8'));
    const appliedRounds = chain.rounds.filter(r => r.status === 'applied');
    const appliedCount = appliedRounds.length;
    const baseFile = appliedCount === 0 ? 'original.pptx' : appliedRounds.slice(-1)[0].outputFile;
    const basePath = path.join(chainDir, baseFile);

    if (!fs.existsSync(basePath)) {
      return res.status(400).json({ error: `Base file not found: ${baseFile}` });
    }

    const originalBase = path.basename(chain.pptxFileName, '.pptx');
    const outputFile = `${originalBase}-patch-${appliedCount + 1}.pptx`;
    const outputPath = path.join(chainDir, outputFile);

    const { zip, previewData } = buildPptxZip(basePath, tags || [], jsonData || {}, repeatableSlides || []);
    zip.writeZip(outputPath);

    const round = {
      id: `round-${appliedCount + 1}`,
      name: roundName || `Patch ${appliedCount + 1}`,
      focus: focus || 'mixed',
      status: 'applied',
      baseFile,
      outputFile,
      tags: tags || [],
      repeatableSlides: repeatableSlides || [],
      appliedAt: new Date().toISOString()
    };
    chain.rounds.push(round);
    chain.updatedAt = new Date().toISOString();
    fs.writeFileSync(chainPath, JSON.stringify(chain, null, 2));

    res.json({
      ok: true,
      chainId,
      roundId: round.id,
      outputFile,
      nextBasePath: outputPath,
      previewData,
      downloadUrl: `/api/patch-chains/${chainId}/download/${outputFile}`
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/patch-chains/:chainId/download/:filename', (req, res) => {
  const candidate = path.resolve(CHAINS_DIR, req.params.chainId, req.params.filename);
  if (!isInsideDir(candidate, RESOLVED_CHAINS_DIR)) {
    return res.status(403).json({ error: 'Invalid path' });
  }
  if (!fs.existsSync(candidate)) {
    return res.status(404).json({ error: 'File not found' });
  }
  res.download(candidate);
});

app.post('/api/parse-pptx-from-path', (req, res) => {
  try {
    const { filePath } = req.body;
    if (!isInsideDir(filePath, RESOLVED_CHAINS_DIR)) {
      return res.status(403).json({ error: 'Invalid path' });
    }
    const resolved = path.resolve(filePath);
    if (!fs.existsSync(resolved)) {
      return res.status(404).json({ error: 'File not found' });
    }
    const buffer = fs.readFileSync(resolved);
    const zip = new admZip(buffer);
    const slides = parseSlides(zip);
    res.json({ ok: true, filePath: resolved, slides });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Start server only when run directly (not imported by tests)
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}
