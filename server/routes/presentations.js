/**
 * server/routes/presentations.js
 *
 * REST API endpoints for the Presentations feature.
 * Handles publishing, listing, renaming, and deleting presentations.
 *
 * Presentations are published versions of slides bundled with a navigation tree.
 * Directory structure:
 *   projects/<projectName>/presentations/
 *     <presentationName>/
 *       index.html       — main presentation file
 *       meta.json        — metadata (name, publishedAt, slideCount)
 */

import express from 'express';
import fs from 'fs';
import path from 'path';
import { resolveProjectDir, loadProject } from '../lib/project-manager.js';
import { publishPresentation } from '../lib/export-manager.js';
import { PROJECTS_DIR } from '../config.js';

const router = express.Router();

// ── Helper: Validate presentation name ────────────────────────────────────────

function validatePresentationName(name) {
  if (!name || typeof name !== 'string') return false;
  return /^[a-zA-Z0-9_-]{1,100}$/.test(name);
}



// ── POST /api/projects/:projectName/presentations ────────────────────────────

router.post('/:projectName/presentations', (req, res) => {
  try {
    const { projectName } = req.params;
    const { name, structureId } = req.body;

    if (!projectName || !/^[\w-]{1,100}$/.test(projectName)) {
      return res.status(400).json({ ok: false, error: 'Invalid projectName' });
    }

    if (!name || typeof name !== 'string') {
      return res.status(400).json({ ok: false, error: 'Presentation name is required' });
    }

    if (!validatePresentationName(name)) {
      return res.status(400).json({ ok: false, error: 'Invalid presentation name. Use letters, numbers, hyphens, and underscores only.' });
    }

    if (!structureId) {
      return res.status(400).json({ error: 'structureId is required' });
    }

    const projectDir = resolveProjectDir(projectName);
    if (!projectDir || !fs.existsSync(projectDir)) {
      return res.status(404).json({ ok: false, error: `Project "${projectName}" not found` });
    }

    const presentationsDir = path.join(projectDir, 'presentations');
    const presentationDir = path.join(presentationsDir, name);

    if (fs.existsSync(presentationDir)) {
      return res.status(409).json({ ok: false, error: `Presentation "${name}" already exists` });
    }

    const result = publishPresentation(projectName, name, structureId);

    if (!result.ok) {
      return res.status(500).json({ ok: false, error: result.error });
    }

    return res.status(201).json({
      ok: true,
      name,
      publishedAt: result.publishedAt,
      slideCount: result.slideCount,
    });
  } catch (err) {
    console.error('[presentations] POST error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ── GET /api/projects/:projectName/presentations ─────────────────────────────

router.get('/:projectName/presentations', (req, res) => {
  try {
    const { projectName } = req.params;

    if (!projectName || !/^[\w-]{1,100}$/.test(projectName)) {
      return res.status(400).json({ ok: false, error: 'Invalid projectName' });
    }

    const projectDir = resolveProjectDir(projectName);
    if (!projectDir || !fs.existsSync(projectDir)) {
      return res.status(404).json({ ok: false, error: `Project "${projectName}" not found` });
    }

    const presentationsDir = path.join(projectDir, 'presentations');

    if (!fs.existsSync(presentationsDir)) {
      return res.json({ presentations: [] });
    }

    const presentations = [];

    try {
      const entries = fs.readdirSync(presentationsDir);
      for (const entry of entries) {
        const presentationDir = path.join(presentationsDir, entry);
        const stat = fs.statSync(presentationDir);

        if (!stat.isDirectory()) continue;

        const metaPath = path.join(presentationDir, 'meta.json');
        if (!fs.existsSync(metaPath)) continue;

        try {
          const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
          presentations.push({
            name: meta.name || entry,
            publishedAt: meta.publishedAt,
            slideCount: meta.slideCount || 0,
          });
        } catch {
          // skip malformed meta.json
        }
      }
    } catch {
      // skip errors reading directory
    }

    return res.json({ presentations });
  } catch (err) {
    console.error('[presentations] GET list error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ── GET /api/projects/:projectName/presentations/:name ────────────────────────

router.get('/:projectName/presentations/:name', (req, res) => {
  try {
    const { projectName, name } = req.params;

    if (!projectName || !/^[\w-]{1,100}$/.test(projectName)) {
      return res.status(400).json({ ok: false, error: 'Invalid projectName' });
    }

    if (!name || !validatePresentationName(name)) {
      return res.status(400).json({ ok: false, error: 'Invalid presentation name' });
    }

    const projectDir = resolveProjectDir(projectName);
    if (!projectDir || !fs.existsSync(projectDir)) {
      return res.status(404).json({ ok: false, error: `Project "${projectName}" not found` });
    }

    const presentationDir = path.join(projectDir, 'presentations', name);
    if (!fs.existsSync(presentationDir)) {
      return res.status(404).json({ ok: false, error: `Presentation "${name}" not found` });
    }

    const metaPath = path.join(presentationDir, 'meta.json');
    if (!fs.existsSync(metaPath)) {
      return res.status(404).json({ ok: false, error: 'meta.json not found' });
    }

    try {
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
      return res.json({
        ok: true,
        presentation: meta,
        url: `/published/${projectName}/presentations/${name}/index.html`,
      });
    } catch (err) {
      return res.status(500).json({ ok: false, error: 'Failed to parse meta.json' });
    }
  } catch (err) {
    console.error('[presentations] GET single error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ── PATCH /api/projects/:projectName/presentations/:name ──────────────────────

router.patch('/:projectName/presentations/:name', (req, res) => {
  try {
    const { projectName, name } = req.params;
    const { newName } = req.body;

    if (!projectName || !/^[\w-]{1,100}$/.test(projectName)) {
      return res.status(400).json({ ok: false, error: 'Invalid projectName' });
    }

    if (!name || !validatePresentationName(name)) {
      return res.status(400).json({ ok: false, error: 'Invalid presentation name' });
    }

    if (!newName || typeof newName !== 'string') {
      return res.status(400).json({ ok: false, error: 'newName is required' });
    }

    if (!validatePresentationName(newName)) {
      return res.status(400).json({ ok: false, error: 'Invalid new presentation name. Use letters, numbers, hyphens, and underscores only.' });
    }

    if (name === newName) {
      return res.status(400).json({ ok: false, error: 'New name must be different from current name' });
    }

    const projectDir = resolveProjectDir(projectName);
    if (!projectDir || !fs.existsSync(projectDir)) {
      return res.status(404).json({ ok: false, error: `Project "${projectName}" not found` });
    }

    const presentationsDir = path.join(projectDir, 'presentations');
    const oldDir = path.join(presentationsDir, name);
    const newDir = path.join(presentationsDir, newName);

    if (!fs.existsSync(oldDir)) {
      return res.status(404).json({ ok: false, error: `Presentation "${name}" not found` });
    }

    if (fs.existsSync(newDir)) {
      return res.status(409).json({ ok: false, error: `Presentation "${newName}" already exists` });
    }

    // Rename directory
    try {
      fs.renameSync(oldDir, newDir);
    } catch (err) {
      return res.status(500).json({ ok: false, error: `Failed to rename presentation: ${err.message}` });
    }

    // Update meta.json
    const metaPath = path.join(newDir, 'meta.json');
    if (fs.existsSync(metaPath)) {
      try {
        const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
        meta.name = newName;
        fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf8');
      } catch {
        // continue even if meta.json update fails
      }
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error('[presentations] PATCH error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ── DELETE /api/projects/:projectName/presentations/:name ─────────────────────

router.delete('/:projectName/presentations/:name', (req, res) => {
  try {
    const { projectName, name } = req.params;

    if (!projectName || !/^[\w-]{1,100}$/.test(projectName)) {
      return res.status(400).json({ ok: false, error: 'Invalid projectName' });
    }

    if (!name || !validatePresentationName(name)) {
      return res.status(400).json({ ok: false, error: 'Invalid presentation name' });
    }

    const projectDir = resolveProjectDir(projectName);
    if (!projectDir || !fs.existsSync(projectDir)) {
      return res.status(404).json({ ok: false, error: `Project "${projectName}" not found` });
    }

    const presentationDir = path.join(projectDir, 'presentations', name);
    if (!fs.existsSync(presentationDir)) {
      return res.status(404).json({ ok: false, error: `Presentation "${name}" not found` });
    }

    try {
      fs.rmSync(presentationDir, { recursive: true, force: true });
      return res.json({ ok: true });
    } catch (err) {
      return res.status(500).json({ ok: false, error: `Failed to delete presentation: ${err.message}` });
    }
  } catch (err) {
    console.error('[presentations] DELETE error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ── GET /api/projects/:projectName/export-catalog ─────────────────────────────

router.get('/:projectName/export-catalog', async (req, res) => {
  try {
    const { projectName } = req.params;
    const projectData = await loadProject(projectName);
    const flows = projectData?.project?.flows || projectData?.flows || [];
    const projectDir = resolveProjectDir(projectName);

    const exports = [];

    for (const flow of flows) {
      const flowId   = flow.flowId;
      const flowName = flow.name || flowId;
      const exportsDir = path.join(projectDir, 'flows', flowId, 'exports');

      if (!fs.existsSync(exportsDir)) continue;

      let exportDirs;
      try {
        exportDirs = fs.readdirSync(exportsDir).filter(d => {
          try { return fs.statSync(path.join(exportsDir, d)).isDirectory(); } catch { return false; }
        });
      } catch { continue; }

      for (const exportId of exportDirs) {
        const exportJsonPath = path.join(exportsDir, exportId, 'export.json');
        if (!fs.existsSync(exportJsonPath)) continue;

        let exportData;
        try { exportData = JSON.parse(fs.readFileSync(exportJsonPath, 'utf8')); } catch { continue; }

        const slides = (exportData.content?.slides || []).map(s => ({
          slideIndex: s.index,
          title:      s.title || `Slide ${s.index}`,
          file:       s.file,
          size:       s.size || 0,
        }));

        exports.push({
          flowId,
          flowName,
          exportId:     exportData.exportId || exportId,
          exportNumber: exportData.exportNumber || 0,
          createdAt:    exportData.createdAt || null,
          slides,
        });
      }
    }

    exports.sort((a, b) => {
      if (a.flowId < b.flowId) return -1;
      if (a.flowId > b.flowId) return 1;
      return (a.exportNumber || 0) - (b.exportNumber || 0);
    });

    return res.json({ exports });
  } catch (err) {
    console.error('[presentations] GET export-catalog error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

export default router;
