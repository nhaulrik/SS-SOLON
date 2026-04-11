import express from 'express';
import path from 'path';
import fs from 'fs';
import { PATCHES_DIR, RESOLVED_PATCHES_DIR, isInsideDir } from '../config.js';

const router = express.Router();

// ── List patches ───────────────────────────────────────────────────────────────
router.get('/patches', (_req, res) => {
  try {
    const patches = fs.readdirSync(PATCHES_DIR)
      .filter(f => f.endsWith('.json'))
      .map(f => JSON.parse(fs.readFileSync(path.join(PATCHES_DIR, f), 'utf8')));
    res.json(patches);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Save patch ─────────────────────────────────────────────────────────────────
router.post('/patches', (req, res) => {
  try {
    const { patch } = req.body;
    if (!patch || !patch.name) return res.status(400).json({ error: 'Patch name required' });

    const slug     = patch.name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
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

// ── Delete patch ───────────────────────────────────────────────────────────────
router.delete('/patches/:id', (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid patch id' });

    const file = fs.readdirSync(PATCHES_DIR).filter(f => f.endsWith('.json')).find(f => f.startsWith(`${id}-`));
    if (file) fs.unlinkSync(path.join(PATCHES_DIR, file));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
