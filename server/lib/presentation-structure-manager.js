/**
 * server/lib/presentation-structure-manager.js
 *
 * Manages Presentation Structures for a project.
 * Structures are stored in: server/projects/<projectName>/presentation-structures.json
 *
 * Schema:
 * {
 *   "structures": [
 *     {
 *       "id": "ps-<uuid>",
 *       "name": "My Presentation",
 *       "createdAt": "...",
 *       "updatedAt": "...",
 *       "slides": [
 *         { "id": "sr-<uuid>", "flowId": "...", "exportId": "...", "slideIndex": 1, "title": "Slide 1" }
 *       ],
 *       "levelNames": ["Chapter", "Section"],
 *       "tree": [
 *         { "slideRefId": "sr-<uuid>", "children": [] }
 *       ]
 *     }
 *   ]
 * }
 */

import fs   from 'fs';
import path from 'path';
import crypto from 'crypto';
import { resolveProjectDir } from './project-manager.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function resolveStructuresFile(projectName) {
  const projectDir = resolveProjectDir(projectName);
  return path.join(projectDir, 'presentation-structures.json');
}

function readFile(filePath) {
  if (!fs.existsSync(filePath)) return { structures: [] };
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return { structures: [] };
  }
}

function writeFile(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

// ── Public API ────────────────────────────────────────────────────────────────

export function listStructures(projectName) {
  const filePath = resolveStructuresFile(projectName);
  return readFile(filePath);
}

export function getStructure(projectName, structureId) {
  const data = listStructures(projectName);
  const structure = data.structures.find(s => s.id === structureId);
  if (!structure) {
    const err = new Error(`Presentation structure "${structureId}" not found`);
    err.statusCode = 404;
    throw err;
  }
  return structure;
}

export function createStructure(projectName, { name }) {
  const filePath = resolveStructuresFile(projectName);
  const data = readFile(filePath);
  const now = new Date().toISOString();
  const structure = {
    id:        `ps-${crypto.randomUUID()}`,
    name:      name || 'Untitled Structure',
    createdAt: now,
    updatedAt: now,
    slides:    [],
    tree:      [],
  };
  data.structures.push(structure);
  writeFile(filePath, data);
  return structure;
}

export function updateStructure(projectName, structureId, patch) {
  const filePath = resolveStructuresFile(projectName);
  const data = readFile(filePath);
  const idx = data.structures.findIndex(s => s.id === structureId);
  if (idx === -1) {
    const err = new Error(`Presentation structure "${structureId}" not found`);
    err.statusCode = 404;
    throw err;
  }
  const existing = data.structures[idx];
  const updated = {
    ...existing,
    ...(patch.name        !== undefined ? { name:       patch.name       } : {}),
    ...(patch.slides      !== undefined ? { slides:     patch.slides     } : {}),
    ...(patch.tree        !== undefined ? { tree:       patch.tree       } : {}),
    ...(patch.levelNames  !== undefined ? { levelNames: patch.levelNames } : {}),
    updatedAt: new Date().toISOString(),
  };
  data.structures[idx] = updated;
  writeFile(filePath, data);
  return updated;
}

export function deleteStructure(projectName, structureId) {
  const filePath = resolveStructuresFile(projectName);
  const data = readFile(filePath);
  const idx = data.structures.findIndex(s => s.id === structureId);
  if (idx === -1) {
    const err = new Error(`Presentation structure "${structureId}" not found`);
    err.statusCode = 404;
    throw err;
  }
  data.structures.splice(idx, 1);
  writeFile(filePath, data);
}
