/**
 * server/lib/project-manager.js
 *
 * Filesystem helpers for projects and flows.
 *
 * Data model:
 *   projects/
 *     shared/<projectName>/    — git-tracked, team-visible
 *       project.json
 *       flows/<flowId>/
 *         flow.json
 *         template.html
 *         output-*.html
 *         exports/
 *     private/<projectName>/   — excluded from git via projects/.gitignore
 *       ...same structure...
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { PROJECTS_DIR, RESOLVED_PROJECTS_DIR, isInsideDir } from '../../config.js';

const SHARED_DIR  = path.join(PROJECTS_DIR, 'shared');
const PRIVATE_DIR = path.join(PROJECTS_DIR, 'private');

// ── Internal helpers ──────────────────────────────────────────────────────────

function validateName(name) {
  if (!name || typeof name !== 'string') return null;
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(name)) return null;
  return name;
}

function subdirForType(type) {
  return type === 'private' ? PRIVATE_DIR : SHARED_DIR;
}

function readProjectMeta(projectDir) {
  const metaPath = path.join(projectDir, 'project.json');
  if (!fs.existsSync(metaPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
  } catch {
    return null;
  }
}

function writeProjectMeta(projectDir, meta) {
  try {
    fs.writeFileSync(path.join(projectDir, 'project.json'), JSON.stringify(meta, null, 2), 'utf-8');
    return true;
  } catch {
    return false;
  }
}

/**
 * Write projects/.gitignore with a single `private/` entry so git
 * ignores all private projects at once.
 */
function ensureGitignore() {
  fs.writeFileSync(path.join(PROJECTS_DIR, '.gitignore'), 'private/\n', 'utf-8');
}

/**
 * Move any legacy root-level projects (pre-subdir format) into shared/.
 * Runs once on startup; safe to call repeatedly.
 */
function migrateLegacyProjects() {
  try {
    for (const entry of fs.readdirSync(PROJECTS_DIR)) {
      if (['shared', 'private', '.gitignore'].includes(entry)) continue;
      const oldPath = path.join(PROJECTS_DIR, entry);
      if (!fs.statSync(oldPath).isDirectory()) continue;
      if (!fs.existsSync(path.join(oldPath, 'flows'))) continue;
      const newPath = path.join(SHARED_DIR, entry);
      if (!fs.existsSync(newPath)) fs.renameSync(oldPath, newPath);
    }
  } catch (err) {
    console.warn('[project-manager] migration warning:', err.message);
  }
}

/**
 * Ensure shared/ and private/ subdirs exist, migrate any legacy projects,
 * and keep the .gitignore up to date. Called lazily before any scan.
 */
function ensureSubdirs() {
  fs.mkdirSync(SHARED_DIR,  { recursive: true });
  fs.mkdirSync(PRIVATE_DIR, { recursive: true });
  migrateLegacyProjects();
  ensureGitignore();
}

/**
 * Run `git rm -r --cached <dir>` to remove a directory from the git index
 * without deleting files on disk. Returns true when files were staged.
 */
