import express from 'express';
import admZip from 'adm-zip';
import path from 'path';
import fs from 'fs';
import { TEMP_DIR, OUTPUT_DIR, RESOLVED_OUTPUT_DIR, isInsideDir } from '../config.js';
import { parseSlides, buildPptxZip, buildRecipe, validateJsonData } from '../pptx-utils.js';

const router = express.Router();

// ── Upload PPTX ────────────────────────────────────────────────────────────────
router.post('/upload-pptx', (req, res) => {
  try {
    const { file, fileName } = req.body;
    if (!file) return res.status(400).json({ error: 'No file provided' });

    const buffer   = Buffer.from(file, 'base64');
    const tempPath = path.join(TEMP_DIR, `${Date.now()}-${fileName || 'template.pptx'}`);
    fs.writeFileSync(tempPath, buffer);

    const zip    = new admZip(buffer);
    const slides = parseSlides(zip);

    res.json({ ok: true, filePath: tempPath, slides, fileName: fileName || 'template.pptx' });
  } catch (err) {
    res.status(400).json({ error: 'Failed to parse PPTX: ' + err.message });
  }
});

// ── Generate recipe prompt ─────────────────────────────────────────────────────
router.post('/generate-recipe', (req, res) => {
  try {
    const { tags, repeatableSlides, globalPrompt } = req.body;
    const recipe = buildRecipe(tags, repeatableSlides, globalPrompt);
    res.json({ ok: true, recipe });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Validate JSON response ─────────────────────────────────────────────────────
router.post('/validate-json', (req, res) => {
  try {
    const { jsonString, tags, repeatableSlides } = req.body;
    res.json(validateJsonData(jsonString, tags, repeatableSlides));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Generate PPTX ──────────────────────────────────────────────────────────────
router.post('/generate-pptx', (req, res) => {
  try {
    const { templatePath, tags, jsonData, repeatableSlides } = req.body;
    if (!templatePath || !fs.existsSync(templatePath)) {
      return res.status(400).json({ error: 'Template file not found' });
    }

    const { zip, previewData } = buildPptxZip(templatePath, tags, jsonData, repeatableSlides);
    const outputPath = path.join(OUTPUT_DIR, `generated-${Date.now()}.pptx`);
    zip.writeZip(outputPath);

    res.json({ ok: true, previewData, downloadUrl: `/api/download/${path.basename(outputPath)}` });
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate: ' + err.message });
  }
});

// ── Download generated file ────────────────────────────────────────────────────
router.get('/download/:filename', (req, res) => {
  const candidate = path.resolve(OUTPUT_DIR, req.params.filename);
  if (!isInsideDir(candidate, RESOLVED_OUTPUT_DIR)) {
    return res.status(403).json({ error: 'Invalid path' });
  }
  if (!fs.existsSync(candidate)) {
    return res.status(404).json({ error: 'File not found' });
  }
  res.download(candidate);
});

export default router;
