/**
 * server/routes/projects.js
 *
 * API endpoints for project and flow management.
 *
 * Projects are directories with an optional project.json manifest (type: private|shared).
 * Flows are subdirectories of <project>/flows/ and carry their full
 * metadata (zones, selections, template) inside flow.json + template.html.
 */

import express from 'express';
import fs from 'fs';
import path from 'path';
import {
  listProjects,
  loadProject,
  loadFlow,
  createProject,
  deleteProject,
  deleteFlow,
  convertProjectType,
  findProject,
  resolveProjectDir,
  resolveFlowDir,
} from '../lib/project/project-manager.js';
import { selectionsToZones, resolveConflicts, autoDiscoverZonesForFullSlide } from '../lib/zones/selections-to-zones.js';

const router = express.Router();

// ── GET /api/projects ─────────────────────────────────────────────────────────

router.get('/', (req, res) => {
  try {
    res.json({ projects: listProjects() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/projects ────────────────────────────────────────────────────────

router.post('/', (req, res) => {
  try {
    const { name, type = 'shared' } = req.body;
    if (!name || typeof name !== 'string') {
      return res.status(400).json({ error: 'Project name is required' });
    }
    if (!['private', 'shared'].includes(type)) {
      return res.status(400).json({ error: 'Invalid project type. Must be "private" or "shared".' });
    }
    if (!resolveProjectDir(name, type)) {
      return res.status(400).json({ error: 'Invalid project name. Use letters, numbers, hyphens, and underscores only.' });
    }
    if (findProject(name)) {
      return res.status(409).json({ error: `Project "${name}" already exists` });
    }
    if (!createProject(name, type)) {
      return res.status(500).json({ error: 'Failed to create project' });
    }
    res.status(201).json({ ok: true, name, type });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/projects/:projectName ────────────────────────────────────────────

router.get('/:projectName', (req, res) => {
  try {
    const project = loadProject(req.params.projectName);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    res.json({ project });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PATCH /api/projects/:projectName ─────────────────────────────────────────

router.patch('/:projectName', (req, res) => {
  try {
    const { type } = req.body;
    if (!['private', 'shared'].includes(type)) {
      return res.status(400).json({ error: 'Invalid type. Must be "private" or "shared".' });
    }
    const result = convertProjectType(req.params.projectName, type);
    if (!result.ok) {
      return res.status(400).json({ error: 'Failed to convert project type' });
    }
    res.json({ ok: true, name: req.params.projectName, type, gitChanged: result.gitChanged });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/projects/:projectName ─────────────────────────────────────────

router.delete('/:projectName', (req, res) => {
  try {
    if (!deleteProject(req.params.projectName)) {
      return res.status(400).json({ error: 'Failed to delete project' });
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/projects/:projectName/flows/:flowId ──────────────────────────────

router.get('/:projectName/flows/:flowId', (req, res) => {
  try {
    const flow = loadFlow(req.params.projectName, req.params.flowId);
    if (!flow) return res.status(404).json({ error: 'Flow not found' });
    res.json({ flow });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PATCH /api/projects/:projectName/flows/:flowId ────────────────────────────

router.patch('/:projectName/flows/:flowId', (req, res) => {
  try {
    const { globalPrompt, status, repeatableSlides, summaryPrompt, contentPrompt, sliceOutputTemplate, selections, fullSlideGeneration, selectedContextFiles, filters } = req.body;
    const flow = loadFlow(req.params.projectName, req.params.flowId);
    if (!flow) return res.status(404).json({ error: 'Flow not found' });

    if (globalPrompt !== undefined) flow.globalPrompt = globalPrompt;
    if (summaryPrompt !== undefined) flow.summaryPrompt = summaryPrompt;
    if (contentPrompt !== undefined) flow.contentPrompt = contentPrompt;
    if (sliceOutputTemplate !== undefined) flow.sliceOutputTemplate = sliceOutputTemplate;
    if (Array.isArray(selectedContextFiles)) flow.selectedContextFiles = selectedContextFiles;
    if (Array.isArray(filters)) flow.filters = filters;
    if (status !== undefined) {
      if (!['active', 'paused', 'archived'].includes(status)) {
        return res.status(400).json({ error: 'Invalid status' });
      }
      flow.status = status;
    }
     if (Array.isArray(repeatableSlides)) {
       flow._metadata = flow._metadata || {};
       flow._metadata.repeatableSlides = repeatableSlides.map(rs => ({
         slideIndex: rs.slideIndex,
         key: rs.key,
         prompt: rs.prompt,
       }));
     }
    const selectionsChanged = Array.isArray(selections);
    const fullSlideGenChanged = Array.isArray(fullSlideGeneration);

    if (fullSlideGenChanged) {
      flow._metadata = flow._metadata || {};
      flow._metadata.fullSlideGeneration = fullSlideGeneration;
    }

    const flowDir = resolveFlowDir(req.params.projectName, req.params.flowId);
    if (!flowDir) return res.status(400).json({ error: 'Invalid flow path' });

    if (selectionsChanged || fullSlideGenChanged) {
      flow._metadata = flow._metadata || {};
      const fullSlideGen = fullSlideGenChanged ? fullSlideGeneration : (flow._metadata?.fullSlideGeneration || []);
      const currentSelections = selectionsChanged ? selections : (flow._metadata?.selections || []);
      const trees = flow._metadata?.trees || [];
      
      // Load template HTML for auto-discovery
      let templateHtml = '';
      const templatePath = path.join(flowDir, 'template.html');
      if (fs.existsSync(templatePath)) {
        templateHtml = fs.readFileSync(templatePath, 'utf8');
      }
      
      const selectionsWithAutoDiscovered = autoDiscoverZonesForFullSlide(trees, fullSlideGen, currentSelections, templateHtml);
      flow._metadata.selections = selectionsWithAutoDiscovered;
      const repSlides = flow._metadata.repeatableSlides || [];
      const { resolved } = resolveConflicts(selectionsWithAutoDiscovered);
      flow._metadata.zones = selectionsToZones(resolved, repSlides);
    }
    flow.updatedAt = new Date().toISOString();

    fs.writeFileSync(path.join(flowDir, 'flow.json'), JSON.stringify(flow, null, 2));
    res.json({ flow });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/projects/:projectName/flows/:flowId ───────────────────────────

router.delete('/:projectName/flows/:flowId', (req, res) => {
  try {
    if (!deleteFlow(req.params.projectName, req.params.flowId)) {
      return res.status(400).json({ error: 'Failed to delete flow' });
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