function gitRmCached(projectDir) {
  try {
    execSync(`git rm -r --cached "${projectDir}"`, { cwd: PROJECTS_DIR, stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

// ── Path helpers (public API) ─────────────────────────────────────────────────

/**
 * Resolve a project directory path.
 *
 * - resolveProjectDir(name, type) — returns the path for the given type (used
 *   for creation; directory may not yet exist).
 * - resolveProjectDir(name) — scans shared/ then private/ and returns the
 *   existing directory. Falls back to the shared/ path when neither exists
 *   (preserving the original "always return a path" contract so callers that
 *   just do an existsSync check continue to work).
 */
export function resolveProjectDir(projectName, type = null) {
  const safeName = validateName(projectName);
  if (!safeName) return null;

  if (type) {
    const dir = path.join(subdirForType(type), safeName);
    return isInsideDir(dir, RESOLVED_PROJECTS_DIR) ? dir : null;
  }

  // Scan both subdirs for an existing project
  for (const t of ['shared', 'private']) {
    const dir = path.join(subdirForType(t), safeName);
    if (isInsideDir(dir, RESOLVED_PROJECTS_DIR) && fs.existsSync(dir)) return dir;
  }

  // Project not found — return the shared path as the default (may not exist)
  const defaultDir = path.join(SHARED_DIR, safeName);
  return isInsideDir(defaultDir, RESOLVED_PROJECTS_DIR) ? defaultDir : null;
}

/**
 * Find an existing project across both subdirs.
 * Returns { dir, type } or null.
 */
export function findProject(projectName) {
  const safeName = validateName(projectName);
  if (!safeName) return null;
  for (const type of ['shared', 'private']) {
    const dir = path.join(subdirForType(type), safeName);
    if (isInsideDir(dir, RESOLVED_PROJECTS_DIR) && fs.existsSync(dir)) return { dir, type };
  }
  return null;
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
 * List all projects from both shared/ and private/ subdirs.
 * Returns [{ name, type }].
 */
export function listProjects() {
  ensureSubdirs();
  const result = [];
  for (const type of ['shared', 'private']) {
    const dir = subdirForType(type);
    if (!fs.existsSync(dir)) continue;
    try {
      for (const name of fs.readdirSync(dir)) {
        const projectPath = path.join(dir, name);
        if (
          fs.statSync(projectPath).isDirectory() &&
          fs.existsSync(path.join(projectPath, 'flows'))
        ) {
          result.push({ name, type });
        }
      }
    } catch { /* skip unreadable subdir */ }
  }
  return result;
}

/**
 * Load a project — returns { name, type, flows }.
 * Returns null if the project cannot be found in either subdir.
 */
export function loadProject(projectName) {
  const found = findProject(projectName);
  const projectDir = found?.dir ?? resolveProjectDir(projectName);
  if (!projectDir || !fs.existsSync(projectDir)) return null;

  const flowsDir = path.join(projectDir, 'flows');
  const flows = [];

  if (fs.existsSync(flowsDir)) {
    for (const flowId of fs.readdirSync(flowsDir)) {
      const flowPath = path.join(flowsDir, flowId, 'flow.json');
      if (!fs.existsSync(flowPath)) continue;
      try {
        flows.push(JSON.parse(fs.readFileSync(flowPath, 'utf-8')));
      } catch { /* skip malformed flow.json */ }
    }
  }

  flows.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  return { name: projectName, type: found?.type ?? 'shared', flows };
}

/**
 * Load a single flow's flow.json. Returns the parsed object or null.
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
 * Create a new project directory with project.json.
 * Returns true on success, false if the name is invalid or already exists.
 */
export function createProject(projectName, type = 'shared') {
  if (!['shared', 'private'].includes(type)) return false;
  const projectDir = resolveProjectDir(projectName, type);
  if (!projectDir || fs.existsSync(projectDir)) return false;
  ensureSubdirs();
  fs.mkdirSync(path.join(projectDir, 'flows'), { recursive: true });
  writeProjectMeta(projectDir, { name: projectName, type, createdAt: new Date().toISOString() });
  return true;
}

/**
 * Convert a project between 'shared' and 'private' by moving its directory.
 *
 * shared → private: runs `git rm -r --cached` before the move so the files
 *   are staged for removal from the git index. Commit to finish the transition.
 * private → shared: the directory moves into shared/; git sees new untracked
 *   files ready to be staged and committed.
 *
 * Returns { ok, gitChanged }.
 */
export function convertProjectType(projectName, newType) {
  if (!['shared', 'private'].includes(newType)) return { ok: false, gitChanged: false };
  const found = findProject(projectName);
  if (!found) return { ok: false, gitChanged: false };
  if (found.type === newType) return { ok: true, gitChanged: false };

  const newDir = resolveProjectDir(projectName, newType);
  if (!newDir || fs.existsSync(newDir)) return { ok: false, gitChanged: false };

  let gitChanged = false;
  if (newType === 'private') {
    gitChanged = gitRmCached(found.dir);
  }

  fs.renameSync(found.dir, newDir);

  const meta = readProjectMeta(newDir) || { name: projectName, createdAt: new Date().toISOString() };
  meta.type = newType;
  writeProjectMeta(newDir, meta);

  return { ok: true, gitChanged };
}

/**
 * Delete a project directory and everything inside it.
 */
export function deleteProject(projectName) {
  const found = findProject(projectName);
  const projectDir = found?.dir ?? resolveProjectDir(projectName);
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
