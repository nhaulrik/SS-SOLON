/**
 * server/lib/project-manager.js
 *
 * Filesystem helpers for projects and flows.
 *
 * Data model (new format only):
 *   projects/<projectName>/
 *     flows/<flowId>/
 *       flow.json      — flow metadata + _metadata (zones, selections, trees)
 *       template.html  — the HTML slide template
 *       output-*.html  — generated output files
 *       exports/       — versioned exports
 *
 * There is no project.json or templates/ directory.
 * A "project" is simply a named directory containing a flows/ subdirectory.
 */

import fs from 'fs';
import path from 'path';
import { PROJECTS_DIR, RESOLVED_PROJECTS_DIR, isInsideDir } from '../../config.js';

// ── Path helpers ─────────────────────────────────────────────────────────────

/**
 * Validate a project name and return it, or null if invalid.
 * Allows alphanumeric, hyphens, underscores.
 */
function validateName(name) {
  if (!name || typeof name !== 'string') return null;
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(name)) return null;
  return name;
}

/**
 * Resolve a project directory path safely.
 * Returns the path if valid, or null.
 */
export function resolveProjectDir(projectName) {
  const safeName = validateName(projectName);
  if (!safeName) return null;
  const dir = path.join(PROJECTS_DIR, safeName);
  if (!isInsideDir(dir, RESOLVED_PROJECTS_DIR)) return null;
  return dir;
}

/**
 * Resolve a flow directory path safely within a project.
 */
export function resolveFlowDir(projectName, flowId) {
  const projectDir = resolveProjectDir(projectName);
  if (!projectDir) return null;
  if (!validateName(flowId)) return null;
  const dir = path.join(projectDir, 'flows', flowId);
  if (!isInsideDir(dir, RESOLVED_PROJECTS_DIR)) return null;
  return dir;
}

// ── Project discovery ─────────────────────────────────────────────────────────

/**
 * List all projects by scanning PROJECTS_DIR.
 * A project is any subdirectory that contains a flows/ subdirectory.
 */
export function listProjects() {
  if (!fs.existsSync(PROJECTS_DIR)) return [];
  try {
    return fs.readdirSync(PROJECTS_DIR)
      .filter(name => {
        const projectPath = path.join(PROJECTS_DIR, name);
        return (
          fs.statSync(projectPath).isDirectory() &&
          fs.existsSync(path.join(projectPath, 'flows'))
        );
      })
      .map(name => ({ name }));
  } catch {
    return [];
  }
}

/**
 * Load a project — returns { name, flows } by scanning the flows/ directory.
 * Each flow entry is the parsed flow.json content.
 * Returns null if the project directory does not exist.
 */
export function loadProject(projectName) {
  const projectDir = resolveProjectDir(projectName);
  if (!projectDir || !fs.existsSync(projectDir)) return null;

  const flowsDir = path.join(projectDir, 'flows');
  const flows = [];

  if (fs.existsSync(flowsDir)) {
    for (const flowId of fs.readdirSync(flowsDir)) {
      const flowPath = path.join(flowsDir, flowId, 'flow.json');
      if (!fs.existsSync(flowPath)) continue;
      try {
        flows.push(JSON.parse(fs.readFileSync(flowPath, 'utf-8')));
      } catch {
        // skip malformed flow.json
      }
    }
  }

  flows.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  return { name: projectName, flows };
}

/**
 * Load a single flow's flow.json.
 * Returns the parsed object or null if not found.
 */
export function loadFlow(projectName, flowId) {
  const flowDir = resolveFlowDir(projectName, flowId);
  if (!flowDir) return null;

  const flowPath = path.join(flowDir, 'flow.json');
  if (!fs.existsSync(flowPath)) return null;

  try {
    return JSON.parse(fs.readFileSync(flowPath, 'utf-8'));
  } catch {
    return null;
  }
}

/**
 * Persist a flow object back to its flow.json.
 * Returns true on success, false on failure.
 */
export function saveFlow(projectName, flowId, flow) {
  const flowDir = resolveFlowDir(projectName, flowId);
  if (!flowDir) return false;
  try {
    fs.writeFileSync(path.join(flowDir, 'flow.json'), JSON.stringify(flow, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.error(`[project-manager] Failed to save flow ${projectName}/${flowId}:`, err.message);
    return false;
  }
}

// ── Mutation helpers ──────────────────────────────────────────────────────────

/**
 * Delete a project directory and everything inside it.
 */
export function deleteProject(projectName) {
  const projectDir = resolveProjectDir(projectName);
  if (!projectDir || !fs.existsSync(projectDir)) return false;
  try {
    fs.rmSync(projectDir, { recursive: true, force: true });
    return true;
  } catch {
    return false;
  }
}

/**
 * Delete a single flow directory.
 */
export function deleteFlow(projectName, flowId) {
  const flowDir = resolveFlowDir(projectName, flowId);
  if (!flowDir || !fs.existsSync(flowDir)) return false;
  try {
    fs.rmSync(flowDir, { recursive: true, force: true });
    return true;
  } catch {
    return false;
  }
}
