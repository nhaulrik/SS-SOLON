/**
 * server/routes/presentation-structures.js
 *
 * REST endpoints for Presentation Structures.
 *
 * Mounted at: /api/projects
 *
 * Routes:
 *   GET    /:projectName/presentation-structures
 *   POST   /:projectName/presentation-structures
 *   GET    /:projectName/presentation-structures/:structureId
 *   PATCH  /:projectName/presentation-structures/:structureId
 *   DELETE /:projectName/presentation-structures/:structureId
 */

import express from 'express';
import {
  listStructures,
  getStructure,
  createStructure,
  updateStructure,
  deleteStructure,
} from '../lib/presentation/presentation-structure-manager.js';

const router = express.Router({ mergeParams: true });

// GET /api/projects/:projectName/presentation-structures
router.get('/:projectName/presentation-structures', async (req, res) => {
  try {
    const { projectName } = req.params;
    const data = listStructures(projectName);
    return res.json(data);
  } catch (err) {
    const status = err.statusCode || 500;
    console.error('[presentation-structures] GET list error:', err.message);
    return res.status(status).json({ error: err.message });
  }
});

// POST /api/projects/:projectName/presentation-structures
router.post('/:projectName/presentation-structures', async (req, res) => {
  try {
    const { projectName } = req.params;
    const { name } = req.body;
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'name is required' });
    }
    const structure = createStructure(projectName, { name: name.trim() });
    return res.status(201).json(structure);
  } catch (err) {
    const status = err.statusCode || 500;
    console.error('[presentation-structures] POST error:', err.message);
    return res.status(status).json({ error: err.message });
  }
});

// GET /api/projects/:projectName/presentation-structures/:structureId
router.get('/:projectName/presentation-structures/:structureId', async (req, res) => {
  try {
    const { projectName, structureId } = req.params;
    const structure = getStructure(projectName, structureId);
    return res.json(structure);
  } catch (err) {
    const status = err.statusCode || 500;
    console.error('[presentation-structures] GET one error:', err.message);
    return res.status(status).json({ error: err.message });
  }
});

// PATCH /api/projects/:projectName/presentation-structures/:structureId
router.patch('/:projectName/presentation-structures/:structureId', async (req, res) => {
  try {
    const { projectName, structureId } = req.params;
    const { name, slides, tree, levelNames } = req.body;
    const patch = {};
    if (name        !== undefined) patch.name       = name;
    if (slides      !== undefined) patch.slides     = slides;
    if (tree        !== undefined) patch.tree       = tree;
    if (levelNames  !== undefined) patch.levelNames = levelNames;
    const updated = updateStructure(projectName, structureId, patch);
    return res.json(updated);
  } catch (err) {
    const status = err.statusCode || 500;
    console.error('[presentation-structures] PATCH error:', err.message);
    return res.status(status).json({ error: err.message });
  }
});

// DELETE /api/projects/:projectName/presentation-structures/:structureId
router.delete('/:projectName/presentation-structures/:structureId', async (req, res) => {
  try {
    const { projectName, structureId } = req.params;
    deleteStructure(projectName, structureId);
    return res.status(204).end();
  } catch (err) {
    const status = err.statusCode || 500;
    console.error('[presentation-structures] DELETE error:', err.message);
    return res.status(status).json({ error: err.message });
  }
});

export default router;
