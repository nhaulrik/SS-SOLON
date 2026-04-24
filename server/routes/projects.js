/**
 * server/routes/projects.js
 *
 * API endpoints for project and flow management.
 *
 * Projects are directories — there is no project.json manifest.
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
  deleteProject,
  deleteFlow,
  resolveProjectDir,
  resolveFlowDir,
} from '../lib/project-manager.js';
import { selectionsToZones, resolveConflicts } from '../lib/selections-to-zones.js';

const router = express.Router();

// ── Auto-discovery helper for full slide generation ─────────────────────────
function autoDiscoverZonesForFullSlide(trees, fullSlideGeneration, existingSelections) {
  if (!Array.isArray(fullSlideGeneration) || fullSlideGeneration.length === 0) {
    return existingSelections;
  }

  const result = [...existingSelections];
  const existingNodeIds = new Set(existingSelections.map(s => s.nodeId));

  function flattenTree(nodes) {
    const flat = [];
    function visit(arr) {
      for (const n of arr) {
        flat.push(n);
        if (n.children?.length) visit(n.children);
      }
    }
    visit(nodes);
    return flat;
  }

  for (const slideIdx of fullSlideGeneration) {
    const treeIdx = slideIdx - 1;
    if (treeIdx < 0 || treeIdx >= trees.length) continue;

    const allNodes = flattenTree(trees[treeIdx]);

    for (const node of allNodes) {
      if (existingNodeIds.has(node.id)) continue;
      if (node.leaf) continue;

      if (node.interesting || node.children?.length > 0) {
        const key = `auto_${node.id.replace(/[^a-z0-9]/gi, '_').toLowerCase()}`;
        result.push({
          nodeId:        node.id,
          slideIndex:    slideIdx,
          zoneType:      'block',
          key,
          prompt:        '',
          autoGenerate:  true,
          autoDiscovered: true,
          type:          'block',
          ...(node.innerHTML ? { exampleHtml: node.innerHTML } : {}),
        });
        existingNodeIds.add(node.id);
      }
    }
  }

  return result;
}

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
    const { name } = req.body;
    if (!name || typeof name !== 'string') {
      return res.status(400).json({ error: 'Project name is required' });
    }
    const projectDir = resolveProjectDir(name);
    if (!projectDir) {
      return res.status(400).json({ error: 'Invalid project name. Use letters, numbers, hyphens, and underscores only.' });
    }
    if (fs.existsSync(projectDir)) {
      return res.status(409).json({ error: `Project "${name}" already exists` });
    }
    fs.mkdirSync(path.join(projectDir, 'flows'), { recursive: true });
    res.status(201).json({ ok: true, name });
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
    const { globalPrompt, status, repeatableSlides, summaryPrompt, contentPrompt, sliceOutputTemplate, selections, fullSlideGeneration } = req.body;
    const flow = loadFlow(req.params.projectName, req.params.flowId);
    if (!flow) return res.status(404).json({ error: 'Flow not found' });

    if (globalPrompt !== undefined) flow.globalPrompt = globalPrompt;
    if (summaryPrompt !== undefined) flow.summaryPrompt = summaryPrompt;
    if (contentPrompt !== undefined) flow.contentPrompt = contentPrompt;
    if (sliceOutputTemplate !== undefined) flow.sliceOutputTemplate = sliceOutputTemplate;
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

    if (selectionsChanged || fullSlideGenChanged) {
      flow._metadata = flow._metadata || {};
      const fullSlideGen = fullSlideGenChanged ? fullSlideGeneration : (flow._metadata?.fullSlideGeneration || []);
      const currentSelections = selectionsChanged ? selections : (flow._metadata?.selections || []);
      const trees = flow._metadata?.trees || [];
      const selectionsWithAutoDiscovered = autoDiscoverZonesForFullSlide(trees, fullSlideGen, currentSelections);
      flow._metadata.selections = selectionsWithAutoDiscovered;
      const repSlides = flow._metadata.repeatableSlides || [];
      const { resolved } = resolveConflicts(selectionsWithAutoDiscovered);
      flow._metadata.zones = selectionsToZones(resolved, repSlides);
    }
    flow.updatedAt = new Date().toISOString();

    const flowDir = resolveFlowDir(req.params.projectName, req.params.flowId);
    if (!flowDir) return res.status(400).json({ error: 'Invalid flow path' });

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
