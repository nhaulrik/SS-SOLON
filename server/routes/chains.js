import express from 'express';
import admZip from 'adm-zip';
import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';
import { CHAINS_DIR, RESOLVED_CHAINS_DIR, isInsideDir } from '../config.js';
import { parseSlides, buildPptxZip } from '../pptx-utils.js';

const router = express.Router();

// ── Create chain ───────────────────────────────────────────────────────────────
router.post('/patch-chains', (req, res) => {
  try {
    const { templatePath, pptxFileName } = req.body;
    if (!templatePath || !fs.existsSync(templatePath)) {
      return res.status(400).json({ error: 'Template file not found' });
    }

    const chainId  = `chain-${randomUUID()}`;
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

// ── Apply patch round ──────────────────────────────────────────────────────────
router.post('/patch-chains/:chainId/apply', (req, res) => {
  try {
    const { chainId } = req.params;
    const { tags, jsonData, repeatableSlides, roundName, focus } = req.body;

    const chainDir = path.join(CHAINS_DIR, chainId);
    if (!isInsideDir(chainDir, RESOLVED_CHAINS_DIR)) {
      return res.status(403).json({ error: 'Invalid chain id' });
    }

    const chainPath = path.join(chainDir, 'chain.json');
    if (!fs.existsSync(chainPath)) return res.status(404).json({ error: 'Chain not found' });

    const chain         = JSON.parse(fs.readFileSync(chainPath, 'utf8'));
    const appliedRounds = chain.rounds.filter(r => r.status === 'applied');
    const appliedCount  = appliedRounds.length;
    const baseFile      = appliedCount === 0 ? 'original.pptx' : appliedRounds.at(-1).outputFile;
    const basePath      = path.join(chainDir, baseFile);

    if (!fs.existsSync(basePath)) return res.status(400).json({ error: `Base file not found: ${baseFile}` });

    const originalBase = path.basename(chain.pptxFileName, '.pptx');
    const outputFile   = `${originalBase}-patch-${appliedCount + 1}.pptx`;
    const outputPath   = path.join(chainDir, outputFile);

    const { zip, previewData } = buildPptxZip(basePath, tags || [], jsonData || {}, repeatableSlides || []);
    zip.writeZip(outputPath);

    const round = {
      id:              `round-${appliedCount + 1}`,
      name:            roundName || `Patch ${appliedCount + 1}`,
      focus:           focus || 'mixed',
      status:          'applied',
      baseFile,
      outputFile,
      tags:            tags || [],
      repeatableSlides: repeatableSlides || [],
      appliedAt:       new Date().toISOString()
    };
    chain.rounds.push(round);
    chain.updatedAt = new Date().toISOString();
    fs.writeFileSync(chainPath, JSON.stringify(chain, null, 2));

    res.json({
      ok: true,
      chainId,
      roundId:      round.id,
      outputFile,
      nextBasePath: outputPath,
      previewData,
      downloadUrl:  `/api/patch-chains/${chainId}/download/${outputFile}`
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Download chain file ────────────────────────────────────────────────────────
router.get('/patch-chains/:chainId/download/:filename', (req, res) => {
  const candidate = path.resolve(CHAINS_DIR, req.params.chainId, req.params.filename);
  if (!isInsideDir(candidate, RESOLVED_CHAINS_DIR)) {
    return res.status(403).json({ error: 'Invalid path' });
  }
  if (!fs.existsSync(candidate)) return res.status(404).json({ error: 'File not found' });
  res.download(candidate);
});

// ── Parse PPTX from chain path (used after apply-patch to re-read the new base) ─
router.post('/parse-pptx-from-path', (req, res) => {
  try {
    const { filePath } = req.body;
    if (!isInsideDir(filePath, RESOLVED_CHAINS_DIR)) {
      return res.status(403).json({ error: 'Invalid path' });
    }
    const resolved = path.resolve(filePath);
    if (!fs.existsSync(resolved)) return res.status(404).json({ error: 'File not found' });

    const zip    = new admZip(fs.readFileSync(resolved));
    const slides = parseSlides(zip);
    res.json({ ok: true, filePath: resolved, slides });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
